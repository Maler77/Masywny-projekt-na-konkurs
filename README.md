# Projekt konkursowy — gra przeglądarkowa

Minimalny szkielet gry działającej w nowoczesnej przeglądarce. Projekt używa zwykłego HTML, CSS i JavaScript, bez frameworka i bez zależności do instalowania.

## Uruchomienie

Uruchom lokalny serwer HTTP w katalogu projektu (wymagany dla modułów JavaScript):

```bash
python -m http.server 8000
```

Następnie otwórz <http://localhost:8000>. Wymagany jest Python 3. Polecenie uruchamia serwer tylko na czas pracy; zatrzymasz go przez `Ctrl+C`.

## Struktura

```text
index.html       Strona i punkt wejścia aplikacji
src/
  css/style.css  Wygląd strony i obszaru gry
  js/main.js     Punkt wejścia logiki gry
  js/game.js     Fizyka, rozgrywka i renderowanie obiektów
  js/levels.js   Definicje poziomów, bomb i przeciwników
  js/enemies.js  Typy przeciwników i reguły kajdankowania
  js/viewport.js Renderowanie i skalowanie obszaru gry
```

Menu główne jest pierwszym ekranem po otwarciu strony. Przycisk „Rozpocznij grę” uruchamia rozgrywkę i prosi przeglądarkę o tryb fullscreen. Menu pauzy pozostaje na pełnym ekranie podczas gry, gdy przeglądarka obsługuje blokadę klawisza Esc; przy braku tej obsługi Escape może wyjść z trybu przeglądarki, a gra pokaże menu pauzy w układzie wypełniającym stronę. Przycisk „Menu główne” kończy fullscreen. Obszar gry ma rozdzielczość 640 × 360 px (20 × 11,25 tila po 32 px, patrz `src/js/config.js`) i tymczasowe tło. Obraz jest skalowany do okna całkowitą skalą, żeby piksele były zawsze równe; przy proporcjach innych niż 16:9 renderer dodaje pasy. Jednostką w kodzie jest piksel gry (1/32 tila).

## Przeciwnicy

Poziom 1 zawiera patrolującego przeciwnika słabego (E z bliska lub dash) i patrolującego silnego (E od tyłu, zgodnie z kierunkiem, w którym patrzy). Kontakt z aktywnym przeciwnikiem odrzuca gracza; silny przeciwnik odrzuca mocniej. Krótki cooldown zapobiega ciągłym uderzeniom. Nowych przeciwników dodawaj do `enemies` w definicji poziomu. Typy i dozwolone metody kajdankowania są zdefiniowane w `src/js/enemies.js`; aby dodać metodę, dopisz jej nazwę do `cuffMethods` i wywołaj `game.cuffEnemy(enemy, "nazwaMetody")` z odpowiedniej akcji gry.

## Platform types

Level platforms are created with `platform(x, y, w, h, options)`. Platforms default to the existing fully solid behavior. Examples:

```js
platform(100, 240, 96, 12, { oneWay: true });
platform(300, 160, 24, 24, { solid: false, grappleable: true });
platform(400, 200, 96, 16, { grappleable: true });
```

`oneWay` lets the player pass from below and the sides, then catches them while descending onto the top. Intentional drop-through is not implemented. `grappleable` is independent of collision, so a target can be non-solid. A future hook can query `game.getGrappleTargets()`; each result has `x`, `y`, `w`, `h`, and its capability flags.

## Grappling hook

Press Q while facing a grappleable point within `160 * SCALE` game pixels (320 px with the current tile size) to attach. Solid platforms block the hook path. The rope swings with gravity and preserves momentum; left and right add swing force. While attached, W/Up shortens the rope and S/Down lengthens it. Space releases the rope and keeps swing momentum. Press Q again to switch to another reachable target immediately, or release if there is no other target. A full release starts the 0.5-second regrapple cooldown. The last detached anchor stays unavailable for 0.5 seconds. Grapple targets are level platforms marked with `grappleable: true` and can be listed with `game.getGrappleTargets()`.

## Editing bomb questions

All question content is in `src/data/questions.json`. Edit this file with a text editor; questions and answers do not need to be changed in JavaScript.

Each question is one object inside the JSON array. Give it a unique, non-empty `id`, write its `question`, provide exactly three non-empty strings in `answers`, and set `correctAnswer` to the correct answer's zero-based position: `0` for the first answer, `1` for the second, or `2` for the third. When adding another object, put a comma after the previous object, but not after the final object. Keep the file valid JSON.

The game validates the file at startup and reports a clear error in the browser console if it cannot be loaded or any question is malformed. Run the local HTTP server described above so the browser can fetch the JSON file.
