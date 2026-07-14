#!/usr/bin/env node

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const {
  VARIANTS,
  SCORER_VERSION,
  SCENARIO_SET_VERSION,
  SCENARIOS,
  composePrompt,
  scoreResponse,
  scoreRawRows,
  scenarioSetVersionForRows,
  summarizeResults,
} = require('./lib/persona-eval');

const DEFAULT_OUTPUT_ROOT = path.join(__dirname, '..', 'benchmarks', 'persona-eval');
const HOSTS = ['codex', 'claude'];
const EVALUATOR_VERSION = 2;
const MAX_HOST_OUTPUT_BYTES = 64 * 1024 * 1024;

function currentGitSha() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'unknown';
  }
}

function detectCliVersion(host) {
  const completed = spawnSync(host, ['--version'], { encoding: 'utf8', shell: false });
  if (completed.error || completed.status !== 0) return 'unknown';
  return String(completed.stdout || completed.stderr || '').trim() || 'unknown';
}

function reportMetadata(options, generatedAt) {
  return {
    evaluatorVersion: EVALUATOR_VERSION,
    scorerVersion: SCORER_VERSION,
    scenarioSetVersion: options.scenarioSetVersion || SCENARIO_SET_VERSION,
    gitSha: options.gitSha || currentGitSha(),
    model: options.model || 'host-default',
    cliVersion: options.cliVersion || 'unknown',
    generatedAt,
  };
}

function parseArgs(argv) {
  const options = {
    host: undefined,
    reps: 5,
    variant: 'all',
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--host') options.host = argv[++index];
    else if (arg === '--reps') options.reps = Number(argv[++index]);
    else if (arg === '--variant') options.variant = argv[++index];
    else if (arg === '--model') options.model = argv[++index];
    else if (arg === '--rescore') options.rescore = argv[++index];
    else if (arg === '--dry-run') options.dryRun = true;
    else throw new Error(`Nieznany argument: ${arg}`);
  }

  if ('rescore' in options) {
    if (!options.rescore) throw new Error('--rescore wymaga katalogu runu');
    return options;
  }
  if (!options.host) throw new Error('Wymagane --host codex|claude');
  if (!HOSTS.includes(options.host)) throw new Error(`Nieznany host: ${options.host}`);
  if (!options.model) throw new Error('Wymagane --model <model-id>');
  if (options.variant !== 'all' && !VARIANTS.includes(options.variant)) {
    throw new Error(`Nieznany wariant: ${options.variant}`);
  }
  if (!Number.isInteger(options.reps) || options.reps <= 0) {
    throw new Error('--reps musi być dodatnią liczbą całkowitą');
  }
  return options;
}

function commandForHost(host, prompt, outputFile, model) {
  if (host === 'codex') {
    const modelArgs = model ? ['-m', model] : [];
    return {
      command: 'codex',
      args: [
        'exec',
        '--ignore-user-config',
        '--ephemeral',
        '--skip-git-repo-check',
        '-s',
        'read-only',
        '-o',
        outputFile,
        ...modelArgs,
        prompt,
      ],
      readsOutputFile: true,
    };
  }
  if (host === 'claude') {
    const modelArgs = model ? ['--model', model] : [];
    return {
      command: 'claude',
      args: [
        '--safe-mode',
        '-p',
        '--tools',
        '',
        '--no-session-persistence',
        ...modelArgs,
        prompt,
      ],
      readsOutputFile: false,
    };
  }
  throw new Error(`Nieznany host: ${host}`);
}

function environmentForHost(host, scratch, environment) {
  if (host !== 'codex') return environment;

  // --ignore-user-config pomija config.toml, ale Codex nadal czyta globalne
  // AGENTS.md z CODEX_HOME. Benchmark potrzebuje czystej kontroli, więc daje
  // osobny home z samym uwierzytelnieniem i usuwa go razem ze scratch dir.
  const isolatedHome = path.join(scratch, 'codex-home');
  fs.mkdirSync(isolatedHome, { mode: 0o700 });
  const sourceHome = environment.CODEX_HOME || path.join(os.homedir(), '.codex');
  const sourceAuth = path.join(sourceHome, 'auth.json');
  if (fs.existsSync(sourceAuth)) {
    const targetAuth = path.join(isolatedHome, 'auth.json');
    fs.copyFileSync(sourceAuth, targetAuth);
    fs.chmodSync(targetAuth, 0o600);
  }
  return { ...environment, CODEX_HOME: isolatedHome };
}

function plannedCalls({ host, reps, variant, model }, outputFile) {
  const variants = variant === 'all' ? VARIANTS : [variant];
  const calls = [];
  for (const currentVariant of variants) {
    for (const scenario of SCENARIOS) {
      for (let repetition = 1; repetition <= reps; repetition += 1) {
        const prompt = composePrompt(currentVariant, scenario, repetition - 1);
        calls.push({
          host,
          variant: currentVariant,
          scenario: scenario.id,
          repetition,
          prompt,
          invocation: commandForHost(host, prompt, outputFile, model),
        });
      }
    }
  }
  return calls;
}

function scoreArtifact(row) {
  return {
    host: row.host,
    variant: row.variant,
    scenario: row.scenario,
    repetition: row.repetition,
    score: row.score,
  };
}

function runEvaluation(options) {
  const host = options.host;
  const reps = options.reps ?? 5;
  const variant = options.variant ?? 'all';
  const dryRun = options.dryRun ?? false;
  const model = options.model;
  const spawn = options.spawn || spawnSync;
  const score = options.score || scoreResponse;
  const now = options.now || (() => new Date());
  const outputRoot = options.outputRoot || DEFAULT_OUTPUT_ROOT;
  const environment = options.environment || process.env;
  const makeScratch = options.makeScratch || (
    () => fs.mkdtempSync(path.join(os.tmpdir(), 'krux-persona-eval-'))
  );

  if (!HOSTS.includes(host)) throw new Error(`Nieznany host: ${host}`);
  if (variant !== 'all' && !VARIANTS.includes(variant)) {
    throw new Error(`Nieznany wariant: ${variant}`);
  }
  if (!Number.isInteger(reps) || reps <= 0) {
    throw new Error('--reps musi być dodatnią liczbą całkowitą');
  }

  const scratch = makeScratch();
  const results = [];
  let attempts = 0;
  let runDir;
  let writeReport;

  try {
    const lastMessageFile = path.join(scratch, 'last-message.txt');
    const calls = plannedCalls({ host, reps, variant, model }, lastMessageFile);
    if (dryRun) return { status: 'DRY_RUN', calls };

    const generatedAt = now().toISOString();
    const runNonce = path.basename(scratch).replace(/^krux-persona-eval-/, '');
    const runId = [
      generatedAt.replace(/[:.]/g, '-'),
      host,
      variant,
      runNonce,
    ].join('-');
    runDir = path.join(outputRoot, runId);
    fs.mkdirSync(runDir, { recursive: true });
    const metadata = reportMetadata(options, generatedAt);
    const selectedVariants = variant === 'all' ? VARIANTS : [variant];

    writeReport = (status, extras = {}) => {
      const report = {
        status,
        host,
        reps,
        variants: selectedVariants,
        scenarios: SCENARIOS.map(item => item.id),
        attempts,
        results: results.length,
        metadata,
        summary: summarizeResults(results),
        ...extras,
      };
      fs.writeFileSync(path.join(runDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
      return { ...report, results, runDir };
    };

    const hostEnvironment = environmentForHost(host, scratch, environment);

    for (const call of calls) {
      try { fs.unlinkSync(lastMessageFile); } catch {}
      const invocation = call.invocation;
      let completed;
      try {
        completed = spawn(invocation.command, invocation.args, {
          encoding: 'utf8',
          shell: false,
          maxBuffer: MAX_HOST_OUTPUT_BYTES,
          cwd: scratch,
          env: hostEnvironment,
        });
      } catch (error) {
        completed = { status: null, error, stdout: '', stderr: '' };
      }

      if (completed.error) {
        const status = completed.error.code === 'ENOENT' ? 'SKIP' : 'ERROR';
        const reason = status === 'SKIP'
          ? `Brak binarki hosta: ${invocation.command}`
          : completed.error.message;
        const raw = {
          host,
          variant: call.variant,
          scenario: call.scenario,
          repetition: call.repetition,
          prompt: call.prompt,
          response: String(completed.stdout || '').trim(),
          exitCode: completed.status ?? null,
          status,
          error: reason,
        };
        fs.appendFileSync(path.join(runDir, 'raw.jsonl'), `${JSON.stringify(raw)}\n`);
        attempts += 1;
        return writeReport(status, { reason, exitCode: completed.status ?? null });
      }
      if (completed.status !== 0) {
        const reason = (
          completed.stderr || completed.stdout || `Host zakończył kodem ${completed.status}`
        ).trim();
        const raw = {
          host,
          variant: call.variant,
          scenario: call.scenario,
          repetition: call.repetition,
          prompt: call.prompt,
          response: String(completed.stdout || '').trim(),
          exitCode: completed.status,
          status: 'ERROR',
          error: reason,
        };
        fs.appendFileSync(path.join(runDir, 'raw.jsonl'), `${JSON.stringify(raw)}\n`);
        attempts += 1;
        return writeReport('ERROR', { reason, exitCode: completed.status });
      }

      const response = invocation.readsOutputFile && fs.existsSync(lastMessageFile)
        ? fs.readFileSync(lastMessageFile, 'utf8').trim()
        : String(completed.stdout || '').trim();
      const scenario = SCENARIOS.find(item => item.id === call.scenario);
      const raw = {
        host,
        variant: call.variant,
        scenario: call.scenario,
        repetition: call.repetition,
        prompt: call.prompt,
        response,
        exitCode: completed.status,
        status: 'COMPLETE',
      };
      fs.appendFileSync(path.join(runDir, 'raw.jsonl'), `${JSON.stringify(raw)}\n`);
      attempts += 1;

      try {
        const scored = { ...raw, score: score(scenario, response) };
        results.push(scored);
        fs.appendFileSync(
          path.join(runDir, 'scores.jsonl'),
          `${JSON.stringify(scoreArtifact(scored))}\n`
        );
      } catch (error) {
        return writeReport('ERROR', {
          reason: `Scoring ${call.scenario}: ${error.message}`,
          exitCode: completed.status,
        });
      }
    }

    return writeReport('COMPLETE');
  } catch (error) {
    if (!writeReport) throw error;
    return writeReport('ERROR', { reason: error.message, exitCode: null });
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

function rescoreRun(runDir, options = {}) {
  const rawPath = path.join(runDir, 'raw.jsonl');
  if (!fs.existsSync(rawPath)) throw new Error(`Brak raw.jsonl: ${runDir}`);
  const rawRows = fs.readFileSync(rawPath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
  const results = scoreRawRows(rawRows);
  const previousReportPath = path.join(runDir, 'report.json');
  let previous = {};
  if (fs.existsSync(previousReportPath)) {
    try { previous = JSON.parse(fs.readFileSync(previousReportPath, 'utf8')); } catch {}
  }

  const now = options.now || (() => new Date());
  const rescoredAt = now().toISOString();
  const host = rawRows[0]?.host || previous.host || 'unknown';
  const sourceMetadata = previous.sourceMetadata || previous.metadata;
  const currentMetadata = reportMetadata({
    gitSha: options.gitSha,
    model: options.model || sourceMetadata?.model || 'unknown',
    cliVersion: options.cliVersion || sourceMetadata?.cliVersion || 'unknown',
    scenarioSetVersion: scenarioSetVersionForRows(rawRows),
  }, rescoredAt);
  const metadata = {
    ...currentMetadata,
    gitSha: sourceMetadata?.gitSha || currentMetadata.gitSha,
    model: sourceMetadata?.model || currentMetadata.model,
    cliVersion: sourceMetadata?.cliVersion || currentMetadata.cliVersion,
    generatedAt: sourceMetadata?.generatedAt || currentMetadata.generatedAt,
    scorerGitSha: currentMetadata.gitSha,
    rescoredAt,
  };
  const isComplete = row => (
    (row.status === undefined || row.status === 'COMPLETE') &&
    typeof row.response === 'string' &&
    row.response.trim()
  );
  const allSkipped = rawRows.length > 0 && rawRows.every(row => row.status === 'SKIP');
  const status = rawRows.length === 0
    ? 'ERROR'
    : (allSkipped ? 'SKIP' : (rawRows.every(isComplete) ? 'COMPLETE' : 'ERROR'));
  const reason = rawRows.length === 0
    ? 'Pusty raw: brak prób do ponownego scoringu'
    : (allSkipped ? (rawRows[0].error || 'Run pominięty') : undefined);
  const report = {
    status,
    rescored: true,
    host,
    reps: Math.max(0, ...rawRows.map(row => Number(row.repetition) || 0)),
    variants: [...new Set(rawRows.map(row => row.variant).filter(Boolean))],
    scenarios: [...new Set(rawRows.map(row => row.scenario).filter(Boolean))],
    attempts: rawRows.length,
    results: results.length,
    metadata,
    sourceMetadata,
    summary: summarizeResults(results),
    ...(reason ? { reason } : {}),
  };
  fs.writeFileSync(
    path.join(runDir, 'scores.jsonl'),
    results.length
      ? `${results.map(row => JSON.stringify(scoreArtifact(row))).join('\n')}\n`
      : ''
  );
  fs.writeFileSync(previousReportPath, `${JSON.stringify(report, null, 2)}\n`);
  return { ...report, results, runDir };
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = options.rescore
      ? rescoreRun(path.resolve(options.rescore))
      : runEvaluation({ ...options, cliVersion: detectCliVersion(options.host) });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.status === 'ERROR') process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`persona-eval: ${error.message}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  EVALUATOR_VERSION,
  parseArgs,
  commandForHost,
  environmentForHost,
  rescoreRun,
  runEvaluation,
};
