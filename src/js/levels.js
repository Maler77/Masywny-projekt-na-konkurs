// ============================================================================
//  POZIOMY
//  Każdy poziom to wpis w tablicy LEVELS na dole pliku. Menu główne samo tworzy
//  z niej listę poziomów, więc nowy poziom to tylko nowy wpis (nic więcej nie trzeba).
//
//  JEDNOSTKI: piksele gry. 1 tile = 32 px (stała TILE), ekran ma 640 x 360 px (20 x 11,25 tila).
//  Współrzędne: x rośnie w prawo, y w dół, (0, 0) to lewy górny róg poziomu.
//
//  POLA POZIOMU
//    name        nazwa widoczna w menu i w grze
//    subtitle    krótki opis na karcie w menu (opcjonalnie)
//    thumbnail   nazwa tekstury z textures.js dla miniatury w menu (opcjonalnie)
//    background  warstwy tła: nazwy tekstur z textures.js, od najdalszej (opcjonalnie)
//    timeLimit   czas na rozbrojenie wszystkich bomb, w sekundach
//    width       szerokość poziomu w px
//    height      wysokość poziomu w px (opcjonalnie, domyślnie 360 = jeden ekran)
//    spawn       { x, y } miejsce startu: dolny środek gracza (x = środek, y = powierzchnia pod stopami)
//    platforms   lista platform (patrz funkcje pomocnicze niżej)
//    bombs       lista położeń bomb (pytania są w src/data/questions.json)
//    enemies     opcjonalna lista przeciwników, np. enemy("strong", x, y)
//    spikes      opcjonalna lista kolców, np. spike(x, y) albo spike(x, y, 3) (patrz niżej)
//    jumpPads    opcjonalna lista skoczni, np. jumpPad(x, y) albo jumpPad(x, y, 2, { power: 1.2 }) (patrz niżej)
//    hp          opcjonalnie: życie gracza na tym poziomie (domyślnie PLAYER_MAX_HP w game.js = 3)
//    mode        opcjonalnie: "bombs" (domyślnie: rozbrój wszystkie bomby i dojdź do drzwi po prawej) albo
//                "panel" (skradanka: dokładnie jedna bomba = panel, wygrywasz po jego rozbrojeniu, pytania zawsze
//                trudne; zauważenie przez przeciwnika włącza alarm i na mapę spadają spadochroniarze,
//                ich liczbę ustawia pole paratroopers, domyślnie 14). Poziomy z panelem najwygodniej robić
//                w edytorze (pole "Tryb") jako pliki JSON, patrz levelstore.js.
//
//  ZASIĘG SKOKU (żeby nie zrobić niemożliwego poziomu; gracz ma domyślnie 32 x 48 px = 1 x 1,5 tila)
//    do góry ok. 74 px (2,3 tila), w poziomie ok. 110-156 px (zależnie od różnicy wysokości
//    i szerokości hitboxa gracza), z dashem do ok. 260 px. Bezpiecznie: różnica wysokości
//    do 48 px (1,5 tila) i odstęp do 64-80 px.
//    Odstęp ok. 208 px na tej samej wysokości jest możliwy TYLKO z dashem.
//    Nad platformą wiszącą nad podłogą zostaw co najmniej 56 px, żeby gracz mógł pod nią przejść
//    (albo dociągnij platformę do podłogi jak blok).
//
//  WALL-JUMP (Spacja przy ścianie w powietrzu)
//    Ścianą jest każda platforma sięgająca przy graczu co najmniej 36 px (platformy grube na
//    1 tile to nie ściany). Odbicie od ściany z tej samej strony co poprzednie ma cooldown
//    (SAME_WALL_COOLDOWN w game.js), a od ściany z przeciwnej strony nie ma. Dlatego po jednej
//    ścianie nie da się wspinać, a w szybie (dwie ściany naprzeciw siebie) tak.
//    Szyb szeroki na 3 tile (96 px, odstęp między ścianami) jest wygodny.
//
//  PRZELICZANIE PO ZMIANIE TILE: fizyka i rozmiary w game.js skalują się same (SCALE w config.js),
//  ale współrzędne w tym pliku są w pikselach, więc trzeba je pomnożyć przez nowy TILE / stary TILE.
// ============================================================================

import { TILE, VIEW_HEIGHT } from "./config.js";

export { TILE };

// Platforma: pełny prostokąt (x, y = lewy górny róg). Domyślna grubość to 1 tile.
// texture to nazwa z textures.js, color to kolor zastępczy bez tekstury.
export function platform(x, y, w, h = TILE, textureOrOptions = "platform", extraOptions = {}) {
    const options = typeof textureOrOptions === "object" && textureOrOptions !== null
        ? textureOrOptions
        : extraOptions;
    const texture = typeof textureOrOptions === "string"
        ? textureOrOptions
        : (options.texture ?? "platform");

    return {
        x, y, w, h, texture,
        color: options.color ?? "#24343d",
        solid: options.solid ?? true,
        oneWay: options.oneWay ?? false,
        grappleable: options.grappleable ?? false,
    };
}

// Podłoga na całą szerokość poziomu, na samym dole. Ma grubość 1,25 tila, więc jej górna krawędź
// jest 40 px nad dołem poziomu (dla ekranu 360 px: y = 320 = 10 tili). Dla wyższego poziomu
// podaj jego wysokość.
const GROUND_HEIGHT = TILE * 1.25;
export const ground = (width, levelHeight = VIEW_HEIGHT) => platform(0, levelHeight - GROUND_HEIGHT, width, GROUND_HEIGHT, "ground");

// Kolce: 1 tile szerokości i 1/4 tila wysokości (32 x 8 px) na każdą sztukę. x = lewa krawędź,
// y = powierzchnia, na której kolce stoją (np. górna krawędź platformy). count = ile kolców obok
// siebie (każdy 1 tile szerokości). Dotknięcie kolca zabiera graczowi 1 HP i cofa go do checkpointu.
export const spike = (x, y, count = 1) => ({ x, y: y - TILE / 4, w: TILE * count, h: TILE / 4 });

// Skocznia (jump pad): 1 tile szerokości i 1/4 tila wysokości (32 x 8 px) na każdą sztukę. x = lewa
// krawędź, y = powierzchnia, na której skocznia stoi (np. górna krawędź platformy). count = ile
// skoczni obok siebie. Wejście na nią wyrzuca gracza w górę na ok. 5,3 tila (JUMP_PAD_SPEED w game.js);
// opcja power mnoży prędkość odbicia (np. 1.2 = wyżej, 0.7 = niżej; wysokość rośnie z kwadratem power).
export const jumpPad = (x, y, count = 1, options = {}) => ({ x, y: y - TILE / 4, w: TILE * count, h: TILE / 4, power: options.power ?? 1 });

// Przeciwnik: x = środek, y = powierzchnia pod stopami. Opcje (wszystkie opcjonalne):
//   id, direction (1 / -1), speed (patrol, px/s), chaseSpeed (pościg),
//   area { x1, y1, x2, y2 }  dwa rogi prostokąta, w którym może się poruszać (domyślnie: jego platforma),
//   vision { angle, length, offsetX, offsetY, alpha }  nadpisuje pole widzenia z enemies.js.
export const enemy = (type, x, y, options = {}) => ({ type, x, y, ...options });

// Bomba: x = środek, y = powierzchnia, na której stoi. Opcjonalny hitbox: { hitbox: { w, h } }.
export const bomb = (x, y, options = {}) => ({ x, y, ...options });

export const LEVELS = [
    {
        name: "Poziom 1",
        subtitle: "Rozgrzewka",
        questionCategory: "easy",
        thumbnail: "level1Thumbnail",
        background: ["background"],
        timeLimit: 60,
        width: 1600, // 50 tili
        spawn: { x: 64, y: 320 },
        platforms: [
            ground(1600),
            platform(64, 256, 96, 12, { oneWay: true, color: "#5c8790" }),
            platform(304, -3, 24, 24, { solid: false, grappleable: true, color: "#d1a94f" }),
            platform(200, 0, 24, 24, { solid: false, grappleable: true, color: "#d1a94f" }),
            platform(192, 272, 96, 48),   // blok do podłogi
            platform(352, 224, 96),
            platform(512, 176, 96),
            platform(672, 224, 96),
            platform(784, 288, 32, 32),  // mały blok na podłodze
            platform(832, 208, 128),
            platform(1000, 160, 96),
            platform(1168, 208, 96),
            platform(1328, 272, 128, 48),  // blok do podłogi
        ],
        bombs: [
            bomb(560, 176),
            bomb(1048, 160),
            bomb(1392, 272),
        ],
        spikes: [
            spike(576, 320, 2),   // podłoga pod platformami przed drugą bombą
            spike(1264, 320, 2),  // podłoga przed ostatnim blokiem
        ],
        jumpPads: [
            jumpPad(464, 320),    // na podłodze obok pierwszej wieży: wyrzuca na platformę z bomką (y = 176)
        ],
        enemies: [
            // Domyślnie przeciwnik patroluje całą platformę, na której stoi. Prostokąt `area` (dwa rogi)
            // pozwala mu w pościgu zejść z niej na podłogę (y2 = 320 to górna krawędź podłogi).
            enemy("weak", 400, 224, { id: "weak-1", speed: 48, area: { x1: 320, y1: 100, x2: 520, y2: 320 } }),
            enemy("strong", 896, 208, { id: "strong-1", speed: 36 }),
        ],
    },
];