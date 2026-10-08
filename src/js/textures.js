import { TILE, getScale, snap } from "./config.js";

// ============================================================================
//  TEKSTURY
//  Tu wybierasz grafiki z folderu assets/ dla wszystkich obiektów w grze
//  oraz dla elementów interfejsu (menu, okno z pytaniem, ekrany wygranej i przegranej).
//
//  PIXEL ART: 1 piksel obrazka = 1 piksel gry (1/32 tila). Obrazki rysuj w skali 1:1,
//  gra sama skaluje je do okna (patrz config.js i viewport.js). Wygładzanie jest wyłączone.
//
//  JAK UŻYĆ TEKSTURY DLA ISTNIEJĄCEGO OBIEKTU
//    Wpisz ścieżkę do pliku w polu `src` (np. src: "assets/bomb.png").
//    Bez ścieżki (src: null) obiekt jest rysowany zwykłym kolorem lub kształtem.
//
//  ROZMIAR OBRAZKA Z TEKSTURY (trim: true)
//    Obrazek jest najpierw przycinany z przezroczystych brzegów (pusty margines znika),
//    a rozmiar obiektu w grze to rozmiar przyciętego obrazka. Np. gracz 32x48 px z pustymi
//    bokami przycięty do 24x48 ma w grze 24x48 px (0,75 x 1,5 tila).
//    Bez tekstury obiekt ma rozmiar zastępczy (patrz game.js).
//    HITBOX jest osobno (patrz PLAYER_HITBOX i BOMB_HITBOX w game.js): domyślnie ręczny,
//    a po wpisaniu "auto" równy rozmiarowi przyciętego obrazka.
//
//  JAK DODAĆ TEKSTURĘ NOWEMU OBIEKTOWI W ŚWIECIE GRY (np. monecie)
//    1) Dodaj wpis poniżej:      coin: { src: "assets/coin.png", trim: true },
//    2) W obiekcie wpisz nazwę:  { x: 500, y: 300, w: 32, h: 32, texture: "coin", color: "gold" }
//       (rozmiar obrazka pobierzesz przez getTextureSize("coin"))
//    3) W funkcji draw() wywołaj: drawBox(ctx, coin);
//
//  JAK DODAĆ TEKSTURĘ ELEMENTOWI HTML
//    1) Dodaj wpis poniżej (np. pausePanel: { src: "assets/pause.png", mode: "cover" })
//    2) W index.html dopisz elementowi atrybut:  data-texture="pausePanel"
//    Tło zastępcze (gdy brak pliku) jest zdefiniowane w CSS.
//
//  OPCJE WPISU
//    src       ścieżka względem index.html albo null (brak tekstury)
//    trim      true = przytnij przezroczyste brzegi i weź rozmiar obiektu z obrazka
//              (tylko dla tekstur obiektów rysowanych w trybie "stretch")
//    smooth    true = wygładzanie przy skalowaniu (domyślnie wyłączone: ostre piksele)
//    mode      "stretch" (domyślnie) = rysuj w rozmiarze obiektu
//              "cover"               = wypełnij cały obiekt bez zniekształceń (nadmiar ucinany)
//              "tile"                = powtarzaj kafelek (platformy, podłoga, ściany)
//    tileWidth, tileHeight  rozmiar kafelka w trybie "tile" (domyślnie rozmiar pliku)
//    parallax  tylko dla tła gry: 0 = nieruchome, 1 = przesuwa się razem z kamerą
// ============================================================================

export const TEXTURES = {
    // Gracz. Obrazek powinien patrzeć w PRAWO, bo przy chodzeniu w lewo jest odbijany.
    player: { src: "assets/player1.png", trim: true },

    // Platformy, podłoga i ściany: powtarzany kafelek o rozmiarze tila (TILE z config.js).
    platform: { src: null, mode: "tile", tileWidth: TILE, tileHeight: TILE }, // np. "assets/platform.png"
    ground: { src: null, mode: "tile", tileWidth: TILE, tileHeight: TILE },   // np. "assets/ground.png"
    wall: { src: null, mode: "tile", tileWidth: TILE, tileHeight: TILE },     // ściany szybu (poziom 4)

    // Tło poziomu: rysowane w skali 1:1 (narysuj je na rozmiar ekranu gry, 640x360), powtarzane w poziomie.
    background: { src: null, parallax: 0.3 },  // poziom 1, np. "assets/background.png"
    background2: { src: null, parallax: 0.3 },  // poziom 2
    background3: { src: null, parallax: 0.3 },  // poziom 3
    background4: { src: null, parallax: 0.3 },  // poziom 4 (tło przesuwa się tylko poziomo)

    // Bomby w świecie gry. bombDefused to bomba po rozbrojeniu.
    bomb: { src: null, trim: true },         // np. "assets/bomb.png"
    bombDefused: { src: null, trim: true },  // np. "assets/bomb_defused.png"

    // Elementy interfejsu (HTML):
    menuBackground: { src: null, mode: "cover" }, // tło menu głównego, np. "assets/menu_background.png"
    bombPanel: { src: null },                     // okno z pytaniem, np. "assets/bomb_panel.png"
    level1Thumbnail: { src: null, mode: "cover" }, // miniatury poziomów w menu głównym
    level2Thumbnail: { src: null, mode: "cover" },
    level3Thumbnail: { src: null, mode: "cover" },
    level4Thumbnail: { src: null, mode: "cover" },
    winBackground: { src: null, mode: "cover" },  // ekran wygranej
    loseBackground: { src: "assets/decha.jpg", mode: "cover" }, // ekran przegranej
};

// ---------------------------------------------------------------------------
// Poniżej jest mechanizm. Zwykle nie musisz tego zmieniać.
// ---------------------------------------------------------------------------

const entries = new Map();   // nazwa -> { def, image, failed, trim }
const warnedUnknown = new Set();

for (const [name, def] of Object.entries(TEXTURES)) {
    const entry = { def, image: null, failed: false, trim: undefined };
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

// Prostokąt obrazka bez przezroczystych brzegów (rozmiar w pikselach obrazka).
function computeTrim(image) {
    const w = image.naturalWidth;
    const h = image.naturalHeight;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(image, 0, 0);
    const { data } = ctx.getImageData(0, 0, w, h);

    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (data[(y * w + x) * 4 + 3] === 0) continue; // w pełni przezroczysty piksel
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
    }
    if (maxX < 0) return null; // cały obrazek przezroczysty: bez przycinania
    return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

// Wynik przycinania liczymy raz na teksturę. Bez `trim: true` to cały obrazek.
function getTrim(entry) {
    if (entry.trim !== undefined) return entry.trim;

    let trim = { x: 0, y: 0, w: entry.image.naturalWidth, h: entry.image.naturalHeight };
    if (entry.def.trim) {
        try {
            trim = computeTrim(entry.image) ?? trim;
        } catch (error) {
            // Odczyt pikseli jest zablokowany np. przy otwarciu strony z file:// (użyj serwera).
            console.warn("Nie można przyciąć tekstury (odczyt pikseli zablokowany). Uruchom grę przez serwer HTTP.", error);
        }
    }
    entry.trim = trim;
    return trim;
}

// Rozmiar tekstury w pikselach gry (po przycięciu, jeśli trim: true) albo null,
// gdy tekstury nie ma / jeszcze się ładuje. Z tego game.js bierze rozmiar obiektów.
export function getTextureSize(name) {
    const entry = getReady(name);
    if (!entry) return null;
    const { w, h } = getTrim(entry);
    return { w, h };
}

// Rysuje teksturę w prostokącie (x, y, w, h), zawsze w pełnych pikselach gry.
// Zwraca true, jeśli coś narysowano. Gdy zwróci false (brak tekstury lub pliku),
// wywołujący rysuje kolor zastępczy.
export function drawTexture(ctx, name, x, y, w, h) {
    const entry = getReady(name);
    if (!entry) return false;

    const { image, def } = entry;
    x = Math.round(x);
    y = Math.round(y);
    w = Math.round(w);
    h = Math.round(h);

    ctx.save();
    ctx.imageSmoothingEnabled = Boolean(def.smooth);

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
        const t = getTrim(entry); // tylko widoczna część obrazka
        ctx.drawImage(image, t.x, t.y, t.w, t.h, x, y, w, h);
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
        ctx.fillRect(Math.round(box.x), Math.round(box.y), Math.round(box.w), Math.round(box.h));
    }
    return false;
}

// Rysuje warstwę tła na ekranie (nie w układzie poziomu) w skali 1:1, od góry ekranu,
// powtarzaną w poziomie. scrollX to pozycja kamery. (viewHeight zostaje dla zgodności wywołań.)
export function drawBackground(ctx, name, scrollX, viewWidth, viewHeight) {
    const entry = getReady(name);
    if (!entry) return false;

    const { image, def } = entry;
    const width = Math.max(1, image.naturalWidth);
    // Przesunięcie jest płynne (nie zaokrąglane do pikseli gry), tylko wyrównane do pikseli ekranu.
    const offset = -snap((scrollX * (def.parallax ?? 0)) % width, getScale(ctx));

    ctx.save();
    ctx.imageSmoothingEnabled = Boolean(def.smooth);
    for (let x = offset; x < viewWidth; x += width) {
        ctx.drawImage(image, x, 0);
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

        // WAŻNE: adres musi być bezwzględny. Względna ścieżka ("assets/x.png") w zmiennej CSS
        // jest rozwiązywana względem arkusza stylów (src/css/), a nie strony, więc obrazek się
        // nie ładował (szukał src/css/assets/x.png).
        const url = new URL(def.src, document.baseURI).href;

        element.style.setProperty("--texture", `url("${url}")`);
        element.style.setProperty("--texture-size", size);
        element.style.setProperty("--texture-repeat", repeat);
        element.style.imageRendering = def.smooth ? "" : "pixelated";
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