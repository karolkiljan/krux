const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const skill = fs.readFileSync(path.join(ROOT, 'skills', 'krux', 'SKILL.md'), 'utf8');
const examples = fs.readFileSync(path.join(ROOT, 'skills', 'krux', 'examples.md'), 'utf8');
const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');

test('rdzeń persony zostaje mały i ma jawne warunki doczytania', () => {
  const words = (skill.match(/\S+/g) || []).length;
  assert.ok(Buffer.byteLength(skill) <= 8_500, `SKILL.md ma ${Buffer.byteLength(skill)} B`);
  assert.ok(words <= 1_100, `SKILL.md ma ${words} słów`);
  assert.match(skill, /\*\*Czytaj gdy:\*\*/);
  assert.match(skill, /robota\.md[^\n]+\*\*Czytaj gdy:\*\*[^\n]+kod/);
});

test('kontrakt ma hierarchię, raport, granice i model A\/B\/C', () => {
  assert.match(skill, /poprawność > bezpieczeństwo i kompatybilność[\s\S]*> dramaturgia/);
  const robota = fs.readFileSync(path.join(ROOT, 'skills', 'krux', 'robota.md'), 'utf8');
  assert.match(robota, /Kontrakt raportu[\s\S]*Wynik[\s\S]*Jak działa[\s\S]*Weryfikacja/);
  assert.match(skill, /Bloki kodu, JSON, commit messages[\s\S]*pisz neutralnie/);
  assert.match(skill, /Regresja A\/B\/C:[\s\S]*A = rozmycie[\s\S]*B = cel[\s\S]*C = przesterowanie/);
});

test('przykłady nie uczą utraty technicznych warunków retry i rewrite', () => {
  assert.match(examples, /Retry tylko timeout\/429\/5xx[\s\S]*Retry-After[\s\S]*idempotency key/);
  assert.match(examples, /Brak danych do werdyktu[\s\S]*plan migracji i rollback/);
  assert.match(examples, /Krux C — błąd/);
  assert.doesNotMatch(examples, /Błąd tu\. Brakować domknięcia nawiasu/);
  assert.match(examples, /Bez tego diagnoza = zgadywanie/);
  assert.match(examples, /Normalnie:[^\n]+awaryjność[^\n]+testami kontraktowymi[^\n]+plan migracji i rollbacku/);
  assert.doesNotMatch(readme, /Fix linia 14/);
  assert.match(examples, /Krux A — rozmycie/);
  assert.match(examples, /fast-forward/);
  assert.match(examples, /Krux C — błąd:[^\n]+gubi fast-forward/);
  assert.match(readme, /`React\.memo` child[\s\S]*shallow compare/);
  assert.match(readme, /`exp < now`[\s\S]*`exp === now`[\s\S]*`exp <= now`/);
});

test('delegacja nie ucina kontraktu raportu do summary', () => {
  const orchestration = fs.readFileSync(path.join(ROOT, 'skills', 'krux', 'orchestration.md'), 'utf8');
  assert.match(orchestration, /summary[^\n]+pierwsze zdanie/);
  assert.match(orchestration, /nietrywialnej zmianie[\s\S]*Jak działa[\s\S]*Dlaczego[\s\S]*Czytaj od[\s\S]*Weryfikacja/);
  assert.doesNotMatch(orchestration, /Reszta pól = dla mnie, nie dla usera/);
});

test('ork dostaje jawny stan persony zamiast udawać dziedziczenie kontekstu', () => {
  const common = fs.readFileSync(path.join(ROOT, 'agents', '_common.md'), 'utf8');
  const orchestration = fs.readFileSync(path.join(ROOT, 'skills', 'krux', 'orchestration.md'), 'utf8');
  assert.match(common, /Subagent nie dziedziczy kontekstu persony/);
  assert.match(common, /Brak jawnego stanu → bezpieczny fallback `off`/);
  assert.match(orchestration, /Każdy prompt spawnu zawiera jawne `persona=on` albo `persona=off`/);
});
