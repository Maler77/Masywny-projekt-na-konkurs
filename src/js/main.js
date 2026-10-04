import { createViewport } from "./viewport.js";
import { createInput } from "./input.js";
import { createGame, formatTime } from "./game.js";
import { createMenu } from "./menu.js";
import { applyDomTextures } from "./textures.js";

const canvas = document.querySelector(".game__viewport");

if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error("Game viewport canvas is missing from index.html");
}

const viewport = createViewport(canvas);
const input = createInput();
const game = createGame();

// Tekstury elementów HTML (tło menu, okno z pytaniem, ekrany wygranej i przegranej).
applyDomTextures();

// Elementy okna z pytaniem oraz ekranów końcowych.
const bombTitle = document.querySelector("#bomb-title");
const bombTimer = document.querySelector("#bomb-timer");
const bombOptions = [...document.querySelectorAll(".bomb-panel__option")];
const loseReason = document.querySelector("#lose-reason");
const winTime = document.querySelector("#win-time");
const LETTERS = ["A", "B", "C"];

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
// "bomb"    - okno z pytaniem przy bombie (czas leci dalej)
// "lost"    - ekran przegranej
// "won"     - ekran wygranej

let state = "landing";
let debug = false;      // tryb debug włączany klawiszem "/"
let activeBomb = null;  // bomba, której pytanie jest teraz otwarte

// Który ekran menu (data-screen w index.html) odpowiada któremu stanowi.
const SCREEN_FOR_STATE = {
    landing: "landing",
    menu: "main",
    paused: "pause",
    bomb: "bomb",
    lost: "lose",
    won: "win",
};

const menu = createMenu({
    enter: enterGame,
    play: startGame,
    resume: resumeGame,
    fullscreen: toggleFullscreen,
    quit: quitToMenu,
    exit: exitGame,
    answer: (data) => answerBomb(Number(data.index)),
});

function setState(next) {
    state = next;

    // Poza ekranem startowym gra zajmuje całe okno (styl .game-fullscreen w CSS).
    document.body.classList.toggle("game-fullscreen", next !== "landing");
    // Kursor jest ukryty tylko, gdy naprawdę grasz.
    document.body.classList.toggle("cursor-hidden", next === "playing");

    if (next === "playing") menu.hide();
    else menu.show(SCREEN_FOR_STATE[next]);
}

// "Rozpocznij grę" na ekranie startowym: pełny ekran i menu główne.
function enterGame() {
    enterFullscreen();
    setState("menu");
}

// "Graj" w menu głównym: start poziomu od początku (pełny reset: gracz, bomby, timer).
function startGame() {
    game.reset();
    activeBomb = null;
    setState("playing");
}

function pauseGame() {
    if (state === "playing") setState("paused");
}

function resumeGame() {
    if (state === "paused") setState("playing");
}

// "Menu główne" z pauzy i z ekranów wygranej/przegranej: wracamy do menu w pełnym ekranie.
function quitToMenu() {
    game.reset();
    activeBomb = null;
    setState("menu");
}

// "Wyjdź" w menu głównym: strona nie może sama się zamknąć, więc wychodzimy z pełnego
// ekranu i wracamy na ekran startowy.
function exitGame() {
    exitFullscreen();
    game.reset();
    activeBomb = null;
    setState("landing");
}

// ---------- Bomby, wygrana i przegrana ----------

// Otwiera okno z pytaniem dla bomby (E przy bombie).
function openBomb(bomb) {
    activeBomb = bomb;
    bombTitle.textContent = bomb.question;
    bombOptions.forEach((button, index) => {
        const text = bomb.options[index];
        button.hidden = text === undefined;
        button.textContent = `${LETTERS[index]}. ${text ?? ""}`;
    });
    setState("bomb");
}

// Zła odpowiedź = przegrana, dobra = bomba rozbrojona (a po ostatniej wygrana).
function answerBomb(index) {
    if (state !== "bomb" || !activeBomb) return;

    if (index === activeBomb.correct) {
        game.defuse(activeBomb);
        activeBomb = null;
        if (game.allDefused()) winGame();
        else setState("playing");
    } else {
        loseGame("Zła odpowiedź. Bomba wybuchła!");
    }
}

function loseGame(reason) {
    activeBomb = null;
    loseReason.textContent = reason;
    setState("lost");
}

function winGame() {
    winTime.textContent = `Pozostały czas: ${formatTime(game.timeLeft)}`;
    setState("won");
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
let shownBombTime = ""; // żeby nie dotykać DOM, gdy tekst się nie zmienił

function frame(now) {
    const rawDt = (now - lastTime) / 1000;
    lastTime = now;
    if (rawDt > 0) fps += (1 / rawDt - fps) * 0.1;

    // dt = czas od poprzedniej klatki w sekundach (z limitem, np. po powrocie z innej karty).
    const dt = Math.min(rawDt, 0.05);

    if (input.debugPressed()) debug = !debug;

    // Esc: z ekranu sterowania wraca, w grze pauzuje, w pauzie wznawia, w oknie bomby je zamyka.
    if (input.escapePressed() && performance.now() >= ignoreEscapeUntil) {
        if (menu.current === "controls") menu.back();
        else if (state === "playing") pauseGame();
        else if (state === "paused") resumeGame();
        else if (state === "bomb") {
            activeBomb = null;
            setState("playing");
        }
    }

    if (state === "playing") {
        game.update(dt, input);
        const bomb = game.nearbyBomb();
        if (bomb && input.interactPressed()) openBomb(bomb);
    } else if (state === "bomb") {
        // Postać stoi, ale czas leci dalej.
        game.tickTimer(dt);

        const answer = input.answerPressed(); // klawisze A, B, C
        if (answer !== -1) answerBomb(answer);

        const text = `Czas: ${formatTime(game.timeLeft)}`;
        if (text !== shownBombTime) {
            shownBombTime = text;
            bombTimer.textContent = text;
        }
    }

    // Koniec czasu = przegrana (także podczas pytania).
    if ((state === "playing" || state === "bomb") && game.timeLeft <= 0) {
        loseGame("Czas minął! Bomby wybuchły.");
    }

    input.endFrame();

    const ctx = viewport.begin();
    game.draw(ctx, { debug, fps, hud: state === "playing" });
    viewport.end();

    requestAnimationFrame(frame);
}

requestAnimationFrame(frame);