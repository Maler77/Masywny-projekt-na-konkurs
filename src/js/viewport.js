// Viewport odpowiada tylko za canvas: rozmiar, skalowanie i czyszczenie ekranu.
// Treść gry (rysowanie postaci, tła itd.) jest w game.js.

// Stały rozmiar świata gry. Cała logika gry używa tych jednostek, nie pikseli ekranu.
export const WORLD_WIDTH = 960;
export const WORLD_HEIGHT = 540;

export function createViewport(canvas) {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser does not support the 2D canvas API");

    // Dopasowuje wewnętrzną rozdzielczość canvasa do jego rozmiaru na ekranie.
    const resize = () => {
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.max(1, Math.round(canvas.clientWidth * pixelRatio));
        canvas.height = Math.max(1, Math.round(canvas.clientHeight * pixelRatio));
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    // Wywołaj na początku każdej klatki. Zwraca kontekst, na którym rysujesz
    // we współrzędnych świata (0..960 x 0..540).
    function begin() {
        // Czyszczenie całego canvasa kolorem pasków (letterbox).
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.fillStyle = "#0b1016";
        context.fillRect(0, 0, canvas.width, canvas.height);

        // Jednakowa skala w X i Y, żeby obraz się nie rozciągał.
        const scale = Math.min(canvas.width / WORLD_WIDTH, canvas.height / WORLD_HEIGHT);
        const offsetX = (canvas.width - WORLD_WIDTH * scale) / 2;
        const offsetY = (canvas.height - WORLD_HEIGHT * scale) / 2;

        context.save();
        context.setTransform(scale, 0, 0, scale, offsetX, offsetY);

        // Przycinamy rysowanie do obszaru świata.
        context.beginPath();
        context.rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
        context.clip();

        return context;
    }

    // Wywołaj na końcu klatki.
    function end() {
        context.restore();
    }

    return {
        width: WORLD_WIDTH,
        height: WORLD_HEIGHT,
        begin,
        end,
        destroy() {
            observer.disconnect();
        },
    };
}