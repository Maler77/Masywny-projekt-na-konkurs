// Stan i logika gry: gracz, fizyka, platformy, kamera.
import { WORLD_WIDTH as VIEW_WIDTH, WORLD_HEIGHT as VIEW_HEIGHT } from "./viewport.js";
import { createCamera } from "./camera.js";

// Uwaga: VIEW_* to rozmiar ekranu (960 x 540), a LEVEL_* to rozmiar całego poziomu.
const LEVEL_WIDTH = 2400;
const LEVEL_HEIGHT = VIEW_HEIGHT;

// Fizyka (jednostki świata na sekundę).
const GRAVITY = 1800;        // przyspieszenie w dół
const MAX_FALL_SPEED = 1000; // maksymalna prędkość spadania
const JUMP_SPEED = 620;      // prędkość początkowa skoku (~107 jednostek wysokości)
const MOVE_SPEED = 280;      // prędkość biegu

// Wszystkie platformy są pełne (zderzasz się z nimi z każdej strony).
// Pierwsza to podłoga na całą szerokość poziomu.
const platforms = [
    { x: 0, y: 480, w: LEVEL_WIDTH, h: 60 },
    { x: 300, y: 400, w: 140, h: 20 },
    { x: 520, y: 330, w: 140, h: 20 },
    { x: 760, y: 260, w: 160, h: 20 },
    { x: 1000, y: 360, w: 120, h: 20 },
    { x: 1250, y: 300, w: 200, h: 20 },
    { x: 1500, y: 220, w: 140, h: 20 },
    { x: 1750, y: 320, w: 160, h: 20 },
    { x: 2000, y: 400, w: 200, h: 20 },
    { x: 1150, y: 420, w: 60, h: 60 }, // niski blok do wskakiwania
];

// Wygląd gracza. Hitbox (40 x 40, patrz niżej) to to, z czym zderzasz się w grze,
// a sprite to tylko obrazek narysowany na wierzchu, może być od niego większy.
const PLAYER_SPRITE = {
    src: "assets/player.png", // ścieżka względem index.html
    width: 150,                // rozmiar rysowania obrazka w jednostkach świata
    height: 150,
    pixelArt: false,          // true = ostre piksele (bez wygładzania) dla pixel artu
};

// Obrazek ładuje się w tle. Dopóki się nie wczyta (lub gdy go brak), rysujemy kwadrat.
const playerImage = new Image();
playerImage.src = PLAYER_SPRITE.src;

// Czy dwa prostokąty na siebie nachodzą (kolizja AABB).
function overlaps(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function createGame() {
    // Gracz: (x, y) to lewy górny róg, vx/vy to prędkość.
    const player = {
        w: 40,
        h: 120,
        x: 100,
        y: 370,
        vx: 0,
        vy: 0,
        onGround: false,
        facing: 1, // 1 = w prawo, -1 = w lewo (do odbijania obrazka)
    };

    const camera = createCamera({
        viewWidth: VIEW_WIDTH,
        viewHeight: VIEW_HEIGHT,
        levelWidth: LEVEL_WIDTH,
        levelHeight: LEVEL_HEIGHT,
        smoothing: 6,
    });
    camera.snapTo(player);

    function respawn() {
        player.x = 100;
        player.y = 440;
        player.vx = 0;
        player.vy = 0;
        camera.snapTo(player);
    }

    // Aktualizacja logiki. dt = czas od poprzedniej klatki w sekundach.
    function update(dt, input) {
        // 1) Ruch poziomy
        player.vx = input.moveX() * MOVE_SPEED;
        if (player.vx !== 0) player.facing = Math.sign(player.vx);

        // 2) Skok: tylko z ziemi i tylko przy świeżym wciśnięciu klawisza
        if (input.jumpPressed() && player.onGround) {
            player.vy = -JUMP_SPEED;
        }

        // 3) Grawitacja. Gdy puścisz skok w trakcie wznoszenia, grawitacja
        //    jest silniejsza, więc skok jest niższy (krótkie vs długie naciśnięcie).
        const gravityScale = player.vy < 0 && !input.jumpHeld() ? 2.5 : 1;
        player.vy = Math.min(player.vy + GRAVITY * gravityScale * dt, MAX_FALL_SPEED);

        // 4) Ruch w poziomie, potem kolizje w poziomie
        player.x += player.vx * dt;
        for (const platform of platforms) {
            if (!overlaps(player, platform)) continue;
            if (player.vx > 0) player.x = platform.x - player.w;
            else if (player.vx < 0) player.x = platform.x + platform.w;
        }
        player.x = Math.max(0, Math.min(LEVEL_WIDTH - player.w, player.x));

        // 5) Ruch w pionie, potem kolizje w pionie
        player.y += player.vy * dt;
        player.onGround = false;
        for (const platform of platforms) {
            if (!overlaps(player, platform)) continue;
            if (player.vy > 0) {
                player.y = platform.y - player.h; // lądowanie na platformie
                player.onGround = true;
            } else if (player.vy < 0) {
                player.y = platform.y + platform.h; // uderzenie głową
            }
            player.vy = 0;
        }

        // 6) Zabezpieczenie: gdyby gracz wypadł poza poziom
        if (player.y > LEVEL_HEIGHT + 300) respawn();

        // 7) Kamera goni gracza
        camera.follow(player, dt);
    }

    function drawPlayer(ctx) {
        const imageReady = playerImage.complete && playerImage.naturalWidth > 0;

        if (!imageReady) {
            // Zapas: kwadrat, gdy brak obrazka.
            ctx.fillStyle = "#79d7c4";
            ctx.fillRect(player.x, player.y, player.w, player.h);
            return;
        }

        // Obrazek stoi "stopami" na dole hitboxa i jest wyśrodkowany w poziomie.
        const { width, height, pixelArt } = PLAYER_SPRITE;
        const centerX = player.x + player.w / 2;
        const top = player.y + player.h - height;

        ctx.imageSmoothingEnabled = !pixelArt;
        ctx.save();
        ctx.translate(centerX, 0);
        ctx.scale(player.facing, 1); // odbicie lustrzane, gdy idziesz w lewo
        ctx.drawImage(playerImage, -width / 2, top, width, height);
        ctx.restore();
    }

    // Rysowanie. Tylko odczytuje stan, niczego nie zmienia.
    function draw(ctx) {
        // Tło na stałe przyklejone do ekranu (nie przesuwa się z kamerą).
        const sky = ctx.createLinearGradient(0, 0, 0, VIEW_HEIGHT);
        sky.addColorStop(0, "#203748");
        sky.addColorStop(1, "#111a23");
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

        // Wszystko poniżej jest rysowane we współrzędnych poziomu.
        ctx.save();
        camera.apply(ctx);

        // Siatka (tylko widoczny fragment), dzięki niej widać ruch kamery.
        ctx.strokeStyle = "rgba(204, 224, 238, 0.07)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        const firstX = Math.floor(camera.x / 48) * 48;
        for (let x = firstX; x <= camera.x + VIEW_WIDTH; x += 48) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x, LEVEL_HEIGHT);
        }
        for (let y = 0; y <= LEVEL_HEIGHT; y += 48) {
            ctx.moveTo(camera.x, y);
            ctx.lineTo(camera.x + VIEW_WIDTH, y);
        }
        ctx.stroke();

        // Platformy
        for (const p of platforms) {
            ctx.fillStyle = "#24343d";
            ctx.fillRect(p.x, p.y, p.w, p.h);
            ctx.fillStyle = "#526b70";
            ctx.fillRect(p.x, p.y, p.w, 3);
        }

        // Gracz
        drawPlayer(ctx);

        ctx.restore();

        // Interfejs przyklejony do ekranu
        ctx.fillStyle = "rgba(232, 237, 244, 0.68)";
        ctx.font = "16px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("A / D lub strzałki: ruch   ·   Spacja / W / ↑: skok", VIEW_WIDTH / 2, 28);
    }

    return { player, camera, update, draw };
}