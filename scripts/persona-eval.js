#!/usr/bin/env node

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  VARIANTS,
  SCENARIOS,
  composePrompt,
  scoreResponse,
  summarizeResults,
} = require('./lib/persona-eval');

const DEFAULT_OUTPUT_ROOT = path.join(__dirname, '..', 'benchmarks', 'persona-eval');
const HOSTS = ['codex', 'claude'];

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
    else if (arg === '--dry-run') options.dryRun = true;
    else throw new Error(`Nieznany argument: ${arg}`);
  }

  if (!options.host) throw new Error('Wymagane --host codex|claude');
  if (!HOSTS.includes(options.host)) throw new Error(`Nieznany host: ${options.host}`);
  if (options.variant !== 'all' && !VARIANTS.includes(options.variant)) {
    throw new Error(`Nieznany wariant: ${options.variant}`);
  }
  if (!Number.isInteger(options.reps) || options.reps <= 0) {
    throw new Error('--reps musi być dodatnią liczbą całkowitą');
  }
  return options;
}

function commandForHost(host, prompt, outputFile) {
  if (host === 'codex') {
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
        prompt,
      ],
      readsOutputFile: true,
    };
  }
  if (host === 'claude') {
    return {
      command: 'claude',
      args: [
        '--safe-mode',
        '-p',
        '--tools',
        '',
        '--no-session-persistence',
        prompt,
      ],
      readsOutputFile: false,
    };
  }
  throw new Error(`Nieznany host: ${host}`);
}

function plannedCalls({ host, reps, variant }, outputFile) {
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
          invocation: commandForHost(host, prompt, outputFile),
        });
      }
    }
  }
  return calls;
}

function runEvaluation(options) {
  const host = options.host;
  const reps = options.reps ?? 5;
  const variant = options.variant ?? 'all';
  const dryRun = options.dryRun ?? false;
  const spawn = options.spawn || spawnSync;
  const now = options.now || (() => new Date());
  const outputRoot = options.outputRoot || DEFAULT_OUTPUT_ROOT;

  if (!HOSTS.includes(host)) throw new Error(`Nieznany host: ${host}`);
  if (variant !== 'all' && !VARIANTS.includes(variant)) {
    throw new Error(`Nieznany wariant: ${variant}`);
  }
  if (!Number.isInteger(reps) || reps <= 0) {
    throw new Error('--reps musi być dodatnią liczbą całkowitą');
  }

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'krux-persona-eval-'));
  const lastMessageFile = path.join(scratch, 'last-message.txt');
  const calls = plannedCalls({ host, reps, variant }, lastMessageFile);
  if (dryRun) {
    fs.rmSync(scratch, { recursive: true, force: true });
    return { status: 'DRY_RUN', calls };
  }

  const runId = `${now().toISOString().replace(/[:.]/g, '-')}-${host}`;
  const runDir = path.join(outputRoot, runId);
  const results = [];
  let runDirCreated = false;

  try {
    for (const call of calls) {
      try { fs.unlinkSync(lastMessageFile); } catch {}
      const invocation = commandForHost(host, call.prompt, lastMessageFile);
      const completed = spawn(invocation.command, invocation.args, {
        encoding: 'utf8',
        shell: false,
        cwd: scratch,
        env: process.env,
      });

      if (completed.error?.code === 'ENOENT') {
        return {
          status: 'SKIP',
          reason: `Brak binarki hosta: ${invocation.command}`,
          host,
        };
      }
      if (completed.error) {
        return {
          status: 'ERROR',
          reason: completed.error.message,
          host,
        };
      }
      if (completed.status !== 0) {
        return {
          status: 'ERROR',
          reason: (completed.stderr || `Host zakończył kodem ${completed.status}`).trim(),
          exitCode: completed.status,
          host,
        };
      }

      const response = invocation.readsOutputFile && fs.existsSync(lastMessageFile)
        ? fs.readFileSync(lastMessageFile, 'utf8').trim()
        : String(completed.stdout || '').trim();
      const scenario = SCENARIOS.find(item => item.id === call.scenario);
      const row = {
        host,
        variant: call.variant,
        scenario: call.scenario,
        repetition: call.repetition,
        prompt: call.prompt,
        response,
        exitCode: completed.status,
        score: scoreResponse(scenario, response),
      };

      if (!runDirCreated) {
        fs.mkdirSync(runDir, { recursive: true });
        runDirCreated = true;
      }
      fs.appendFileSync(path.join(runDir, 'raw.jsonl'), `${JSON.stringify(row)}\n`);
      results.push(row);
    }

    const summary = summarizeResults(results);
    const report = {
      status: 'COMPLETE',
      host,
      reps,
      variants: variant === 'all' ? VARIANTS : [variant],
      scenarios: SCENARIOS.map(item => item.id),
      results: results.length,
      summary,
    };
    fs.writeFileSync(path.join(runDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    return { ...report, results, runDir };
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = runEvaluation(options);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.status === 'ERROR') process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`persona-eval: ${error.message}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  parseArgs,
  commandForHost,
  runEvaluation,
};
