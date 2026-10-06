import { createViewport } from "./viewport.js";
import { createInput } from "./input.js";
import { createGame, formatTime } from "./game.js";
import { createMenu } from "./menu.js";
import { applyDomTextures } from "./textures.js";
import { LEVELS } from "./levels.js";

const canvas = document.querySelector(".game__viewport");

if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error("Game viewport canvas is missing from index.html");
}

const viewport = createViewport(canvas);
const input = createInput();
const game = createGame(LEVELS[0]);

// ---------- Lista poziomów w menu głównym ----------
// Karty tworzą się z tablicy LEVELS (levels.js), więc nowy poziom pojawia się w menu sam.

const levelList = document.querySelector("#level-list");

// "1 bomba", "2 bomby", "5 bomb"
function bombCountLabel(count) {
    const lastTwo = count % 100;
    const last = count % 10;
    if (count === 1) return "1 bomba";
    if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) return `${count} bomby`;
    return `${count} bomb`;
}

function buildLevelList() {
    LEVELS.forEach((level, index) => {
        const card = document.createElement("button");
        card.type = "button";
        card.className = "menu__button level-card";
        card.dataset.action = "play";
        card.dataset.level = String(index);

        // Miniatura: tekstura z textures.js (data-texture) albo gradient zastępczy.
        const thumb = document.createElement("span");
        thumb.className = "level-card__thumb";
        if (level.thumbnail) thumb.dataset.texture = level.thumbnail;
        const hue = 200 + index * 55;
        thumb.style.setProperty(
            "--fallback",
            `linear-gradient(135deg, hsl(${hue} 45% 32%), hsl(${hue + 40} 40% 14%))`,
        );

        const name = document.createElement("span");
        name.className = "level-card__name";
        name.textContent = level.name;

        const subtitle = document.createElement("span");
        subtitle.className = "level-card__subtitle";
        subtitle.textContent = level.subtitle ?? "";

        const info = document.createElement("span");
        info.className = "level-card__info";
        info.textContent = `${bombCountLabel(level.bombs.length)} · ${formatTime(level.timeLimit)}`;

        card.append(thumb, name, subtitle, info);
        levelList.append(card);
    });
}

buildLevelList();

// Tekstury elementów HTML (tło menu, miniatury poziomów, okno z pytaniem, ekrany końcowe).
applyDomTextures();

// Elementy okna z pytaniem oraz ekranów końcowych.
const bombTitle = document.querySelector("#bomb-title");
const bombTimer = document.querySelector("#bomb-timer");
const bombOptions = [...document.querySelectorAll(".bomb-panel__option")];
const loseReason = document.querySelector("#lose-reason");
const winSummary = document.querySelector("#win-summary");
const winTime = document.querySelector("#win-time");
const winNext = document.querySelector("#win-next");
const LETTERS = ["A", "B", "C"];

// ---------- Stan gry ----------
// "menu"    - menu główne, widoczne po otwarciu strony
// "playing" - gra
// "paused"  - pauza
// "bomb"    - okno z pytaniem przy bombie (czas leci dalej)
// "lost"    - ekran przegranej
// "won"     - ekran wygranej

let state = "menu";
let debug = false;      // tryb debug włączany klawiszem "/"
let activeBomb = null;  // bomba, której pytanie jest teraz otwarte
let currentLevel = 0;   // indeks aktualnego poziomu w LEVELS
let ignoreEscapeUntil = 0;

// Który ekran menu (data-screen w index.html) odpowiada któremu stanowi.
const SCREEN_FOR_STATE = {
    menu: "main",
    paused: "pause",
    bomb: "bomb",
    lost: "lose",
    won: "win",
};

const menu = createMenu({
    play: (data) => startGame(Number(data.level)),       // karta poziomu w menu głównym
    retry: () => startGame(currentLevel),                // "Spróbuj ponownie" po przegranej
    next: () => startGame(currentLevel + 1),             // "Następny poziom" po wygranej
    resume: resumeGame,
    quit: quitToMenu,
    answer: (data) => answerBomb(Number(data.index)),
});

function setState(next) {
    state = next;
    document.body.dataset.state = next; // używa tego CSS (np. do panelu sterowania w rogu)

    // Rozszerzamy viewport tylko podczas rozgrywki i ekranów w jej trakcie.
    const gameIsActive = ["playing", "paused", "bomb", "lost", "won"].includes(next);
    document.body.classList.toggle("game-active", gameIsActive);
    // Kursor jest ukryty tylko, gdy naprawdę grasz.
    document.body.classList.toggle("cursor-hidden", next === "playing");

    if (next === "playing") menu.hide();
    else menu.show(SCREEN_FOR_STATE[next]);
}

// Wczytaj wybrany poziom od początku (pełny reset: gracz, bomby, timer).
function startGame(levelIndex = currentLevel) {
    if (!LEVELS[levelIndex]) return;
    currentLevel = levelIndex;
    game.loadLevel(LEVELS[levelIndex]);
    activeBomb = null;
    setState("playing");
    enterFullscreen();
}

// Fullscreen is requested from the user's Play click. Keyboard Lock lets Escape
// open the pause menu without leaving fullscreen where the browser supports it.
function enterFullscreen() {
    const root = document.documentElement;
    const request = root.requestFullscreen ?? root.webkitRequestFullscreen;
    if (isFullscreen() || typeof request !== "function") return;

    try {
        Promise.resolve(request.call(root, { keyboardLock: "browser" })).catch(() => {
            // Keep the game playable in browsers without keyboard-lock support.
            if (!isFullscreen()) {
                Promise.resolve(request.call(root)).catch(() => {});
            }
        });
    } catch {
        try {
            Promise.resolve(request.call(root)).catch(() => {});
        } catch {
            // CSS still expands the game to the page viewport if fullscreen is denied.
        }
    }
}

function exitFullscreen() {
    const exit = document.exitFullscreen ?? document.webkitExitFullscreen;
    if (!isFullscreen() || typeof exit !== "function") return;
    try {
        Promise.resolve(exit.call(document)).catch(() => {});
    } catch {
        // The main menu remains available in the normal page layout.
    }
}

function isFullscreen() {
    return Boolean(document.fullscreenElement ?? document.webkitFullscreenElement);
}

function pauseGame() {
    if (state === "playing") setState("paused");
}

function resumeGame() {
    if (state === "paused") setState("playing");
}

// "Menu główne" z pauzy i z ekranów wygranej/przegranej.
function quitToMenu() {
    game.reset();
    activeBomb = null;
    exitFullscreen();
    setState("menu");
}

// Request the browser to keep Escape inside the game while fullscreen is active.
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isFullscreen() && ["playing", "paused", "bomb"].includes(state)) {
        event.preventDefault();
    }
}, true);

function onFullscreenChange() {
    // If the browser exits fullscreen (for example with Escape where keyboard
    // locking is unavailable), preserve the page-filling pause screen.
    if (!isFullscreen() && state === "playing") {
        ignoreEscapeUntil = performance.now() + 300;
        pauseGame();
    }
}
document.addEventListener("fullscreenchange", onFullscreenChange);
document.addEventListener("webkitfullscreenchange", onFullscreenChange);

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
    const hasNext = currentLevel + 1 < LEVELS.length;
    const name = LEVELS[currentLevel].name;
    winSummary.textContent = hasNext
        ? `${name} ukończony! Wszystkie bomby rozbrojone.`
        : `${name} ukończony! To był ostatni poziom, gratulacje!`;
    winTime.textContent = `Pozostały czas: ${formatTime(game.timeLeft)}`;
    winNext.hidden = !hasNext;
    setState("won");
}

// Gra sama się zatrzymuje, gdy przełączysz kartę lub okno.
document.addEventListener("visibilitychange", () => {
    if (document.hidden) pauseGame();
});
window.addEventListener("blur", pauseGame);

setState("menu");

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

    // Esc: w grze pauzuje, w pauzie wznawia, w oknie bomby je zamyka.
    if (input.escapePressed() && performance.now() >= ignoreEscapeUntil) {
        if (state === "playing") pauseGame();
        else if (state === "paused") resumeGame();
        else if (state === "bomb") {
            activeBomb = null;
            setState("playing");
        }
    }

    if (state === "playing") {
        const updateResult = game.update(dt, input);
        if (updateResult.dashed && updateResult.dashTarget) {
            game.cuffEnemy(updateResult.dashTarget, "dash", { fromBehind: updateResult.dashFromBehind });
        }

        if (input.interactPressed()) {
            const enemy = game.nearbyEnemy("interact");
            if (enemy && game.cuffEnemy(enemy, "interact")) {
                // Cuffing takes this E press; bombs remain available on the next press.
            } else {
                const bomb = game.nearbyBomb();
                if (bomb) openBomb(bomb);
            }
        }

        if (state === "playing") game.resolveEnemyAttack();
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
