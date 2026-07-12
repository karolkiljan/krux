#!/usr/bin/env node
// krux — generuje agents-codex/*.toml (format subagentów Codex CLI) z
// agents/ork-*.md (Markdown + YAML frontmatter, format Claude Code).
// agents/ork-*.md zostaje jedynym źródłem prawdy — ten skrypt tylko tłumaczy.

const fs = require('fs');
const path = require('path');

const AGENTS_DIR = path.join(__dirname, '..', 'agents');
const OUT_DIR = path.join(__dirname, '..', 'agents-codex');

function parseOrk(file) {
  const content = fs.readFileSync(file, 'utf8');
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) throw new Error(`${file}: brak frontmatter YAML`);
  const [, frontmatter, body] = fmMatch;

  const name = (frontmatter.match(/^name:\s*(\S+)\s*$/m) || [])[1];
  if (!name) throw new Error(`${file}: brak pola name`);

  const descMatch = frontmatter.match(/^description:\s*>\n([\s\S]*?)(?=\n[a-z]+:)/m);
  if (!descMatch) throw new Error(`${file}: brak folded-scalar description`);
  const description = descMatch[1]
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .join(' ');

  const toolsMatch = frontmatter.match(/^tools:\s*\[([^\n]+)\]/m);
  if (!toolsMatch) throw new Error(`${file}: brak pola tools`);
  const tools = JSON.parse(`[${toolsMatch[1]}]`);
  const sandboxMode = (tools.includes('Edit') || tools.includes('Write'))
    ? 'workspace-write'
    : 'read-only';

  return { name, description, sandboxMode, instructions: body.trim() };
}

function toToml({ name, description, sandboxMode, instructions }) {
  const escLine = s => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return [
    `name = "${escLine(name)}"`,
    `description = "${escLine(description)}"`,
    `sandbox_mode = "${sandboxMode}"`,
    `developer_instructions = """`,
    instructions,
    `"""`,
    '',
  ].join('\n');
}

function generateAll() {
  const files = fs.readdirSync(AGENTS_DIR)
    .filter(f => f.startsWith('ork-') && f.endsWith('.md'));
  return files.map(file => {
    const ork = parseOrk(path.join(AGENTS_DIR, file));
    return {
      name: ork.name,
      content: toToml(ork),
      outPath: path.join(OUT_DIR, `${ork.name}.toml`),
    };
  });
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const results = generateAll();
  for (const { content, outPath } of results) {
    fs.writeFileSync(outPath, content);
  }
  console.log(`Wygenerowano ${results.length} plików w ${OUT_DIR}`);
}

if (require.main === module) main();

module.exports = { parseOrk, toToml, generateAll, AGENTS_DIR, OUT_DIR };
