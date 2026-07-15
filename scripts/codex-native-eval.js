#!/usr/bin/env node

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const {
  SCORER_VERSION,
  SCENARIO_SET_VERSION,
  SCENARIOS,
  scoreResponse,
  scoreRawRows,
  summarizeResults,
} = require('./lib/persona-eval');
const { totalFinalGuardActivations } = require('../hooks/lib/drift-guard');

const ROOT = path.join(__dirname, '..');
const DEFAULT_OUTPUT_ROOT = path.join(ROOT, 'benchmarks', 'codex-native-eval');
const PERSONALITIES = ['none', 'pragmatic', 'friendly'];
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;
const EVALUATOR_VERSION = 3;
const MIN_NATIVE_PERSONA_PASS_RATE = 0.8;
const MIN_PERSONA_PASS_RATE = MIN_NATIVE_PERSONA_PASS_RATE;
const ACCEPTANCE_CRITERIA = Object.freeze({
  nativeEveryTurnAnchored: true,
  controlHasNoKruxContext: true,
  minContinuationCountPerRepetition: 1,
  nativeTaskPassRate: 1,
  nativePersonaPassRateMin: MIN_PERSONA_PASS_RATE,
  nativePersonaMustBeatControl: true,
  maxWordInflationVsControl: 0,
});

function scenario(id) {
  const found = SCENARIOS.find(item => item.id === id);
  if (!found) throw new Error(`Brak scenariusza: ${id}`);
  return found;
}

const BASE_TURNS = SCENARIOS.map(item => ({
  key: `base-${item.id}`,
  kind: 'base',
  scenario: item.id,
  prompt: item.prompt,
}));

const TOOL_SCENARIO = scenario('context-summary-probe');
const TOOL_PROBE = {
  key: 'tool-probe',
  kind: 'tool-probe',
  scenario: TOOL_SCENARIO.id,
  prompt: [
    'Najpierw wykonaj dokładnie cztery osobne wywołania narzędzia terminal, bez łączenia poleceń:',
    '`pwd`, `uname -s`, `node --version`, `git --version`.',
    'Narzędzia służą tylko do próby lifecycle; nie opisuj ich wyników.',
    `Potem odpowiedz wyłącznie na zadanie: ${TOOL_SCENARIO.prompt}`,
  ].join(' '),
};

const DRIFT_IDS = ['causal-chain', 'work-report', 'no-offer-ending'];
const DRIFT_TURNS = DRIFT_IDS.map((id, index) => {
  const item = scenario(id);
  return {
    key: `drift-${index + 1}-${id}`,
    kind: 'drift',
    scenario: id,
    prompt: `Próba stabilności po długiej rozmowie. ${item.prompt}`,
  };
});

const TURN_BLUEPRINT = Object.freeze([...BASE_TURNS, TOOL_PROBE, ...DRIFT_TURNS]);

function parseArgs(argv) {
  const options = { model: undefined, reps: 5, personality: 'none', dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--model') options.model = argv[++index];
    else if (arg === '--reps') options.reps = Number(argv[++index]);
    else if (arg === '--personality') options.personality = argv[++index];
    else if (arg === '--rescore') options.rescore = argv[++index];
    else if (arg === '--dry-run') options.dryRun = true;
    else throw new Error(`Nieznany argument: ${arg}`);
  }
  if ('rescore' in options) {
    if (!options.rescore) throw new Error('--rescore wymaga katalogu runu');
    return { rescore: options.rescore };
  }
  if (!options.model) throw new Error('Wymagane --model <model-id>');
  if (!Number.isInteger(options.reps) || options.reps <= 0) {
    throw new Error('--reps musi być dodatnią liczbą całkowitą');
  }
  if (!PERSONALITIES.includes(options.personality)) {
    throw new Error(`Nieznane personality: ${options.personality}`);
  }
  return options;
}

function invocationForTurn(turn, index, options, outputFile, threadId = '<THREAD_ID>', workdir) {
  const configArgs = ['-m', options.model, '-c', `personality="${options.personality}"`];
  const hookTrust = options.variant === 'native'
    ? ['--dangerously-bypass-hook-trust']
    : [];
  const outputArgs = ['-o', outputFile];

  if (index === 0) {
    return {
      command: 'codex',
      args: [
        'exec',
        '--json',
        ...hookTrust,
        '--skip-git-repo-check',
        '--ignore-rules',
        '-s',
        'read-only',
        ...(workdir ? ['-C', workdir] : []),
        ...configArgs,
        ...outputArgs,
        turn.prompt,
      ],
    };
  }

  return {
    command: 'codex',
    args: [
      'exec',
      'resume',
      '--json',
      ...hookTrust,
      '--skip-git-repo-check',
      '--ignore-rules',
      ...configArgs,
      ...outputArgs,
      threadId,
      turn.prompt,
    ],
  };
}

function plannedTurns(options, outputDir) {
  return TURN_BLUEPRINT.map((turn, index) => ({
    ...turn,
    turnIndex: index + 1,
    ...invocationForTurn(
      turn,
      index,
      options,
      path.join(outputDir, `turn-${String(index + 1).padStart(2, '0')}.txt`),
    ),
  }));
}

function evaluationPlan(options, outputDir) {
  const calls = [];
  for (const variant of ['control', 'native']) {
    for (let repetition = 1; repetition <= options.reps; repetition += 1) {
      for (const call of plannedTurns({ ...options, variant }, outputDir)) {
        calls.push({ ...call, variant, repetition });
      }
    }
  }
  return calls;
}

function parseCodexJson(stdout) {
  let threadId;
  const agentMessages = [];
  for (const line of String(stdout || '').split('\n').filter(Boolean)) {
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    if (event.type === 'thread.started' && event.thread_id) threadId = event.thread_id;
    if (event.type === 'item.completed' && event.item?.type === 'agent_message') {
      const text = event.item.text || event.item.message;
      if (typeof text === 'string') agentMessages.push(text);
    }
  }
  return { threadId, agentMessages };
}

function extractTranscriptEvidence(transcript) {
  const contexts = [];
  for (const line of String(transcript || '').split('\n').filter(Boolean)) {
    let record;
    try { record = JSON.parse(line); } catch { continue; }
    const payload = record.type === 'response_item' ? record.payload : null;
    if (payload?.type !== 'message' || payload.role !== 'developer') continue;
    for (const item of payload.content || []) {
      if (item?.type !== 'input_text' || typeof item.text !== 'string') continue;
      if (/^KRUX (?:PERSONA ACTIVE|TURN|CONTINUATION)\b/u.test(item.text)) {
        contexts.push(item.text);
      }
    }
  }
  return {
    contexts,
    persona: contexts.some(text => /^KRUX PERSONA ACTIVE\b/u.test(text)),
    turn: contexts.some(text => /^KRUX TURN\b/u.test(text)),
    continuation: contexts.some(text => /^KRUX CONTINUATION\b/u.test(text)),
  };
}

function createIsolatedHome(sourceCodexHome, targetCodexHome) {
  fs.mkdirSync(targetCodexHome, { recursive: true, mode: 0o700 });
  const sourceAuth = path.join(sourceCodexHome, 'auth.json');
  if (!fs.existsSync(sourceAuth)) return;
  const targetAuth = path.join(targetCodexHome, 'auth.json');
  fs.copyFileSync(sourceAuth, targetAuth);
  fs.chmodSync(targetAuth, 0o600);
}

function pluginDataDir(codexHome) {
  return path.join(codexHome, 'plugins', 'data', 'krux-krux-marketplace');
}

function cleanEnvironment(environment, home, codexHome) {
  const clean = {};
  for (const [key, value] of Object.entries(environment)) {
    if (key.startsWith('KRUX_')) continue;
    if (key === 'PLUGIN_ROOT' || key === 'PLUGIN_DATA') continue;
    if (key.startsWith('CLAUDE_PLUGIN_')) continue;
    clean[key] = value;
  }
  return { ...clean, HOME: home, CODEX_HOME: codexHome };
}

function listJsonlFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const files = [];
  const visit = current => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (entry.isFile() && entry.name.endsWith('.jsonl')) files.push(target);
    }
  };
  visit(dir);
  return files;
}

function transcriptSnapshot(codexHome) {
  const snapshot = new Map();
  for (const file of listJsonlFiles(path.join(codexHome, 'sessions'))) {
    snapshot.set(file, fs.statSync(file).size);
  }
  return snapshot;
}

function appendedTranscript(codexHome, before) {
  const chunks = [];
  for (const file of listJsonlFiles(path.join(codexHome, 'sessions'))) {
    const buffer = fs.readFileSync(file);
    const offset = before.get(file) || 0;
    if (buffer.length > offset) chunks.push(buffer.subarray(offset).toString('utf8'));
  }
  return chunks.join('\n');
}

function currentGitSha() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'unknown';
  }
}

function codexVersion(spawn) {
  const result = spawn('codex', ['--version'], { encoding: 'utf8', shell: false });
  if (result.error || result.status !== 0) return 'unknown';
  return String(result.stdout || result.stderr || '').trim() || 'unknown';
}

function appendJson(file, value) {
  fs.appendFileSync(file, `${JSON.stringify(value)}\n`);
}

function scoreArtifact(row) {
  return {
    variant: row.variant,
    scenario: row.scenario,
    repetition: row.repetition,
    turnIndex: row.turnIndex,
    score: row.score,
  };
}

function spawnCodex(spawn, args, options) {
  try {
    return spawn('codex', args, {
      encoding: 'utf8',
      shell: false,
      maxBuffer: MAX_OUTPUT_BYTES,
      ...options,
    });
  } catch (error) {
    return { status: null, error, stdout: '', stderr: '' };
  }
}

function installNativePlugin(spawn, env, cwd) {
  for (const args of [
    ['plugin', 'marketplace', 'add', ROOT, '--json'],
    ['plugin', 'add', 'krux@krux-marketplace', '--json'],
  ]) {
    const result = spawnCodex(spawn, args, { env, cwd });
    if (result.error || result.status !== 0) return { result, args };
  }
  return null;
}

function reportEvidence(rows) {
  const native = rows.filter(row => row.variant === 'native' && row.status === 'COMPLETE');
  const control = rows.filter(row => row.variant === 'control' && row.status === 'COMPLETE');
  const continuationCount = native.reduce(
    (sum, row) => sum + (row.hookEvidence.continuation ? 1 : 0),
    0,
  );
  const finalGuardActivations = native.reduce((sum, row) => sum + row.guardActivations, 0);
  return {
    nativeTurns: native.length,
    controlTurns: control.length,
    nativeEveryTurnAnchored: native.length > 0 && native.every(row => (
      row.hookEvidence.persona || row.hookEvidence.turn || row.hookEvidence.continuation
    )),
    controlHasNoKruxContext: control.every(row => row.hookEvidence.contexts.length === 0),
    continuationCount,
    finalGuardActivations,
  };
}

function acceptanceGates(summary, evidence, reps = 1) {
  return {
    nativeEveryTurnAnchored: (
      evidence?.nativeEveryTurnAnchored === ACCEPTANCE_CRITERIA.nativeEveryTurnAnchored
    ),
    controlHasNoKruxContext: (
      evidence?.controlHasNoKruxContext === ACCEPTANCE_CRITERIA.controlHasNoKruxContext
    ),
    continuationPerRepetition: (
      typeof evidence?.continuationCount === 'number'
      && evidence.continuationCount >= reps * ACCEPTANCE_CRITERIA.minContinuationCountPerRepetition
    ),
    nativeTaskPass: summary.native?.taskPassRate === 1,
    nativePersonaFloor: summary.native?.personaPassRate >= MIN_NATIVE_PERSONA_PASS_RATE,
    nativePersonaBeatsControl: (
      typeof summary.native?.personaPassRate === 'number'
      && typeof summary.control?.personaPassRate === 'number'
      && summary.native.personaPassRate > summary.control.personaPassRate
    ),
    noWordInflation: (
      typeof summary.native?.wordInflationVsControl === 'number'
      && summary.native.wordInflationVsControl <= 0
    ),
  };
}

function acceptedSummary(summary, evidence, reps = 1) {
  return Object.values(acceptanceGates(summary, evidence, reps)).every(Boolean);
}

function rescoreRun(runDir, options = {}) {
  const resolved = path.resolve(runDir);
  const rawPath = path.join(resolved, 'raw.jsonl');
  const reportPath = path.join(resolved, 'report.json');
  if (!fs.existsSync(rawPath)) throw new Error(`Brak raw.jsonl: ${resolved}`);
  if (!fs.existsSync(reportPath)) throw new Error(`Brak report.json: ${resolved}`);

  const rows = fs.readFileSync(rawPath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
  const previous = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const scoredRows = scoreRawRows(rows);
  const reps = previous.reps || Math.max(0, ...rows.map(row => Number(row.repetition) || 0));
  const rawComplete = rows.length > 0
    && scoredRows.length === rows.length
    && (previous.attempts === undefined || previous.attempts === rows.length);
  const status = previous.status === 'COMPLETE' && !rawComplete
    ? 'ERROR'
    : previous.status;
  const summary = summarizeResults(scoredRows);
  const evidence = reportEvidence(rows);
  const gates = acceptanceGates(summary, evidence, reps);
  const now = options.now || (() => new Date());
  const metadata = {
    ...(previous.metadata || {}),
    evaluatorVersion: EVALUATOR_VERSION,
    scorerVersion: SCORER_VERSION,
    scenarioSetVersion: SCENARIO_SET_VERSION,
    rescoredAt: now().toISOString(),
    rescoreGitSha: options.gitSha || currentGitSha(),
  };
  const report = {
    ...previous,
    status,
    reps,
    attempts: rows.length,
    metadata,
    summary,
    evidence,
    acceptanceCriteria: ACCEPTANCE_CRITERIA,
    gates,
    accepted: status === 'COMPLETE' && acceptedSummary(summary, evidence, reps),
  };
  if (!rawComplete) report.rescoreError = 'Raw jest pusty, niekompletny albo nie zgadza się z attempts';

  const scoreText = scoredRows.length
    ? `${scoredRows.map(row => JSON.stringify(scoreArtifact(row))).join('\n')}\n`
    : '';
  fs.writeFileSync(path.join(resolved, 'scores.jsonl'), scoreText);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return { ...report, rows, runDir: resolved };
}

function runEvaluation(options) {
  const model = options.model;
  const reps = options.reps ?? 5;
  const personality = options.personality ?? 'none';
  const dryRun = options.dryRun ?? false;
  if (!model) throw new Error('Wymagane --model <model-id>');
  if (!Number.isInteger(reps) || reps <= 0) throw new Error('--reps musi być dodatnią liczbą całkowitą');
  if (!PERSONALITIES.includes(personality)) throw new Error(`Nieznane personality: ${personality}`);

  const planned = evaluationPlan({ model, reps, personality }, '/tmp/krux-codex-native-eval');
  if (dryRun) return { status: 'DRY_RUN', calls: planned };

  const spawn = options.spawn || spawnSync;
  const environment = options.environment || process.env;
  const outputRoot = options.outputRoot || DEFAULT_OUTPUT_ROOT;
  const now = options.now || (() => new Date());
  const makeScratch = options.makeScratch || (
    () => fs.mkdtempSync(path.join(os.tmpdir(), 'krux-codex-native-eval-'))
  );
  const scratch = makeScratch();
  const generatedAt = now().toISOString();
  const runId = `${generatedAt.replace(/[:.]/g, '-')}-${model.replace(/[^A-Za-z0-9_.-]/g, '_')}-${path.basename(scratch)}`;
  const runDir = path.join(outputRoot, runId);
  fs.mkdirSync(runDir, { recursive: true });

  const rows = [];
  const scoredRows = [];
  const rawPath = path.join(runDir, 'raw.jsonl');
  const scoresPath = path.join(runDir, 'scores.jsonl');
  const transcriptPath = path.join(runDir, 'transcript-evidence.jsonl');
  const metadata = {
    evaluatorVersion: EVALUATOR_VERSION,
    scorerVersion: SCORER_VERSION,
    scenarioSetVersion: SCENARIO_SET_VERSION,
    gitSha: options.gitSha || currentGitSha(),
    model,
    personality,
    cliVersion: options.cliVersion || codexVersion(spawn),
    generatedAt,
  };

  const writeReport = (status, extras = {}) => {
    const summary = summarizeResults(scoredRows);
    const evidence = reportEvidence(rows);
    const gates = acceptanceGates(summary, evidence, reps);
    const report = {
      status,
      reps,
      turnsPerSession: TURN_BLUEPRINT.length,
      attempts: rows.length,
      metadata,
      summary,
      evidence,
      acceptanceCriteria: ACCEPTANCE_CRITERIA,
      accepted: status === 'COMPLETE' && acceptedSummary(summary, evidence, reps),
      gates,
      ...extras,
    };
    fs.writeFileSync(path.join(runDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    return { ...report, rows, runDir };
  };

  try {
    const sourceCodexHome = environment.CODEX_HOME || path.join(os.homedir(), '.codex');
    const homes = {};
    const envs = {};
    for (const variant of ['control', 'native']) {
      const home = path.join(scratch, `${variant}-home`);
      const codexHome = path.join(home, '.codex');
      createIsolatedHome(sourceCodexHome, codexHome);
      homes[variant] = { home, codexHome };
      envs[variant] = cleanEnvironment(environment, home, codexHome);
    }

    const installFailure = installNativePlugin(spawn, envs.native, scratch);
    if (installFailure) {
      const { result, args } = installFailure;
      const status = result.error?.code === 'ENOENT' ? 'SKIP' : 'ERROR';
      const reason = result.error?.message
        || String(result.stderr || result.stdout || `codex ${args.join(' ')} failed`).trim();
      return writeReport(status, { reason, exitCode: result.status ?? null });
    }

    for (const variant of ['control', 'native']) {
      for (let repetition = 1; repetition <= reps; repetition += 1) {
        const workdir = path.join(scratch, 'work', `${variant}-${repetition}`);
        const outputDir = path.join(scratch, 'output', `${variant}-${repetition}`);
        fs.mkdirSync(workdir, { recursive: true });
        fs.mkdirSync(outputDir, { recursive: true });
        let threadId;

        for (let index = 0; index < TURN_BLUEPRINT.length; index += 1) {
          const turn = TURN_BLUEPRINT[index];
          const outputFile = path.join(outputDir, `turn-${String(index + 1).padStart(2, '0')}.txt`);
          try { fs.unlinkSync(outputFile); } catch {}
          const before = transcriptSnapshot(homes[variant].codexHome);
          const guardCountBefore = totalFinalGuardActivations(
            pluginDataDir(homes[variant].codexHome),
          );
          const invocation = invocationForTurn(
            turn,
            index,
            { model, personality, variant },
            outputFile,
            threadId,
            workdir,
          );
          const completed = spawnCodex(spawn, invocation.args, {
            cwd: workdir,
            env: envs[variant],
          });
          const parsed = parseCodexJson(completed.stdout);
          if (index === 0 && parsed.threadId) threadId = parsed.threadId;
          const transcript = appendedTranscript(homes[variant].codexHome, before);
          const hookEvidence = extractTranscriptEvidence(transcript);
          const guardActivations = Math.max(
            0,
            totalFinalGuardActivations(pluginDataDir(homes[variant].codexHome))
              - guardCountBefore,
          );
          appendJson(transcriptPath, {
            variant,
            repetition,
            turnIndex: index + 1,
            turnKey: turn.key,
            ...hookEvidence,
          });

          const response = fs.existsSync(outputFile)
            ? fs.readFileSync(outputFile, 'utf8').trim()
            : (parsed.agentMessages.at(-1) || '').trim();
          const raw = {
            variant,
            scenario: turn.scenario,
            repetition,
            turnIndex: index + 1,
            turnKey: turn.key,
            kind: turn.kind,
            prompt: turn.prompt,
            response,
            preGuardResponse: guardActivations > 0 && parsed.agentMessages.length > 1
              ? parsed.agentMessages.at(-2)
              : null,
            agentMessages: parsed.agentMessages,
            guardActivations,
            hookEvidence,
            exitCode: completed.status ?? null,
            status: completed.error || completed.status !== 0 ? 'ERROR' : 'COMPLETE',
          };
          if (completed.error || completed.status !== 0) {
            raw.error = completed.error?.message
              || String(completed.stderr || completed.stdout || 'Codex failed').trim();
          }
          appendJson(rawPath, raw);
          rows.push(raw);

          if (raw.status !== 'COMPLETE') {
            return writeReport(completed.error?.code === 'ENOENT' ? 'SKIP' : 'ERROR', {
              reason: raw.error,
              exitCode: raw.exitCode,
            });
          }
          if (!threadId) {
            return writeReport('ERROR', {
              reason: `Brak thread_id po pierwszej turze ${variant}/${repetition}`,
              exitCode: raw.exitCode,
            });
          }

          const scored = {
            ...raw,
            score: scoreResponse(scenario(turn.scenario), response),
          };
          scoredRows.push(scored);
          appendJson(scoresPath, scoreArtifact(scored));
        }
      }
    }

    return writeReport('COMPLETE');
  } catch (error) {
    return writeReport('ERROR', { reason: error.message, exitCode: null });
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = options.rescore
      ? rescoreRun(options.rescore)
      : runEvaluation(options);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.status === 'ERROR') process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`codex-native-eval: ${error.message}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  EVALUATOR_VERSION,
  MIN_PERSONA_PASS_RATE,
  ACCEPTANCE_CRITERIA,
  PERSONALITIES,
  TURN_BLUEPRINT,
  parseArgs,
  plannedTurns,
  evaluationPlan,
  parseCodexJson,
  extractTranscriptEvidence,
  createIsolatedHome,
  MIN_NATIVE_PERSONA_PASS_RATE,
  acceptanceGates,
  acceptedSummary,
  rescoreRun,
  runEvaluation,
};
