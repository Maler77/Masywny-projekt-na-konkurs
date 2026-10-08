const QUESTIONS_URL = new URL("../data/questions.json", import.meta.url);

export async function loadQuestions() {
    let response;
    try {
        response = await fetch(QUESTIONS_URL);
    } catch (error) {
        throw new Error(`Could not load question data from ${QUESTIONS_URL.pathname}. Start the project with a local HTTP server.`, { cause: error });
    }

    if (!response.ok) {
        throw new Error(`Could not load question data from ${QUESTIONS_URL.pathname} (HTTP ${response.status}).`);
    }

    let questions;
    try {
        questions = await response.json();
    } catch (error) {
        throw new Error(`Question data at ${QUESTIONS_URL.pathname} is not valid JSON.`, { cause: error });
    }

    return validateQuestions(questions);
}

export function validateQuestions(questions) {
    if (!Array.isArray(questions)) {
        throw new Error("Invalid question data: the JSON root must be an array.");
    }
    if (questions.length === 0) {
        throw new Error("Invalid question data: add at least one question to src/data/questions.json.");
    }

    const ids = new Set();
    for (let index = 0; index < questions.length; index++) {
        const question = questions[index];
        const label = `Question at array index ${index}`;
        if (!question || typeof question !== "object" || Array.isArray(question)) {
            throw new Error(`Invalid question data: ${label} must be an object.`);
        }
        if (typeof question.id !== "string" || question.id.trim() === "") {
            throw new Error(`Invalid question data: ${label} must have a non-empty string id.`);
        }
        const id = question.id.trim();
        if (ids.has(id)) {
            throw new Error(`Invalid question data: duplicate id "${question.id}".`);
        }
        ids.add(id);

        if (typeof question.question !== "string" || question.question.trim() === "") {
            throw new Error(`Invalid question data: question "${question.id}" needs non-empty question text.`);
        }
        if (!Array.isArray(question.answers) || question.answers.length !== 3
            || question.answers.some((answer) => typeof answer !== "string" || answer.trim() === "")) {
            throw new Error(`Invalid question data: question "${question.id}" must have exactly three non-empty answer strings.`);
        }
        if (!Number.isInteger(question.correctAnswer) || question.correctAnswer < 0 || question.correctAnswer > 2) {
            throw new Error(`Invalid question data: question "${question.id}" must have a correctAnswer index of 0, 1, or 2.`);
        }
    }

    return questions;
}

export function createQuestionQueue(questions, random = Math.random) {
    const pool = validateQuestions(questions);
    let queue = [];
    let lastQuestionId = null;

    function shuffleNextCycle() {
        queue = [...pool];
        for (let index = queue.length - 1; index > 0; index--) {
            const swapIndex = Math.floor(random() * (index + 1));
            [queue[index], queue[swapIndex]] = [queue[swapIndex], queue[index]];
        }

        // Avoid an identical question on the boundary between cycles when possible.
        if (queue.length > 1 && queue[queue.length - 1].id === lastQuestionId) {
            [queue[0], queue[queue.length - 1]] = [queue[queue.length - 1], queue[0]];
        }
    }

    return {
        next() {
            if (queue.length === 0) shuffleNextCycle();
            const question = queue.pop();
            lastQuestionId = question.id;
            return question;
        },
    };
}
