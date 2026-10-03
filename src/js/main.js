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

// Dopóki gracz nie kliknie "Rozpocznij grę", scena jest widoczna, ale nic się nie rusza.
let started = false;

startButton?.addEventListener("click", () => {
    document.body.classList.add("game-started");
    started = true;
});

// Pętla gry: w każdej klatce najpierw aktualizujemy logikę, potem rysujemy.
let lastTime = performance.now();

function frame(now) {
    // dt = czas od poprzedniej klatki w sekundach (z limitem, np. po powrocie z innej karty).
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    if (started) game.update(dt, input);
    input.endFrame();

    const ctx = viewport.begin();
    game.draw(ctx);
    viewport.end();

    requestAnimationFrame(frame);
}

requestAnimationFrame(frame);