#!/usr/bin/env node
// krux — czysta logika dopasowania triggerów Hordy (bez I/O procesu).
// Wydzielona z krux-horda-trigger.js, żeby dało się ją testować wprost —
// w tym escapeRegex na triggerach ze znakami specjalnymi regexa.

const fs = require('fs');

function fold(text) {
  return text
    .toLowerCase()
    .replace(/ą/g, 'a').replace(/ć/g, 'c').replace(/ę/g, 'e')
    .replace(/ł/g, 'l').replace(/ń/g, 'n').replace(/ó/g, 'o')
    .replace(/ś/g, 's').replace(/ż/g, 'z').replace(/ź/g, 'z');
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Matching best-effort: word-boundary + fold diakrytyków + lowercase;
// polska fleksja celowo nieobsługiwana („błędu" nie łapie „błąd").
function matchedRoles(prompt, triggersPath) {
  let triggers;
  try {
    triggers = JSON.parse(fs.readFileSync(triggersPath, 'utf8'));
  } catch (e) {
    return [];
  }
  const foldedPrompt = fold(prompt);
  const roles = [];
  for (const [role, words] of Object.entries(triggers)) {
    for (const word of words) {
      const re = new RegExp(
        `(?<![\\p{L}\\p{N}])${escapeRegex(fold(word))}(?![\\p{L}\\p{N}])`, 'u'
      );
      if (re.test(foldedPrompt)) {
        roles.push({ role, word });
        break;
      }
    }
  }
  return roles;
}

module.exports = { fold, escapeRegex, matchedRoles };
