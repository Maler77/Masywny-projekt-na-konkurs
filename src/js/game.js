// Stan i logika gry: gracz, fizyka, dash, platformy, kamera.
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

// Dash (Shift): krótki, szybki zryw w poziomie, bez grawitacji.
const DASH_SPEED = 720;      // prędkość w trakcie dashu
const DASH_TIME = 0.15;      // czas trwania dashu w sekundach (~108 jednostek dystansu)
const DASH_COOLDOWN = 0.5;   // minimalny odstęp między startami dashu
const GHOST_LIFE = 0.25;     // jak długo widać "cienie" po dashu

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
    width: 48,                // rozmiar rysowania obrazka w jednostkach świata
    height: 48,
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
        h: 40,
        x: 100,
        y: 440,
        vx: 0,
        vy: 0,
        onGround: false,
        facing: 1,        // 1 = w prawo, -1 = w lewo (do odbijania obrazka)
        dashTime: 0,      // ile jeszcze trwa aktualny dash (0 = brak dashu)
        dashCooldown: 0,  // ile jeszcze do możliwości kolejnego dashu
        dashDir: 1,       // kierunek aktualnego dashu
    };

    // "Cienie" zostawiane przez gracza podczas dashu (tylko efekt wizualny).
    const ghosts = [];
    let lastDt = 0; // do wyświetlania w trybie debug

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
        player.dashTime = 0;
        camera.snapTo(player);
    }

    // Aktualizacja logiki. dt = czas od poprzedniej klatki w sekundach.
    function update(dt, input) {
        lastDt = dt;

        // 1) Dash: start, jeśli wciśnięto Shift i minął cooldown
        player.dashCooldown = Math.max(0, player.dashCooldown - dt);
        if (input.dashPressed() && player.dashTime <= 0 && player.dashCooldown <= 0) {
            // Kierunek z klawiszy, a jeśli żaden nie jest wciśnięty, to w stronę patrzenia.
            player.dashDir = input.moveX() || player.facing;
            player.facing = player.dashDir;
            player.dashTime = DASH_TIME;
            player.dashCooldown = DASH_COOLDOWN;
        }

        if (player.dashTime > 0) {
            // W trakcie dashu: stała prędkość w poziomie, bez grawitacji i bez skoku.
            player.dashTime -= dt;
            player.vx = player.dashDir * DASH_SPEED;
            player.vy = 0;
        } else {
            // 2) Ruch poziomy
            player.vx = input.moveX() * MOVE_SPEED;
            if (player.vx !== 0) player.facing = Math.sign(player.vx);

            // 3) Skok: tylko z ziemi i tylko przy świeżym wciśnięciu klawisza
            if (input.jumpPressed() && player.onGround) {
                player.vy = -JUMP_SPEED;
            }

            // 4) Grawitacja. Gdy puścisz skok w trakcie wznoszenia, grawitacja
            //    jest silniejsza, więc skok jest niższy (krótkie vs długie naciśnięcie).
            const gravityScale = player.vy < 0 && !input.jumpHeld() ? 2.5 : 1;
            player.vy = Math.min(player.vy + GRAVITY * gravityScale * dt, MAX_FALL_SPEED);
        }

        // 5) Ruch w poziomie, potem kolizje w poziomie
        player.x += player.vx * dt;
        for (const platform of platforms) {
            if (!overlaps(player, platform)) continue;
            if (player.vx > 0) player.x = platform.x - player.w;
            else if (player.vx < 0) player.x = platform.x + platform.w;
            player.dashTime = 0; // uderzenie w ścianę kończy dash
        }
        player.x = Math.max(0, Math.min(LEVEL_WIDTH - player.w, player.x));

        // 6) Ruch w pionie, potem kolizje w pionie
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

        // 7) Cienie dashu: stare znikają, w trakcie dashu dochodzą nowe
        for (let i = ghosts.length - 1; i >= 0; i--) {
            ghosts[i].life -= dt;
            if (ghosts[i].life <= 0) ghosts.splice(i, 1);
        }
        if (player.dashTime > 0) {
            ghosts.push({ x: player.x, y: player.y, facing: player.facing, life: GHOST_LIFE });
        }

        // 8) Zabezpieczenie: gdyby gracz wypadł poza poziom
        if (player.y > LEVEL_HEIGHT + 300) respawn();

        // 9) Kamera goni gracza
        camera.follow(player, dt);
    }

    // Prostokąt, w którym rysowany jest obrazek gracza (stoi "stopami" na dole hitboxa).
    function spriteRect() {
        const { width, height } = PLAYER_SPRITE;
        return {
            x: player.x + player.w / 2 - width / 2,
            y: player.y + player.h - height,
            w: width,
            h: height,
        };
    }

    function drawPlayer(ctx, x, y, facing, alpha = 1) {
        const imageReady = playerImage.complete && playerImage.naturalWidth > 0;

        ctx.save();
        ctx.globalAlpha = alpha;
        if (!imageReady) {
            // Zapas: kwadrat, gdy brak obrazka.
            ctx.fillStyle = "#79d7c4";
            ctx.fillRect(x, y, player.w, player.h);
        } else {
            const { width, height, pixelArt } = PLAYER_SPRITE;
            ctx.imageSmoothingEnabled = !pixelArt;
            ctx.translate(x + player.w / 2, 0);
            ctx.scale(facing, 1); // odbicie lustrzane, gdy idziesz w lewo
            ctx.drawImage(playerImage, -width / 2, y + player.h - height, width, height);
        }
        ctx.restore();
    }

    // Debug w układzie poziomu: hitboxy i wektory.
    function drawDebugWorld(ctx) {
        ctx.lineWidth = 1.5;

        // Granice poziomu
        ctx.strokeStyle = "rgba(255, 0, 255, 0.6)";
        ctx.strokeRect(0, 0, LEVEL_WIDTH, LEVEL_HEIGHT);

        // Hitboxy platform
        ctx.strokeStyle = "rgba(255, 90, 90, 0.95)";
        for (const p of platforms) ctx.strokeRect(p.x, p.y, p.w, p.h);

        // Obszar rysowania obrazka gracza (przerywana żółta)
        const s = spriteRect();
        ctx.strokeStyle = "rgba(255, 230, 80, 0.9)";
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(s.x, s.y, s.w, s.h);
        ctx.setLineDash([]);

        // Hitbox gracza (zielony)
        ctx.strokeStyle = "#3cff7a";
        ctx.strokeRect(player.x, player.y, player.w, player.h);

        // Wektor prędkości (0,15 s ruchu)
        const cx = player.x + player.w / 2;
        const cy = player.y + player.h / 2;
        ctx.strokeStyle = "#4db8ff";
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + player.vx * 0.15, cy + player.vy * 0.15);
        ctx.stroke();

        // Znacznik kontaktu z podłożem: zielony = stoi, czerwony = w powietrzu
        ctx.fillStyle = player.onGround ? "#3cff7a" : "#ff5a5a";
        ctx.fillRect(player.x, player.y + player.h - 3, player.w, 3);
    }

    // Debug w układzie ekranu: panel z liczbami.
    function drawDebugPanel(ctx, fps) {
        const dash = player.dashTime > 0
            ? `w trakcie (${player.dashTime.toFixed(2)} s)`
            : player.dashCooldown > 0
                ? `cooldown ${player.dashCooldown.toFixed(2)} s`
                : "gotowy";

        const lines = [
            "DEBUG   ( / = wyłącz )",
            `FPS: ${fps.toFixed(0)}   dt: ${(lastDt * 1000).toFixed(1)} ms`,
            `pozycja:  x=${player.x.toFixed(1)}  y=${player.y.toFixed(1)}`,
            `prędkość: vx=${player.vx.toFixed(0)}  vy=${player.vy.toFixed(0)}`,
            `onGround: ${player.onGround}   facing: ${player.facing}`,
            `dash: ${dash}`,
            `kamera:   x=${camera.x.toFixed(1)}  y=${camera.y.toFixed(1)}`,
            `poziom: ${LEVEL_WIDTH}x${LEVEL_HEIGHT}   platform: ${platforms.length}`,
        ];

        const lineHeight = 18;
        ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
        ctx.fillRect(10, 48, 320, lines.length * lineHeight + 14);

        ctx.fillStyle = "#d8ffe4";
        ctx.font = "13px ui-monospace, Menlo, Consolas, monospace";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        lines.forEach((text, i) => ctx.fillText(text, 18, 56 + i * lineHeight));
        ctx.textBaseline = "alphabetic";
    }

    // Rysowanie. Tylko odczytuje stan, niczego nie zmienia.
    function draw(ctx, { debug = false, fps = 0 } = {}) {
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

        // Cienie po dashu, potem sam gracz
        for (const g of ghosts) {
            drawPlayer(ctx, g.x, g.y, g.facing, (g.life / GHOST_LIFE) * 0.45);
        }
        drawPlayer(ctx, player.x, player.y, player.facing);

        if (debug) drawDebugWorld(ctx);

        ctx.restore();

        // Interfejs przyklejony do ekranu
        ctx.fillStyle = "rgba(232, 237, 244, 0.68)";
        ctx.font = "16px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(
            "A / D: ruch  ·  Spacja / W: skok  ·  Shift: dash  ·  / : debug",
            VIEW_WIDTH / 2,
            28,
        );

        if (debug) drawDebugPanel(ctx, fps);
    }

    return { player, camera, update, draw };
}