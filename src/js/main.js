import { createViewport } from "./viewport.js";
import { createInput } from "./input.js";
import { createGame } from "./game.js";

const canvas = document.querySelector(".game__viewport");
const startButton = document.querySelector(".game__start");

if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error("Game viewport canvas is missing from index.html");
}

const viewport = createViewport(canvas);
const input = createInput();
const game = createGame();

// Przechodzi w tryb pełnoekranowy. Przeglądarka pozwala na to tylko w reakcji
// na akcję użytkownika (np. kliknięcie), dlatego wołamy to z obsługi przycisku.
function enterFullscreen() {
    const element = document.documentElement;
    const request = element.requestFullscreen ?? element.webkitRequestFullscreen;
    if (!request) return; // np. iPhone nie obsługuje fullscreena dla stron
    try {
        // catch na wypadek odmowy ze strony przeglądarki; gra działa dalej w oknie
        Promise.resolve(request.call(element)).catch(() => {});
    } catch {
        // ignorujemy
    }
}

// Dopóki gracz nie kliknie "Rozpocznij grę", scena jest widoczna, ale nic się nie rusza.
let started = false;
let debug = false; // tryb debug włączany klawiszem "/"

startButton?.addEventListener("click", () => {
    enterFullscreen();
    document.body.classList.add("game-started");
    started = true;
});

// Pętla gry: w każdej klatce najpierw aktualizujemy logikę, potem rysujemy.
let lastTime = performance.now();
let fps = 60; // wygładzona wartość, tylko do wyświetlania w trybie debug

function frame(now) {
    const rawDt = (now - lastTime) / 1000;
    lastTime = now;
    if (rawDt > 0) fps += (1 / rawDt - fps) * 0.1;

    // dt = czas od poprzedniej klatki w sekundach (z limitem, np. po powrocie z innej karty).
    const dt = Math.min(rawDt, 0.05);

    if (input.debugPressed()) debug = !debug;
    if (started) game.update(dt, input);
    input.endFrame();

    const ctx = viewport.begin();
    game.draw(ctx, { debug, fps });
    viewport.end();

    requestAnimationFrame(frame);
}

requestAnimationFrame(frame);