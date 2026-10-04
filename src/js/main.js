import { createViewport } from "./viewport.js";
import { createInput } from "./input.js";
import { createGame } from "./game.js";
import { createMenu } from "./menu.js";

const canvas = document.querySelector(".game__viewport");

if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error("Game viewport canvas is missing from index.html");
}

const viewport = createViewport(canvas);
const input = createInput();
const game = createGame();

// ---------- Pełny ekran ----------

function isFullscreen() {
    return Boolean(document.fullscreenElement ?? document.webkitFullscreenElement);
}

// Przeglądarka pozwala wejść w pełny ekran tylko w reakcji na akcję użytkownika
// (kliknięcie, Enter), dlatego wołamy to z obsługi przycisków menu.
function enterFullscreen() {
    const element = document.documentElement;
    const request = element.requestFullscreen ?? element.webkitRequestFullscreen;
    if (!request) return; // np. iPhone nie obsługuje fullscreena dla stron
    try {
        Promise.resolve(request.call(element)).catch(() => {}); // odmowa = gramy w oknie
    } catch {
        // ignorujemy
    }
}

function exitFullscreen() {
    if (!isFullscreen()) return;
    const exit = document.exitFullscreen ?? document.webkitExitFullscreen;
    try {
        Promise.resolve(exit.call(document)).catch(() => {});
    } catch {
        // ignorujemy
    }
}

function toggleFullscreen() {
    if (isFullscreen()) exitFullscreen();
    else enterFullscreen();
}

// ---------- Stan gry ----------
// "landing" - ekran startowy na stronie
// "menu"    - menu główne (pełny ekran, część gry)
// "playing" - gra
// "paused"  - pauza

let state = "landing";
let debug = false; // tryb debug włączany klawiszem "/"

const menu = createMenu({
    enter: enterGame,
    play: startGame,
    resume: resumeGame,
    fullscreen: toggleFullscreen,
    quit: quitToMenu,
    exit: exitGame,
});

function setState(next) {
    state = next;

    // Poza ekranem startowym gra zajmuje całe okno (styl .game-fullscreen w CSS).
    document.body.classList.toggle("game-fullscreen", next !== "landing");
    // Kursor jest ukryty tylko, gdy naprawdę grasz.
    document.body.classList.toggle("cursor-hidden", next === "playing");

    if (next === "playing") menu.hide();
    else menu.show({ landing: "landing", menu: "main", paused: "pause" }[next]);
}

// "Rozpocznij grę" na ekranie startowym: pełny ekran i menu główne.
function enterGame() {
    enterFullscreen();
    setState("menu");
}

// "Graj" w menu głównym: start poziomu od początku.
function startGame() {
    game.reset();
    setState("playing");
}

function pauseGame() {
    if (state === "playing") setState("paused");
}

function resumeGame() {
    if (state === "paused") setState("playing");
}

// "Menu główne" z pauzy: wracamy do menu, nadal w pełnym ekranie.
function quitToMenu() {
    game.reset();
    setState("menu");
}

// "Wyjdź" w menu głównym: strona nie może sama się zamknąć, więc wychodzimy z pełnego
// ekranu i wracamy na ekran startowy.
function exitGame() {
    exitFullscreen();
    game.reset();
    setState("landing");
}

// Gra sama się zatrzymuje, gdy przełączysz kartę lub okno.
document.addEventListener("visibilitychange", () => {
    if (document.hidden) pauseGame();
});
window.addEventListener("blur", pauseGame);

// Esc w pełnym ekranie jest "zjadany" przez przeglądarkę (wychodzi z fullscreena)
// i do gry zwykle nie dociera. Wtedy pauzujemy po samej zmianie trybu.
let ignoreEscapeUntil = 0;
function onFullscreenChange() {
    if (!isFullscreen() && state === "playing") {
        ignoreEscapeUntil = performance.now() + 300; // żeby ten sam Esc nie wznowił gry
        pauseGame();
    }
}
document.addEventListener("fullscreenchange", onFullscreenChange);
document.addEventListener("webkitfullscreenchange", onFullscreenChange);

setState("landing");

// ---------- Pętla gry ----------

let lastTime = performance.now();
let fps = 60; // wygładzona wartość, tylko do wyświetlania w trybie debug

function frame(now) {
    const rawDt = (now - lastTime) / 1000;
    lastTime = now;
    if (rawDt > 0) fps += (1 / rawDt - fps) * 0.1;

    // dt = czas od poprzedniej klatki w sekundach (z limitem, np. po powrocie z innej karty).
    const dt = Math.min(rawDt, 0.05);

    if (input.debugPressed()) debug = !debug;

    // Esc: z ekranu sterowania wraca, w grze pauzuje, w pauzie wznawia.
    if (input.escapePressed() && performance.now() >= ignoreEscapeUntil) {
        if (menu.current === "controls") menu.back();
        else if (state === "playing") pauseGame();
        else if (state === "paused") resumeGame();
    }

    if (state === "playing") game.update(dt, input);
    input.endFrame();

    const ctx = viewport.begin();
    game.draw(ctx, { debug, fps, hud: state === "playing" });
    viewport.end();

    requestAnimationFrame(frame);
}

requestAnimationFrame(frame);