// ============================================================================
//  POZIOMY W PLIKACH JSON
//  Poza poziomami zapisanymi w kodzie (levels.js) gra wczytuje poziomy z plików JSON w katalogu
//  src/data/levels/. Lista plików jest w src/data/levels/index.json:
//
//      { "levels": ["poziom-5.json", "inny-poziom.json"] }
//
//  Plik poziomu tworzy edytor (menu główne -> "Edytor poziomów" -> "Pobierz JSON"). Wrzuć go do
//  src/data/levels/ i dopisz jego nazwę do index.json, a poziom pojawi się w menu po karcie ostatniego
//  poziomu z kodu.
//
//  FORMAT PLIKU (wszystkie współrzędne w pikselach gry, 1 tile = 32 px, patrz levels.js):
//    name, subtitle, questionCategory ("easy" | "medium" | "hard"), background (lista tekstur tła),
//    timeLimit (s), width, height, hp (opcjonalnie), spawn { x, y }   (x = środek, y = pod stopami)
//    platforms  [{ x, y, w, h, texture, textureMode?, solid?, oneWay?, grappleable? }]
//    bombs      [{ x, y }]                                              (x = środek, y = podłoże)
//    enemies    [{ type: "weak" | "strong", x, y, direction?, speed?, area?: { x1, y1, x2, y2 } }]
//    spikes     [{ x, y, w, h }]                                        (prostokąt, patrz spike())
//    jumpPads   [{ x, y, w, h, power? }]                                (prostokąt, patrz jumpPad())
//  texture to nazwa z textures.js ("platform", "ground", "wall") albo ścieżka do obrazka z folderu
//  assets, np. "assets/budynek.png"; textureMode ("stretch" | "tile" | "cover") mówi, jak go rysować.
// ============================================================================

import { VIEW_HEIGHT } from "./config.js";
import { platform } from "./levels.js";
import { TEXTURES, textureKey } from "./textures.js";

const MANIFEST_URL = new URL("../data/levels/index.json", import.meta.url);
const LEVELS_DIR = new URL("../data/levels/", import.meta.url);
const DRAFTS_KEY = "masywny.editor.drafts";
const AUTOSAVE_KEY = "masywny.editor.autosave";

export const QUESTION_CATEGORIES = ["easy", "medium", "hard"];

const isNumber = (value) => typeof value === "number" && Number.isFinite(value);

// Pusty poziom dla edytora: podłoga i miejsce startu.
export function newLevel() {
    return {
        name: "Nowy poziom",
        subtitle: "",
        questionCategory: "easy",
        background: ["background"],
        timeLimit: 60,
        width: 1280,
        height: VIEW_HEIGHT,
        spawn: { x: 64, y: 320 },
        platforms: [{ x: 0, y: 320, w: 1280, h: 40, texture: "ground" }],
        bombs: [],
        enemies: [],
        spikes: [],
        jumpPads: [],
    };
}

// Czyści poziom do postaci zapisywanej w pliku (bez pól tymczasowych i wartości domyślnych).
export function serializeLevel(level) {
    const out = {
        name: level.name,
        subtitle: level.subtitle ?? "",
        questionCategory: level.questionCategory,
        background: [...(level.background ?? ["background"])],
        timeLimit: level.timeLimit,
        width: level.width,
        height: level.height ?? VIEW_HEIGHT,
    };
    if (isNumber(level.hp)) out.hp = level.hp;
    if (level.thumbnail) out.thumbnail = level.thumbnail;
    out.spawn = { x: level.spawn.x, y: level.spawn.y };

    out.platforms = (level.platforms ?? []).map((p) => {
        const item = { x: p.x, y: p.y, w: p.w, h: p.h, texture: p.textureSource ?? p.texture ?? "platform" };
        if (p.textureMode && p.textureMode !== "stretch") item.textureMode = p.textureMode;
        if (p.color && p.color !== "#24343d") item.color = p.color;
        if (p.solid === false) item.solid = false;
        if (p.oneWay) item.oneWay = true;
        if (p.grappleable) item.grappleable = true;
        return item;
    });
    out.bombs = (level.bombs ?? []).map((b) => ({ x: b.x, y: b.y }));
    out.enemies = (level.enemies ?? []).map((e) => {
        const item = { type: e.type, x: e.x, y: e.y };
        if (e.id) item.id = e.id;
        if (e.direction === -1) item.direction = -1;
        if (isNumber(e.speed)) item.speed = e.speed;
        if (isNumber(e.chaseSpeed)) item.chaseSpeed = e.chaseSpeed;
        if (e.area) item.area = { x1: e.area.x1, y1: e.area.y1, x2: e.area.x2, y2: e.area.y2 };
        if (e.vision) item.vision = { ...e.vision };
        return item;
    });
    out.spikes = (level.spikes ?? []).map((s) => ({ x: s.x, y: s.y, w: s.w, h: s.h }));
    out.jumpPads = (level.jumpPads ?? []).map((j) => {
        const item = { x: j.x, y: j.y, w: j.w, h: j.h };
        if (isNumber(j.power) && j.power !== 1) item.power = j.power;
        return item;
    });
    return out;
}

// Zamienia poziom z JSON na obiekt dla gry (tak jak poziomy z levels.js). Rzuca błąd z opisem
// problemu, gdy plik jest uszkodzony.
export function normalizeLevel(raw) {
    if (!raw || typeof raw !== "object") throw new Error("poziom nie jest obiektem");
    const need = (condition, message) => { if (!condition) throw new Error(message); };

    need(typeof raw.name === "string" && raw.name.trim() !== "", "brak pola name");
    need(QUESTION_CATEGORIES.includes(raw.questionCategory ?? "easy"), "questionCategory musi być easy, medium albo hard");
    need(isNumber(raw.timeLimit ?? 60) && (raw.timeLimit ?? 60) > 0, "timeLimit musi być liczbą większą od 0");
    need(isNumber(raw.width) && raw.width > 0, "width musi być liczbą większą od 0");
    need(isNumber(raw.spawn?.x) && isNumber(raw.spawn?.y), "spawn musi mieć x i y");

    const list = (key) => {
        const value = raw[key] ?? [];
        need(Array.isArray(value), `${key} musi być listą`);
        return value;
    };
    const rect = (item, where) => need(
        [item.x, item.y, item.w, item.h].every(isNumber) && item.w > 0 && item.h > 0,
        `${where}: x, y, w, h muszą być liczbami (w i h > 0)`,
    );

    const platforms = list("platforms").map((p, i) => {
        rect(p, `platforms[${i}]`);
        const item = platform(p.x, p.y, p.w, p.h, textureKey(p.texture ?? "platform", p.textureMode), {
            color: p.color,
            solid: p.solid,
            oneWay: p.oneWay,
            grappleable: p.grappleable,
        });
        // Obrazek z pliku: pamiętamy oryginalną ścieżkę (item.texture to wewnętrzny klucz), żeby edytor
        // mógł poziom z powrotem zapisać do JSON.
        if (p.texture && !TEXTURES[p.texture]) {
            item.textureSource = p.texture;
            item.textureMode = p.textureMode ?? "stretch";
        }
        return item;
    });
    const spikes = list("spikes").map((s, i) => {
        rect(s, `spikes[${i}]`);
        return { x: s.x, y: s.y, w: s.w, h: s.h };
    });
    const jumpPads = list("jumpPads").map((j, i) => {
        rect(j, `jumpPads[${i}]`);
        return { x: j.x, y: j.y, w: j.w, h: j.h, power: j.power ?? 1 };
    });
    const bombs = list("bombs").map((b, i) => {
        need(isNumber(b.x) && isNumber(b.y), `bombs[${i}]: x i y muszą być liczbami`);
        return { ...b };
    });
    const enemies = list("enemies").map((e, i) => {
        need(e.type === "weak" || e.type === "strong", `enemies[${i}]: type musi być weak albo strong`);
        need(isNumber(e.x) && isNumber(e.y), `enemies[${i}]: x i y muszą być liczbami`);
        return { ...e };
    });

    const level = {
        ...raw,
        name: raw.name,
        subtitle: raw.subtitle ?? "",
        questionCategory: raw.questionCategory ?? "easy",
        background: raw.background ?? ["background"],
        timeLimit: raw.timeLimit ?? 60,
        width: raw.width,
        height: raw.height ?? VIEW_HEIGHT,
        spawn: { x: raw.spawn.x, y: raw.spawn.y },
        platforms,
        bombs,
        enemies,
        spikes,
        jumpPads,
    };
    if (!isNumber(level.hp)) delete level.hp;
    return level;
}

// Wczytuje poziomy wymienione w src/data/levels/index.json. Uszkodzony plik jest pomijany
// (ostrzeżenie w konsoli), a brak index.json oznacza po prostu brak poziomów JSON.
export async function loadJsonLevels() {
    let names;
    try {
        const response = await fetch(MANIFEST_URL);
        if (!response.ok) return [];
        names = (await response.json()).levels ?? [];
    } catch (error) {
        console.warn("Nie można wczytać listy poziomów JSON (index.json):", error);
        return [];
    }

    const levels = [];
    for (const file of names) {
        try {
            const response = await fetch(new URL(file, LEVELS_DIR));
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const level = normalizeLevel(await response.json());
            level.source = file;
            levels.push(level);
        } catch (error) {
            console.warn(`Poziom ${file} pominięty: ${error.message}`);
        }
    }
    return levels;
}

// ---------- Szkice w przeglądarce (localStorage) ----------

function readJson(key, fallback) {
    try {
        const text = localStorage.getItem(key);
        return text ? JSON.parse(text) : fallback;
    } catch {
        return fallback;
    }
}

function writeJson(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch {
        return false; // zablokowany localStorage (np. tryb prywatny)
    }
}

export const listDrafts = () => Object.keys(readJson(DRAFTS_KEY, {}));
export const loadDraft = (name) => readJson(DRAFTS_KEY, {})[name] ?? null;

export function saveDraft(level) {
    const drafts = readJson(DRAFTS_KEY, {});
    drafts[level.name] = serializeLevel(level);
    return writeJson(DRAFTS_KEY, drafts);
}

export function deleteDraft(name) {
    const drafts = readJson(DRAFTS_KEY, {});
    delete drafts[name];
    return writeJson(DRAFTS_KEY, drafts);
}

// Automatyczny zapis ostatnio edytowanego poziomu (żeby odświeżenie strony niczego nie traciło).
export const saveAutosave = (level) => writeJson(AUTOSAVE_KEY, serializeLevel(level));
export const loadAutosave = () => readJson(AUTOSAVE_KEY, null);