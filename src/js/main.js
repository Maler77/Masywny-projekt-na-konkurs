import { createViewport } from "./viewport.js";

const canvas = document.querySelector(".game__viewport");
const startButton = document.querySelector(".game__start");

if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error("Game viewport canvas is missing from index.html");
}

createViewport(canvas);

startButton?.addEventListener("click", () => {
    document.body.classList.add("game-started");
});
