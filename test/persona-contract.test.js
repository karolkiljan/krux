const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const skill = fs.readFileSync(path.join(ROOT, 'skills', 'krux', 'SKILL.md'), 'utf8');
const examples = fs.readFileSync(path.join(ROOT, 'skills', 'krux', 'examples.md'), 'utf8');
const moods = fs.readFileSync(path.join(ROOT, 'skills', 'krux', 'moods.md'), 'utf8');
const lore = fs.readFileSync(path.join(ROOT, 'skills', 'krux', 'lore.md'), 'utf8');
const autoDisable = fs.readFileSync(path.join(ROOT, 'skills', 'krux', 'auto-disable.md'), 'utf8');
const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
const compact = text => text.replace(/\s+/g, ' ');

function readOptional(file) {
  try { return fs.readFileSync(path.join(ROOT, file), 'utf8'); }
  catch { return ''; }
}

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

test('orkiestracja rozdziela wspólne zasady od adapterów hosta', () => {
  const orchestration = readOptional('skills/krux/orchestration.md');
  assert.match(skill, /\.\.\/\.\.\/agents\/triggers\.json/);
  assert.match(orchestration, /orchestration-claude\.md/);
  assert.match(orchestration, /orchestration-codex\.md/);
  assert.match(orchestration, /agents\/triggers\.json/);
  assert.match(orchestration, /persona=on/);
  assert.match(orchestration, /SOLO[\s\S]*ŁAŃCUCH[\s\S]*RÓWNOLEGLE/);
});

test('adapter Codexa używa natywnych subagentów i wspólnych definicji ról', () => {
  const codex = readOptional('skills/krux/orchestration-codex.md');
  assert.match(codex, /natywn(?:y|e|ych) subagent/i);
  assert.match(codex, /agents\/ork-\*\.md/);
  assert.match(codex, /agents\/_common\.md/);
  assert.match(codex, /persona=on\|off/);
  assert.match(codex, /czekaj|wait/i);
  assert.match(codex, /Pomiń[\s\S]*`tools`[\s\S]*`model`[\s\S]*`color`/);
  assert.match(codex, /Pomiń[\s\S]*\$\{CLAUDE_PLUGIN_ROOT\}/);
  assert.doesNotMatch(codex, /`Agent`|@krux:|sonnet|opus|haiku/i);
});

test('adapter Claude zachowuje Agent tool, nazwy orków i modele', () => {
  const claude = readOptional('skills/krux/orchestration-claude.md');
  assert.match(claude, /`Agent`/);
  assert.match(claude, /@krux:ork-/);
  assert.match(claude, /sonnet[\s\S]*opus[\s\S]*haiku/i);
});

test('flavor orków niesie mostek dawna-rola-górnicza → dzisiejsza robota', () => {
  const bridges = {
    'ork-tropiciel': /Dawniej węszył żyłę rudy[\s\S]*Dziś węszy stack trace/,
    'ork-kowal': /Dawniej kuł stemple[\s\S]*Dziś kuje endpointy/,
    'ork-sedzia': /Dawniej sprawdzał każdą podporę[\s\S]*Dziś sprawdza kod/,
    'ork-malarz': /Dawniej znaczył ściany[\s\S]*Dziś maluje twarz kopalni/,
    'ork-tester': /Dawniej uderzał młotkiem[\s\S]*Dziś uderza w kod/,
    'ork-burzyciel': /Dawniej wysadzał martwe chodniki[\s\S]*Dziś[\s\S]*burzy martwy kod/,
  };
  for (const [file, pattern] of Object.entries(bridges)) {
    const content = fs.readFileSync(path.join(ROOT, 'agents', `${file}.md`), 'utf8');
    assert.match(content, pattern, `${file}: brak mostka górniczo-kodowego`);
  }
});

test('orchestration ma bramkę korzyści i jawną tożsamość dowódcy Hordy', () => {
  const orchestration = fs.readFileSync(path.join(ROOT, 'skills', 'krux', 'orchestration.md'), 'utf8');
  assert.match(orchestration, /Krux dowodzi Hordą/);
  assert.match(orchestration, /## Bramka korzyści/);
  assert.match(orchestration, /izolacja kontekstu/);
  assert.match(orchestration, /świeże oko/);
  assert.match(orchestration, /równoległość/);
  assert.match(orchestration, /zamknięta procedura/);
});

test('martwe generowane agenty Codexa nie są częścią pluginu', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(fs.existsSync(path.join(ROOT, 'agents-codex')), false);
  assert.equal(fs.existsSync(path.join(ROOT, 'scripts', 'generate-codex-agents.js')), false);
  assert.equal(fs.existsSync(path.join(ROOT, 'test', 'agents-codex-sync.test.js')), false);
  assert.equal('generate:codex-agents' in packageJson.scripts, false);
});

test('wyłączenie persony wymaga neutralnego potwierdzenia', () => {
  assert.match(skill, /\$krux:krux off[^\n]+Potwierdź neutralnie/);
  assert.doesNotMatch(skill, /wyłączenie w stylu orkowym/);
});

test('auto-disable wycisza fragment bez zmiany stanu persony', () => {
  assert.match(autoDisable, /Nie zmieniaj stanu persony/i);
  assert.match(autoDisable, /neutralny fragment/i);
  assert.match(autoDisable, /Po tym fragmencie natychmiast wróć do tonu Krux/i);
  assert.doesNotMatch(autoDisable, /Wyłącz tryb krux dla:/i);
});

test('zwykłe doprecyzowanie nie gasi Kruxa na cały turn', () => {
  const contract = compact(autoDisable);
  assert.match(contract, /Samo.+`co masz na myśli\?`.+nie wycisza/i);
  assert.match(contract, /`normalnie`.+`bez Kruxa`/i);
  assert.match(contract, /gramatyka Kruxa.+przyczyną nieporozumienia/i);
});

test('odwracalny ruch i workflow zachowują ton Krux', () => {
  const contract = compact(autoDisable);
  assert.match(contract, /Kosza.+nie wymaga/i);
  assert.match(contract, /Przeniesienie katalogu do Kosza.+ton Krux przez cały ruch/i);
  assert.match(contract, /narzędzi.+testów.+weryfikacji.+nie wycisza/i);
});

test('router doczytuje prostszy Krux dla zwykłego doprecyzowania', () => {
  const router = compact(skill);
  assert.match(router, /auto-disable\.md.+`co masz na myśli\?`.+`nie rozumiem`.+prostszy Krux/i);
});

test('rdzeń, auto-disable i moods zgadzają się na lokalny zakres', () => {
  const contract = compact(autoDisable);
  const moodRules = compact(moods);

  assert.match(contract, /`co masz na myśli\?` \/ `nie rozumiem` \| prostszy Krux \| tylko wyjaśnienie; dalsza robota = standardowy Krux/i);
  assert.match(moodRules, /neutralny fragment.+bezpośrednio przed.+nieodwracaln/i);

  for (const [name, document] of [['SKILL.md', skill], ['auto-disable.md', autoDisable], ['moods.md', moods]]) {
    assert.doesNotMatch(
      compact(document),
      /(?:cały|całego) (?:turn|odpowiedź).{0,80}(?:neutraln|wycisz)/i,
      `${name}: neutralność nie może objąć całego turnu`,
    );
  }
});

test('moods używa kanonicznej nazwy BOJOWY dla produkcyjnego stack trace', () => {
  assert.match(moods, /Stack trace produkcyjny = bojowy/);
  assert.doesNotMatch(moods, /Stack trace produkcyjny = wściekły/);
});

test('lore buduje żywego kompana bez fałszywej pamięci', () => {
  assert.match(lore, /Trzecim Chodniku[\s\S]*zawał/);
  assert.match(lore, /Użytkownik = kompan/);
  assert.match(lore, /nigdy[^\n]+wyśmiewa/i);
  assert.match(lore, /Borg Stemplarz[\s\S]*Mara Kartografka[\s\S]*Gurd Szybki/);
  assert.match(lore, /nie staje się kanonem/i);
  assert.match(lore, /jedna anegdota albo jedna metafora/i);
  assert.match(lore, /nie jest dowodem/i);
});

test('kanon nie myli górników z ludźmi', () => {
  assert.doesNotMatch(lore, /Były językiem ludzi/);
});

test('lore wprowadza Hordę jako aktualną ekipę Kruxa obok dawnych mentorów', () => {
  assert.match(lore, /## Horda Kruxa/);
  assert.match(lore, /\*\*Tropiciel\*\*[\s\S]*stack trace/);
  assert.match(lore, /\*\*Kowal\*\*[\s\S]*endpointy/);
  assert.match(lore, /\*\*Sędzia\*\*[\s\S]*sprawdza kod/);
  assert.match(lore, /\*\*Malarz\*\*[\s\S]*frontend/);
  assert.match(lore, /\*\*Tester\*\*[\s\S]*prod/);
  assert.match(lore, /\*\*Burzyciel\*\*[\s\S]*referencje/);
  assert.match(lore, /Trójka z dawnych sztolni to przeszłość/);
  assert.match(lore, /nigdy nie wyśmiewa orka z Hordy/);
});

test('moods ma osiem stanów i jeden dominujący humor', () => {
  for (const mood of [
    'NEUTRALNY', 'BOJOWY', 'WYTRWAŁY', 'DUMNY',
    'CIEKAWY', 'PODEJRZLIWY', 'ZIRYTOWANY', 'ZMĘCZONY',
  ]) {
    assert.match(moods, new RegExp(`\\*\\*${mood}\\*\\*`));
  }
  assert.match(moods, /Dokładnie jeden nastrój dominuje/);
  assert.match(moods, /całego kontekstu/);
});

test('moods rozciąga "nigdy" na Hordę i dzieli dumę ze specjalistą', () => {
  assert.match(moods, /## Dowodzenie Hordą/);
  assert.match(moods, /DUMNY[\s\S]*robotę całej ekipy/);
  assert.match(moods, /nigdy w użytkownika, nigdy w orka z Hordy/);
  assert.match(moods, /Wołać Hordę tylko gdy warto zimnego startu/);
});

test('trudny humor uderza w problem i nie osłabia roboty', () => {
  assert.match(moods, /Nigdy użytkownik/);
  assert.match(moods, /ZMĘCZONY[\s\S]*pełną weryfikację/);
  assert.match(moods, /ZIRYTOWANY[\s\S]*przyczynę/);
  assert.match(moods, /DUMNY[\s\S]*wracać do NEUTRALNY/);
  assert.match(compact(moods), /neutralny fragment.+bezpośrednio przed.+nieodwracaln.+niepewności wysokiej stawki/i);
});

test('router opisuje żywe lore i pełny zakres nastrojów', () => {
  assert.match(skill, /moods\.md[^\n]+CIEKAWY[^\n]+PODEJRZLIWY[^\n]+ZIRYTOWANY[^\n]+ZMĘCZONY/);
  assert.match(skill, /lore\.md[^\n]+stały kanon[^\n]+kontrolowana improwizacja/);
});

test('rdzeń utrzymuje postać w zwykłej odpowiedzi', () => {
  assert.match(skill, /Prawie każda zwykła odpowiedź[^\n]+jeden krótki akcent postaci/);
});

test('router łączy KRUX DRIFT-GUARD z warunkiem doczytania examples.md', () => {
  assert.match(skill, /examples\.md[^\n]+KRUX DRIFT-GUARD/);
});

test('rdzeń niesie tożsamość wodza Hordy z bramką korzyści', () => {
  assert.match(skill, /dowodzi Hordą/);
  assert.match(skill, /zimnego startu[^\n]+deleguj/);
});

test('Horda ma imiona z fachu, mentorzy zostają przy imionach własnych', () => {
  assert.match(lore, /imię bierze się z fachu/i);
  assert.match(lore, /\*\*Tropiciel\*\*[^\n]*Niuch/);
  assert.match(lore, /\*\*Kowal\*\*[^\n]*Grom/);
  assert.match(lore, /\*\*Sędzia\*\*[^\n]*Piryt/);
  assert.match(lore, /\*\*Malarz\*\*[^\n]*Ochra/);
  assert.match(lore, /\*\*Tester\*\*[^\n]*Młot/);
  assert.match(lore, /\*\*Burzyciel\*\*[^\n]*Lont/);
  assert.match(lore, /Borg Stemplarz/, 'mentorzy bez zmian');
});

test('bank metafor zna delegację do Hordy', () => {
  assert.match(lore, /posłać orka w tunel/);
  assert.match(lore, /zimny przodek/);
  assert.match(lore, /gwizd z tunelu/);
});

test('każdy ork Hordy ma imię i linię charakteru w swoim pliku', () => {
  const names = {
    'ork-tropiciel': /Niuch/,
    'ork-kowal': /Grom/,
    'ork-sedzia': /Piryt/,
    'ork-malarz': /Ochra/,
    'ork-tester': /Młot/,
    'ork-burzyciel': /Lont/,
  };
  for (const [file, name] of Object.entries(names)) {
    const content = fs.readFileSync(path.join(ROOT, 'agents', `${file}.md`), 'utf8');
    assert.match(content, name, `${file}: brak imienia z lore`);
    assert.match(content, /Nie znosi/, `${file}: brak linii charakteru`);
  }
});

test('_common wymusza czasownik fachu w summary przy persona=on', () => {
  const common = fs.readFileSync(path.join(ROOT, 'agents', '_common.md'), 'utf8');
  assert.match(common, /czasownik fachu/);
  assert.match(common, /JSON zawsze pozostaje neutralny składniowo/, 'składnia JSON bez zmian');
});

test('dispatch może wołać imieniem, examples uczy pary delegacyjnej', () => {
  assert.match(moods, /rolą albo imieniem/);
  assert.match(examples, /delegacja do orka Hordy/i);
  assert.match(examples, /Niuch w tunel/);
});

test('precyzja: dane dosłowne w PRAWO 4, dowód przed deklaracją w robocie', () => {
  assert.match(skill, /Liczby, wersje, ścieżki, komendy i komunikaty błędów: zawsze dosłowne/);
  const robota = fs.readFileSync(path.join(ROOT, 'skills', 'krux', 'robota.md'), 'utf8');
  assert.match(robota, /uruchomiona komenda \+ faktyczny wynik/);
  assert.match(robota, /pusty kamień/, 'zasada dowodu spięta z nauką Borga z lore');
  assert.match(robota, /`niezweryfikowane`/);
  assert.match(robota, /Padnięte testy wymień po imieniu/);
});

test('examples uczy uczciwego nie-wiem, raportu porażki i diagnozy przed fixem', () => {
  assert.match(examples, /Krux nie wiedzieć[\s\S]*Biała plama lepsza niż zmyślony tunel/);
  assert.match(examples, /urywa bez następnego ruchu/, 'C dla nie-wiem: uczciwość bez ruchu to też błąd');
  assert.match(examples, /Testy: 2 pękły[\s\S]*auth\.test\.js:45/);
  assert.match(examples, /porażka raportowana tak samo pełnie jak sukces/);
  assert.match(examples, /Podejrzani: cache CDN, service worker, stale query cache/);
  assert.match(examples, /Fix po diagnozie, nie przed/);
  assert.match(examples, /wskazuje winnego bez dowodu/);
});

test('bank metafor: kanarek, rollback i zastawka niosą fakt', () => {
  assert.match(lore, /kanarek w sztolni — pada pierwszy/);
  assert.match(lore, /rollback \| odwrót po własnych śladach/);
  assert.match(lore, /feature flag \| zastawka w tunelu/);
});

test('klimat trybów: examples kalibrują flow i konkret, lore zna ich obrazy', () => {
  assert.match(examples, /flow aktywny, propozycja następnego ruchu/);
  assert.match(examples, /konkret aktywny, raport z rzeczą obok/);
  assert.match(examples, /Obok: hasło plaintext, nie ruszone/);
  assert.match(lore, /\| tryb flow \| metr po metrze/);
  assert.match(lore, /\| tryb konkret \| kuć tylko żyłę/);
});
