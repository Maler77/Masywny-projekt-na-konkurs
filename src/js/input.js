// Obsługa klawiatury. Pamięta, które klawisze są wciśnięte
// oraz które zostały wciśnięte dokładnie w tej klatce (do skoku).

const LEFT = ["ArrowLeft", "KeyA"];
const RIGHT = ["ArrowRight", "KeyD"];
const JUMP = ["Space", "ArrowUp", "KeyW"];

// Klawisze, którym blokujemy domyślne działanie (strzałki i spacja przewijają stronę).
const GAME_KEYS = new Set([...LEFT, ...RIGHT, ...JUMP, "ArrowDown"]);

export function createInput() {
    const down = new Set();    // klawisze trzymane teraz
    const pressed = new Set(); // klawisze wciśnięte w tej klatce

    const onKeyDown = (event) => {
        if (GAME_KEYS.has(event.code)) event.preventDefault();
        // Przytrzymany klawisz wysyła powtórzenia; liczymy tylko pierwsze wciśnięcie.
        if (!event.repeat) pressed.add(event.code);
        down.add(event.code);
    };
    const onKeyUp = (event) => down.delete(event.code);
    // Gdy okno traci fokus, puszczamy wszystkie klawisze (inaczej postać "ucieka").
    const onBlur = () => down.clear();

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);

    const any = (codes, set) => codes.some((code) => set.has(code));

    return {
        // Kierunek poziomy: -1 (lewo), 0 albo 1 (prawo).
        moveX: () => Number(any(RIGHT, down)) - Number(any(LEFT, down)),
        // Czy klawisz skoku jest trzymany (do regulacji wysokości skoku).
        jumpHeld: () => any(JUMP, down),
        // Czy klawisz skoku został dopiero co wciśnięty (jeden skok na naciśnięcie).
        jumpPressed: () => any(JUMP, pressed),
        // Wołane raz na koniec każdej klatki z main.js.
        endFrame: () => pressed.clear(),
        destroy() {
            window.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("keyup", onKeyUp);
            window.removeEventListener("blur", onBlur);
        },
    };
}