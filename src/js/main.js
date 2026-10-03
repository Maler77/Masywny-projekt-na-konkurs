import { createViewport } from "./viewport.js";

const canvas = document.querySelector(".game__viewport");

if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error("Game viewport canvas is missing from index.html");
}

createViewport(canvas);
