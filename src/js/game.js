// Stan i logika gry: gracz, fizyka, dash, platformy, bomby, timer, tło, kamera.
import { WORLD_WIDTH as VIEW_WIDTH, WORLD_HEIGHT as VIEW_HEIGHT } from "./viewport.js";
import { createCamera } from "./camera.js";
import { drawBackground, drawBox, drawTexture, getTextureReport } from "./textures.js";
import { BOMBS, TIME_LIMIT } from "./bombs.js";

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
const DASH_TIME = 0.15;      // czas trwania dashu w sekundach
const DASH_COOLDOWN = 0.5;   // minimalny odstęp między startami dashu
const GHOST_LIFE = 0.25;     // jak długo widać "cienie" po dashu

// Bomby (pozycje i pytania są w bombs.js).
const BOMB_SIZE = 36;        // rozmiar bomby w jednostkach świata
const INTERACT_RANGE = 70;   // odległość od środka bomby, w której działa klawisz E

// Tło: nazwy tekstur z textures.js rysowane od najdalszej do najbliższej.
// Dla głębi dodaj kolejne warstwy, np. ["sky", "hills", "trees"].
// Bez tekstur widać tylko gradient.
const BACKGROUND_LAYERS = ["background"];

// Platforma: pełny prostokąt. Tekstura jest w textures.js, color to kolor zastępczy.
// Pierwsza platforma to podłoga na całą szerokość poziomu.
const platform = (x, y, w, h, texture = "platform") => ({ x, y, w, h, texture, color: "#24343d" });

const platforms = [
    platform(0, 480, LEVEL_WIDTH, 60, "ground"),
    platform(300, 400, 140, 20),
    platform(520, 330, 140, 20),
    platform(760, 260, 160, 20),
    platform(1000, 360, 120, 20),
    platform(1250, 300, 200, 20),
    platform(1500, 220, 140, 20),
    platform(1750, 320, 160, 20),
    platform(2000, 400, 200, 20),
    platform(1150, 420, 60, 60), // niski blok do wskakiwania
];

// Rozmiar rysowania obrazka gracza. Hitbox (player.w x player.h) to to, z czym zderzasz się
// w grze, a obrazek to tylko grafika na wierzchu, może być od hitboxa większy.
const PLAYER_SPRITE = { width: 48, height: 48 };

// Czy dwa prostokąty na siebie nachodzą (kolizja AABB).
function overlaps(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// Zamienia sekundy na tekst m:ss (zaokrąglone w górę, żeby 0:00 oznaczało koniec czasu).
export function formatTime(seconds) {
    const total = Math.ceil(Math.max(0, seconds));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
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
        texture: "player", // nazwa z textures.js
        color: "#79d7c4",  // kolor zastępczy, gdy brak tekstury
    };

    // Bomby: dane z bombs.js + rozmiar, tekstura i stan rozbrojenia.
    const bombs = BOMBS.map((data) => ({
        ...data,
        w: BOMB_SIZE,
        h: BOMB_SIZE,
        texture: "bomb",
        defused: false,
    }));

    let timeLeft = TIME_LIMIT; // pozostały czas w sekundach

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

    // Ustawia gracza na starcie (po wypadnięciu poza poziom).
    function respawnPlayer() {
        player.x = 100;
        player.y = 440;
        player.vx = 0;
        player.vy = 0;
        player.onGround = false;
        player.facing = 1;
        player.dashTime = 0;
        player.dashCooldown = 0;
        ghosts.length = 0;
        camera.snapTo(player);
    }

    // Pełny reset: gracz, bomby i timer (start gry, powrót do menu).
    function reset() {
        respawnPlayer();
        for (const bomb of bombs) {
            bomb.defused = false;
            bomb.texture = "bomb";
        }
        timeLeft = TIME_LIMIT;
    }

    // Odlicza czas. Wołane z update(), a także podczas okna z pytaniem (czas wtedy leci dalej).
    function tickTimer(dt) {
        timeLeft = Math.max(0, timeLeft - dt);
    }

    // Najbliższa nierozbrojona bomba w zasięgu interakcji albo null.
    function nearbyBomb() {
        const cx = player.x + player.w / 2;
        const cy = player.y + player.h / 2;
        let best = null;
        let bestDistance = INTERACT_RANGE;
        for (const bomb of bombs) {
            if (bomb.defused) continue;
            const distance = Math.hypot(cx - (bomb.x + bomb.w / 2), cy - (bomb.y + bomb.h / 2));
            if (distance <= bestDistance) {
                best = bomb;
                bestDistance = distance;
            }
        }
        return best;
    }

    function defuse(bomb) {
        bomb.defused = true;
        bomb.texture = "bombDefused";
    }

    const defusedCount = () => bombs.filter((bomb) => bomb.defused).length;
    const allDefused = () => defusedCount() === bombs.length;

    // Aktualizacja logiki. dt = czas od poprzedniej klatki w sekundach.
    function update(dt, input) {
        lastDt = dt;
        tickTimer(dt);

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
        for (const p of platforms) {
            if (!overlaps(player, p)) continue;
            if (player.vx > 0) player.x = p.x - player.w;
            else if (player.vx < 0) player.x = p.x + p.w;
            player.dashTime = 0; // uderzenie w ścianę kończy dash
        }
        player.x = Math.max(0, Math.min(LEVEL_WIDTH - player.w, player.x));

        // 6) Ruch w pionie, potem kolizje w pionie
        player.y += player.vy * dt;
        player.onGround = false;
        for (const p of platforms) {
            if (!overlaps(player, p)) continue;
            if (player.vy > 0) {
                player.y = p.y - player.h; // lądowanie na platformie
                player.onGround = true;
            } else if (player.vy < 0) {
                player.y = p.y + p.h; // uderzenie głową
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
        if (player.y > LEVEL_HEIGHT + 300) respawnPlayer();

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
        const { width, height } = PLAYER_SPRITE;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(x + player.w / 2, 0);
        ctx.scale(facing, 1); // odbicie lustrzane, gdy idziesz w lewo

        const drawn = drawTexture(ctx, player.texture, -width / 2, y + player.h - height, width, height);
        if (!drawn) {
            ctx.fillStyle = player.color;
            ctx.fillRect(-player.w / 2, y, player.w, player.h);
        }
        ctx.restore();
    }

    // Bomba: teksturą, a bez niej prosty kształt (czarna kula z lontem, po rozbrojeniu zielona).
    function drawBomb(ctx, bomb) {
        if (drawBox(ctx, bomb)) return;

        const cx = bomb.x + bomb.w / 2;
        const cy = bomb.y + bomb.h / 2 + 3;
        const radius = bomb.w / 2 - 3;

        ctx.fillStyle = bomb.defused ? "#2e7d5b" : "#1a1a1f";
        ctx.strokeStyle = bomb.defused ? "#7be0ae" : "#6b7480";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Lont
        ctx.strokeStyle = "#c9a27a";
        ctx.beginPath();
        ctx.moveTo(cx, cy - radius);
        ctx.lineTo(cx + 8, cy - radius - 8);
        ctx.stroke();

        // Migająca iskra (tylko na nierozbrojonej bombie)
        if (!bomb.defused && Math.floor(timeLeft * 3) % 2 === 0) {
            ctx.fillStyle = "#ff7a3d";
            ctx.beginPath();
            ctx.arc(cx + 8, cy - radius - 8, 3.5, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // Napis "E" nad bombą w zasięgu (w układzie poziomu).
    function drawInteractPrompt(ctx) {
        const bomb = nearbyBomb();
        if (!bomb) return;

        const text = "E: rozbrój";
        ctx.font = "700 14px system-ui, sans-serif";
        ctx.textAlign = "center";
        const width = ctx.measureText(text).width + 16;
        const x = bomb.x + bomb.w / 2;
        const y = bomb.y - 14;

        ctx.fillStyle = "rgba(10, 15, 22, 0.8)";
        ctx.fillRect(x - width / 2, y - 16, width, 24);
        ctx.fillStyle = "#ffe08a";
        ctx.fillText(text, x, y);
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

        // Bomby: hitbox (pomarańczowy) i zasięg interakcji (przerywany niebieski)
        for (const bomb of bombs) {
            ctx.strokeStyle = "rgba(255, 160, 60, 0.95)";
            ctx.strokeRect(bomb.x, bomb.y, bomb.w, bomb.h);
            ctx.strokeStyle = "rgba(90, 220, 255, 0.55)";
            ctx.setLineDash([5, 4]);
            ctx.beginPath();
            ctx.arc(bomb.x + bomb.w / 2, bomb.y + bomb.h / 2, INTERACT_RANGE, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
        }

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
        const tex = getTextureReport();

        const lines = [
            "DEBUG   ( / = wyłącz )",
            `FPS: ${fps.toFixed(0)}   dt: ${(lastDt * 1000).toFixed(1)} ms`,
            `pozycja:  x=${player.x.toFixed(1)}  y=${player.y.toFixed(1)}`,
            `prędkość: vx=${player.vx.toFixed(0)}  vy=${player.vy.toFixed(0)}`,
            `onGround: ${player.onGround}   facing: ${player.facing}`,
            `dash: ${dash}`,
            `czas: ${timeLeft.toFixed(1)} s   bomby: ${defusedCount()}/${bombs.length}   w zasięgu: ${nearbyBomb() ? "tak" : "nie"}`,
            `kamera:   x=${camera.x.toFixed(1)}  y=${camera.y.toFixed(1)}`,
            `poziom: ${LEVEL_WIDTH}x${LEVEL_HEIGHT}   platform: ${platforms.length}`,
            `tekstury: ok=${tex.ok} błąd=${tex.error} brak=${tex.none}` + (tex.loading ? ` ładuje=${tex.loading}` : ""),
        ];

        const lineHeight = 18;
        ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
        ctx.fillRect(10, 48, 360, lines.length * lineHeight + 14);

        ctx.fillStyle = "#d8ffe4";
        ctx.font = "13px ui-monospace, Menlo, Consolas, monospace";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        lines.forEach((text, i) => ctx.fillText(text, 18, 56 + i * lineHeight));
        ctx.textBaseline = "alphabetic";
    }

    // Interfejs przyklejony do ekranu: podpowiedź ze sterowaniem, timer i licznik bomb.
    function drawHud(ctx) {
        ctx.fillStyle = "rgba(232, 237, 244, 0.68)";
        ctx.font = "16px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(
            "A / D: ruch  ·  Spacja: skok  ·  Shift: dash  ·  E: interakcja  ·  Esc: pauza  ·  / : debug",
            VIEW_WIDTH / 2 - 60,
            28,
        );

        // Timer i bomby w prawym górnym rogu
        ctx.fillStyle = "rgba(10, 15, 22, 0.55)";
        ctx.fillRect(VIEW_WIDTH - 150, 10, 140, 66);

        ctx.textAlign = "right";
        ctx.font = "700 30px ui-monospace, Menlo, Consolas, monospace";
        ctx.fillStyle = timeLeft <= 10 ? "#ff6b6b" : "#e8edf4";
        ctx.fillText(formatTime(timeLeft), VIEW_WIDTH - 20, 44);

        ctx.font = "15px system-ui, sans-serif";
        ctx.fillStyle = "rgba(232, 237, 244, 0.85)";
        ctx.fillText(`Bomby: ${defusedCount()}/${bombs.length}`, VIEW_WIDTH - 20, 66);
    }

    // Rysowanie. Tylko odczytuje stan, niczego nie zmienia.
    function draw(ctx, { debug = false, fps = 0, hud = true } = {}) {
        // Tło przyklejone do ekranu: gradient jako baza, na nim warstwy z teksturami.
        const sky = ctx.createLinearGradient(0, 0, 0, VIEW_HEIGHT);
        sky.addColorStop(0, "#203748");
        sky.addColorStop(1, "#111a23");
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
        for (const layer of BACKGROUND_LAYERS) {
            drawBackground(ctx, layer, camera.x, VIEW_WIDTH, VIEW_HEIGHT);
        }

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

        // Platformy: teksturą, a bez niej kolorem z jasnym paskiem na górze.
        for (const p of platforms) {
            const textured = drawBox(ctx, p);
            if (!textured) {
                ctx.fillStyle = "#526b70";
                ctx.fillRect(p.x, p.y, p.w, 3);
            }
        }

        // Bomby
        for (const bomb of bombs) drawBomb(ctx, bomb);

        // Cienie po dashu, potem sam gracz
        for (const g of ghosts) {
            drawPlayer(ctx, g.x, g.y, g.facing, (g.life / GHOST_LIFE) * 0.45);
        }
        drawPlayer(ctx, player.x, player.y, player.facing);

        if (hud) drawInteractPrompt(ctx);
        if (debug) drawDebugWorld(ctx);

        ctx.restore();

        if (hud) drawHud(ctx);
        if (debug) drawDebugPanel(ctx, fps);
    }

    return {
        player,
        camera,
        update,
        draw,
        reset,
        tickTimer,
        nearbyBomb,
        defuse,
        allDefused,
        get timeLeft() { return timeLeft; },
    };
}