// ============================================================================
//  POZIOMY
//  Każdy poziom to wpis w tablicy LEVELS na dole pliku. Menu główne samo tworzy
//  z niej listę poziomów, więc nowy poziom to tylko nowy wpis (nic więcej nie trzeba).
//
//  POLA POZIOMU
//    name        nazwa widoczna w menu i w grze
//    subtitle    krótki opis na karcie w menu (opcjonalnie)
//    thumbnail   nazwa tekstury z textures.js dla miniatury w menu (opcjonalnie)
//    background  warstwy tła: nazwy tekstur z textures.js, od najdalszej (opcjonalnie)
//    timeLimit   czas na rozbrojenie wszystkich bomb, w sekundach
//    width       szerokość poziomu w jednostkach świata (ekran ma 960 x 540)
//    height      wysokość poziomu (opcjonalnie, domyślnie 540)
//    spawn       { x, y } miejsce startu gracza (opcjonalnie)
//    platforms   lista platform (patrz funkcje pomocnicze niżej)
//    bombs       lista bomb z pytaniami (patrz funkcja bomb() niżej)
//
//  ZASIĘG SKOKU (żeby nie zrobić niemożliwego poziomu)
//    do góry ok. 107, w poziomie ok. 190 (z dashem więcej).
//    Bezpiecznie: różnica wysokości do 80 i odstęp między platformami do 100-120.
// ============================================================================

// Platforma: pełny prostokąt (x, y = lewy górny róg). Domyślna wysokość to 20.
// texture to nazwa z textures.js, color to kolor zastępczy bez tekstury.
export const platform = (x, y, w, h = 20, texture = "platform") => ({ x, y, w, h, texture, color: "#24343d" });

// Podłoga na całą szerokość poziomu (górna krawędź na y = 480).
export const ground = (width) => platform(0, 480, width, 60, "ground");

const LETTERS = ["A", "B", "C"];

// Bomba o rozmiarze 36 x 36: (x, y) to jej lewy górny róg, więc y = góra platformy - 36.
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
        width: 2400,
        spawn: { x: 100, y: 440 },
        platforms: [
            ground(2400),
            platform(300, 400, 140),
            platform(520, 330, 140),
            platform(760, 260, 160),
            platform(1000, 360, 120),
            platform(1250, 300, 200),
            platform(1500, 220, 140),
            platform(1750, 320, 160),
            platform(2000, 400, 200),
            platform(1150, 420, 60, 60), // niski blok do wskakiwania
        ],
        bombs: [
            bomb(820, 224, 1),
            bomb(1552, 184, 2),
            bomb(2082, 364, 0),
        ],
    },
    {
        name: "Poziom 2",
        subtitle: "Wieże",
        thumbnail: "level2Thumbnail",
        background: ["background2"],
        timeLimit: 70,
        width: 2800,
        spawn: { x: 100, y: 440 },
        platforms: [
            ground(2800),
            // pierwsza wieża schodów
            platform(260, 410, 120, 70), // pierwszy stopień: pełny blok do podłogi
            platform(420, 340, 120),
            platform(580, 270, 120),
            platform(740, 200, 140),
            // zejście
            platform(980, 280, 120),
            platform(1180, 360, 140),
            platform(1400, 420, 60, 60), // blok na podłodze
            // druga wieża
            platform(1520, 350, 120),
            platform(1700, 280, 120),
            platform(1880, 210, 120),
            // koniec poziomu
            platform(2150, 400, 140),
            platform(2400, 320, 160),
        ],
        bombs: [
            bomb(792, 164, 2),
            bomb(1922, 174, 0),
            bomb(2202, 364, 1),
            bomb(2462, 284, 2),
        ],
    },
    {
        name: "Poziom 3",
        subtitle: "Długa droga",
        thumbnail: "level3Thumbnail",
        background: ["background3"],
        timeLimit: 75,
        width: 3600,
        spawn: { x: 100, y: 440 },
        platforms: [
            ground(3600),
            // pierwszy podjazd
            platform(300, 420, 100, 60), // pierwszy stopień: pełny blok do podłogi
            platform(480, 350, 100),
            platform(660, 280, 100),
            platform(860, 220, 120),
            // zejście
            platform(1120, 300, 100),
            platform(1340, 380, 100),
            // schody z bloków na podłodze
            platform(1700, 420, 60, 60),
            platform(1790, 360, 60, 120),
            // drugi podjazd
            platform(2000, 400, 140),
            platform(2240, 330, 100),
            platform(2440, 260, 100),
            platform(2640, 190, 120),
            // zejście do mety
            platform(2900, 280, 100),
            platform(3120, 360, 100),
            platform(3340, 300, 160),
        ],
        bombs: [
            bomb(902, 184, 0),
            bomb(1802, 324, 1),
            bomb(2682, 154, 2),
            bomb(3402, 264, 1),
        ],
    },
];