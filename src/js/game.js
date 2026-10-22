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
import { createAnimator, getSheetFrameSize, getSheetReport } from "./animations.js";
import {
    ENEMY_TYPES, calmEnemy, canCuff, createEnemy, cuffEnemy as applyCuff, initEnemyArea, resetEnemy,
    updateEnemy, visionPolygon,
} from "./enemies.js";

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

// Hak (Q): lina jest sztywnym ograniczeniem odległości od punktu zaczepienia, a gracz huśta się jak wahadło.
const GRAPPLE_RANGE = 100 * SCALE;          // zasięg zaczepienia i maksymalna długość liny (200 px = ok. 6 tili)
const GRAPPLE_MIN_LENGTH = 24 * SCALE;      // najkrótsza lina
const GRAPPLE_COOLDOWN = 0.5;               // po odpięciu: czas, zanim można zaczepić ten sam punkt (i w ogóle ponownie)
const GRAPPLE_LENGTH_SPEED = 50 * SCALE;    // zwijanie / rozwijanie liny (px/s); wolno, żeby dało się precyzyjnie ustawić długość
const GRAPPLE_PUMP_ACCEL = 22 * SCALE;      // rozhuśtywanie (A/D w powietrzu): bardzo słabe, wahadło rozkręca się powoli
const GRAPPLE_DAMPING = 0.06;               // tłumienie napiętej liny (1/s), żeby huśtawka nie rosła w nieskończoność
const GRAPPLE_SUBSTEP = 1 / 120;            // krok symulacji liny (s); mniejszy krok = stabilniejsze wahadło
const GRAPPLE_BACK_TOLERANCE = TILE / 2;    // punkt tak blisko "za plecami" (np. dokładnie nad głową) nadal jest "przed"
const GRAPPLE_BLOCKED_TIME = 0.12;          // lina przecięta przez ścianę dłużej niż tyle sekund odpina się sama
const RELEASE_AIR_ACCEL = 300 * SCALE;      // sterowanie w powietrzu po odpięciu liny (px/s²)
const RELEASE_AIR_DRAG = 0.6;               // jak szybko wygasa pęd z huśtawki bez sterowania (1/s)

// Bomba dymna (F): leci w linii prostej do najbliższego przeciwnika w zasięgu (jak hak). Po trafieniu
// w przeciwnika, ścianę albo po przelocie całego zasięgu tworzy się chmura, w której przeciwnicy nic nie widzą.
const SMOKE_RANGE = GRAPPLE_RANGE;         // zasięg namierzania i lotu (taki jak hak)
const SMOKE_SPEED = 170 * SCALE;           // prędkość pocisku (px/s)
const SMOKE_COOLDOWN = 3;                  // odstęp między rzutami (s)
const SMOKE_RADIUS = 40 * SCALE;           // promień chmury (80 px = 2,5 tila, średnica 5 tili)
const SMOKE_DURATION = 6;                  // jak długo trwa chmura (s)
const SMOKE_GROW_TIME = 0.35;              // chmura rośnie od zera do pełnego promienia przez tyle sekund
const SMOKE_FADE_TIME = 1;                 // w ostatniej sekundzie chmura się kurczy i znika
const SMOKE_SHOT_SIZE = 4 * SCALE;         // rozmiar pocisku (8 px)

// Skocznia (jump pad): wyrzuca gracza w górę po wejściu na nią (JUMP_PAD_SPEED to prędkość startowa,
// wysokość ok. 5,3 tila; pojedyncza skocznia może ją zmienić polem `power`, patrz jumpPad() w levels.js).
const JUMP_PAD_SPEED = 320 * SCALE;
const JUMP_PAD_SQUASH_TIME = 0.18;         // jak długo skocznia jest "ściśnięta" po odbiciu (tylko wygląd)

// Tryb poziomu "panel" (skradanka): jeden panel do rozbrojenia. Gdy którykolwiek strażnik zauważy gracza,
// włącza się alarm i na całej mapie spada kilkunastu przeciwników na spadochronach (patrz triggerAlarm()).
const PARATROOPERS_DEFAULT = 14;               // ilu spadochroniarzy spada po alarmie (pole `paratroopers` w poziomie)
const PARATROOPER_STRONG_EVERY = 4;            // co który spadochroniarz jest silny (pozostali są słabi)
const PARATROOPER_SPAWN_MIN = 12 * SCALE;      // start nad górną krawędzią poziomu: od tylu px ...
const PARATROOPER_SPAWN_SPREAD = 40 * SCALE;   // ... do tylu px więcej (różne momenty lądowania)

// Tryb poziomu "boss": po mapie goni gracza kamikaze z bombami przy ciele. Gdy gracz zbliży się na
// BOSS_TRIGGER_RADIUS, kamikaze wybucha od razu i oznacza to przegraną (zwykle poziom ma wtedy 1 HP, pole `hp`).
// Dym spowalnia kamikaze (patrz enemies.js). Kamikaze, który utknie, pojawia się po BOSS_STUCK_RESPAWN_TIME s
// w jednym z miejsc `respawns`, najbliższym graczowi, ale dalszym niż BOSS_RESPAWN_MIN_DISTANCE.
// Poziom wygrywa się rozbrojeniem wszystkich paneli (zwykle 3).
const BOSS_TRIGGER_RADIUS = 40 * SCALE;
const BOSS_STUCK_RESPAWN_TIME = 1.5;
const BOSS_RESPAWN_MIN_DISTANCE = 300 * SCALE;
const BOSS_RESPAWN_WAIT = 0.8;                 // po pojawieniu się chwilę stoi (żeby nie wyskakiwał na gracza)
const BOSS_BLAST_TIME = 0.6;                   // jak długo widać wybuch

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

// Życie gracza. Na każdym poziomie gracz zaczyna z PLAYER_MAX_HP (poziom może to zmienić polem `hp`).
// Kolce i ataki przeciwników zabierają po 1 HP, a gracz wraca do checkpointu (ostatnia rozbrojona
// bomba albo początek poziomu). Przy 0 HP gra się kończy (ekran przegranej).
const PLAYER_MAX_HP = 3;
const INVULNERABLE_TIME = 1.5;  // tyle sekund po utracie HP gracz jest nietykalny (miga)
const HURT_FLASH_TIME = 0.3;    // czas czerwonego błysku ekranu po obrażeniach

// Kolce: 1 tile szerokości i 1/4 tila wysokości (32 x 8 px przy tilu 32 px). Pozycje są w levels.js.
const SPIKE_HEIGHT = TILE / 4;

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
        hp: PLAYER_MAX_HP,       // aktualne życie
        maxHp: PLAYER_MAX_HP,    // życie na starcie poziomu
        invulnerableTime: 0,     // ile jeszcze gracz jest nietykalny po utracie HP
        wallDir: 0,            // ściana przy graczu: -1 po lewej, 1 po prawej, 0 brak
        lastWallJumpSide: 0,   // strona ostatniego odbicia od ściany (0 po lądowaniu)
        sinceWallJump: Infinity, // ile sekund minęło od ostatniego odbicia od ściany
        wallSlideTime: 0,      // ile sekund trwa kontakt ze ścianą w powietrzu
        wallLockTime: 0,       // ile jeszcze sterowanie poziome jest zablokowane po odbiciu
        jumpBuffer: 0,         // ile jeszcze liczy się wcześniej wciśnięty skok
        canCutJump: false,     // czy puszczenie klawisza skróci skok (tylko skok z ziemi)
        airCarry: false,       // po odpięciu liny: zachowuje pęd poziomy w powietrzu (do lądowania)
        sheet: "player",       // sprite sheet z animations.js (animacje); bez pliku gra użyje tekstury
        texture: "player",     // nazwa z textures.js (statyczny obrazek, gdy brak sprite sheetu)
        color: "#79d7c4",      // kolor zastępczy, gdy brak tekstury
    };

    // Dane aktualnego poziomu (ustawiane w loadLevel).
    let level = initialLevel;
    let platforms = [];
    let bombs = [];
    let enemies = [];
    let spikes = [];
    let backgroundLayers = [];
    let levelWidth = VIEW_WIDTH;
    let levelHeight = VIEW_HEIGHT;
    let timeLimit = 60;
    let timeLeft = 60; // pozostały czas w sekundach
    let spawn = { x: 32 * SCALE, y: 160 * SCALE }; // dolny środek gracza na starcie
    let checkpoint = { ...spawn };  // dolny środek gracza po utracie HP (start albo ostatnia rozbrojona bomba)
    let hurtFlash = 0;              // ile jeszcze trwa czerwony błysk po obrażeniach

    // "Cienie" zostawiane przez gracza podczas dashu (tylko efekt wizualny).
    const ghosts = [];

    // Bomba dymna: pociski w locie, chmury, cooldown, krótki komunikat "brak celu".
    let smokeShots = [];
    let smokes = [];
    let smokeCooldown = 0;
    let smokeNoTarget = 0;
    let jumpPads = [];
    let mode = "bombs";                   // "bombs" = rozbrój bomby i dojdź do wyjścia, "panel" = jeden panel, skradanka
    let alarm = { active: false, time: 0 }; // alarm w trybie "panel" (time = sekundy od włączenia)
    let blasts = [];                      // wybuchy kamikaze { x, y, age } (tylko wygląd; skutek liczy explodeKamikaze)
    let deathReason = null;               // "blast" po wybuchu kamikaze (main.js pokazuje wtedy własny komunikat)
    let penalty = { amount: 0, time: 0 }; // ostatnia kara czasowa (do wyświetlenia w HUD)

    // Animacje gracza (sprite sheet z animations.js).
    const animator = createAnimator(player.sheet);
    let grappleTarget = null;
    let grappleLength = 0;
    let grappleCooldown = 0;
    let grappleBlockedTime = 0; // ile sekund lina jest przecięta przez ścianę
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
        // Rozmiar obrazka: klatka sprite sheetu, a jak go nie ma, przycięta tekstura, a jak jej nie ma, zastępczy.
        const size = (entity.sheet && getSheetFrameSize(entity.sheet)) || getTextureSize(entity.texture);
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

    // Wybiera animację gracza na podstawie jego stanu (kolejność ma znaczenie: pierwszy pasujący wygrywa).
    // Nazwy animacji są w animations.js; tu decydujesz, kiedy która gra.
    function pickPlayerAnimation() {
        if (hurtFlash > 0 || player.hp <= 0) return "hurt";
        if (player.dashTime > 0) return "dash";
        if (grappleTarget && !player.onGround) return "swing";
        if (!player.onGround) {
            if (player.wallDir !== 0 && player.vy > 0 && player.wallSlideTime < WALL_SLIDE_DURATION) return "wallslide";
            return player.vy < 0 ? "jump" : "fall";
        }
        return Math.abs(player.vx) > 8 * SCALE ? "run" : "idle";
    }

    // W zsuwaniu po ścianie postać patrzy w stronę ściany (arkusz ma ręce na ścianie po prawej).
    function playerFacing(anim) {
        return anim === "wallslide" && player.wallDir !== 0 ? player.wallDir : player.facing;
    }

    function updateAnimation(dt) {
        animator.play(pickPlayerAnimation());
        animator.update(dt);
    }

    // Tekstura bomby: w trybie "panel" ta sama bomba jest panelem (panel / panelDefused w textures.js).
    function bombTexture(defused) {
        if (mode !== "bombs") return defused ? "panelDefused" : "panel"; // "panel" i "boss": bomba to panel
        return defused ? "bombDefused" : "bomb";
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
        mode = next.mode ?? "bombs";

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
            texture: bombTexture(false),
            defused: false,
        }));
        enemies = (next.enemies ?? []).map(createEnemy);
        // Kamikaze porusza się po całym poziomie (domyślny obszar to cała mapa, nie jedna platforma).
        for (const enemy of enemies) {
            if (enemy.type === "kamikaze" && !enemy.areaData) {
                enemy.areaData = { x1: 0, y1: -1000 * SCALE, x2: levelWidth, y2: levelHeight };
            }
        }
        enemies.forEach((enemy) => initEnemyArea(enemy, platforms));
        // Kolec w danych poziomu to prostokąt { x, y, w, h } (patrz spike() w levels.js).
        spikes = (next.spikes ?? []).map((data) => ({ texture: "spike", color: "#aab4bd", ...data }));
        // Skocznia w danych poziomu to prostokąt { x, y, w, h, power } (patrz jumpPad() w levels.js).
        jumpPads = (next.jumpPads ?? []).map((data) => ({ texture: "jumpPad", color: "#e0a030", power: 1, ...data, squash: 0 }));
        syncSizes();
        camera.setLevelSize(levelWidth, levelHeight);
        reset();
    }

    // Ustawia gracza w checkpoincie (na starcie poziomu, a po rozbrojeniu bomby przy niej).
    function respawnPlayer() {
        syncSizes();
        player.x = checkpoint.x - player.w / 2;
        player.y = checkpoint.y - player.h;
        player.vx = 0;
        player.vy = 0;
        player.onGround = false;
        player.facing = 1;
        player.dashTime = 0;
        player.dashCooldown = 0;
        player.invulnerableTime = 0;
        player.wallDir = 0;
        player.lastWallJumpSide = 0;
        player.sinceWallJump = Infinity;
        player.wallSlideTime = 0;
        player.wallLockTime = 0;
        player.jumpBuffer = 0;
        player.canCutJump = false;
        player.airCarry = false;
        ghosts.length = 0;
        grappleTarget = null;
        grappleLength = 0;
        grappleCooldown = 0;
        grappleBlockedTime = 0;
        grappleTargetLocks.clear();
        camera.snapTo(player);
    }

    // Pełny reset aktualnego poziomu: gracz (z pełnym HP), bomby, przeciwnicy i timer.
    function reset() {
        for (const bomb of bombs) {
            bomb.defused = false;
            bomb.texture = bombTexture(false);
        }
        enemies = enemies.filter((enemy) => !enemy.paratrooper); // spadochroniarze z alarmu znikają
        enemies.forEach(resetEnemy);
        alarm = { active: false, time: 0 };
        blasts = [];
        deathReason = null;
        checkpoint = { ...spawn };
        player.maxHp = level.hp ?? PLAYER_MAX_HP;
        player.hp = player.maxHp;
        hurtFlash = 0;
        smokeShots = [];
        smokes = [];
        smokeCooldown = 0;
        smokeNoTarget = 0;
        penalty = { amount: 0, time: 0 };
        for (const pad of jumpPads) pad.squash = 0;
        respawnPlayer();
        timeLeft = timeLimit;
    }

    // Odlicza czas. Wołane z update(), a także podczas okna z pytaniem (czas wtedy leci dalej).
    function tickTimer(dt) {
        timeLeft = Math.max(0, timeLeft - dt);
        penalty.time = Math.max(0, penalty.time - dt);
    }

    // Kara czasowa (np. za złą odpowiedź przy bombie): zabiera `seconds` sekund z timera.
    // Gdy czas spadnie do zera, main.js kończy poziom jak przy zwykłym końcu czasu.
    function addTimePenalty(seconds) {
        timeLeft = Math.max(0, timeLeft - seconds);
        penalty = { amount: seconds, time: 2 };
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

    // Odpina linę. Odpięty punkt jest blokowany na GRAPPLE_COOLDOWN, a gracz w powietrzu zachowuje
    // pęd z huśtawki (airCarry), zamiast od razu hamować do prędkości biegu.
    function detachGrapple() {
        if (!grappleTarget) return;
        grappleTargetLocks.set(grappleTarget, GRAPPLE_COOLDOWN);
        grappleTarget = null;
        grappleLength = 0;
        grappleBlockedTime = 0;
        grappleCooldown = GRAPPLE_COOLDOWN;
        player.airCarry = !player.onGround;
    }

    function attachGrapple(target) {
        grappleTarget = target;
        grappleBlockedTime = 0;
        const anchorX = target.x + target.w / 2;
        const anchorY = target.y + target.h / 2;
        const distance = Math.hypot(player.x + player.w / 2 - anchorX, player.y + player.h / 2 - anchorY);
        grappleLength = Math.max(GRAPPLE_MIN_LENGTH, Math.min(GRAPPLE_RANGE, distance));
        player.canCutJump = false;
        player.airCarry = false;
        player.dashTime = 0;
    }

    // Czy odcinek (gracz -> punkt zaczepienia) nie przechodzi przez solidną platformę.
    // Platformy "oneWay" (przechodzi się przez nie od dołu) nie blokują liny. `shrink` zmniejsza
    // przeszkody o tyle pikseli z każdej strony, żeby ocierający się o ścianę gracz nie gubił liny.
    function hasClearGrappleLine(target, fromX, fromY, shrink = 0) {
        const toX = target.x + target.w / 2;
        const toY = target.y + target.h / 2;
        return !platforms.some((platform) => platform !== target
            && platform.solid !== false
            && !platform.oneWay
            && segmentIntersectsBox(fromX, fromY, toX, toY, {
                x: platform.x + shrink,
                y: platform.y + shrink,
                w: Math.max(0, platform.w - 2 * shrink),
                h: Math.max(0, platform.h - 2 * shrink),
            }));
    }

    // Stan punktu zaczepienia względem gracza (do wyboru celu i do debugu):
    // "ok" (można zaczepić), "behind" (za plecami), "blocked" (ściana na drodze liny),
    // "locked" (chwilowo zablokowany po odpięciu), "far" (poza zasięgiem).
    function classifyGrappleTarget(target, maxDistance = GRAPPLE_RANGE) {
        const cx = player.x + player.w / 2;
        const cy = player.y + player.h / 2;
        const targetX = target.x + target.w / 2;
        const targetY = target.y + target.h / 2;
        if (Math.hypot(cx - targetX, cy - targetY) > maxDistance) return "far";
        if (grappleTargetLocks.has(target)) return "locked";
        if (!hasClearGrappleLine(target, cx, cy)) return "blocked";
        if ((targetX - cx) * player.facing < -GRAPPLE_BACK_TOLERANCE) return "behind";
        return "ok";
    }

    // Najbliższy punkt zaczepienia przed graczem, w zasięgu i bez ściany na drodze.
    // Opcje: anyDirection = bierze też punkty za plecami; ignoreLocks = ignoruje blokadę po odpięciu
    // (przy przełączaniu między punktami blokada nie ma sensu, bo lina nie była odpinana).
    function nearbyGrappleTarget(maxDistance = GRAPPLE_RANGE, excludedTarget = null, { anyDirection = false, ignoreLocks = false } = {}) {
        const cx = player.x + player.w / 2;
        const cy = player.y + player.h / 2;
        let best = null;
        let bestDistance = maxDistance;
        for (const target of platforms) {
            if (target.grappleable !== true || target === excludedTarget) continue;
            if (!ignoreLocks && grappleTargetLocks.has(target)) continue;
            const targetX = target.x + target.w / 2;
            const targetY = target.y + target.h / 2;
            if (!anyDirection && (targetX - cx) * player.facing < -GRAPPLE_BACK_TOLERANCE) continue;
            const distance = Math.hypot(cx - targetX, cy - targetY);
            if (distance <= bestDistance && hasClearGrappleLine(target, cx, cy)) {
                best = target;
                bestDistance = distance;
            }
        }
        return best;
    }

    // Cel, na który przełączy Q podczas huśtania: najpierw przed graczem, a gdy go nie ma,
    // dowolny inny w zasięgu (wcześniej Q po obróceniu się plecami do drugiego punktu odpinało linę).
    function nextGrappleTarget() {
        const options = { ignoreLocks: true };
        return nearbyGrappleTarget(GRAPPLE_RANGE, grappleTarget, options)
            ?? nearbyGrappleTarget(GRAPPLE_RANGE, grappleTarget, { ...options, anyDirection: true });
    }

    // Lina to ograniczenie: gdy gracz jest dalej niż długość liny, wracamy na okrąg. Jeśli ściana
    // blokuje korektę, próbujemy przesunąć tylko w poziomie albo tylko w pionie (ślizg po ścianie),
    // zamiast zostawiać linę rozciągniętą. Składową prędkości "od kotwicy" usuwamy, styczną zostawiamy.
    function constrainGrappleRope() {
        if (!grappleTarget || grappleLength <= 0) return;
        const anchorX = grappleTarget.x + grappleTarget.w / 2;
        const anchorY = grappleTarget.y + grappleTarget.h / 2;
        const dx = player.x + player.w / 2 - anchorX;
        const dy = player.y + player.h / 2 - anchorY;
        const distance = Math.hypot(dx, dy);
        if (distance <= grappleLength || distance === 0) return; // lina luźna

        const nx = dx / distance;
        const ny = dy / distance;
        const moveX = nx * grappleLength - dx;
        const moveY = ny * grappleLength - dy;
        const fits = (ox, oy) => !platforms.some((platform) => platform.solid !== false && !platform.oneWay
            && overlaps({ x: player.x + ox, y: player.y + oy, w: player.w, h: player.h }, platform));
        if (fits(moveX, moveY)) {
            player.x += moveX;
            player.y += moveY;
        } else if (fits(moveX, 0)) {
            player.x += moveX;
        } else if (fits(0, moveY)) {
            player.y += moveY;
        }
        player.x = Math.max(0, Math.min(levelWidth - player.w, player.x));

        const outwardSpeed = player.vx * nx + player.vy * ny;
        if (outwardSpeed > 0) {
            player.vx -= outwardSpeed * nx;
            player.vy -= outwardSpeed * ny;
        }
    }

    function defuse(bomb) {
        bomb.defused = true;
        bomb.texture = bombTexture(true);
        // Rozbrojona bomba to nowy checkpoint: gracz wraca tu na środek, stopami na powierzchni bomby.
        checkpoint = { x: bomb.x + bomb.w / 2, y: bomb.y + bomb.h };
    }

    // Zabiera graczowi życie. Zwraca false, gdy gracz jest nietykalny (nic się nie dzieje).
    // Po utracie HP gracz wraca do checkpointu i jest chwilę nietykalny; przy 0 HP zostaje
    // na miejscu, a main.js pokazuje ekran przegranej (patrz isDead()).
    function damagePlayer(amount = 1) {
        if (player.hp <= 0 || player.invulnerableTime > 0) return false;
        player.hp = Math.max(0, player.hp - amount);
        hurtFlash = HURT_FLASH_TIME;
        if (player.hp > 0) {
            respawnPlayer();
            player.invulnerableTime = INVULNERABLE_TIME;
            enemies.forEach(calmEnemy); // po powrocie do checkpointu nikt nie goni gracza
        }
        return true;
    }

    const isDead = () => player.hp <= 0;

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

    // ----- Bomba dymna -----

    // Aktualny promień chmury: rośnie na początku i kurczy się na końcu.
    function smokeRadius(cloud) {
        const grow = Math.min(1, cloud.age / SMOKE_GROW_TIME);
        const eased = 1 - (1 - grow) * (1 - grow);
        const fade = Math.max(0, Math.min(1, (SMOKE_DURATION - cloud.age) / SMOKE_FADE_TIME));
        return SMOKE_RADIUS * eased * fade;
    }

    // Najbliższy aktywny przeciwnik w zasięgu bomby dymnej (liczony od środka gracza) albo null.
    // Ściany nie liczą się: jeśli stoi jedna na drodze, pocisk w nią uderzy i tam powstanie chmura.
    function nearestSmokeTarget() {
        const cx = player.x + player.w / 2;
        const cy = player.y + player.h / 2;
        let best = null;
        let bestDistance = SMOKE_RANGE;
        for (const enemy of enemies) {
            if (enemy.state !== "active") continue;
            const distance = Math.hypot(cx - (enemy.x + enemy.w / 2), cy - (enemy.y + enemy.h / 2));
            if (distance <= bestDistance) {
                best = enemy;
                bestDistance = distance;
            }
        }
        return best;
    }

    // Rzut: pocisk leci prosto w stronę przeciwnika, na którego wskazywał w chwili rzutu.
    function fireSmoke() {
        const target = nearestSmokeTarget();
        if (!target) {
            smokeNoTarget = 0.8; // krótki komunikat "brak celu", cooldown nie startuje
            return false;
        }
        const ox = player.x + player.w / 2;
        const oy = player.y + player.h / 2;
        const dx = target.x + target.w / 2 - ox;
        const dy = target.y + target.h / 2 - oy;
        const length = Math.hypot(dx, dy) || 1;
        smokeShots.push({ x: ox, y: oy, dx: dx / length, dy: dy / length, travelled: 0 });
        smokeCooldown = SMOKE_COOLDOWN;
        return true;
    }

    function spawnSmoke(x, y) {
        // Kłębki chmury: stałe losowe kształty (tylko wygląd).
        const puffs = Array.from({ length: 12 }, () => ({
            angle: Math.random() * Math.PI * 2,
            distance: 0.15 + Math.random() * 0.45,
            size: 0.35 + Math.random() * 0.2,
            spin: (Math.random() - 0.5) * 0.8,
        }));
        smokes.push({ x, y, age: 0, puffs });
    }

    // Lot pocisków małymi krokami (żeby nie przeskoczyć przez cienką ścianę) i tworzenie chmur.
    function updateSmokeShots(dt) {
        for (let i = smokeShots.length - 1; i >= 0; i--) {
            const shot = smokeShots[i];
            let remaining = SMOKE_SPEED * dt;
            let hit = null;
            while (remaining > 0 && !hit) {
                const step = Math.min(remaining, 2 * SCALE);
                remaining -= step;
                const nx = shot.x + shot.dx * step;
                const ny = shot.y + shot.dy * step;
                const wall = platforms.some((p) => p.solid !== false && !p.oneWay
                    && nx >= p.x && nx <= p.x + p.w && ny >= p.y && ny <= p.y + p.h);
                const foe = enemies.some((e) => e.state === "active"
                    && nx >= e.x && nx <= e.x + e.w && ny >= e.y && ny <= e.y + e.h);
                if (wall) {
                    hit = { x: shot.x, y: shot.y }; // ostatni wolny punkt przed ścianą
                } else if (foe || nx < 0 || nx > levelWidth || ny < 0 || ny > levelHeight) {
                    hit = { x: nx, y: ny };
                } else {
                    shot.x = nx;
                    shot.y = ny;
                    shot.travelled += step;
                    if (shot.travelled >= SMOKE_RANGE) hit = { x: nx, y: ny }; // przeciwnik uciekł: chmura na końcu zasięgu
                }
            }
            if (hit) {
                spawnSmoke(hit.x, hit.y);
                smokeShots.splice(i, 1);
            }
        }
    }

    function updateSmoke(dt, input) {
        smokeCooldown = Math.max(0, smokeCooldown - dt);
        smokeNoTarget = Math.max(0, smokeNoTarget - dt);
        if (input.smokePressed() && smokeCooldown <= 0 && player.hp > 0) fireSmoke();
        updateSmokeShots(dt);
        for (let i = smokes.length - 1; i >= 0; i--) {
            smokes[i].age += dt;
            if (smokes[i].age >= SMOKE_DURATION) smokes.splice(i, 1);
        }
    }

    // ----- Skocznie -----

    // Wejście na skocznię od góry (albo stanie na niej) wyrzuca gracza w górę. Nie działa na linie.
    function resolveJumpPads(dt) {
        for (const pad of jumpPads) {
            pad.squash = Math.max(0, pad.squash - dt);
            if (grappleTarget || player.vy < 0 || !overlaps(player, pad)) continue;
            if (player.y + player.h > pad.y + pad.h + 1) continue; // stopy muszą być przy skoczni, nie pod nią
            player.vy = -JUMP_PAD_SPEED * pad.power;
            player.onGround = false;
            player.canCutJump = false; // puszczenie skoku nie skraca odbicia
            player.jumpBuffer = 0;
            player.dashTime = 0;
            pad.squash = JUMP_PAD_SQUASH_TIME;
        }
    }

    // Ruch przeciwników: patrol, pole widzenia, pościg i grawitacja (patrz enemies.js).
    function updateEnemies(dt) {
        const world = {
            platforms, player, gravity: GRAVITY, maxFall: MAX_FALL_SPEED,
            smokes: smokes.map((cloud) => ({ x: cloud.x, y: cloud.y, r: smokeRadius(cloud) })),
        };
        for (const enemy of enemies) updateEnemy(enemy, world, dt);
    }

    // Alarm (tryb "panel"): na całej szerokości mapy zaczynają opadać przeciwnicy na spadochronach.
    // Rozkładają się równo wzdłuż poziomu (z losowym przesunięciem), startują nad jego górną krawędzią
    // na różnych wysokościach, więc lądują jeden po drugim. Po wylądowaniu są "łowcami": gonią gracza
    // bez pola widzenia (oślepia ich tylko dym). Co PARATROOPER_STRONG_EVERY-ty jest silny.
    function triggerAlarm() {
        if (alarm.active) return;
        alarm = { active: true, time: 0 };
        const count = level.paratroopers ?? PARATROOPERS_DEFAULT;
        const area = { x1: 0, y1: -1000 * SCALE, x2: levelWidth, y2: levelHeight };
        const slot = levelWidth / count;
        for (let i = 0; i < count; i++) {
            const data = {
                id: `spadochroniarz-${i + 1}`,
                type: (i + 1) % PARATROOPER_STRONG_EVERY === 0 ? "strong" : "weak",
                x: slot * (i + 0.15 + Math.random() * 0.7),
                y: -(PARATROOPER_SPAWN_MIN + Math.random() * PARATROOPER_SPAWN_SPREAD), // y = stopy
                state: "falling",
                hunter: true,
                paratrooper: true,
                area,
            };
            const enemy = createEnemy(data, enemies.length);
            initEnemyArea(enemy, platforms);
            enemies.push(enemy);
        }
    }

    // ----- Kamikaze (tryb "boss") -----

    // Zapalnik, wybuch i ponowne pojawienie się kamikaze. Pościg i skoki są w enemies.js.
    function updateKamikazes(dt) {
        for (const blast of blasts) blast.age += dt;
        blasts = blasts.filter((blast) => blast.age < BOSS_BLAST_TIME);

        const px = player.x + player.w / 2;
        const py = player.y + player.h / 2;
        for (const boss of enemies) {
            if (boss.type !== "kamikaze") continue;
            if (boss.state === "gone") {
                boss.respawnIn -= dt;
                if (boss.respawnIn <= 0) respawnKamikaze(boss);
                continue;
            }
            if (boss.state !== "active" || player.hp <= 0) continue;
            if (boss.wait > 0) continue;

            if (boss.stuck) { // utknął (np. za wąskim przejściem): wraca do gry w innym miejscu
                boss.stuck = false;
                boss.state = "gone";
                boss.respawnIn = BOSS_STUCK_RESPAWN_TIME;
                continue;
            }
            const distance = Math.hypot(px - (boss.x + boss.w / 2), py - (boss.y + boss.h / 2));
            if (distance <= BOSS_TRIGGER_RADIUS) explodeKamikaze(boss); // gracz za blisko: wybuch od razu
        }
    }

    // Wybuch: gracz ginie od razu (nietykalność po utracie HP nie chroni), nawet przy kilku HP.
    function explodeKamikaze(boss) {
        blasts.push({ x: boss.x + boss.w / 2, y: boss.y + boss.h / 2, age: 0 });
        if (player.hp > 0) {
            player.hp = 0;
            hurtFlash = HURT_FLASH_TIME;
            deathReason = "blast";
        }
        boss.state = "gone";
        boss.respawnIn = BOSS_STUCK_RESPAWN_TIME;
    }

    function respawnKamikaze(boss) {
        const home = { x: boss.homeX + boss.w / 2, y: boss.homeY + boss.h };
        // Punkty z polem stage są brane pod uwagę tylko przy tylu rozbrojonych panelach.
        const stage = defusedCount();
        const listed = (boss.respawns ?? []).filter((point) => point.stage === undefined || point.stage === stage);
        const points = listed.length > 0 ? listed : [home];
        const px = player.x + player.w / 2;
        const py = player.y + player.h / 2;
        const minDistance = boss.respawnDistance ?? BOSS_RESPAWN_MIN_DISTANCE;
        const distanceTo = (point) => Math.hypot(point.x - px, point.y - py);
        // side: "left" = punkt musi leżeć na lewo od gracza, "right" = na prawo (kamikaze ma się pojawiać ZA graczem).
        const sideOk = (point) => point.side === undefined || (point.side === "left" ? point.x < px : point.x > px);
        const far = points.filter((point) => sideOk(point) && distanceTo(point) >= minDistance)
            .sort((a, b) => distanceTo(a) - distanceTo(b));
        // Żaden punkt nie jest dość daleko od gracza: kamikaze czeka (nie pojawia się mu pod nosem).
        if (far.length === 0) return;
        const point = far[0];
        boss.x = point.x - boss.w / 2;
        boss.y = point.y - boss.h;
        boss.vy = 0;
        boss.onGround = false;
        boss.state = "active";
        boss.fuse = null;
        boss.stuck = false;
        boss.stuckClock = 0;
        boss.lostClock = 0;
        boss.slowTime = 0;
        boss.wait = BOSS_RESPAWN_WAIT;
        boss.ai = { mode: "chase", timer: 2, lastSeenX: px, sees: false };
        boss.facing = px >= point.x ? 1 : -1;
        boss.direction = boss.facing;
    }

    // Kontakt z aktywnym przeciwnikiem zabiera 1 HP, ale tylko gdy gracz jest PRZED nim (po stronie,
    // w którą patrzy). Od tyłu przeciwnik nie rani. Wyjątek: dash w słabego przeciwnika ma
    // pierwszeństwo (main.js kajdankuje go przed tym wywołaniem, a tu pomijamy go na wszelki wypadek).
    // Zwraca przeciwnika, który zranił gracza, albo null.
    function resolveEnemyAttack() {
        if (player.invulnerableTime > 0 || player.hp <= 0) return null;
        const playerCenter = player.x + player.w / 2;
        for (const enemy of enemies) {
            if (enemy.state !== "active" || !overlaps(player, enemy)) continue;
            if (enemy.type === "kamikaze") continue; // kamikaze rani tylko wybuchem (updateKamikazes)
            const enemyCenter = enemy.x + enemy.w / 2;
            if ((playerCenter - enemyCenter) * enemy.facing < 0) continue; // gracz za plecami przeciwnika
            const dashingIntoIt = player.dashTime > 0
                && (enemyCenter - playerCenter) * player.dashDir > 0
                && canCuff(enemy, "dash", { fromBehind: false });
            if (dashingIntoIt) continue; // atak gracza ma pierwszeństwo
            damagePlayer(ENEMY_TYPES[enemy.type].attack.damage);
            return enemy;
        }
        return null;
    }

    // Kolce nie są solidne: samo dotknięcie hitboxem zabiera 1 HP.
    function resolveSpikes() {
        if (player.invulnerableTime > 0 || player.hp <= 0) return false;
        if (!spikes.some((spike) => overlaps(player, spike))) return false;
        return damagePlayer(1);
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

    // Kroki 6-7 ruchu: przesunięcie w poziomie i kolizje, potem w pionie i kolizje, na końcu lina.
    // Uderzenie w ścianę zeruje prędkość poziomą (wcześniej rosła dalej, np. podczas huśtania
    // w stronę ściany, i po odejściu od niej gracz wystrzeliwał).
    function moveAndCollide(dt) {
        const vx = player.vx;
        let hitSide = false;
        player.x += vx * dt;
        for (const p of platforms) {
            if (p.solid === false || p.oneWay) continue;
            if (!overlaps(player, p)) continue;
            if (vx > 0) player.x = p.x - player.w;
            else if (vx < 0) player.x = p.x + p.w;
            player.dashTime = 0; // uderzenie w ścianę kończy dash
            hitSide = true;
        }
        const clampedX = Math.max(0, Math.min(levelWidth - player.w, player.x));
        if (clampedX !== player.x) hitSide = true;
        player.x = clampedX;
        if (hitSide && player.wallLockTime <= 0) {
            player.vx = 0;
            player.airCarry = false;
        }

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
    }

    // Jeden krok huśtawki (h sekund): długość liny, sterowanie, grawitacja, tłumienie, ruch.
    function swingStep(h, input) {
        grappleLength = Math.max(
            GRAPPLE_MIN_LENGTH,
            Math.min(GRAPPLE_RANGE, grappleLength + input.grappleLengthChange() * GRAPPLE_LENGTH_SPEED * h),
        );
        const move = input.moveX();
        if (move !== 0) player.facing = move;
        if (player.onGround) {
            player.vx = move * MOVE_SPEED; // na ziemi chodzisz normalnie (bez ślizgania się)
        } else {
            player.vx += move * GRAPPLE_PUMP_ACCEL * h; // w powietrzu: bardzo słabe rozhuśtywanie
        }
        player.vy = Math.min(player.vy + GRAVITY * h, MAX_FALL_SPEED);

        const anchorX = grappleTarget.x + grappleTarget.w / 2;
        const anchorY = grappleTarget.y + grappleTarget.h / 2;
        const distance = Math.hypot(player.x + player.w / 2 - anchorX, player.y + player.h / 2 - anchorY);
        if (!player.onGround && distance >= grappleLength - 0.5) {
            const damping = Math.exp(-GRAPPLE_DAMPING * h); // lina napięta: lekkie tłumienie
            player.vx *= damping;
            player.vy *= damping;
        }
        player.dashTime = 0;
        player.canCutJump = false;
        player.wallSlideTime = 0;

        moveAndCollide(h);

        // Ściana przecinająca linę na dłużej odcina ją (nie huśtamy się "przez" ściany).
        const cx = player.x + player.w / 2;
        const cy = player.y + player.h / 2;
        grappleBlockedTime = hasClearGrappleLine(grappleTarget, cx, cy, 1.5) ? 0 : grappleBlockedTime + h;
        if (grappleBlockedTime >= GRAPPLE_BLOCKED_TIME) detachGrapple();
    }

    // Aktualizacja logiki. dt = czas od poprzedniej klatki w sekundach.
    function update(dt, input) {
        lastDt = dt;
        const dashOriginX = player.x + player.w / 2;
        let dashedThisFrame = false;
        let dashDirection = player.dashDir;
        syncSizes();
        if (!allDefused()) tickTimer(dt);
        player.invulnerableTime = Math.max(0, player.invulnerableTime - dt);
        hurtFlash = Math.max(0, hurtFlash - dt);
        updateSmoke(dt, input);
        updateEnemies(dt);
        if (mode === "panel") {
            // Zauważenie gracza przez któregokolwiek strażnika (pościg) włącza alarm.
            if (alarm.active) alarm.time += dt;
            else if (enemies.some((enemy) => enemy.state === "active" && enemy.ai.mode === "chase")) triggerAlarm();
        }
        updateKamikazes(dt);

        grappleCooldown = Math.max(0, grappleCooldown - dt);
        for (const [target, remaining] of grappleTargetLocks) {
            const nextRemaining = remaining - dt;
            if (nextRemaining <= 0) grappleTargetLocks.delete(target);
            else grappleTargetLocks.set(target, nextRemaining);
        }
        // Q / Spacja przy linie. Spacja odpina (i nie liczy się jako skok), Q przełącza na inny punkt
        // albo odpina, gdy w zasięgu nie ma innego. Bez liny Q zaczepia najbliższy punkt przed graczem.
        let releasedThisFrame = false;
        if (grappleTarget && input.grappleReleasePressed()) {
            detachGrapple();
            releasedThisFrame = true;
        } else if (grappleTarget && input.grapplePressed()) {
            const nextTarget = nextGrappleTarget();
            if (nextTarget) attachGrapple(nextTarget); // przełączenie nie ma cooldownu ani blokady
            else detachGrapple();
        } else if (!grappleTarget && grappleCooldown <= 0 && input.grapplePressed() && player.dashTime <= 0) {
            const target = nearbyGrappleTarget();
            if (target) attachGrapple(target);
        }

        // Liczniki czasu
        player.dashCooldown = Math.max(0, player.dashCooldown - dt);
        player.wallLockTime = Math.max(0, player.wallLockTime - dt);
        player.jumpBuffer = Math.max(0, player.jumpBuffer - dt);
        player.sinceWallJump += dt;
        if (input.jumpPressed() && !grappleTarget && !releasedThisFrame) player.jumpBuffer = JUMP_BUFFER;

        // 1) Dash: start, jeśli wciśnięto Shift i minął cooldown
        if (input.dashPressed() && !grappleTarget && player.dashTime <= 0 && player.dashCooldown <= 0) {
            // Kierunek z klawiszy, a jeśli żaden nie jest wciśnięty, to w stronę patrzenia.
            player.dashDir = input.moveX() || player.facing;
            player.facing = player.dashDir;
            player.dashTime = DASH_TIME;
            player.dashCooldown = DASH_COOLDOWN;
            player.wallLockTime = 0;
            player.airCarry = false;
        }

        const swinging = Boolean(grappleTarget);
        if (swinging) {
            // Huśtawka liczona drobnymi krokami, bo lina to sztywne ograniczenie i duży krok psuje wahadło.
            const steps = Math.max(1, Math.ceil(dt / GRAPPLE_SUBSTEP));
            for (let i = 0; i < steps && grappleTarget; i++) swingStep(dt / steps, input);
        } else if (player.dashTime > 0) {
            // W trakcie dashu: stała prędkość w poziomie, bez grawitacji i bez skoku.
            dashedThisFrame = true;
            dashDirection = player.dashDir;
            player.dashTime -= dt;
            player.vx = player.dashDir * DASH_SPEED;
            player.vy = 0;
        } else {
            // 2) Ruch poziomy (na chwilę zablokowany po odbiciu od ściany)
            if (player.onGround) player.airCarry = false;
            if (player.wallLockTime <= 0) {
                const move = input.moveX();
                if (player.airCarry) {
                    // Po odpięciu liny pęd z huśtawki nie znika od razu: gracz może go zwiększyć do
                    // prędkości biegu, ale szybszy ruch tylko powoli wygasa (RELEASE_AIR_DRAG).
                    if (move !== 0 && player.vx * move <= MOVE_SPEED) {
                        player.vx += move * RELEASE_AIR_ACCEL * dt;
                        if (player.vx * move > MOVE_SPEED) player.vx = move * MOVE_SPEED;
                    } else {
                        player.vx *= Math.exp(-RELEASE_AIR_DRAG * dt);
                    }
                    if (Math.abs(player.vx) <= MOVE_SPEED * 0.5) player.airCarry = false;
                } else {
                    player.vx = move * MOVE_SPEED;
                }
            }
            if (player.vx !== 0) player.facing = Math.sign(player.vx);

            // 3) Skok z ziemi albo odbicie od ściany
            if (player.jumpBuffer > 0) {
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
                    player.airCarry = false;
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

        // Ruch i kolizje (6-7). Przy linie robi to swingStep() w drobnych krokach.
        if (!swinging) moveAndCollide(dt);

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
            ghosts.push({ x: player.x, y: player.y, facing: player.facing, pose: animator.pose(), life: GHOST_LIFE });
        }

        // 10) Zabezpieczenie: gdyby gracz wypadł poza poziom
        if (player.y > levelHeight + 100 * SCALE) respawnPlayer(); // bez utraty HP

        // 11) Kamera goni gracza (pionowo ze strefą martwą)
        camera.follow(player, dt);

        // 12) Animacja gracza zależna od jego stanu
        updateAnimation(dt);

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
        resolveJumpPads(dt);
        resolveSpikes();

        return { dashed: dashedThisFrame, dashDirection, dashTarget, dashFromBehind };
    }

    // Gracz. Pozycja NIE jest zaokrąglana do pikseli gry (ruch jest płynny), tylko wyrównana do
    // pikseli ekranu (snap), żeby piksele były ostre. Odbicie lustrzane obejmuje cały obrazek.
    function drawPlayer(ctx, x, y, facing, alpha = 1, scale = 1, pose = animator.pose()) {
        const r = spriteRect(player, x, y);
        const sx = snap(r.x, scale);
        const sy = snap(r.y, scale);

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(facing > 0 ? sx : sx + r.w, sy);
        ctx.scale(facing, 1);

        // Kolejność: klatka z sprite sheetu, statyczna tekstura, kolorowy prostokąt.
        const animated = pose.anim && animator.drawFrame(ctx, pose.anim, pose.frame, 0, 0, r.w, r.h);
        if (!animated && !drawTexture(ctx, player.texture, 0, 0, r.w, r.h)) {
            ctx.fillStyle = player.color;
            ctx.fillRect(0, 0, r.w, r.h);
            ctx.fillStyle = "#10201f"; // oko, żeby było widać, w którą stronę patrzy
            ctx.fillRect(r.w - 5 * SCALE, 5 * SCALE, 2 * SCALE, 2 * SCALE);
        }
        ctx.restore();
    }

    // Skocznia: teksturą (kafelek 1 x 1/4 tila z textures.js), a bez niej sprężyna z płytką.
    // Po odbiciu płytka na chwilę się ściska.
    function drawJumpPad(ctx, pad) {
        const drop = pad.squash > 0 ? Math.round(pad.h * 0.4) : 0;
        if (drawTexture(ctx, pad.texture, pad.x, pad.y + drop, pad.w, pad.h - drop)) return;

        const x = Math.round(pad.x);
        const y = Math.round(pad.y);
        const w = Math.round(pad.w);
        const h = Math.round(pad.h);
        ctx.fillStyle = "#3a2f1c";                      // podstawa
        ctx.fillRect(x, y + h - 2, w, 2);
        for (let tx = 4; tx + 2 <= w - 2; tx += 6) {   // sprężyna
            ctx.fillStyle = "#c8c2b6";
            ctx.fillRect(x + tx, y + drop + 2, 2, h - drop - 4);
        }
        ctx.fillStyle = pad.color;                      // płytka
        ctx.fillRect(x, y + drop, w, 3);
        ctx.fillStyle = "#ffd98a";
        ctx.fillRect(x, y + drop, w, 1);
    }

    // Pocisk bomby dymnej (mały kwadrat) i chmura (kilka półprzezroczystych kłębków).
    function drawSmokeShot(ctx, shot) {
        const size = SMOKE_SHOT_SIZE;
        const x = Math.round(shot.x - size / 2);
        const y = Math.round(shot.y - size / 2);
        if (drawTexture(ctx, "smokeBomb", x, y, size, size)) return;
        ctx.fillStyle = "#2b3138";
        ctx.fillRect(x, y, size, size);
        ctx.fillStyle = "#8a949e";
        ctx.fillRect(x + 1, y + 1, size - 4, 2);
    }

    function drawSmoke(ctx, cloud) {
        const radius = smokeRadius(cloud);
        if (radius <= 0) return;
        const fade = Math.max(0, Math.min(1, (SMOKE_DURATION - cloud.age) / SMOKE_FADE_TIME));
        ctx.save();
        ctx.globalAlpha = 0.55 * (0.4 + 0.6 * fade);
        for (const puff of cloud.puffs) {
            const angle = puff.angle + cloud.age * puff.spin;
            const px = cloud.x + Math.cos(angle) * puff.distance * radius;
            const py = cloud.y + Math.sin(angle) * puff.distance * radius;
            const pr = puff.size * radius;
            if (drawTexture(ctx, "smokeCloud", px - pr, py - pr, pr * 2, pr * 2)) continue;
            ctx.fillStyle = "#c3c9d0";
            ctx.beginPath();
            ctx.arc(px, py, pr, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    // "?" nad oślepionym przeciwnikiem.
    function drawBlindMark(ctx, enemy) {
        if (!enemy.blind || enemy.state !== "active") return;
        ctx.save();
        ctx.font = `700 ${10 * SCALE}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        ctx.fillStyle = "#1a1f24";
        ctx.fillText("?", Math.round(enemy.x + enemy.w / 2) + 1, Math.round(enemy.y - 3 * SCALE) + 1);
        ctx.fillStyle = "#dfe6ee";
        ctx.fillText("?", Math.round(enemy.x + enemy.w / 2), Math.round(enemy.y - 3 * SCALE));
        ctx.restore();
    }

    // Kolce: teksturą (kafelek 1 x 1/4 tila z textures.js), a bez niej rząd szarych trójkątów.
    function drawSpike(ctx, spike) {
        if (drawTexture(ctx, spike.texture, spike.x, spike.y, spike.w, spike.h)) return;

        const x = Math.round(spike.x);
        const y = Math.round(spike.y);
        const h = Math.round(spike.h);
        const toothW = h; // ząb jest tak szeroki jak wysoki (4 zęby na tile)
        ctx.fillStyle = spike.color;
        for (let tx = 0; tx + toothW <= spike.w; tx += toothW) {
            for (let row = 0; row < h; row++) {
                // Trójkąt: im wyżej, tym węższy.
                const half = Math.floor((row + 1) * toothW / (2 * h) + 0.5);
                const cx = x + tx + toothW / 2;
                ctx.fillRect(cx - half, y + row, half * 2, 1);
            }
        }
    }

    // Serce w HUD: teksturą "heart" / "heartEmpty", a bez niej proste serce z pikseli.
    function drawHeart(ctx, x, y, size, full) {
        if (drawTexture(ctx, full ? "heart" : "heartEmpty", x, y, size, size)) return;

        // Wzór 7 x 6 "pikseli serca" skalowany do size.
        const rows = ["0110110", "1111111", "1111111", "0111110", "0011100", "0001000"];
        const px = size / 7;
        ctx.fillStyle = full ? "#e5484d" : "#3a2a32";
        rows.forEach((row, ry) => {
            for (let rx = 0; rx < 7; rx++) {
                if (row[rx] === "1") ctx.fillRect(Math.round(x + rx * px), Math.round(y + ry * px), Math.ceil(px), Math.ceil(px));
            }
        });
    }

    // Panel rozbrajania (tryb "panel") bez tekstury: obudowa z ekranem i klawiaturą. Ekran jest niebieski,
    // podczas alarmu miga na czerwono, a po rozbrojeniu robi się zielony.
    function drawPanelFallback(ctx, bomb, x, y, w, h) {
        const u = (value) => Math.max(1, Math.round(value * SCALE));
        const blink = Math.floor(timeLeft * 3) % 2 === 0;
        ctx.fillStyle = "#1d2a33";
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = "#6b7c88";
        ctx.fillRect(x, y, w, u(1));
        ctx.fillRect(x, y + h - u(1), w, u(1));
        ctx.fillRect(x, y, u(1), h);
        ctx.fillRect(x + w - u(1), y, u(1), h);

        ctx.fillStyle = bomb.defused ? "#1f8f62" : alarm.active ? (blink ? "#ff5a5a" : "#7a2630") : "#2f6f8f";
        ctx.fillRect(x + u(2), y + u(2), w - u(4), Math.round(h * 0.4));

        ctx.fillStyle = "#43586a";
        const keyY = y + Math.round(h * 0.55);
        for (let row = 0; row < 2; row++) {
            for (let col = 0; col < 3; col++) {
                ctx.fillRect(x + u(2) + col * u(4), keyY + row * u(3), u(3), u(2));
            }
        }
        ctx.fillStyle = bomb.defused ? "#55e6ad" : blink ? "#ffd166" : "#6b5a2a";
        ctx.fillRect(x + w - u(4), y + h - u(4), u(2), u(2));
    }

    // Spadochron nad opadającym przeciwnikiem: czerwono-biała czasza (rząd po rzędzie, żeby piksele były
    // ostre) i dwie linki do ramion. Czasza lekko się kołysze.
    function drawParachute(ctx, enemy) {
        const u = (value) => Math.max(1, Math.round(value * SCALE));
        const sway = Math.round(Math.sin(enemy.fallTime * 3) * u(2));
        const rx = Math.round(enemy.w / 2 + u(7));
        const height = u(9);
        const cx = Math.round(enemy.x + enemy.w / 2) + sway;
        const baseY = Math.round(enemy.y) - u(8);

        ctx.strokeStyle = "#d8dde2";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx - rx + 0.5, baseY);
        ctx.lineTo(Math.round(enemy.x) + u(3) + 0.5, Math.round(enemy.y) + u(7));
        ctx.moveTo(cx + rx - 0.5, baseY);
        ctx.lineTo(Math.round(enemy.x + enemy.w) - u(3) + 0.5, Math.round(enemy.y) + u(7));
        ctx.stroke();

        for (let i = 0; i < height; i++) {
            const half = Math.round(rx * Math.sqrt(1 - (i / height) ** 2));
            const rowY = baseY - i - 1;
            ctx.fillStyle = "#d94f4f";
            ctx.fillRect(cx - half, rowY, half * 2, 1);
            const stripe = Math.min(half, Math.round(rx / 3));
            ctx.fillStyle = "#f2ead1";
            ctx.fillRect(cx - stripe, rowY, stripe * 2, 1);
        }
    }

    // Bomba: teksturą, a bez niej prosty kształt z pikseli (kula z lontem, po rozbrojeniu zielona).
    function drawBomb(ctx, bomb) {
        const r = spriteRect(bomb);
        const x = Math.round(r.x);
        const y = Math.round(r.y);
        if (drawTexture(ctx, bomb.texture, x, y, r.w, r.h)) return;
        if (mode !== "bombs") {
            drawPanelFallback(ctx, bomb, x, y, r.w, r.h);
            return;
        }

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

    // Kamikaze: ciemnoczerwony żołnierz z pasem bomb na piersi. Po uruchomieniu lontu miga na przemian czerwono
    // i żółto (im bliżej wybuchu, tym szybciej), a gdy jeszcze "śpi" (wait), jest przygaszony.
    function drawKamikaze(ctx, enemy) {
        const u = (value) => Math.round(value * SCALE);
        const x = Math.round(enemy.x);
        const y = Math.round(enemy.y);
        const { w, h } = enemy;
        const colors = ENEMY_TYPES.kamikaze.colors;
        const armed = enemy.fuse !== null;
        const flashOn = armed && Math.floor(enemy.fuse * 16) % 2 === 0;

        ctx.save();
        if (enemy.wait > 0 && enemy.respawnIn <= 0 && !armed) ctx.globalAlpha = 0.65;
        ctx.fillStyle = flashOn ? "#ffe08a" : armed ? "#ff4d4d" : colors.body;
        ctx.fillRect(x + u(1), y + u(7), w - u(2), h - u(7));
        ctx.fillStyle = colors.head;
        ctx.fillRect(x + u(3), y + u(1), w - u(6), u(7));
        ctx.fillStyle = colors.visor;
        const visorW = u(3);
        ctx.fillRect(enemy.facing > 0 ? x + w - u(3) - visorW : x + u(3), y + u(4), visorW, u(2));
        ctx.fillStyle = colors.belt;
        ctx.fillRect(x + u(1), y + h - u(5), w - u(2), u(2));

        // Pas z trzema bombami na piersi (czarne kule z lontem i migającą iskrą).
        const radius = u(2.5);
        for (let i = 0; i < 3; i++) {
            const cx = x + u(3.5) + i * u(3.5);
            const cy = y + u(12);
            ctx.fillStyle = "#15151a";
            for (let dy = -radius; dy <= radius; dy++) {
                const half = Math.round(Math.sqrt(radius * radius - dy * dy));
                ctx.fillRect(cx - half, cy + dy, half * 2, 1);
            }
            if (Math.floor(timeLeft * 4 + i) % 2 === 0 || armed) {
                ctx.fillStyle = armed ? "#ffffff" : "#ff7a3d";
                ctx.fillRect(cx, cy - radius - SCALE, SCALE, SCALE);
            }
        }
        ctx.restore();
    }

    // Wybuch kamikaze: biały błysk, rozszerzające się pomarańczowe koło z pierścieniem (promień rażenia).
    function drawBlast(ctx, blast) {
        const t = blast.age / BOSS_BLAST_TIME;
        const grow = Math.min(1, blast.age / 0.18);
        const radius = BOSS_TRIGGER_RADIUS * 1.15 * (1 - (1 - grow) * (1 - grow));
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - t);
        ctx.fillStyle = t < 0.2 ? "#fff7d6" : "#ff9d3d";
        ctx.beginPath();
        ctx.arc(blast.x, blast.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = Math.max(0, 0.9 - t);
        ctx.strokeStyle = "#ffe08a";
        ctx.lineWidth = 3 * SCALE;
        ctx.beginPath();
        ctx.arc(blast.x, blast.y, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    function drawEnemy(ctx, enemy) {
        const u = (value) => Math.round(value * SCALE); // piksele projektu 16 px -> piksele gry
        const x = Math.round(enemy.x);
        const y = Math.round(enemy.y);
        const { w, h, type, state } = enemy;

        if (state === "gone") return; // kamikaze po wybuchu
        if (type === "kamikaze") {
            drawKamikaze(ctx, enemy);
            return;
        }

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

        if (state === "falling") drawParachute(ctx, enemy);

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

    // Pole widzenia przeciwnika: półprzezroczysty stożek przycinany przez ściany. W pościgu robi się
    // czerwony, po dotknięciu od tyłu pomarańczowy. Kąt, długość i przezroczystość: enemies.js.
    function drawEnemyVision(ctx, enemy) {
        if (enemy.state !== "active" || enemy.vision.alpha <= 0 || enemy.blind) return; // oślepiony nie ma stożka
        const points = visionPolygon(enemy, platforms);
        const mode = enemy.ai.mode;
        ctx.save();
        ctx.globalAlpha = Math.min(1, enemy.vision.alpha * (mode === "chase" ? 1.5 : 1));
        ctx.fillStyle = mode === "chase" ? "#ff5a5a" : mode === "alert" ? "#ffb347" : ENEMY_TYPES[enemy.type].colors.vision;
        ctx.beginPath();
        points.forEach((point, i) => (i === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)));
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    // Wykrzyknik nad głową: przeciwnik zauważył gracza albo został dotknięty od tyłu.
    function drawExclaim(ctx, enemy) {
        if (enemy.exclaim <= 0 || enemy.state !== "active") return;
        const w = 6 * SCALE;
        const h = 14 * SCALE;
        const bob = Math.round(Math.sin(enemy.exclaim * 18) * SCALE);
        const x = Math.round(enemy.x + enemy.w / 2 - w / 2);
        const y = Math.round(enemy.y - h - 2 * SCALE + bob);
        if (drawTexture(ctx, "exclamation", x, y, w, h)) return;

        // Zastępnik: czerwony pasek z kropką i ciemnym obrysem.
        const bar = 2 * SCALE;
        const bx = Math.round(enemy.x + enemy.w / 2 - bar / 2);
        ctx.fillStyle = "#1a0f12";
        ctx.fillRect(bx - SCALE, y - SCALE, bar + 2 * SCALE, 9 * SCALE + SCALE);
        ctx.fillRect(bx - SCALE, y + 10 * SCALE, bar + 2 * SCALE, bar + 2 * SCALE);
        ctx.fillStyle = "#ff4d4d";
        ctx.fillRect(bx, y, bar, 8 * SCALE);
        ctx.fillRect(bx, y + 11 * SCALE, bar, bar);
    }

    // Context prompt for the nearest available enemy or bomb.
    function drawInteractPrompt(ctx) {
        const interactEnemy = nearbyEnemy("interact", INTERACT_RANGE);
        const bomb = nearbyBomb();
        const grapple = grappleTarget ? nextGrappleTarget() : nearbyGrappleTarget();
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
            text = mode !== "bombs" ? "E: rozbrój panel" : "E: rozbrój";
            color = "#ffe08a";
        } else if (grapple) {
            target = grapple;
            text = grappleTarget ? "Q: zmień cel" : "Q: użyj haka";
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

    // Debug haka (w układzie poziomu): zasięg, stan każdego punktu zaczepienia i sama lina.
    // Kolory punktów: zielony = można zaczepić, niebieski = za plecami (Q go pominie, chyba że to jedyny),
    // pomarańczowy = ściana na drodze liny, czerwony = zablokowany po odpięciu, szary = poza zasięgiem.
    const GRAPPLE_DEBUG_COLORS = {
        ok: "rgba(120, 255, 160, 0.95)",
        behind: "rgba(120, 190, 255, 0.9)",
        blocked: "rgba(255, 160, 60, 0.95)",
        locked: "rgba(255, 80, 80, 0.95)",
        far: "rgba(160, 170, 180, 0.6)",
    };

    function drawDebugGrapple(ctx) {
        const targets = platforms.filter((platform) => platform.grappleable === true);
        if (targets.length === 0 && !grappleTarget) return;
        const cx = player.x + player.w / 2;
        const cy = player.y + player.h / 2;

        // Zasięg zaczepienia: półprzezroczyste koło z wyraźnym obrysem i podpisem.
        ctx.fillStyle = "rgba(242, 211, 123, 0.06)";
        ctx.beginPath();
        ctx.arc(cx, cy, GRAPPLE_RANGE, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(242, 211, 123, 0.9)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "rgba(242, 211, 123, 0.95)";
        ctx.font = `${5 * SCALE}px ui-monospace, Menlo, Consolas, monospace`;
        ctx.textAlign = "center";
        ctx.fillText(`zasięg haka ${GRAPPLE_RANGE.toFixed(0)} px`, cx, cy - GRAPPLE_RANGE - 3 * SCALE);

        for (const target of targets) {
            const kind = target === grappleTarget ? "ok" : classifyGrappleTarget(target);
            ctx.strokeStyle = GRAPPLE_DEBUG_COLORS[kind];
            outline(ctx, target.x - 1, target.y - 1, target.w + 2, target.h + 2);
            if (kind !== "far" && target !== grappleTarget) {
                ctx.globalAlpha = 0.5;
                ctx.beginPath();
                ctx.moveTo(cx, cy);
                ctx.lineTo(target.x + target.w / 2, target.y + target.h / 2);
                ctx.stroke();
                ctx.globalAlpha = 1;
            }
        }

        if (grappleTarget) {
            const anchorX = grappleTarget.x + grappleTarget.w / 2;
            const anchorY = grappleTarget.y + grappleTarget.h / 2;
            const taut = Math.hypot(cx - anchorX, cy - anchorY) >= grappleLength - 0.5;
            // Okrąg o promieniu długości liny: po nim porusza się gracz, gdy lina jest napięta.
            ctx.strokeStyle = "rgba(242, 211, 123, 0.5)";
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.arc(anchorX, anchorY, grappleLength, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.strokeStyle = taut ? "#ffd23c" : "#4db8ff"; // żółta = napięta, niebieska = luźna
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(anchorX, anchorY);
            ctx.stroke();
        }
    }

    // Debug w układzie poziomu: hitboxy i wektory.
    // Debug bomby dymnej: promień chmur, lot pocisków i linia do namierzonego przeciwnika.
    function drawDebugSmoke(ctx) {
        for (const pad of jumpPads) {
            ctx.strokeStyle = "rgba(255, 170, 40, 0.95)";
            outline(ctx, pad.x, pad.y, pad.w, pad.h);
        }
        ctx.strokeStyle = "rgba(190, 200, 215, 0.9)";
        ctx.setLineDash([3, 3]);
        for (const cloud of smokes) {
            ctx.beginPath();
            ctx.arc(cloud.x, cloud.y, smokeRadius(cloud), 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.setLineDash([]);
        const target = nearestSmokeTarget();
        if (target && smokeCooldown <= 0) {
            ctx.strokeStyle = "rgba(190, 200, 215, 0.7)";
            ctx.beginPath();
            ctx.moveTo(player.x + player.w / 2, player.y + player.h / 2);
            ctx.lineTo(target.x + target.w / 2, target.y + target.h / 2);
            ctx.stroke();
        }
    }

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

        // Kolce (żółty obrys)
        ctx.strokeStyle = "rgba(255, 220, 60, 0.95)";
        for (const spike of spikes) outline(ctx, spike.x, spike.y, spike.w, spike.h);

        // Checkpoint (zielony krzyżyk w miejscu, do którego wróci gracz)
        ctx.strokeStyle = "rgba(60, 255, 122, 0.9)";
        ctx.beginPath();
        ctx.moveTo(checkpoint.x - 4 * SCALE, checkpoint.y);
        ctx.lineTo(checkpoint.x + 4 * SCALE, checkpoint.y);
        ctx.moveTo(checkpoint.x, checkpoint.y - 4 * SCALE);
        ctx.lineTo(checkpoint.x, checkpoint.y + 4 * SCALE);
        ctx.stroke();

        drawDebugGrapple(ctx);
        drawDebugSmoke(ctx);

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

            if (enemy.state !== "active") continue;
            // Prostokąt ruchu (niebieski, przerywany) i obrys pola widzenia (żółty; czerwony, gdy widzi gracza).
            ctx.strokeStyle = "rgba(90, 200, 255, 0.7)";
            ctx.setLineDash([4, 3]);
            outline(ctx, enemy.area.x1, enemy.area.y1, enemy.area.x2 - enemy.area.x1, enemy.area.y2 - enemy.area.y1);
            ctx.setLineDash([]);
            const cone = visionPolygon(enemy, platforms);
            ctx.strokeStyle = enemy.ai.sees ? "rgba(255, 70, 70, 0.95)" : "rgba(255, 230, 90, 0.9)";
            ctx.beginPath();
            cone.forEach((point, i) => (i === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)));
            ctx.closePath();
            ctx.stroke();
            ctx.fillStyle = "#ffffff";
            ctx.font = `${5 * SCALE}px ui-monospace, Menlo, Consolas, monospace`;
            ctx.textAlign = "center";
            const timer = enemy.ai.mode === "patrol" || enemy.ai.mode === "chase" ? "" : ` ${enemy.ai.timer.toFixed(1)}`;
            ctx.fillText(`${enemy.ai.mode}${timer}`, enemy.x + enemy.w / 2, enemy.y + enemy.h + 7 * SCALE);
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

    // Wiersze panelu debug o haku.
    function grappleDebugLines() {
        const counts = { ok: 0, behind: 0, blocked: 0, locked: 0, far: 0 };
        for (const platform of platforms) {
            if (platform.grappleable === true) counts[classifyGrappleTarget(platform)]++;
        }
        const state = grappleTarget
            ? "zaczepiony"
            : grappleCooldown > 0 ? `cooldown ${grappleCooldown.toFixed(2)} s` : "gotowy";
        const lines = [
            `hak: ${state}   zasięg: ${GRAPPLE_RANGE.toFixed(0)} px (${(GRAPPLE_RANGE / TILE).toFixed(1)} tila)   pęd po odpięciu: ${player.airCarry ? "tak" : "nie"}`,
            `cele: ok ${counts.ok}, za plecami ${counts.behind}, ściana ${counts.blocked}, blokada ${counts.locked}, daleko ${counts.far}`,
        ];
        if (grappleTarget) {
            const dx = player.x + player.w / 2 - (grappleTarget.x + grappleTarget.w / 2);
            const dy = player.y + player.h / 2 - (grappleTarget.y + grappleTarget.h / 2);
            const distance = Math.hypot(dx, dy) || 1e-9;
            const radial = (player.vx * dx + player.vy * dy) / distance;
            const tangential = (-player.vx * dy + player.vy * dx) / distance;
            const angle = Math.atan2(dx, dy) * 180 / Math.PI; // 0 = lina pionowo w dół
            const taut = distance >= grappleLength - 0.5 ? "napięta" : "luźna";
            lines.push(
                `lina: dł=${grappleLength.toFixed(0)}/${GRAPPLE_RANGE.toFixed(0)}  dystans=${distance.toFixed(0)}  ${taut}  kąt=${angle.toFixed(0)}°`,
                `v_prom=${radial.toFixed(0)}  v_stycz=${tangential.toFixed(0)}  lina za ścianą: ${grappleBlockedTime.toFixed(2)} s`,
            );
        }
        return lines;
    }

    // Debug w układzie ekranu: panel z liczbami.
    function drawDebugPanel(ctx, fps) {
        const dash = player.dashTime > 0
            ? `w trakcie (${player.dashTime.toFixed(2)} s)`
            : player.dashCooldown > 0
                ? `cooldown ${player.dashCooldown.toFixed(2)} s`
                : "gotowy";
        const tex = getTextureReport();
        const sheetReport = getSheetReport();
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
            `HP: ${player.hp}/${player.maxHp}   nietykalny: ${player.invulnerableTime.toFixed(2)} s   checkpoint: ${checkpoint.x.toFixed(0)},${checkpoint.y.toFixed(0)}   kolce: ${spikes.length}   skocznie: ${jumpPads.length}`,
            `dym: ${smokeCooldown > 0 ? `cooldown ${smokeCooldown.toFixed(1)} s` : "gotowy"}   zasięg: ${SMOKE_RANGE.toFixed(0)} px   chmury: ${smokes.length}   pociski: ${smokeShots.length}   ślepi: ${enemies.filter((e) => e.blind).length}`,
            ...grappleDebugLines(),
            `czas: ${timeLeft.toFixed(1)} s   bomby: ${defusedCount()}/${bombs.length}   w zasięgu: ${nearbyBomb() ? "tak" : "nie"}`,
            `przeciwnicy: ${enemyCounts.active} aktywnych / ${enemyCounts.cuffed} zakutych`,
            ...enemies.filter((enemy) => enemy.state === "active").slice(0, 3).map((enemy) => {
                const ai = enemy.ai;
                const timer = ai.mode === "alert" || ai.mode === "search" ? ` ${ai.timer.toFixed(1)} s` : "";
                return ` ${enemy.id}: ${ai.mode}${timer}  widzi: ${ai.sees ? "tak" : "nie"}  ${enemy.onGround ? "na ziemi" : "w powietrzu"}  patrzy: ${enemy.facing > 0 ? "→" : "←"}`;
            }),
            `kamera:   x=${camera.x.toFixed(1)}  y=${camera.y.toFixed(1)}`,
            `${level.name}: ${levelWidth}x${levelHeight} px   platform: ${platforms.length}`,
            `tekstury: ok=${tex.ok} błąd=${tex.error} brak=${tex.none}` + (tex.loading ? ` ładuje=${tex.loading}` : ""),
            `animacja: ${animator.name ?? "-"} [${animator.frame + 1}/${animator.frames}]   arkusze: ok=${sheetReport.ok} błąd=${sheetReport.error}` + (sheetReport.loading ? ` ładuje=${sheetReport.loading}` : ""),
        ];

        const lineHeight = 7 * SCALE;
        ctx.fillStyle = "rgba(0, 0, 0, 0.62)";
        ctx.fillRect(4 * SCALE, 28 * SCALE, 260 * SCALE, lines.length * lineHeight + 6 * SCALE);

        ctx.fillStyle = "#d8ffe4";
        ctx.font = `${5 * SCALE}px ui-monospace, Menlo, Consolas, monospace`;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        lines.forEach((text, i) => ctx.fillText(text, 7 * SCALE, 31 * SCALE + i * lineHeight));
        ctx.textBaseline = "alphabetic";
    }

    // HUD bossa: komunikat o lontach, o śpiącym albo zniszczonym kamikaze i strzałka na brzegu ekranu,
    // gdy kamikaze jest poza widokiem (na dużej mapie trzeba wiedzieć, z której strony nadbiega).
    function drawBossHud(ctx) {
        const bosses = enemies.filter((enemy) => enemy.type === "kamikaze");
        ctx.textAlign = "center";
        const asleep = bosses.find((boss) => boss.state === "active" && boss.wait > 0);
        const gone = bosses.find((boss) => boss.state === "gone");
        if (asleep || gone) {
            ctx.font = `700 ${6 * SCALE}px system-ui, sans-serif`;
            ctx.fillStyle = "rgba(232, 237, 244, 0.85)";
            ctx.fillText(asleep
                ? `Kamikaze rusza za ${Math.ceil(asleep.wait)} s`
                : "Kamikaze utknął, zaraz wróci", VIEW_WIDTH / 2, 14 * SCALE);
        }

        for (const boss of bosses) {
            if (boss.state !== "active") continue;
            const bx = boss.x + boss.w / 2 - camera.x;
            const by = boss.y + boss.h / 2 - camera.y;
            if (bx >= 0 && bx <= VIEW_WIDTH && by >= 0 && by <= VIEW_HEIGHT) continue; // widać go na ekranie
            const cx = VIEW_WIDTH / 2;
            const cy = VIEW_HEIGHT / 2;
            const dx = bx - cx;
            const dy = by - cy;
            const margin = 14 * SCALE;
            const t = Math.min((cx - margin) / Math.max(1e-6, Math.abs(dx)), (cy - margin) / Math.max(1e-6, Math.abs(dy)));
            const ax = cx + dx * t;
            const ay = cy + dy * t;
            const angle = Math.atan2(dy, dx);
            const size = 6 * SCALE;
            ctx.save();
            ctx.translate(ax, ay);
            ctx.rotate(angle);
            ctx.fillStyle = "rgba(255, 90, 90, 0.9)";
            ctx.beginPath();
            ctx.moveTo(size, 0);
            ctx.lineTo(-size * 0.7, size * 0.8);
            ctx.lineTo(-size * 0.7, -size * 0.8);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
            const meters = Math.round(Math.hypot(boss.x - player.x, boss.y - player.y) / TILE);
            ctx.font = `700 ${5 * SCALE}px system-ui, sans-serif`;
            ctx.fillStyle = "rgba(255, 200, 200, 0.95)";
            ctx.fillText(`${meters} m`, ax - Math.cos(angle) * size * 2.2, ay - Math.sin(angle) * size * 2.2 + 2 * SCALE);
        }
        ctx.textAlign = "right";
    }

    // Interfejs przyklejony do ekranu: nazwa poziomu, timer i licznik bomb.
    // (Podpowiedź ze sterowaniem jest w rogu ekranu, w HTML.)
    function drawHud(ctx) {
        ctx.textBaseline = "alphabetic";
        ctx.textAlign = "left";
        ctx.font = `700 ${7 * SCALE}px system-ui, sans-serif`;
        ctx.fillStyle = "rgba(232, 237, 244, 0.85)";
        ctx.fillText(level.name, 6 * SCALE, 11 * SCALE);

        // Życie: rząd serc pod nazwą poziomu (pełne = pozostałe HP).
        const heartSize = 10 * SCALE;
        for (let i = 0; i < player.maxHp; i++) {
            drawHeart(ctx, 6 * SCALE + i * (heartSize + 2 * SCALE), 14 * SCALE, heartSize, i < player.hp);
        }

        // Bomba dymna: gotowość (F), czas do kolejnego rzutu albo komunikat o braku celu.
        ctx.textAlign = "left";
        ctx.font = `${6 * SCALE}px system-ui, sans-serif`;
        if (smokeNoTarget > 0) {
            ctx.fillStyle = "#ffb347";
            ctx.fillText("Dym: brak celu w zasięgu", 6 * SCALE, 31 * SCALE);
        } else if (smokeCooldown > 0) {
            ctx.fillStyle = "rgba(232, 237, 244, 0.55)";
            ctx.fillText(`Dym: ${smokeCooldown.toFixed(1)} s`, 6 * SCALE, 31 * SCALE);
        } else {
            ctx.fillStyle = "#a4f1dc";
            ctx.fillText("Dym [F]: gotowy", 6 * SCALE, 31 * SCALE);
        }

        // Timer i bomby w prawym górnym rogu
        ctx.fillStyle = "rgba(10, 15, 22, 0.55)";
        ctx.fillRect(VIEW_WIDTH - 54 * SCALE, 4 * SCALE, 50 * SCALE, 25 * SCALE);

        ctx.textAlign = "right";
        ctx.font = `700 ${12 * SCALE}px ui-monospace, Menlo, Consolas, monospace`;
        ctx.fillStyle = timeLeft <= 10 ? "#ff6b6b" : "#e8edf4";
        ctx.fillText(formatTime(timeLeft), VIEW_WIDTH - 8 * SCALE, 17 * SCALE);

        ctx.font = `${6 * SCALE}px system-ui, sans-serif`;
        ctx.fillStyle = "rgba(232, 237, 244, 0.9)";
        ctx.fillText(
            mode === "bombs" ? `Bomby: ${defusedCount()}/${bombs.length}`
                : bombs.length > 1 ? `Panele: ${defusedCount()}/${bombs.length}` : `Panel: ${defusedCount()}/${bombs.length}`,
            VIEW_WIDTH - 8 * SCALE, 26 * SCALE,
        );

        // Alarm: pulsująca czerwona ramka ekranu i napis u góry.
        if (alarm.active) {
            const pulse = 0.5 + 0.5 * Math.sin(alarm.time * 8);
            ctx.fillStyle = `rgba(255, 60, 60, ${0.14 + 0.16 * pulse})`;
            const edge = 5 * SCALE;
            ctx.fillRect(0, 0, VIEW_WIDTH, edge);
            ctx.fillRect(0, VIEW_HEIGHT - edge, VIEW_WIDTH, edge);
            ctx.fillRect(0, 0, edge, VIEW_HEIGHT);
            ctx.fillRect(VIEW_WIDTH - edge, 0, edge, VIEW_HEIGHT);
            ctx.textAlign = "center";
            ctx.font = `700 ${10 * SCALE}px ui-monospace, Menlo, Consolas, monospace`;
            ctx.fillStyle = `rgba(255, 110, 110, ${0.65 + 0.35 * pulse})`;
            ctx.fillText("ALARM!", VIEW_WIDTH / 2, 18 * SCALE);
            ctx.textAlign = "right";
        }

        if (mode === "boss") drawBossHud(ctx);

        // Kara czasowa (np. zła odpowiedź): czerwony napis pod timerem przez chwilę.
        if (penalty.time > 0) {
            ctx.globalAlpha = Math.min(1, penalty.time);
            ctx.font = `700 ${9 * SCALE}px ui-monospace, Menlo, Consolas, monospace`;
            ctx.fillStyle = "#ff6b6b";
            ctx.fillText(`−${penalty.amount} s`, VIEW_WIDTH - 8 * SCALE, 38 * SCALE);
            ctx.globalAlpha = 1;
        }
    }

    // Wyjście na prawym końcu poziomu (tryb "bombs"). Zapala się, gdy wszystkie bomby są rozbrojone.
    function drawExit(ctx) {
        const exitWidth = 28 * SCALE;
        const exitHeight = 48 * SCALE;
        const exitX = levelWidth - exitWidth;
        const exitY = levelHeight - 1.25 * TILE - exitHeight;
        const exitActive = allDefused();
        ctx.fillStyle = exitActive ? "rgba(69, 224, 164, 0.28)" : "rgba(110, 130, 145, 0.18)";
        ctx.fillRect(exitX, exitY, exitWidth, exitHeight);
        ctx.strokeStyle = exitActive ? "#55e6ad" : "#74838d";
        ctx.lineWidth = 3 * SCALE;
        ctx.strokeRect(exitX, exitY, exitWidth, exitHeight);
        ctx.fillStyle = exitActive ? "#b9ffe0" : "#aab4bd";
        ctx.font = `700 ${8 * SCALE}px ui-monospace, Menlo, Consolas, monospace`;
        ctx.textAlign = "center";
        ctx.fillText("EXIT", exitX + exitWidth / 2, exitY + exitHeight / 2 + 3 * SCALE);
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

        if (mode === "bombs") drawExit(ctx); // w trybach "panel" i "boss" nie ma drzwi: wygrywasz po rozbrojeniu paneli

        for (const spike of spikes) drawSpike(ctx, spike);
        for (const pad of jumpPads) drawJumpPad(ctx, pad);

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
        for (const enemy of enemies) drawEnemyVision(ctx, enemy);
        for (const enemy of enemies) drawEnemy(ctx, enemy);
        for (const enemy of enemies) drawExclaim(ctx, enemy);
        for (const enemy of enemies) drawBlindMark(ctx, enemy);
        for (const blast of blasts) drawBlast(ctx, blast);

        // Cienie po dashu, potem sam gracz
        for (const g of ghosts) {
            drawPlayer(ctx, g.x, g.y, g.facing, (g.life / GHOST_LIFE) * 0.45, scale, g.pose);
        }
        // Po utracie HP gracz miga (jest nietykalny).
        const blinkHidden = player.invulnerableTime > 0 && Math.floor(player.invulnerableTime * 12) % 2 === 0;
        drawPlayer(ctx, player.x, player.y, playerFacing(animator.name), blinkHidden ? 0.35 : 1, scale);

        // Pociski i chmury dymu rysujemy na wierzchu, żeby chmura przykrywała też gracza i przeciwników.
        for (const shot of smokeShots) drawSmokeShot(ctx, shot);
        for (const cloud of smokes) drawSmoke(ctx, cloud);

        if (hud) drawInteractPrompt(ctx);
        if (debug) drawDebugWorld(ctx);

        ctx.restore();

        // Krótki czerwony błysk po utracie HP.
        if (hurtFlash > 0) {
            ctx.fillStyle = `rgba(229, 72, 77, ${(hurtFlash / HURT_FLASH_TIME) * 0.35})`;
            ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
        }

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
        // Aktualna animacja gracza (tylko do odczytu; używa jej debug i testy).
        get animation() {
            return { name: animator.name, frame: animator.frame, frames: animator.frames };
        },
        // Stan haka (tylko do odczytu; używa go m.in. debug i testy).
        get grapple() {
            return {
                attached: Boolean(grappleTarget),
                target: grappleTarget,
                length: grappleLength,
                cooldown: grappleCooldown,
                blockedTime: grappleBlockedTime,
            };
        },
        tickTimer,
        addTimePenalty,
        // Przeciwnicy i stan dymu (tylko do odczytu; używają ich debug i testy).
        get enemies() { return enemies; },
        get smoke() { return { cooldown: smokeCooldown, shots: smokeShots, clouds: smokes.map((c) => ({ x: c.x, y: c.y, age: c.age, r: smokeRadius(c) })) }; },
        nearbyBomb,
        nearbyEnemy,
        cuffEnemy: cuff,
        resolveEnemyAttack,
        isDead,
        activeEnemyCounts,
        defuse,
        allDefused,
        atRightEdge: () => player.x + player.w >= levelWidth - 1,
        // Tryb poziomu ("bombs" albo "panel") i alarm (tylko do odczytu; triggerAlarm służy też testom).
        get mode() { return mode; },
        get exitRequired() { return mode === "bombs"; }, // czy po rozbrojeniu trzeba jeszcze dojść do drzwi
        get deathReason() { return deathReason; },
        get blasts() { return blasts; },
        get alarm() { return { ...alarm }; },
        triggerAlarm,
        get level() { return level; },
        get timeLeft() { return timeLeft; },
        get hp() { return player.hp; },
        get checkpoint() { return { ...checkpoint }; },
    };
}