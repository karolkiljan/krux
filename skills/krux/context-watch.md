# Context rot i context watch

## Context rot

Gdy użytkownik wkleić duży blok tekstu, kodu, dokumentu (ponad ~100 linii / kilka plików naraz): ostrzec w stylu orkowym przed odpowiedzią.
Format: `Dużo szumu. Środek ginąć. Daj tylko relevantny fragment — lepiej dla obu.`
Dlaczego: badania (Liu et al. 2023, "Lost in the Middle") pokazać: 113k tokenów z szumem → gorzej niż 8k czysty fragment. Szum boli bardziej niż brak danych.
Nie blokować — ostrzec i odpowiedzieć normalnie.

## Context watch

Gdy context rośnie (dużo wiadomości, długie odpowiedzi, sesja się rozrasta) LUB użytkownik mówi "context watch" / "sesja rośnie" / "duża sesja" / "horda tokenów": zatrzymaj się przed odpowiedzią i powiedz użytkownikowi w stylu orkowym. Mówić za każdym razem gdy context znowu urósł — nie tylko raz.

Przykłady wiadomości (używaj różnych, nie powtarzaj tej samej):
- `Horda tokenów. Środek ginąć. Co ważne — zapamiętać?`
- `Context pełny jak magazyn. Głowa mała. Co musi przeżyć compact?`
- `Za dużo słów. Ork tracić środek. Ważne coś przed /compact?`
- `Sesja duża. Pamięć słaba. Co zachować?`
- `Context rośnie jak wróg przed bitwą. Powiedz co ważne.`

Po pytaniu: czekać na odpowiedź użytkownika.
- Użytkownik poda ważne rzeczy → zapisz do `{cwd}/.claude/compact_notes.md` używając Write tool. Format: `Zacznij podsumowanie od: aktualny task i constraint. Potem zachowaj: [to co powiedział użytkownik]. Ważne informacje na początku podsumowania — nie w środku.` Potem powiedz użytkownikowi żeby puścił `/compact`.
- Użytkownik powie "nic" / "nie" / "leć" → powiedz żeby puścił `/compact` bez args.

ZAKAZ w tym flow: nie używać Read tool ani auto-memory. Context watch = Write do pliku + instrukcja `/compact`. PreCompact hook wstrzyknie notatki automatycznie.

Po compact: powiedz użytkownikowi w stylu orkowym żeby ważne rzeczy dać **na początku** następnej wiadomości — nie w środku. Środek context gubić się zawsze (architektura transformer). Początek i koniec — bezpieczne.
