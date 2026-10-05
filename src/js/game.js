// Stan i logika gry: gracz, fizyka, dash, bomby, timer, tło, kamera.
// Układ poziomu (platformy, bomby, czas) pochodzi z levels.js i jest wczytywany przez loadLevel().
import { WORLD_WIDTH as VIEW_WIDTH, WORLD_HEIGHT as VIEW_HEIGHT } from "./viewport.js";
import { createCamera } from "./camera.js";
import { drawBackground, drawBox, drawTexture, getTextureReport } from "./textures.js";

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

// Wall-jump: odbicie od ściany w powietrzu (Spacja przy ścianie).
// Reguła: po odbiciu od ściany z jednej strony następne odbicie jest możliwe dopiero od ściany
// z PRZECIWNEJ strony albo po lądowaniu. Dlatego po jednej ścianie nie da się wspinać,
// ale między dwiema ścianami naprzeciw siebie (szyb) już tak.
const WALL_JUMP_SPEED = 600;  // prędkość pionowa odbicia
const WALL_KICK_SPEED = 300;  // prędkość pozioma odbicia (od ściany)
const WALL_LOCK_TIME = 0.14;  // tyle czasu sterowanie poziome jest zablokowane, żeby odbicie "wyszło" od ściany
const WALL_SLIDE_SPEED = 120; // maksymalna prędkość zsuwania się, gdy trzymasz kierunek w stronę ściany
const WALL_MIN_OVERLAP = 30;  // ściana musi sięgać co najmniej tyle przy graczu (cienkie platformy to nie ściany)
const JUMP_BUFFER = 0.1;      // skok wciśnięty chwilę za wcześnie (przed lądowaniem/ścianą) nadal się liczy

// Bomby (pozycje i pytania są w levels.js).
const BOMB_SIZE = 36;        // rozmiar bomby w jednostkach świata
const INTERACT_RANGE = 70;   // odległość od środka bomby, w której działa klawisz E

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

export function createGame(initialLevel) {
    // Gracz: (x, y) to lewy górny róg, vx/vy to prędkość.
    const player = {
        w: 40,
        h: 40,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        onGround: false,
        facing: 1,        // 1 = w prawo, -1 = w lewo (do odbijania obrazka)
        dashTime: 0,      // ile jeszcze trwa aktualny dash (0 = brak dashu)
        dashCooldown: 0,  // ile jeszcze do możliwości kolejnego dashu
        dashDir: 1,       // kierunek aktualnego dashu
        wallDir: 0,            // ściana przy graczu: -1 po lewej, 1 po prawej, 0 brak
        lastWallJumpSide: 0,   // strona ostatniego odbicia od ściany (0 po lądowaniu)
        wallLockTime: 0,       // ile jeszcze sterowanie poziome jest zablokowane po odbiciu
        jumpBuffer: 0,         // ile jeszcze liczy się wcześniej wciśnięty skok
        canCutJump: false,     // czy puszczenie klawisza skróci skok (tylko skok z ziemi)
        texture: "player", // nazwa z textures.js
        color: "#79d7c4",  // kolor zastępczy, gdy brak tekstury
    };

    // Dane aktualnego poziomu (ustawiane w loadLevel).
    let level = initialLevel;
    let platforms = [];
    let bombs = [];
    let backgroundLayers = [];
    let levelWidth = VIEW_WIDTH;
    let levelHeight = VIEW_HEIGHT;
    let timeLimit = 60;
    let timeLeft = 60; // pozostały czas w sekundach
    let spawn = { x: 100, y: 440 };

    // "Cienie" zostawiane przez gracza podczas dashu (tylko efekt wizualny).
    const ghosts = [];
    let lastDt = 0; // do wyświetlania w trybie debug

    const camera = createCamera({
        viewWidth: VIEW_WIDTH,
        viewHeight: VIEW_HEIGHT,
        levelWidth,
        levelHeight,
        smoothing: 6,
    });

    // Wczytuje poziom z levels.js i ustawia grę od początku.
    function loadLevel(next) {
        level = next;
        platforms = next.platforms;
        backgroundLayers = next.background ?? ["background"];
        levelWidth = next.width;
        levelHeight = next.height ?? VIEW_HEIGHT;
        timeLimit = next.timeLimit;
        spawn = next.spawn ?? { x: 100, y: 440 };
        bombs = next.bombs.map((data) => ({
            ...data,
            w: BOMB_SIZE,
            h: BOMB_SIZE,
            texture: "bomb",
            defused: false,
        }));
        camera.setLevelSize(levelWidth, levelHeight);
        reset();
    }

    // Ustawia gracza na starcie poziomu (też po wypadnięciu poza poziom).
    function respawnPlayer() {
        player.x = spawn.x;
        player.y = spawn.y;
        player.vx = 0;
        player.vy = 0;
        player.onGround = false;
        player.facing = 1;
        player.dashTime = 0;
        player.dashCooldown = 0;
        player.wallDir = 0;
        player.lastWallJumpSide = 0;
        player.wallLockTime = 0;
        player.jumpBuffer = 0;
        player.canCutJump = false;
        ghosts.length = 0;
        camera.snapTo(player);
    }

    // Pełny reset aktualnego poziomu: gracz, bomby i timer.
    function reset() {
        respawnPlayer();
        for (const bomb of bombs) {
            bomb.defused = false;
            bomb.texture = "bomb";
        }
        timeLeft = timeLimit;
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

    // Czy po stronie dir (-1 lewo, 1 prawo) przylega ściana. Ścianą jest platforma, która sięga
    // przy graczu na co najmniej WALL_MIN_OVERLAP (cienka półka nie liczy się jako ściana).
    function touchingWall(dir) {
        const probe = { x: dir < 0 ? player.x - 1 : player.x + player.w, y: player.y, w: 1, h: player.h };
        for (const p of platforms) {
            if (!overlaps(probe, p)) continue;
            const reach = Math.min(player.y + player.h, p.y + p.h) - Math.max(player.y, p.y);
            if (reach >= WALL_MIN_OVERLAP) return true;
        }
        return false;
    }

    // Aktualizacja logiki. dt = czas od poprzedniej klatki w sekundach.
    function update(dt, input) {
        lastDt = dt;
        tickTimer(dt);

        // Liczniki czasu
        player.dashCooldown = Math.max(0, player.dashCooldown - dt);
        player.wallLockTime = Math.max(0, player.wallLockTime - dt);
        player.jumpBuffer = Math.max(0, player.jumpBuffer - dt);
        if (input.jumpPressed()) player.jumpBuffer = JUMP_BUFFER;

        // 1) Dash: start, jeśli wciśnięto Shift i minął cooldown
        if (input.dashPressed() && player.dashTime <= 0 && player.dashCooldown <= 0) {
            // Kierunek z klawiszy, a jeśli żaden nie jest wciśnięty, to w stronę patrzenia.
            player.dashDir = input.moveX() || player.facing;
            player.facing = player.dashDir;
            player.dashTime = DASH_TIME;
            player.dashCooldown = DASH_COOLDOWN;
            player.wallLockTime = 0;
        }

        if (player.dashTime > 0) {
            // W trakcie dashu: stała prędkość w poziomie, bez grawitacji i bez skoku.
            player.dashTime -= dt;
            player.vx = player.dashDir * DASH_SPEED;
            player.vy = 0;
        } else {
            // 2) Ruch poziomy (na chwilę zablokowany po odbiciu od ściany)
            if (player.wallLockTime <= 0) player.vx = input.moveX() * MOVE_SPEED;
            if (player.vx !== 0) player.facing = Math.sign(player.vx);

            // 3) Skok z ziemi albo odbicie od ściany
            if (player.jumpBuffer > 0) {
                if (player.onGround) {
                    player.vy = -JUMP_SPEED;
                    player.canCutJump = true;
                    player.jumpBuffer = 0;
                } else if (player.wallDir !== 0 && player.wallDir !== player.lastWallJumpSide) {
                    player.vy = -WALL_JUMP_SPEED;
                    player.vx = -player.wallDir * WALL_KICK_SPEED; // odbicie od ściany
                    player.facing = -player.wallDir;
                    player.wallLockTime = WALL_LOCK_TIME;
                    player.lastWallJumpSide = player.wallDir;
                    player.canCutJump = false;
                    player.jumpBuffer = 0;
                }
            }

            // 4) Grawitacja. Gdy puścisz skok z ziemi w trakcie wznoszenia, grawitacja jest
            //    silniejsza, więc skok jest niższy (krótkie vs długie naciśnięcie).
            const cutJump = player.canCutJump && player.vy < 0 && !input.jumpHeld();
            player.vy = Math.min(player.vy + GRAVITY * (cutJump ? 2.5 : 1) * dt, MAX_FALL_SPEED);

            // 5) Zsuwanie po ścianie: wolniejsze spadanie, gdy trzymasz kierunek w stronę ściany
            if (!player.onGround && player.wallDir !== 0 && input.moveX() === player.wallDir) {
                player.vy = Math.min(player.vy, WALL_SLIDE_SPEED);
            }
        }

        // 6) Ruch w poziomie, potem kolizje w poziomie
        player.x += player.vx * dt;
        for (const p of platforms) {
            if (!overlaps(player, p)) continue;
            if (player.vx > 0) player.x = p.x - player.w;
            else if (player.vx < 0) player.x = p.x + p.w;
            player.dashTime = 0; // uderzenie w ścianę kończy dash
        }
        player.x = Math.max(0, Math.min(levelWidth - player.w, player.x));

        // 7) Ruch w pionie, potem kolizje w pionie
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

        // 8) Kontakt ze ścianą (do odbicia w następnej klatce); lądowanie odnawia odbicia
        if (player.onGround) player.lastWallJumpSide = 0;
        const left = touchingWall(-1);
        const right = touchingWall(1);
        player.wallDir = left && right ? (input.moveX() || player.facing) : left ? -1 : right ? 1 : 0;

        // 9) Cienie dashu: stare znikają, w trakcie dashu dochodzą nowe
        for (let i = ghosts.length - 1; i >= 0; i--) {
            ghosts[i].life -= dt;
            if (ghosts[i].life <= 0) ghosts.splice(i, 1);
        }
        if (player.dashTime > 0) {
            ghosts.push({ x: player.x, y: player.y, facing: player.facing, life: GHOST_LIFE });
        }

        // 10) Zabezpieczenie: gdyby gracz wypadł poza poziom
        if (player.y > levelHeight + 300) respawnPlayer();

        // 11) Kamera goni gracza (pionowo ze strefą martwą)
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
        ctx.strokeRect(0, 0, levelWidth, levelHeight);

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

        // Znacznik ściany: niebieski pasek po stronie ściany (żółty, gdy odbicie od niej jest zablokowane)
        if (player.wallDir !== 0) {
            ctx.fillStyle = player.wallDir === player.lastWallJumpSide ? "#ffd23c" : "#4db8ff";
            ctx.fillRect(player.wallDir < 0 ? player.x : player.x + player.w - 3, player.y, 3, player.h);
        }
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
            `ściana: ${player.wallDir}  ostatnie odbicie: ${player.lastWallJumpSide}  blokada: ${player.wallLockTime.toFixed(2)}`,
            `czas: ${timeLeft.toFixed(1)} s   bomby: ${defusedCount()}/${bombs.length}   w zasięgu: ${nearbyBomb() ? "tak" : "nie"}`,
            `kamera:   x=${camera.x.toFixed(1)}  y=${camera.y.toFixed(1)}`,
            `${level.name}: ${levelWidth}x${levelHeight}   platform: ${platforms.length}`,
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

    // Interfejs przyklejony do ekranu: nazwa poziomu, timer i licznik bomb.
    // (Podpowiedź ze sterowaniem jest w rogu ekranu, w HTML.)
    function drawHud(ctx) {
        ctx.textAlign = "left";
        ctx.font = "700 16px system-ui, sans-serif";
        ctx.fillStyle = "rgba(232, 237, 244, 0.8)";
        ctx.fillText(level.name, 20, 30);

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
        for (const layer of backgroundLayers) {
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
            ctx.lineTo(x, levelHeight);
        }
        for (let y = 0; y <= levelHeight; y += 48) {
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

    loadLevel(initialLevel);

    return {
        player,
        camera,
        update,
        draw,
        reset,
        loadLevel,
        tickTimer,
        nearbyBomb,
        defuse,
        allDefused,
        get level() { return level; },
        get timeLeft() { return timeLeft; },
    };
}