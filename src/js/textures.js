// ============================================================================
//  TEKSTURY
//  Tu wybierasz grafiki z folderu assets/ dla wszystkich obiektów w grze.
//
//  JAK UŻYĆ TEKSTURY DLA ISTNIEJĄCEGO OBIEKTU
//    Wpisz ścieżkę do pliku w polu `src` (np. src: "assets/platform.png").
//    Bez ścieżki (src: null) obiekt jest rysowany zwykłym kolorem.
//
//  JAK DODAĆ TEKSTURĘ NOWEMU OBIEKTOWI (np. monecie)
//    1) Dodaj wpis poniżej:      coin: { src: "assets/coin.png", pixelArt: true },
//    2) W obiekcie wpisz nazwę:  { x: 500, y: 300, w: 24, h: 24, texture: "coin", color: "gold" }
//    3) W funkcji draw() wywołaj: drawBox(ctx, coin);
//
//  OPCJE WPISU
//    src       ścieżka względem index.html albo null (brak tekstury)
//    pixelArt  true = ostre piksele (bez wygładzania przy skalowaniu)
//    mode      "stretch" (domyślnie) = rozciągnij na cały obiekt
//              "tile"                = powtarzaj kafelek (platformy, podłoga)
//    tileWidth, tileHeight  rozmiar kafelka w trybie "tile" (domyślnie rozmiar pliku)
//    parallax  tylko dla tła: 0 = nieruchome, 1 = przesuwa się razem z kamerą;
//              wartości pomiędzy (np. 0.3) dają efekt głębi
// ============================================================================

export const TEXTURES = {
    // Gracz (rozmiar rysowania ustawiasz w PLAYER_SPRITE w game.js).
    // Obrazek powinien patrzeć w PRAWO, bo przy chodzeniu w lewo jest odbijany.
    player: { src: "assets/player.png", pixelArt: false },
    platform: { src: null, mode: "tile", tileWidth: 64, tileHeight: 64 },
    ground: { src: null, mode: "tile", tileWidth: 64, tileHeight: 64 },
    background: { src: "assets/decha.jpg", parallax: 0.3 },
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
        };
        entry.image.src = def.src;
    }
    entries.set(name, entry);
}

const isReady = (entry) => Boolean(entry.image && entry.image.complete && entry.image.naturalWidth > 0);

// Zwraca wpis gotowy do rysowania albo null (brak nazwy, brak pliku, jeszcze się ładuje).
function getReady(name) {
    if (!name) return null;
    const entry = entries.get(name);
    if (!entry) {
        if (!warnedUnknown.has(name)) {
            warnedUnknown.add(name);
            console.warn(`Nieznana tekstura "${name}". Dodaj ją do TEXTURES w textures.js.`);
        }
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
    } else {
        ctx.drawImage(image, x, y, w, h);
    }

    ctx.restore();
    return true;
}

// Rysuje obiekt-prostokąt { x, y, w, h, texture, color }: teksturą, a jeśli jej nie ma,
// kolorem. Zwraca true tylko wtedy, gdy użyto tekstury.
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