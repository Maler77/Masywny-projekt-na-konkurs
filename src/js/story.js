// ============================================================================
//  FABUŁA MIĘDZY POZIOMAMI
//  Teksty ekranów fabularnych są w src/data/story.json (edytuj go zwykłym edytorem tekstu):
//
//    prologue     ekran przed pierwszym poziomem (pokazuje się, gdy zaczynasz od poziomu 1 z menu)
//    afterLevel   lista: afterLevel[0] pokazuje się po ukończeniu 1. poziomu (przed 2.),
//                 afterLevel[1] po 2. itd. Kolejność = kolejność poziomów w menu.
//    epilogue     ekran po ukończeniu ostatniego poziomu
//
//  Każdy wpis to { "title": "...", "text": "...", "image": "assets/story/cos.png" }.
//    title  nagłówek (opcjonalnie)
//    text   treść; \n robi nowy wiersz, pusta linia (\n\n) nowy akapit
//    image  obrazek-ilustracja (opcjonalnie; bez niego widać ramkę "miejsce na ilustrację")
//  prologue / epilogue: brak wpisu albo null = ten ekran się nie pokazuje.
//  afterLevel: jeśli poziomów jest więcej niż wpisów, brakujące przerywniki dostają automatyczny placeholder
//  ("Rozdział N"); wpis null wyłącza przerywnik po tym poziomie. Brak pliku story.json = gra bez fabuły.
//  Fabułę można wyłączyć w całości stałą STORY_ENABLED na górze main.js.
// ============================================================================

const STORY_URL = new URL("../data/story.json", import.meta.url);

function cleanEntry(raw, where) {
    if (raw === null || raw === undefined) return null;
    if (typeof raw !== "object" || typeof raw.text !== "string") {
        console.warn(`story.json: ${where} pominięte (wpis musi mieć pole "text" z tekstem)`);
        return null;
    }
    return {
        title: typeof raw.title === "string" ? raw.title : "",
        text: raw.text,
        image: typeof raw.image === "string" && raw.image ? raw.image : null,
    };
}

// Przerywnik po poziomie o numerze `index` (od 0): wpis z pliku, a gdy go brak, automatyczny placeholder.
// Wpis null (wyłączony w pliku) albo brak pliku story.json daje null = bez przerywnika.
export function storyAfterLevel(story, index) {
    if (!story.loaded) return null;
    const entry = story.afterLevel[index];
    if (entry === undefined) {
        return { title: `Rozdział ${index + 1}`, text: `[Tu pojawi się fabuła po poziomie ${index + 1}.]`, image: null };
    }
    return entry;
}

// Wczytuje fabułę. Zawsze zwraca obiekt { loaded, prologue, afterLevel, epilogue } (loaded: false, gdy nie ma pliku).
export async function loadStory() {
    const empty = { loaded: false, prologue: null, afterLevel: [], epilogue: null };
    try {
        const response = await fetch(STORY_URL, { cache: "no-cache" });
        if (!response.ok) return empty;
        const raw = await response.json();
        const list = Array.isArray(raw.afterLevel) ? raw.afterLevel : [];
        return {
            loaded: true,
            prologue: cleanEntry(raw.prologue, "prologue"),
            afterLevel: list.map((entry, i) => cleanEntry(entry, `afterLevel[${i}]`)),
            epilogue: cleanEntry(raw.epilogue, "epilogue"),
        };
    } catch (error) {
        console.warn(`Nie można wczytać fabuły (src/data/story.json): ${error.message}`);
        return empty;
    }
}