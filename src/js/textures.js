// ============================================================================
//  TEKSTURY
//  Tu wybierasz grafiki z folderu assets/ dla wszystkich obiektów w grze
//  oraz dla elementów interfejsu (menu, okno z pytaniem, ekrany wygranej i przegranej).
//
//  JAK UŻYĆ TEKSTURY DLA ISTNIEJĄCEGO OBIEKTU
//    Wpisz ścieżkę do pliku w polu `src` (np. src: "assets/bomb.png").
//    Bez ścieżki (src: null) obiekt jest rysowany zwykłym kolorem lub kształtem.
//
//  JAK DODAĆ TEKSTURĘ NOWEMU OBIEKTOWI W ŚWIECIE GRY (np. monecie)
//    1) Dodaj wpis poniżej:      coin: { src: "assets/coin.png", pixelArt: true },
//    2) W obiekcie wpisz nazwę:  { x: 500, y: 300, w: 24, h: 24, texture: "coin", color: "gold" }
//    3) W funkcji draw() wywołaj: drawBox(ctx, coin);
//
//  JAK DODAĆ TEKSTURĘ ELEMENTOWI HTML
//    1) Dodaj wpis poniżej (np. pausePanel: { src: "assets/pause.png", mode: "cover" })
//    2) W index.html dopisz elementowi atrybut:  data-texture="pausePanel"
//    Tło zastępcze (gdy brak pliku) jest zdefiniowane w CSS.
//
//  OPCJE WPISU
//    src       ścieżka względem index.html albo null (brak tekstury)
//    pixelArt  true = ostre piksele (bez wygładzania przy skalowaniu)
//    mode      "stretch" (domyślnie) = rozciągnij na cały obiekt
//              "cover"               = wypełnij cały obiekt bez zniekształceń (nadmiar jest ucinany)
//              "tile"                = powtarzaj kafelek (platformy, podłoga)
//    tileWidth, tileHeight  rozmiar kafelka w trybie "tile" (domyślnie rozmiar pliku)
//    parallax  tylko dla tła gry: 0 = nieruchome, 1 = przesuwa się razem z kamerą
// ============================================================================

export const TEXTURES = {
    // Gracz (rozmiar rysowania ustawiasz w PLAYER_SPRITE w game.js).
    // Obrazek powinien patrzeć w PRAWO, bo przy chodzeniu w lewo jest odbijany.
    player: { src: "assets/player.png", pixelArt: false },

    // Platformy i podłoga: powtarzany kafelek.
    platform: { src: null, mode: "tile", tileWidth: 64, tileHeight: 64 }, // np. "assets/platform.png"
    ground: { src: null, mode: "tile", tileWidth: 64, tileHeight: 64 },   // np. "assets/ground.png"

    // Tło poziomu: skalowane do wysokości ekranu i powtarzane w poziomie.
    background: { src: null, parallax: 0.3 }, // poziom 1, np. "assets/background.png"
    background2: { src: null, parallax: 0.3 }, // poziom 2
    background3: { src: null, parallax: 0.3 }, // poziom 3

    // Bomby w świecie gry (36 x 36). bombDefused to bomba po rozbrojeniu.
    bomb: { src: null },         // np. "assets/bomb.png"
    bombDefused: { src: null },  // np. "assets/bomb_defused.png"

    // Elementy interfejsu (HTML):
    menuBackground: { src: null, mode: "cover" }, // tło menu głównego, np. "assets/menu_background.png"
    bombPanel: { src: null },                     // okno z pytaniem, np. "assets/bomb_panel.png"
    level1Thumbnail: { src: null, mode: "cover" }, // miniatury poziomów w menu głównym
    level2Thumbnail: { src: null, mode: "cover" },
    level3Thumbnail: { src: null, mode: "cover" },
    winBackground: { src: null, mode: "cover" },  // ekran wygranej
    loseBackground: { src: null, mode: "cover" }, // ekran przegranej
};

// ---------------------------------------------------------------------------
// Poniżej jest mechanizm. Zwykle nie musisz tego zmieniać.
// ---------------------------------------------------------------------------

const entries = new Map();   // nazwa -> { def, image, failed }
const warnedUnknown = new Set();

for (const [name, def] of Object.entries(TEXTURES)) {
    const entry = { def, image: null, failed: false };
    if (def.src) {
        entry.image = new Image();
        entry.image.onerror = () => {
            entry.failed = true;
            console.warn(`Tekstura "${name}": nie udało się wczytać pliku ${def.src}`);
            // Elementy HTML wracają do tła zastępczego z CSS.
            if (typeof document !== "undefined") {
                for (const element of document.querySelectorAll(`[data-texture="${name}"]`)) {
                    element.style.removeProperty("--texture");
                }
            }
        };
        entry.image.src = def.src;
    }
    entries.set(name, entry);
}

const isReady = (entry) => Boolean(entry.image && entry.image.complete && entry.image.naturalWidth > 0);

function warnUnknown(name) {
    if (warnedUnknown.has(name)) return;
    warnedUnknown.add(name);
    console.warn(`Nieznana tekstura "${name}". Dodaj ją do TEXTURES w textures.js.`);
}

// Zwraca wpis gotowy do rysowania albo null (brak nazwy, brak pliku, jeszcze się ładuje).
function getReady(name) {
    if (!name) return null;
    const entry = entries.get(name);
    if (!entry) {
        warnUnknown(name);
        return null;
    }
    return isReady(entry) ? entry : null;
}

// Rysuje teksturę w prostokącie (x, y, w, h). Zwraca true, jeśli coś narysowano.
// Gdy zwróci false (brak tekstury lub pliku), wywołujący rysuje kolor zastępczy.
export function drawTexture(ctx, name, x, y, w, h) {
    const entry = getReady(name);
    if (!entry) return false;

    const { image, def } = entry;
    ctx.save();
    ctx.imageSmoothingEnabled = !def.pixelArt;

    if (def.mode === "tile") {
        const tileW = def.tileWidth ?? image.naturalWidth;
        const tileH = def.tileHeight ?? image.naturalHeight;
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip(); // kafelki wystające poza obiekt są ucinane
        for (let ty = y; ty < y + h; ty += tileH) {
            for (let tx = x; tx < x + w; tx += tileW) {
                ctx.drawImage(image, tx, ty, tileW, tileH);
            }
        }
    } else if (def.mode === "cover") {
        // Skalujemy tak, żeby wypełnić prostokąt, a nadmiar obrazka ucinamy z brzegów.
        const scale = Math.max(w / image.naturalWidth, h / image.naturalHeight);
        const sw = w / scale;
        const sh = h / scale;
        ctx.drawImage(image, (image.naturalWidth - sw) / 2, (image.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
    } else {
        ctx.drawImage(image, x, y, w, h);
    }

    ctx.restore();
    return true;
}

// Rysuje obiekt-prostokąt { x, y, w, h, texture, color }: teksturą, a jeśli jej nie ma,
// kolorem (o ile obiekt ma `color`). Zwraca true tylko wtedy, gdy użyto tekstury.
export function drawBox(ctx, box) {
    if (drawTexture(ctx, box.texture, box.x, box.y, box.w, box.h)) return true;
    if (box.color) {
        ctx.fillStyle = box.color;
        ctx.fillRect(box.x, box.y, box.w, box.h);
    }
    return false;
}

// Rysuje warstwę tła na ekranie (nie w układzie poziomu). scrollX to pozycja kamery.
export function drawBackground(ctx, name, scrollX, viewWidth, viewHeight) {
    const entry = getReady(name);
    if (!entry) return false;

    const { image, def } = entry;
    const scale = viewHeight / image.naturalHeight;
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const offset = -Math.round((scrollX * (def.parallax ?? 0)) % width);

    ctx.save();
    ctx.imageSmoothingEnabled = !def.pixelArt;
    for (let x = offset; x < viewWidth; x += width) {
        ctx.drawImage(image, x, 0, width, viewHeight);
    }
    ctx.restore();
    return true;
}

// Nakłada tekstury na elementy HTML z atrybutem data-texture="nazwa".
// Element dostaje zmienną CSS --texture; samo rysowanie robi CSS (patrz style.css).
export function applyDomTextures(root = document) {
    for (const element of root.querySelectorAll("[data-texture]")) {
        const name = element.dataset.texture;
        const entry = entries.get(name);
        if (!entry) {
            warnUnknown(name);
            continue;
        }
        const { def } = entry;
        if (!def.src || entry.failed) continue; // zostaje tło zastępcze z CSS

        let size = "100% 100%"; // "stretch"
        let repeat = "no-repeat";
        if (def.mode === "cover") {
            size = "cover";
        } else if (def.mode === "tile") {
            size = def.tileWidth && def.tileHeight ? `${def.tileWidth}px ${def.tileHeight}px` : "auto";
            repeat = "repeat";
        }

        element.style.setProperty("--texture", `url("${def.src}")`);
        element.style.setProperty("--texture-size", size);
        element.style.setProperty("--texture-repeat", repeat);
        element.style.imageRendering = def.pixelArt ? "pixelated" : "";
    }
}

// Podsumowanie wczytywania tekstur (do trybu debug).
export function getTextureReport() {
    const report = { ok: 0, loading: 0, error: 0, none: 0 };
    for (const entry of entries.values()) {
        if (!entry.def.src) report.none++;
        else if (entry.failed) report.error++;
        else if (isReady(entry)) report.ok++;
        else report.loading++;
    }
    return report;
}