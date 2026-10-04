// Ustawienia poziomu: limit czasu i bomby wraz z pytaniami.
// To jest jedyne miejsce, które musisz edytować, żeby zmienić treść pytań.

// Czas na rozbrojenie wszystkich bomb, w sekundach.
export const TIME_LIMIT = 60;

// Każda bomba:
//   x, y       lewy górny róg bomby w świecie gry (bomba ma 36 x 36, y = góra platformy - 36)
//   question   tekst na górze okna (placeholder: mówi, która odpowiedź jest prawidłowa)
//   options    odpowiedzi A, B, C
//   correct    indeks prawidłowej odpowiedzi: 0 = A, 1 = B, 2 = C
export const BOMBS = [
    {
        x: 820, y: 224,
        question: "Bomba 1 (placeholder): prawidłowa odpowiedź to B",
        options: ["Odpowiedź A", "Odpowiedź B", "Odpowiedź C"],
        correct: 1,
    },
    {
        x: 1552, y: 184,
        question: "Bomba 2 (placeholder): prawidłowa odpowiedź to C",
        options: ["Odpowiedź A", "Odpowiedź B", "Odpowiedź C"],
        correct: 2,
    },
    {
        x: 2082, y: 364,
        question: "Bomba 3 (placeholder): prawidłowa odpowiedź to A",
        options: ["Odpowiedź A", "Odpowiedź B", "Odpowiedź C"],
        correct: 0,
    },
];