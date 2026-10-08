// Stan i logika gry: gracz, fizyka, dash, wall-jump, bomby, timer, tło, kamera.
// Układ poziomu (platformy, bomby, czas) pochodzi z levels.js i jest wczytywany przez loadLevel().
//
// JEDNOSTKI: wszystko jest w pikselach gry (1 px = 1/TILE tila; patrz config.js).
// Prędkości są w px/s, przyspieszenia w px/s², czas w sekundach.
// Wartości poniżej są zapisane dla tila 16 px i mnożone przez SCALE (= TILE / 16), więc po zmianie
// rozmiaru tila fizyka, hitboxy i interfejs skalują się razem z grafiką.
import { VIEW_WIDTH, VIEW_HEIGHT, TILE, SCALE, getScale, snap } from "./config.js";
import { createCamera } from "./camera.js";
import { drawBackground, drawBox, drawTexture, getTextureReport, getTextureSize } from "./textures.js";
import { ENEMY_TYPES, canCuff, createEnemy, cuffEnemy as applyCuff, resetEnemy } from "./enemies.js";

// Fizyka.
const GRAVITY = 600 * SCALE;         // przyspieszenie w dół
const MAX_FALL_SPEED = 330 * SCALE;  // maksymalna prędkość spadania
const JUMP_SPEED = 210 * SCALE;      // prędkość początkowa skoku (wysokość skoku ok. 2,3 tila)
const MOVE_SPEED = 96 * SCALE;       // prędkość biegu (6 tili na sekundę)

// Dash (Shift): krótki, szybki zryw w poziomie, bez grawitacji.
const DASH_SPEED = 240 * SCALE;      // prędkość w trakcie dashu
const DASH_TIME = 0.15;      // czas trwania dashu (dystans ok. 2,25 tila)
const DASH_COOLDOWN = 0.5;   // minimalny odstęp między startami dashu
const GHOST_LIFE = 0.25;     // jak długo widać "cienie" po dashu
const GRAPPLE_RANGE = 160 * SCALE;
const GRAPPLE_PUMP_ACCEL = 420 * SCALE;
const GRAPPLE_COOLDOWN = 0.5;
const GRAPPLE_MIN_LENGTH = 24 * SCALE;
const GRAPPLE_LENGTH_SPEED = 160 * SCALE;

// Wall-jump: odbicie od ściany w powietrzu (Spacja przy ścianie).
const WALL_JUMP_SPEED = 200 * SCALE;     // prędkość pionowa odbicia
const WALL_KICK_SPEED = 100 * SCALE;     // prędkość pozioma odbicia (od ściany)
const WALL_LOCK_TIME = 0.14;     // tyle czasu sterowanie poziome jest zablokowane po odbiciu
const WALL_MIN_OVERLAP = 18 * SCALE;     // ściana musi sięgać co najmniej tyle przy graczu (platforma gruba na 1 tile to nie ściana)
const JUMP_BUFFER = 0.1;         // skok wciśnięty chwilę za wcześnie (przed lądowaniem/ścianą) nadal się liczy

// Zsuwanie po ścianie jest tylko chwilowe: przez WALL_SLIDE_DURATION spadasz wolno
// (WALL_SLIDE_SPEED, o ile trzymasz kierunek w stronę ściany), a potem przyspieszasz normalnie.
const WALL_SLIDE_SPEED = 40 * SCALE;     // maksymalna prędkość spadania na początku zsuwania
const WALL_SLIDE_DURATION = 0.35; // jak długo trwa wolne zsuwanie od dotknięcia ściany

// Odbicie od ściany z tej samej strony co poprzednie jest możliwe dopiero po tylu sekundach
// od poprzedniego odbicia. Odbicie od ściany z PRZECIWNEJ strony (szyb) nie ma cooldownu.
// Zbyt mały cooldown pozwoli wspinać się po jednej ścianie (w czasie cooldownu gracz ma spaść
// niżej, niż wzniósł się odbiciem). Przy WALL_SLIDE_DURATION = 0.35 granica wynosi ok. 0.85 s
// (testowane botem spamującym skok), więc 1.0 daje zapas. Wydłużając zsuwanie, wydłuż też cooldown.
const SAME_WALL_COOLDOWN = 1.0;

// Bomby (pozycje i pytania są w levels.js).
const INTERACT_RANGE = 28 * SCALE;   // odległość od środka bomby, w której działa klawisz E

// ROZMIAR OBRAZKA obiektów bez tekstury (z teksturą bierze się z przyciętego obrazka).
const PLAYER_FALLBACK = { w: 16 * SCALE, h: 24 * SCALE };  // 1 x 1,5 tila
const BOMB_FALLBACK = { w: 16 * SCALE, h: 16 * SCALE };    // 1 x 1 tila

// HITBOXY (kolizje, wall-jump, interakcja). Dla każdego obiektu wybierasz jedną z opcji:
//   { w, h }                    ręcznie, w pikselach (domyślnie)
//   { w, h, offsetX, offsetY }  ręcznie + przesunięcie hitboxa względem dolnego środka obrazka
//   "auto"                      hitbox = rozmiar obrazka (po przycięciu z przezroczystych brzegów)
// Hitbox stoi dolnym środkiem w tym samym punkcie co obrazek (stopy gracza są na dole obu).
const PLAYER_HITBOX = { w: 12 * SCALE, h: 22 * SCALE };
const BOMB_HITBOX = { w: 16 * SCALE, h: 16 * SCALE };
// Przykłady:  const PLAYER_HITBOX = "auto";   albo   { w: 20 * SCALE, h: 40 * SCALE, offsetX: 2 }

// Czy dwa prostokąty na siebie nachodzą (kolizja AABB).
function overlaps(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// True when a segment crosses a rectangle, so the hook cannot pass through platforms.
function segmentIntersectsBox(x1, y1, x2, y2, box) {
    let tMin = 0;
    let tMax = 1;
    const dx = x2 - x1;
    const dy = y2 - y1;
    for (const [origin, delta, min, max] of [
        [x1, dx, box.x, box.x + box.w],
        [y1, dy, box.y, box.y + box.h],
    ]) {
        if (Math.abs(delta) < 1e-9) {
            if (origin < min || origin > max) return false;
            continue;
        }
        let near = (min - origin) / delta;
        let far = (max - origin) / delta;
        if (near > far) [near, far] = [far, near];
        tMin = Math.max(tMin, near);
        tMax = Math.min(tMax, far);
        if (tMin > tMax) return false;
    }
    return true;
}

// Obrys prostokąta o grubości 1 piksela, wewnątrz prostokąta (do trybu debug).
function outline(ctx, x, y, w, h) {
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

// Zamienia sekundy na tekst m:ss (zaokrąglone w górę, żeby 0:00 oznaczało koniec czasu).
export function formatTime(seconds) {
    const total = Math.ceil(Math.max(0, seconds));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function createGame(initialLevel) {
    // Gracz: (x, y, w, h) to jego HITBOX (lewy górny róg i rozmiar), vx/vy to prędkość.
    // Rozmiar hitboxa i obrazka ustawia syncSize() (patrz PLAYER_HITBOX).
    const player = {
        w: 0,
        h: 0,
        x: 0,
        y: 0,
        hitbox: PLAYER_HITBOX,     // { w, h, offsetX?, offsetY? } albo "auto"
        fallback: PLAYER_FALLBACK, // rozmiar obrazka, gdy brak tekstury
        sprite: PLAYER_FALLBACK,   // aktualny rozmiar obrazka
        hitOffsetX: 0,
        hitOffsetY: 0,
        vx: 0,
        vy: 0,
        onGround: false,
        facing: 1,        // 1 = w prawo, -1 = w lewo (do odbijania obrazka)
        dashTime: 0,      // ile jeszcze trwa aktualny dash (0 = brak dashu)
        dashCooldown: 0,  // ile jeszcze do możliwości kolejnego dashu
        dashDir: 1,       // kierunek aktualnego dashu
        knockbackTime: 0, // krótka blokada sterowania po uderzeniu przez przeciwnika
        hitCooldown: 0,   // ogranicza powtarzanie odrzutu przy kontakcie z przeciwnikiem
        wallDir: 0,            // ściana przy graczu: -1 po lewej, 1 po prawej, 0 brak
        lastWallJumpSide: 0,   // strona ostatniego odbicia od ściany (0 po lądowaniu)
        sinceWallJump: Infinity, // ile sekund minęło od ostatniego odbicia od ściany
        wallSlideTime: 0,      // ile sekund trwa kontakt ze ścianą w powietrzu
        wallLockTime: 0,       // ile jeszcze sterowanie poziome jest zablokowane po odbiciu
        jumpBuffer: 0,         // ile jeszcze liczy się wcześniej wciśnięty skok
        canCutJump: false,     // czy puszczenie klawisza skróci skok (tylko skok z ziemi)
        texture: "player",     // nazwa z textures.js
        color: "#79d7c4",      // kolor zastępczy, gdy brak tekstury
    };

    // Dane aktualnego poziomu (ustawiane w loadLevel).
    let level = initialLevel;
    let platforms = [];
    let bombs = [];
    let enemies = [];
    let backgroundLayers = [];
    let levelWidth = VIEW_WIDTH;
    let levelHeight = VIEW_HEIGHT;
    let timeLimit = 60;
    let timeLeft = 60; // pozostały czas w sekundach
    let spawn = { x: 32 * SCALE, y: 160 * SCALE }; // dolny środek gracza na starcie

    // "Cienie" zostawiane przez gracza podczas dashu (tylko efekt wizualny).
    const ghosts = [];
    let grappleTarget = null;
    let grappleLength = 0;
    let grappleCooldown = 0;
    const grappleTargetLocks = new Map();
    let lastDt = 0; // do wyświetlania w trybie debug

    const camera = createCamera({
        viewWidth: VIEW_WIDTH,
        viewHeight: VIEW_HEIGHT,
        levelWidth,
        levelHeight,
        smoothing: 6,
    });

    // Ustawia rozmiar OBRAZKA (z tekstury przyciętej z przezroczystych brzegów, a bez tekstury
    // z rozmiaru zastępczego) oraz rozmiar HITBOXA (ręczny albo "auto" = rozmiar obrazka).
    // Przy zmianie rozmiaru zostaje na miejscu dolny środek obiektu, więc stoi dalej na tej samej
    // platformie (np. gdy tekstura wczyta się później).
    function syncSize(entity) {
        const size = getTextureSize(entity.texture);
        const sprite = size ?? entity.fallback;
        const box = entity.hitbox === "auto" ? sprite : entity.hitbox;

        entity.sprite = sprite;
        entity.hitOffsetX = entity.hitbox === "auto" ? 0 : (box.offsetX ?? 0);
        entity.hitOffsetY = entity.hitbox === "auto" ? 0 : (box.offsetY ?? 0);
        if (box.w === entity.w && box.h === entity.h) return;

        const centerX = entity.x + entity.w / 2;
        const bottom = entity.y + entity.h;
        entity.w = box.w;
        entity.h = box.h;
        entity.x = centerX - box.w / 2;
        entity.y = bottom - box.h;
    }

    function syncSizes() {
        syncSize(player);
        for (const bomb of bombs) syncSize(bomb);
    }

    // Prostokąt, w którym rysowany jest obrazek obiektu. Obrazek stoi dolnym środkiem na dolnym
    // środku hitboxa (przesuniętym o offset hitboxa). (x, y) to lewy górny róg hitboxa.
    function spriteRect(entity, x = entity.x, y = entity.y) {
        return {
            x: x + entity.w / 2 - entity.hitOffsetX - entity.sprite.w / 2,
            y: y + entity.h - entity.hitOffsetY - entity.sprite.h,
            w: entity.sprite.w,
            h: entity.sprite.h,
        };
    }

    // Wczytuje poziom z levels.js i ustawia grę od początku.
    function loadLevel(next) {
        level = next;
        platforms = next.platforms;
        backgroundLayers = next.background ?? ["background"];
        levelWidth = next.width;
        levelHeight = next.height ?? VIEW_HEIGHT;
        timeLimit = next.timeLimit;
        spawn = next.spawn ?? { x: 32 * SCALE, y: 160 * SCALE };

        // Pozycja bomby w danych to jej dolny środek: bomba startuje jako punkt w tym miejscu,
        // a syncSize() nadaje jej rozmiar hitboxa i obrazka, zachowując ten dolny środek.
        bombs = next.bombs.map((data, index) => ({
            ...data,
            id: data.id ?? `${next.id ?? next.name ?? "level"}-bomb-${index + 1}`,
            w: 0,
            h: 0,
            hitbox: data.hitbox ?? BOMB_HITBOX,
            fallback: BOMB_FALLBACK,
            sprite: BOMB_FALLBACK,
            hitOffsetX: 0,
            hitOffsetY: 0,
            texture: "bomb",
            defused: false,
        }));
        enemies = (next.enemies ?? []).map(createEnemy);
        syncSizes();
        camera.setLevelSize(levelWidth, levelHeight);
        reset();
    }

    // Ustawia gracza na starcie poziomu (też po wypadnięciu poza poziom).
    function respawnPlayer() {
        syncSizes();
        player.x = spawn.x - player.w / 2;
        player.y = spawn.y - player.h;
        player.vx = 0;
        player.vy = 0;
        player.onGround = false;
        player.facing = 1;
        player.dashTime = 0;
        player.dashCooldown = 0;
        player.knockbackTime = 0;
        player.hitCooldown = 0;
        player.wallDir = 0;
        player.lastWallJumpSide = 0;
        player.sinceWallJump = Infinity;
        player.wallSlideTime = 0;
        player.wallLockTime = 0;
        player.jumpBuffer = 0;
        player.canCutJump = false;
        ghosts.length = 0;
        grappleTarget = null;
        grappleLength = 0;
        grappleCooldown = 0;
        grappleTargetLocks.clear();
        camera.snapTo(player);
    }

    // Pełny reset aktualnego poziomu: gracz, bomby i timer.
    function reset() {
        for (const bomb of bombs) {
            bomb.defused = false;
            bomb.texture = "bomb";
        }
        enemies.forEach(resetEnemy);
        respawnPlayer();
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

    function detachGrapple() {
        if (!grappleTarget) return;
        grappleTargetLocks.set(grappleTarget, GRAPPLE_COOLDOWN);
        grappleTarget = null;
        grappleLength = 0;
        grappleCooldown = GRAPPLE_COOLDOWN;
    }

    function lockCurrentTargetForTransfer() {
        if (grappleTarget) grappleTargetLocks.set(grappleTarget, GRAPPLE_COOLDOWN);
    }

    function attachGrapple(target) {
        grappleTarget = target;
        const anchorX = target.x + target.w / 2;
        const anchorY = target.y + target.h / 2;
        grappleLength = Math.hypot(
            player.x + player.w / 2 - anchorX,
            player.y + player.h / 2 - anchorY,
        );
        player.canCutJump = false;
    }

    function hasClearGrappleLine(target, fromX, fromY) {
        const toX = target.x + target.w / 2;
        const toY = target.y + target.h / 2;
        return !platforms.some((platform) => platform !== target
            && platform.solid !== false
            && segmentIntersectsBox(fromX, fromY, toX, toY, platform));
    }

    // Nearest grappleable point in front of the player, within range and unobstructed.
    function nearbyGrappleTarget(maxDistance = GRAPPLE_RANGE, excludedTarget = null) {
        const cx = player.x + player.w / 2;
        const cy = player.y + player.h / 2;
        let best = null;
        let bestDistance = maxDistance;
        for (const target of platforms) {
            if (target.grappleable !== true || target === excludedTarget || grappleTargetLocks.has(target)) continue;
            const targetX = target.x + target.w / 2;
            const targetY = target.y + target.h / 2;
            if ((targetX - cx) * player.facing <= 0) continue;
            const distance = Math.hypot(cx - targetX, cy - targetY);
            if (distance < bestDistance && hasClearGrappleLine(target, cx, cy)) {
                best = target;
                bestDistance = distance;
            }
        }
        return best;
    }

    function constrainGrappleRope() {
        if (!grappleTarget || grappleLength <= 0) return;
        const anchorX = grappleTarget.x + grappleTarget.w / 2;
        const anchorY = grappleTarget.y + grappleTarget.h / 2;
        const centerX = player.x + player.w / 2;
        const centerY = player.y + player.h / 2;
        const dx = centerX - anchorX;
        const dy = centerY - anchorY;
        const distance = Math.hypot(dx, dy);
        if (distance <= grappleLength) return; // Rope is slack until it becomes taut.

        const nx = dx / distance;
        const ny = dy / distance;
        const nextCenterX = anchorX + nx * grappleLength;
        const nextCenterY = anchorY + ny * grappleLength;
        const nextPlayer = {
            x: nextCenterX - player.w / 2,
            y: nextCenterY - player.h / 2,
            w: player.w,
            h: player.h,
        };
        const blocked = platforms.some((platform) => platform.solid !== false && overlaps(nextPlayer, platform));
        if (!blocked) {
            player.x = nextPlayer.x;
            player.y = nextPlayer.y;
        }

        // Remove only velocity that would stretch the rope farther; keep tangential swing momentum.
        const outwardSpeed = player.vx * nx + player.vy * ny;
        if (outwardSpeed > 0) {
            player.vx -= outwardSpeed * nx;
            player.vy -= outwardSpeed * ny;
        }
    }

    function defuse(bomb) {
        bomb.defused = true;
        bomb.texture = "bombDefused";
    }

    // Nearest active enemy that accepts this method and is within the given range.
    function nearbyEnemy(method = "interact", maxDistance = INTERACT_RANGE, type = null) {
        const cx = player.x + player.w / 2;
        const cy = player.y + player.h / 2;
        let best = null;
        let bestDistance = maxDistance;
        for (const enemy of enemies) {
            if (enemy.state !== "active" || (type && enemy.type !== type)) continue;
            const enemyX = enemy.x + enemy.w / 2;
            const fromBehind = (cx - enemyX) * enemy.facing < 0;
            if (method && !canCuff(enemy, method, { fromBehind })) continue;
            const distance = Math.hypot(cx - (enemy.x + enemy.w / 2), cy - (enemy.y + enemy.h / 2));
            if (distance <= bestDistance) {
                best = enemy;
                bestDistance = distance;
            }
        }
        return best;
    }

    function cuff(enemy, method, context = {}) {
        if (!enemies.includes(enemy)) return false;
        if (method === "interact") {
            const playerX = player.x + player.w / 2;
            const playerY = player.y + player.h / 2;
            const enemyX = enemy.x + enemy.w / 2;
            const enemyY = enemy.y + enemy.h / 2;
            if (Math.hypot(playerX - enemyX, playerY - enemyY) > INTERACT_RANGE) return false;
            context = { ...context, fromBehind: (playerX - enemyX) * enemy.facing < 0 };
        }
        return applyCuff(enemy, method, context);
    }

    function activeEnemyCounts() {
        return {
            active: enemies.filter((enemy) => enemy.state === "active").length,
            cuffed: enemies.filter((enemy) => enemy.state === "cuffed").length,
        };
    }

    function updateEnemies(dt) {
        for (const enemy of enemies) {
            if (enemy.state !== "active") continue;
            let centerX = enemy.x + enemy.w / 2 + enemy.direction * enemy.patrol.speed * dt;
            if (centerX <= enemy.patrol.minX) {
                centerX = enemy.patrol.minX;
                enemy.direction = 1;
            } else if (centerX >= enemy.patrol.maxX) {
                centerX = enemy.patrol.maxX;
                enemy.direction = -1;
            }
            enemy.x = centerX - enemy.w / 2;
            enemy.facing = enemy.direction;
        }
    }

    // Contact applies knockback only; there is no health or damage system yet.
    function resolveEnemyAttack() {
        if (player.hitCooldown > 0) return null;
        const enemy = enemies.find((item) => item.state === "active" && overlaps(player, item));
        if (!enemy) return null;

        const playerCenter = player.x + player.w / 2;
        const enemyCenter = enemy.x + enemy.w / 2;
        const awayDirection = playerCenter === enemyCenter
            ? -enemy.facing
            : Math.sign(playerCenter - enemyCenter);
        const attack = ENEMY_TYPES[enemy.type].attack;
        player.vx = awayDirection * attack.knockbackX;
        player.vy = attack.knockbackY;
        player.onGround = false;
        player.dashTime = 0;
        player.wallLockTime = 0;
        player.canCutJump = false;
        player.knockbackTime = attack.controlLock;
        player.hitCooldown = attack.hitCooldown;
        return enemy;
    }

    const defusedCount = () => bombs.filter((bomb) => bomb.defused).length;
    const allDefused = () => defusedCount() === bombs.length;

    // Czy po stronie dir (-1 lewo, 1 prawo) przylega ściana. Ścianą jest platforma, która sięga
    // przy graczu na co najmniej WALL_MIN_OVERLAP (cienka półka nie liczy się jako ściana).
    function touchingWall(dir) {
        const probe = { x: dir < 0 ? player.x - 1 : player.x + player.w, y: player.y, w: 1, h: player.h };
        for (const p of platforms) {
            if (p.solid === false || p.oneWay) continue;
            if (!overlaps(probe, p)) continue;
            const reach = Math.min(player.y + player.h, p.y + p.h) - Math.max(player.y, p.y);
            if (reach >= WALL_MIN_OVERLAP) return true;
        }
        return false;
    }

    // Aktualizacja logiki. dt = czas od poprzedniej klatki w sekundach.
    function update(dt, input) {
        lastDt = dt;
        const dashOriginX = player.x + player.w / 2;
        let dashedThisFrame = false;
        let dashDirection = player.dashDir;
        syncSizes();
        tickTimer(dt);
        player.hitCooldown = Math.max(0, player.hitCooldown - dt);
        player.knockbackTime = Math.max(0, player.knockbackTime - dt);
        updateEnemies(dt);

        grappleCooldown = Math.max(0, grappleCooldown - dt);
        for (const [target, remaining] of grappleTargetLocks) {
            const nextRemaining = remaining - dt;
            if (nextRemaining <= 0) grappleTargetLocks.delete(target);
            else grappleTargetLocks.set(target, nextRemaining);
        }
        if (grappleTarget && input.grappleReleasePressed()) detachGrapple();
        if (grappleTarget && input.grapplePressed()) {
            const nextTarget = nearbyGrappleTarget(GRAPPLE_RANGE, grappleTarget);
            if (nextTarget) {
                lockCurrentTargetForTransfer();
                attachGrapple(nextTarget); // Switching anchors has no release cooldown.
            }
            else detachGrapple();
        } else if (!grappleTarget && grappleCooldown <= 0 && input.grapplePressed()
            && player.knockbackTime <= 0 && player.dashTime <= 0) {
            const target = nearbyGrappleTarget();
            if (target) attachGrapple(target);
        }

        // Liczniki czasu
        player.dashCooldown = Math.max(0, player.dashCooldown - dt);
        player.wallLockTime = Math.max(0, player.wallLockTime - dt);
        player.jumpBuffer = Math.max(0, player.jumpBuffer - dt);
        player.sinceWallJump += dt;
        if (input.jumpPressed() && !grappleTarget) player.jumpBuffer = JUMP_BUFFER;

        // 1) Dash: start, jeśli wciśnięto Shift i minął cooldown
        if (input.dashPressed() && !grappleTarget && player.knockbackTime <= 0 && player.dashTime <= 0 && player.dashCooldown <= 0) {
            // Kierunek z klawiszy, a jeśli żaden nie jest wciśnięty, to w stronę patrzenia.
            player.dashDir = input.moveX() || player.facing;
            player.facing = player.dashDir;
            player.dashTime = DASH_TIME;
            player.dashCooldown = DASH_COOLDOWN;
            player.wallLockTime = 0;
        }

        if (grappleTarget) {
            const lengthChange = input.grappleLengthChange();
            grappleLength = Math.max(
                GRAPPLE_MIN_LENGTH,
                Math.min(GRAPPLE_RANGE, grappleLength + lengthChange * GRAPPLE_LENGTH_SPEED * dt),
            );
            const pump = input.moveX();
            player.vx += pump * GRAPPLE_PUMP_ACCEL * dt;
            player.vy = Math.min(player.vy + GRAVITY * dt, MAX_FALL_SPEED);
            if (pump !== 0) player.facing = Math.sign(pump);
            player.dashTime = 0;
            player.canCutJump = false;
        }

        if (grappleTarget) {
            // Swing movement uses both velocity axes; collision resolution below remains shared.
        } else if (player.dashTime > 0) {
            // W trakcie dashu: stała prędkość w poziomie, bez grawitacji i bez skoku.
            dashedThisFrame = true;
            dashDirection = player.dashDir;
            player.dashTime -= dt;
            player.vx = player.dashDir * DASH_SPEED;
            player.vy = 0;
        } else {
            // 2) Ruch poziomy (na chwilę zablokowany po odbiciu od ściany)
            if (player.knockbackTime <= 0 && player.wallLockTime <= 0) player.vx = input.moveX() * MOVE_SPEED;
            if (player.knockbackTime <= 0 && player.vx !== 0) player.facing = Math.sign(player.vx);

            // 3) Skok z ziemi albo odbicie od ściany
            if (player.knockbackTime <= 0 && player.jumpBuffer > 0) {
                const sameSide = player.wallDir === player.lastWallJumpSide;
                const wallJumpAllowed = player.wallDir !== 0
                    && (!sameSide || player.sinceWallJump >= SAME_WALL_COOLDOWN);

                if (player.onGround) {
                    player.vy = -JUMP_SPEED;
                    player.canCutJump = true;
                    player.jumpBuffer = 0;
                } else if (wallJumpAllowed) {
                    player.vy = -WALL_JUMP_SPEED;
                    player.vx = -player.wallDir * WALL_KICK_SPEED; // odbicie od ściany
                    player.facing = -player.wallDir;
                    player.wallLockTime = WALL_LOCK_TIME;
                    player.lastWallJumpSide = player.wallDir;
                    player.sinceWallJump = 0;
                    player.wallSlideTime = 0;
                    player.canCutJump = false;
                    player.jumpBuffer = 0;
                }
            }

            // 4) Grawitacja. Gdy puścisz skok z ziemi w trakcie wznoszenia, grawitacja jest
            //    silniejsza, więc skok jest niższy (krótkie vs długie naciśnięcie).
            const cutJump = player.canCutJump && player.vy < 0 && !input.jumpHeld();
            player.vy = Math.min(player.vy + GRAVITY * (cutJump ? 2.5 : 1) * dt, MAX_FALL_SPEED);

            // 5) Zsuwanie po ścianie: tylko na początku kontaktu (WALL_SLIDE_DURATION) i tylko
            //    gdy trzymasz kierunek w stronę ściany. Potem spadasz coraz szybciej.
            if (!player.onGround && player.wallDir !== 0) {
                player.wallSlideTime += dt;
                if (input.moveX() === player.wallDir && player.wallSlideTime < WALL_SLIDE_DURATION) {
                    player.vy = Math.min(player.vy, WALL_SLIDE_SPEED);
                }
            } else {
                player.wallSlideTime = 0;
            }
        }

        // 6) Ruch w poziomie, potem kolizje w poziomie
        player.x += player.vx * dt;
        for (const p of platforms) {
            if (p.solid === false || p.oneWay) continue;
            if (!overlaps(player, p)) continue;
            if (player.vx > 0) player.x = p.x - player.w;
            else if (player.vx < 0) player.x = p.x + p.w;
            player.dashTime = 0; // uderzenie w ścianę kończy dash
        }
        player.x = Math.max(0, Math.min(levelWidth - player.w, player.x));

        // 7) Ruch w pionie, potem kolizje w pionie
        const previousBottom = player.y + player.h;
        player.y += player.vy * dt;
        player.onGround = false;
        for (const p of platforms) {
            if (p.solid === false) continue;
            if (!overlaps(player, p)) continue;
            if (p.oneWay) {
                // Semisolid surface: only catch a descending player crossing its top.
                if (player.vy <= 0 || previousBottom > p.y) continue;
                player.y = p.y - player.h;
                player.onGround = true;
                player.vy = 0;
                continue;
            }
            if (player.vy > 0) {
                player.y = p.y - player.h; // lądowanie na platformie
                player.onGround = true;
            } else if (player.vy < 0) {
                player.y = p.y + p.h; // uderzenie głową
            }
            player.vy = 0;
        }
        constrainGrappleRope();

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
        if (player.y > levelHeight + 100 * SCALE) respawnPlayer();

        // 11) Kamera goni gracza (pionowo ze strefą martwą)
        camera.follow(player, dt);

        // Dash cuffing uses the existing dash movement and resolved player hitbox.
        // Only a target in front of the dash can be hit; no separate dash mechanic is added.
        let dashTarget = null;
        if (dashedThisFrame) {
            const candidates = enemies.filter((enemy) => {
                const targetX = enemy.x + enemy.w / 2;
                const type = ENEMY_TYPES[enemy.type];
                if (enemy.state !== "active" || !overlaps(player, enemy)) return false;
                if ((targetX - dashOriginX) * dashDirection <= 0) return false;
                const playerIsBehind = (dashOriginX - targetX) * enemy.facing < 0
                    && dashDirection === enemy.facing;
                if (type.cuffFromBackMethods?.includes("dash")) {
                    if (!playerIsBehind) return false;
                }
                return canCuff(enemy, "dash", { fromBehind: playerIsBehind });
            });
            candidates.sort((a, b) => Math.abs(a.x + a.w / 2 - dashOriginX) - Math.abs(b.x + b.w / 2 - dashOriginX));
            dashTarget = candidates[0] ?? null;
        }

        const dashFromBehind = dashTarget
            ? (dashOriginX - (dashTarget.x + dashTarget.w / 2)) * dashTarget.facing < 0
                && dashDirection === dashTarget.facing
            : false;
        return { dashed: dashedThisFrame, dashDirection, dashTarget, dashFromBehind };
    }

    // Gracz. Pozycja NIE jest zaokrąglana do pikseli gry (ruch jest płynny), tylko wyrównana do
    // pikseli ekranu (snap), żeby piksele były ostre. Odbicie lustrzane obejmuje cały obrazek.
    function drawPlayer(ctx, x, y, facing, alpha = 1, scale = 1) {
        const r = spriteRect(player, x, y);
        const sx = snap(r.x, scale);
        const sy = snap(r.y, scale);

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(facing > 0 ? sx : sx + r.w, sy);
        ctx.scale(facing, 1);

        if (!drawTexture(ctx, player.texture, 0, 0, r.w, r.h)) {
            ctx.fillStyle = player.color;
            ctx.fillRect(0, 0, r.w, r.h);
            ctx.fillStyle = "#10201f"; // oko, żeby było widać, w którą stronę patrzy
            ctx.fillRect(r.w - 5 * SCALE, 5 * SCALE, 2 * SCALE, 2 * SCALE);
        }
        ctx.restore();
    }

    // Bomba: teksturą, a bez niej prosty kształt z pikseli (kula z lontem, po rozbrojeniu zielona).
    function drawBomb(ctx, bomb) {
        const r = spriteRect(bomb);
        const x = Math.round(r.x);
        const y = Math.round(r.y);
        if (drawTexture(ctx, bomb.texture, x, y, r.w, r.h)) return;

        const cx = x + Math.round(r.w / 2);
        const cy = y + Math.round(r.h / 2) + SCALE;
        const radius = Math.round(r.w / 2) - 2 * SCALE;

        ctx.fillStyle = bomb.defused ? "#2e7d5b" : "#1a1a1f";
        for (let dy = -radius; dy <= radius; dy++) {
            const half = Math.round(Math.sqrt(radius * radius - dy * dy));
            ctx.fillRect(cx - half, cy + dy, half * 2, 1);
        }

        // Lont
        ctx.fillStyle = "#c9a27a";
        for (let i = 1; i <= 3; i++) ctx.fillRect(cx + (i - 1) * SCALE, cy - radius - i * SCALE, SCALE, SCALE);

        // Migająca iskra (tylko na nierozbrojonej bombie)
        if (!bomb.defused && Math.floor(timeLeft * 3) % 2 === 0) {
            ctx.fillStyle = "#ff7a3d";
            ctx.fillRect(cx + 2 * SCALE, cy - radius - 5 * SCALE, 2 * SCALE, 2 * SCALE);
        }
    }

    function drawEnemy(ctx, enemy) {
        const u = (value) => Math.round(value * SCALE); // piksele projektu 16 px -> piksele gry
        const x = Math.round(enemy.x);
        const y = Math.round(enemy.y);
        const { w, h, type, state } = enemy;

        if (state === "cuffed") {
            // Low, desaturated silhouette and visible cuffs distinguish inactive enemies.
            const bodyY = y + h - u(7);
            ctx.fillStyle = "#53606b";
            ctx.fillRect(x - u(2), bodyY, w + u(4), u(5));
            ctx.fillStyle = "#aebbc4";
            ctx.fillRect(x + u(2), bodyY - u(1), u(3), u(7));
            ctx.fillRect(x + w - u(5), bodyY - u(1), u(3), u(7));
            ctx.fillStyle = "#27333d";
            ctx.fillRect(x + u(5), bodyY + u(1), u(2), u(2));
            ctx.fillRect(x + w - u(7), bodyY + u(1), u(2), u(2));
            return;
        }

        const appearance = ENEMY_TYPES[type];
        const inset = u(appearance.armored ? 4 : 3);
        ctx.fillStyle = appearance.colors.body;
        ctx.fillRect(x + u(appearance.armored ? 1 : 2), y + u(7), w - u(appearance.armored ? 2 : 4), h - u(7));
        if (appearance.armored) {
            // Wider shoulders and a taller silhouette make strong enemies read differently.
            ctx.fillStyle = appearance.colors.head;
            ctx.fillRect(x + u(3), y + u(6), u(4), u(5));
            ctx.fillRect(x + w - u(7), y + u(6), u(4), u(5));
        }
        ctx.fillStyle = appearance.colors.head;
        ctx.fillRect(x + inset, y + u(1), w - inset * 2, u(7));
        ctx.fillStyle = appearance.colors.visor;
        const visorW = u(appearance.armored ? 3 : 2);
        const visorX = enemy.facing > 0 ? x + w - inset - visorW : x + inset;
        ctx.fillRect(visorX, y + u(4), visorW, u(2));
        ctx.fillStyle = appearance.colors.belt;
        ctx.fillRect(x + inset, y + h - u(5), w - inset * 2, u(appearance.armored ? 3 : 2));
    }

    // Context prompt for the nearest available enemy or bomb.
    function drawInteractPrompt(ctx) {
        const interactEnemy = nearbyEnemy("interact", INTERACT_RANGE);
        const bomb = nearbyBomb();
        const grapple = nearbyGrappleTarget();
        const strongEnemy = nearbyEnemy(null, INTERACT_RANGE, "strong");
        let target;
        let text;
        let color;

        if (interactEnemy) {
            target = interactEnemy;
            text = interactEnemy.type === "strong" ? "E: zakuj od tyłu" : "E: zakuj";
            color = "#a4f1dc";
        } else if (bomb) {
            target = bomb;
            text = "E: rozbrój";
            color = "#ffe08a";
        } else if (grapple) {
            target = grapple;
            text = "Q: uzyj haka";
            color = "#f2d37b";
        } else if (strongEnemy) {
            target = strongEnemy;
            text = "Podejdź od tyłu";
            color = "#ff9eaa";
        } else {
            return;
        }

        ctx.font = `700 ${6 * SCALE}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        const width = Math.ceil(ctx.measureText(text).width) + 6 * SCALE;
        const x = Math.round(target.x + target.w / 2);
        const y = Math.round(target.y) - 6 * SCALE;

        ctx.fillStyle = "rgba(10, 15, 22, 0.8)";
        ctx.fillRect(x - Math.floor(width / 2), y - 8 * SCALE, width, 11 * SCALE);
        ctx.fillStyle = color;
        ctx.fillText(text, x, y);
    }

    // Debug w układzie poziomu: hitboxy i wektory.
    function drawDebugWorld(ctx) {
        ctx.lineWidth = 1;

        // Granice poziomu
        ctx.strokeStyle = "rgba(255, 0, 255, 0.6)";
        outline(ctx, 0, 0, levelWidth, levelHeight);

        // Hitboxy platform
        ctx.strokeStyle = "rgba(255, 90, 90, 0.95)";
        for (const p of platforms) outline(ctx, p.x, p.y, p.w, p.h);

        // Bomby: hitbox (pomarańczowy) i zasięg interakcji (przerywany niebieski)
        for (const bomb of bombs) {
            ctx.strokeStyle = "rgba(255, 160, 60, 0.95)";
            outline(ctx, bomb.x, bomb.y, bomb.w, bomb.h);
            ctx.strokeStyle = "rgba(90, 220, 255, 0.55)";
            ctx.setLineDash([2, 2]);
            ctx.beginPath();
            ctx.arc(bomb.x + bomb.w / 2, bomb.y + bomb.h / 2, INTERACT_RANGE, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Active and cuffed enemy hitboxes (red/gray) with their cuffing ranges.
        for (const enemy of enemies) {
            ctx.strokeStyle = enemy.state === "active" ? "rgba(255, 90, 120, 0.95)" : "rgba(180, 190, 200, 0.8)";
            outline(ctx, enemy.x, enemy.y, enemy.w, enemy.h);
            ctx.strokeStyle = enemy.type === "strong" ? "rgba(255, 120, 150, 0.55)" : "rgba(130, 255, 180, 0.45)";
            ctx.setLineDash([2, 2]);
            ctx.beginPath();
            ctx.arc(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2,
                INTERACT_RANGE, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Obrazek gracza (żółty, przerywany) i jego hitbox (zielony). Hitbox ręczny może być
        // mniejszy od obrazka, a przy "auto" oba obrysy są takie same.
        const sr = spriteRect(player);
        ctx.strokeStyle = "rgba(255, 230, 80, 0.9)";
        ctx.setLineDash([2, 2]);
        outline(ctx, sr.x, sr.y, sr.w, sr.h);
        ctx.setLineDash([]);
        ctx.strokeStyle = "#3cff7a";
        outline(ctx, player.x, player.y, player.w, player.h);

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
        ctx.fillRect(player.x, player.y + player.h - 1, player.w, 1);

        // Znacznik ściany: niebieski pasek po stronie ściany (żółty, gdy odbicie od niej czeka na cooldown)
        if (player.wallDir !== 0) {
            const blocked = player.wallDir === player.lastWallJumpSide && player.sinceWallJump < SAME_WALL_COOLDOWN;
            ctx.fillStyle = blocked ? "#ffd23c" : "#4db8ff";
            ctx.fillRect(player.wallDir < 0 ? player.x : player.x + player.w - 1, player.y, 1, player.h);
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
        const scale = ctx.getTransform ? ctx.getTransform().a : 1; // skala viewportu (px ekranu na px gry)
        const wallCooldown = Math.max(0, SAME_WALL_COOLDOWN - player.sinceWallJump);
        const enemyCounts = activeEnemyCounts();

        const lines = [
            "DEBUG   ( / = wyłącz )",
            `FPS: ${fps.toFixed(0)}   dt: ${(lastDt * 1000).toFixed(1)} ms   skala: ${scale.toFixed(2)}x`,
            `pozycja:  x=${player.x.toFixed(1)}  y=${player.y.toFixed(1)}`,
            `prędkość: vx=${player.vx.toFixed(0)}  vy=${player.vy.toFixed(0)}`,
            `hitbox ${player.hitbox === "auto" ? "auto" : "ręczny"}: ${player.w}x${player.h} px   obrazek: ${player.sprite.w}x${player.sprite.h} px (${(player.sprite.w / TILE).toFixed(2)}x${(player.sprite.h / TILE).toFixed(2)} tila)`,
            `onGround: ${player.onGround}   facing: ${player.facing}`,
            `dash: ${dash}`,
            `ściana: ${player.wallDir}  ost.: ${player.lastWallJumpSide}  cd: ${wallCooldown.toFixed(2)}  ślizg: ${player.wallSlideTime.toFixed(2)}`,
            `czas: ${timeLeft.toFixed(1)} s   bomby: ${defusedCount()}/${bombs.length}   w zasięgu: ${nearbyBomb() ? "tak" : "nie"}`,
            `przeciwnicy: ${enemyCounts.active} aktywnych / ${enemyCounts.cuffed} zakutych`,
            `kamera:   x=${camera.x.toFixed(1)}  y=${camera.y.toFixed(1)}`,
            `${level.name}: ${levelWidth}x${levelHeight} px   platform: ${platforms.length}`,
            `tekstury: ok=${tex.ok} błąd=${tex.error} brak=${tex.none}` + (tex.loading ? ` ładuje=${tex.loading}` : ""),
        ];

        const lineHeight = 7 * SCALE;
        ctx.fillStyle = "rgba(0, 0, 0, 0.62)";
        ctx.fillRect(4 * SCALE, 16 * SCALE, 200 * SCALE, lines.length * lineHeight + 6 * SCALE);

        ctx.fillStyle = "#d8ffe4";
        ctx.font = `${5 * SCALE}px ui-monospace, Menlo, Consolas, monospace`;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        lines.forEach((text, i) => ctx.fillText(text, 7 * SCALE, 19 * SCALE + i * lineHeight));
        ctx.textBaseline = "alphabetic";
    }

    // Interfejs przyklejony do ekranu: nazwa poziomu, timer i licznik bomb.
    // (Podpowiedź ze sterowaniem jest w rogu ekranu, w HTML.)
    function drawHud(ctx) {
        ctx.textBaseline = "alphabetic";
        ctx.textAlign = "left";
        ctx.font = `700 ${7 * SCALE}px system-ui, sans-serif`;
        ctx.fillStyle = "rgba(232, 237, 244, 0.85)";
        ctx.fillText(level.name, 6 * SCALE, 11 * SCALE);

        // Timer i bomby w prawym górnym rogu
        ctx.fillStyle = "rgba(10, 15, 22, 0.55)";
        ctx.fillRect(VIEW_WIDTH - 54 * SCALE, 4 * SCALE, 50 * SCALE, 25 * SCALE);

        ctx.textAlign = "right";
        ctx.font = `700 ${12 * SCALE}px ui-monospace, Menlo, Consolas, monospace`;
        ctx.fillStyle = timeLeft <= 10 ? "#ff6b6b" : "#e8edf4";
        ctx.fillText(formatTime(timeLeft), VIEW_WIDTH - 8 * SCALE, 17 * SCALE);

        ctx.font = `${6 * SCALE}px system-ui, sans-serif`;
        ctx.fillStyle = "rgba(232, 237, 244, 0.9)";
        ctx.fillText(`Bomby: ${defusedCount()}/${bombs.length}`, VIEW_WIDTH - 8 * SCALE, 26 * SCALE);
    }

    // Rysowanie. Tylko odczytuje stan, niczego nie zmienia.
    function draw(ctx, { debug = false, fps = 0, hud = true } = {}) {
        syncSizes();
        const scale = getScale(ctx); // skala viewportu: pikseli ekranu na piksel gry

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

        // Siatka tili (tylko widoczny fragment, linie 1-pikselowe), dzięki niej widać ruch kamery.
        const camX = camera.x;
        const camY = camera.y;
        ctx.fillStyle = "rgba(204, 224, 238, 0.07)";
        for (let x = Math.floor(camX / TILE) * TILE; x <= camX + VIEW_WIDTH; x += TILE) {
            ctx.fillRect(x, camY, 1, VIEW_HEIGHT);
        }
        for (let y = Math.floor(camY / TILE) * TILE; y <= camY + VIEW_HEIGHT; y += TILE) {
            ctx.fillRect(camX, y, VIEW_WIDTH, 1);
        }

        // Platformy: teksturą, a bez niej kolorem z jasnym paskiem na górze.
        for (const p of platforms) {
            const textured = drawBox(ctx, p);
            if (!textured) {
                ctx.fillStyle = "#526b70";
                ctx.fillRect(Math.round(p.x), Math.round(p.y), Math.round(p.w), 1);
            }
        }

        if (grappleTarget) {
            ctx.strokeStyle = "#f2d37b";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(player.x + player.w / 2, player.y + player.h / 2);
            ctx.lineTo(grappleTarget.x + grappleTarget.w / 2, grappleTarget.y + grappleTarget.h / 2);
            ctx.stroke();
        }

        // Bomby
        for (const bomb of bombs) drawBomb(ctx, bomb);

        // Enemies are drawn separately from level geometry and bombs.
        for (const enemy of enemies) drawEnemy(ctx, enemy);

        // Cienie po dashu, potem sam gracz
        for (const g of ghosts) {
            drawPlayer(ctx, g.x, g.y, g.facing, (g.life / GHOST_LIFE) * 0.45, scale);
        }
        drawPlayer(ctx, player.x, player.y, player.facing, 1, scale);

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
        getGrappleTargets: () => platforms.filter((platform) => platform.grappleable === true),
        tickTimer,
        nearbyBomb,
        nearbyEnemy,
        cuffEnemy: cuff,
        resolveEnemyAttack,
        activeEnemyCounts,
        defuse,
        allDefused,
        get level() { return level; },
        get timeLeft() { return timeLeft; },
    };
}
