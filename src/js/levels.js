// ============================================================================
//  POZIOMY
//  Każdy poziom to wpis w tablicy LEVELS na dole pliku. Menu główne samo tworzy
//  z niej listę poziomów, więc nowy poziom to tylko nowy wpis (nic więcej nie trzeba).
//
//  JEDNOSTKI: piksele gry. 1 tile = 16 px (stała TILE), ekran ma 320 x 180 px (20 x 11,25 tila).
//  Współrzędne: x rośnie w prawo, y w dół, (0, 0) to lewy górny róg poziomu.
//
//  POLA POZIOMU
//    name        nazwa widoczna w menu i w grze
//    subtitle    krótki opis na karcie w menu (opcjonalnie)
//    thumbnail   nazwa tekstury z textures.js dla miniatury w menu (opcjonalnie)
//    background  warstwy tła: nazwy tekstur z textures.js, od najdalszej (opcjonalnie)
//    timeLimit   czas na rozbrojenie wszystkich bomb, w sekundach
//    width       szerokość poziomu w px
//    height      wysokość poziomu w px (opcjonalnie, domyślnie 180 = jeden ekran)
//    spawn       { x, y } miejsce startu: dolny środek gracza (x = środek, y = powierzchnia pod stopami)
//    platforms   lista platform (patrz funkcje pomocnicze niżej)
//    bombs       lista bomb z pytaniami (patrz funkcja bomb() niżej)
//
//  ZASIĘG SKOKU (żeby nie zrobić niemożliwego poziomu; gracz ma domyślnie 16 x 24 px)
//    do góry ok. 37 px (2,3 tila), w poziomie ok. 55-80 px (zależnie od różnicy wysokości
//    i szerokości hitboxa gracza), z dashem do ok. 130 px. Bezpiecznie: różnica wysokości do 24 px i odstęp do 32-40 px.
//    Odstęp ok. 104 px na tej samej wysokości jest możliwy TYLKO z dashem.
//    Nad platformą wiszącą nad podłogą zostaw co najmniej 28 px, żeby gracz mógł pod nią przejść
//    (albo dociągnij platformę do podłogi jak blok).
//
//  WALL-JUMP (Spacja przy ścianie w powietrzu)
//    Ścianą jest każda platforma sięgająca przy graczu co najmniej 18 px (platformy grube na
//    1 tile to nie ściany). Odbicie od ściany z tej samej strony co poprzednie ma cooldown
//    (SAME_WALL_COOLDOWN w game.js), a od ściany z przeciwnej strony nie ma. Dlatego po jednej
//    ścianie nie da się wspinać, a w szybie (dwie ściany naprzeciw siebie) tak.
//    Szyb szeroki na 3 tile (48 px, odstęp między ścianami) jest wygodny.
// ============================================================================

import { TILE, VIEW_HEIGHT } from "./config.js";

export { TILE };

// Platforma: pełny prostokąt (x, y = lewy górny róg). Domyślna grubość to 1 tile.
// texture to nazwa z textures.js, color to kolor zastępczy bez tekstury.
export const platform = (x, y, w, h = TILE, texture = "platform") => ({ x, y, w, h, texture, color: "#24343d" });

// Podłoga na całą szerokość poziomu, na samym dole (górna krawędź 20 px nad dołem poziomu,
// czyli dla ekranu 180 px na y = 160 = 10 tili). Dla wyższego poziomu podaj jego wysokość.
export const ground = (width, levelHeight = VIEW_HEIGHT) => platform(0, levelHeight - 20, width, 20, "ground");

const LETTERS = ["A", "B", "C"];

// Bomba: x = środek, y = powierzchnia, na której stoi (bomba stoi dolnym środkiem na tym punkcie).
// Rozmiar obrazka wynika z tekstury (bez tekstury 16 x 16 px), a hitbox z BOMB_HITBOX w game.js.
// Opcjonalnie możesz podać własny hitbox bomby: dopisz pole hitbox: { w, h } albo "auto".
//   correct   indeks prawidłowej odpowiedzi: 0 = A, 1 = B, 2 = C
//   question  tekst na górze okna (bez niego: placeholder mówiący, która odpowiedź jest dobra)
//   options   odpowiedzi A, B, C (domyślnie placeholdery)
export function bomb(x, y, correct, question, options = ["Odpowiedź A", "Odpowiedź B", "Odpowiedź C"]) {
    return {
        x,
        y,
        correct,
        question: question ?? `Placeholder: prawidłowa odpowiedź to ${LETTERS[correct]}`,
        options,
    };
}

export const LEVELS = [
    {
        name: "Poziom 1",
        subtitle: "Rozgrzewka",
        thumbnail: "level1Thumbnail",
        background: ["background"],
        timeLimit: 60,
        width: 800, // 50 tili
        spawn: { x: 32, y: 160 },
        platforms: [
            ground(800),
            platform(96, 136, 48, 24),   // blok do podłogi
            platform(176, 112, 48),
            platform(256, 88, 48),
            platform(336, 112, 48),
            platform(392, 144, 16, 16),  // mały blok na podłodze
            platform(416, 104, 64),
            platform(500, 80, 48),
            platform(584, 104, 48),
            platform(664, 136, 64, 24),  // blok do podłogi
        ],
        bombs: [
            bomb(280, 88, 1),
            bomb(524, 80, 2),
            bomb(696, 136, 0),
        ],
    },
    {
        name: "Poziom 2",
        subtitle: "Wieże",
        thumbnail: "level2Thumbnail",
        background: ["background2"],
        timeLimit: 70,
        width: 928, // 58 tili
        spawn: { x: 32, y: 160 },
        platforms: [
            ground(928),
            // pierwsza wieża schodów
            platform(88, 136, 40, 24),   // blok do podłogi
            platform(140, 112, 40),
            platform(192, 88, 40),
            platform(244, 64, 48),
            // zejście
            platform(328, 96, 40),
            platform(392, 112, 48),
            platform(464, 128, 16, 32),  // słupek do podłogi
            // druga wieża
            platform(504, 112, 40),
            platform(568, 96, 40),
            platform(632, 72, 40),
            // koniec poziomu
            platform(716, 136, 48, 24),  // blok do podłogi
            platform(800, 112, 56),
        ],
        bombs: [
            bomb(268, 64, 2),
            bomb(652, 72, 0),
            bomb(740, 136, 1),
            bomb(828, 112, 2),
        ],
    },
    {
        name: "Poziom 3",
        subtitle: "Długa droga",
        thumbnail: "level3Thumbnail",
        background: ["background3"],
        timeLimit: 75,
        width: 1200, // 75 tili
        spawn: { x: 32, y: 160 },
        platforms: [
            ground(1200),
            // pierwszy podjazd
            platform(100, 136, 32, 24),  // blok do podłogi
            platform(160, 112, 32),
            platform(220, 88, 32),
            platform(288, 64, 40),
            // zejście
            platform(376, 96, 32),
            platform(448, 112, 32),
            // schody z bloków na podłodze
            platform(568, 144, 16, 16),
            platform(596, 120, 16, 40),
            // drugi podjazd
            platform(668, 136, 48, 24),  // blok do podłogi
            platform(748, 112, 32),
            platform(812, 88, 32),
            platform(880, 64, 40),
            // zejście do mety
            platform(968, 96, 32),
            platform(1040, 112, 32),
            platform(1112, 104, 56),
        ],
        bombs: [
            bomb(308, 64, 0),
            bomb(604, 120, 1),
            bomb(900, 64, 2),
            bomb(1140, 104, 1),
        ],
    },
    {
        name: "Poziom 4",
        subtitle: "Szyb i dash",
        thumbnail: "level4Thumbnail",
        background: ["background4"],
        timeLimit: 120,
        width: 736,   // 46 tili
        height: 500,  // wyższy niż ekran: kamera podąża za graczem w pionie
        spawn: { x: 32, y: 480 },
        platforms: [
            ground(736, 500),
            // bomba na rozgrzewkę, zwykły skok
            platform(128, 456, 48, 24),  // blok do podłogi
            // SZYB: dwie ściany naprzeciw siebie (odstęp 48 = 3 tile), wspinaczka odbijaniem się od nich.
            // Lewa ściana kończy się 32 px nad podłogą: pod nią wchodzi się do szybu.
            platform(256, 192, 16, 256, "wall"),
            platform(320, 192, 16, 288, "wall"),
            // półka na szczycie szybu
            platform(336, 192, 88),
            // SKOK Z DASHEM: odstęp 104 px (bez dasha da się maks. ok. 78, z dashem ok. 130)
            platform(528, 192, 64),
            // koniec poziomu: zwykły skok w górę
            platform(624, 168, 64),
        ],
        bombs: [
            bomb(152, 456, 1),
            bomb(376, 192, 2),
            bomb(560, 192, 0),
            bomb(656, 168, 1),
        ],
    },
];