import { SCALE } from "./config.js";

// Wymiary, prędkości i odrzut są zapisane dla tila 16 px i mnożone przez SCALE (patrz config.js).
// Enemy definitions and cuffing rules. Add new enemy behavior by registering another
// type here and listing the methods that are allowed to cuff it.
export const ENEMY_TYPES = Object.freeze({
    weak: Object.freeze({
        label: "Słaby przeciwnik",
        width: 12 * SCALE,
        height: 20 * SCALE,
        cuffMethods: Object.freeze(["interact", "dash"]),
        cuffFromBackMethods: Object.freeze([]),
        armored: false,
        colors: Object.freeze({ body: "#c9823d", head: "#edb55f", visor: "#f2ead1", belt: "#5b382d" }),
        attack: Object.freeze({ knockbackX: 116 * SCALE, knockbackY: -112 * SCALE, controlLock: 0.18, hitCooldown: 0.7 }),
    }),
    strong: Object.freeze({
        label: "Silny przeciwnik",
        width: 18 * SCALE,
        height: 26 * SCALE,
        cuffMethods: Object.freeze(["interact"]),
        cuffFromBackMethods: Object.freeze(["interact"]),
        armored: true,
        colors: Object.freeze({ body: "#713e59", head: "#c65366", visor: "#f2d9ab", belt: "#343343" }),
        attack: Object.freeze({ knockbackX: 184 * SCALE, knockbackY: -156 * SCALE, controlLock: 0.24, hitCooldown: 0.85 }),
    }),
});

// Level coordinates use the same anchor as the player and bombs: x is the center,
// y is the floor under the enemy's feet.
export function createEnemy(data, index = 0) {
    const definition = ENEMY_TYPES[data.type];
    if (!definition) throw new Error(`Unknown enemy type: ${data.type}`);

    const enemy = {
        id: data.id ?? `enemy-${index + 1}`,
        type: data.type,
        x: data.x - definition.width / 2,
        y: data.y - definition.height,
        w: definition.width,
        h: definition.height,
        state: "active",
        cuffedBy: null,
        direction: data.direction ?? 1,
        patrol: {
            minX: data.patrol?.minX ?? data.x - 24 * SCALE,
            maxX: data.patrol?.maxX ?? data.x + 24 * SCALE,
            speed: data.patrol?.speed ?? (data.type === "strong" ? 18 : 24) * SCALE,
        },
    };
    enemy.homeX = enemy.x;
    enemy.homeY = enemy.y;
    enemy.homeDirection = enemy.direction;
    enemy.facing = enemy.direction;
    return enemy;
}

export function canCuff(enemy, method, context = {}) {
    const definition = ENEMY_TYPES[enemy.type];
    if (enemy.state !== "active" || !definition?.cuffMethods.includes(method)) return false;
    if (definition.cuffFromBackMethods?.includes(method) && context.fromBehind !== true) return false;
    return true;
}

export function cuffEnemy(enemy, method, context = {}) {
    if (!canCuff(enemy, method, context)) return false;
    enemy.state = "cuffed";
    enemy.cuffedBy = method;
    return true;
}

export function resetEnemy(enemy) {
    enemy.x = enemy.homeX;
    enemy.y = enemy.homeY;
    enemy.state = "active";
    enemy.cuffedBy = null;
    enemy.direction = enemy.homeDirection;
    enemy.facing = enemy.homeDirection;
}