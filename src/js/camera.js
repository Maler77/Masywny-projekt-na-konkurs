// Kamera: przesuwa "okno" (960 x 540) po większym poziomie i płynnie goni gracza.

export function createCamera({ viewWidth, viewHeight, levelWidth, levelHeight, smoothing = 6 }) {
    // smoothing: im większa wartość, tym szybciej kamera dogania gracza
    // (np. 3 = leniwa i miękka, 12 = prawie sztywna).

    // Kamera nie wychodzi poza krawędzie poziomu.
    const clampX = (value) => Math.max(0, Math.min(levelWidth - viewWidth, value));
    const clampY = (value) => Math.max(0, Math.min(levelHeight - viewHeight, value));

    // Pozycja lewego górnego rogu kamery, przy której cel byłby na środku ekranu.
    const targetX = (target) => clampX(target.x + target.w / 2 - viewWidth / 2);
    const targetY = (target) => clampY(target.y + target.h / 2 - viewHeight / 2);

    const camera = {
        x: 0,
        y: 0,

        // Zmienia rozmiar poziomu (przy przejściu na inny poziom).
        setLevelSize(width, height) {
            levelWidth = width;
            levelHeight = height;
        },

        // Natychmiast ustawia kamerę na celu (na start gry i po respawnie).
        snapTo(target) {
            camera.x = targetX(target);
            camera.y = targetY(target);
        },

        // Co klatkę przybliża kamerę do celu. dt = czas klatki w sekundach.
        follow(target, dt) {
            // Wygładzanie niezależne od liczby klatek na sekundę:
            // przy 60 i 144 FPS kamera zachowuje się tak samo.
            const t = 1 - Math.exp(-smoothing * dt);
            camera.x += (targetX(target) - camera.x) * t;
            camera.y += (targetY(target) - camera.y) * t;
        },

        // Przesuwa układ współrzędnych rysowania: wszystko narysowane po tym
        // wywołaniu trafia w odpowiednie miejsce względem kamery.
        apply(ctx) {
            ctx.translate(-camera.x, -camera.y);
        },
    };

    return camera;
}