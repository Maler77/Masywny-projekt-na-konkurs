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

// Enemy anchor: x is center, y is the surface under their feet. Optional patrol
// bounds are center-X coordinates, with an optional speed in pixels per second.
export const enemy = (type, x, y, options = {}) => ({ type, x, y, ...options });

// Bomba: x = środek, y = powierzchnia, na której stoi. Opcjonalny hitbox: { hitbox: { w, h } }.
export const bomb = (x, y, options = {}) => ({ x, y, ...options });

export const LEVELS = [
    {
        name: "Poziom 1",
        subtitle: "Rozgrzewka",
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
        enemies: [
            enemy("weak", 400, 224, { id: "weak-1", patrol: { minX: 368, maxX: 432, speed: 48 } }),
            enemy("strong", 896, 208, { id: "strong-1", patrol: { minX: 856, maxX: 936, speed: 36 } }),
        ],
    },
    {
        name: "Poziom 2",
        subtitle: "Wieże",
        thumbnail: "level2Thumbnail",
        background: ["background2"],
        timeLimit: 70,
        width: 1856, // 58 tili
        spawn: { x: 64, y: 320 },
        platforms: [
            ground(1856),
            // pierwsza wieża schodów
            platform(176, 272, 80, 48),   // blok do podłogi
            platform(280, 224, 80),
            platform(384, 176, 80),
            platform(488, 128, 96),
            // zejście
            platform(656, 192, 80),
            platform(784, 224, 96),
            platform(928, 256, 32, 64),  // słupek do podłogi
            // druga wieża
            platform(1008, 224, 80),
            platform(1136, 192, 80),
            platform(1264, 144, 80),
            // koniec poziomu
            platform(1432, 272, 96, 48),  // blok do podłogi
            platform(1600, 224, 112),
        ],
        bombs: [
            bomb(536, 128),
            bomb(1304, 144),
            bomb(1480, 272),
            bomb(1656, 224),
        ],
    },
    {
        name: "Poziom 3",
        subtitle: "Długa droga",
        thumbnail: "level3Thumbnail",
        background: ["background3"],
        timeLimit: 75,
        width: 2400, // 75 tili
        spawn: { x: 64, y: 320 },
        platforms: [
            ground(2400),
            // pierwszy podjazd
            platform(200, 272, 64, 48),  // blok do podłogi
            platform(320, 224, 64),
            platform(440, 176, 64),
            platform(576, 128, 80),
            // zejście
            platform(752, 192, 64),
            platform(896, 224, 64),
            // schody z bloków na podłodze
            platform(1136, 288, 32, 32),
            platform(1192, 240, 32, 80),
            // drugi podjazd
            platform(1336, 272, 96, 48),  // blok do podłogi
            platform(1496, 224, 64),
            platform(1624, 176, 64),
            platform(1760, 128, 80),
            // zejście do mety
            platform(1936, 192, 64),
            platform(2080, 224, 64),
            platform(2224, 208, 112),
        ],
        bombs: [
            bomb(616, 128),
            bomb(1208, 240),
            bomb(1800, 128),
            bomb(2280, 208),
        ],
    },
    {
        name: "Poziom 4",
        subtitle: "Szyb i dash",
        thumbnail: "level4Thumbnail",
        background: ["background4"],
        timeLimit: 120,
        width: 1472,   // 46 tili
        height: 1000,  // wyższy niż ekran: kamera podąża za graczem w pionie
        spawn: { x: 64, y: 960 },
        platforms: [
            ground(1472, 1000),
            // bomba na rozgrzewkę, zwykły skok
            platform(256, 912, 96, 48),  // blok do podłogi
            // SZYB: dwie ściany naprzeciw siebie (odstęp 96 = 3 tile), wspinaczka odbijaniem się od nich.
            // Lewa ściana kończy się 64 px (2 tile) nad podłogą: pod nią wchodzi się do szybu.
            platform(512, 384, 32, 512, "wall"),
            platform(640, 384, 32, 576, "wall"),
            // półka na szczycie szybu
            platform(672, 384, 176),
            // SKOK Z DASHEM: odstęp 208 px (bez dasha da się maks. ok. 156, z dashem ok. 260)
            platform(1056, 384, 128),
            // koniec poziomu: zwykły skok w górę
            platform(1248, 336, 128),
        ],
        bombs: [
            bomb(304, 912),
            bomb(752, 384),
            bomb(1120, 384),
            bomb(1312, 336),
        ],
    },
];
