import { describe, expect, it } from "vitest";
import {
    ANSWERS_KEY, answersOf, cleanPrimm, commitPrediction, predictionText, progress, startAllowed, storeAnswers,
    tallyChoices, tallyTexts, type PrimmTask,
} from "./Primm";

const task: PrimmTask = {
    id: "t1", predict: "Was steht am Ende in der Konsole?", choices: ["10", "11", "0"],
    investigate: ["Wie oft läuft die Schleife?", "Welchen Wert hat i am Ende?"], modify: ["Zähle bis 20."], make: "Schreibe ein eigenes Programm.",
};

describe("PRIMM – Erst vermuten, dann ausführen", () => {
    it("Aufgabe bereinigen: ohne id oder Frage kein PRIMM, leere Einträge fallen weg", () => {
        expect(cleanPrimm(undefined)).toBeUndefined();
        expect(cleanPrimm({ id: "x", predict: "  " })).toBeUndefined();
        expect(cleanPrimm({ id: "x", predict: "Was passiert?", choices: ["a", " ", "b"], investigate: "kaputt", modify: ["", "m"] }))
            .toEqual({ id: "x", predict: "Was passiert?", choices: ["a", "b"], investigate: [], modify: ["m"], make: "" });
    });

    it("Antworten gehören zur Aufgabe: andere id oder kaputte Daten ergeben leere Antworten", () => {
        expect(answersOf({}, task)).toMatchObject({ taskId: "t1", predict: "", investigate: ["", ""], modified: [false], made: false });
        expect(answersOf({ [ANSWERS_KEY]: { taskId: "anders", predict: "x" } }, task).predict).toBe("");
        const a = answersOf({ [ANSWERS_KEY]: { taskId: "t1", predict: "weil", choice: 7, ranAt: "2026-01-01", investigate: ["3"], modified: [true, true] } }, task);
        // ungültige Wahl und Ausführen ohne Vermutung werden verworfen; Listen passen sich an die Aufgabe an
        expect(a).toMatchObject({ predict: "weil", investigate: ["3", ""], modified: [true] });
        expect(a.choice).toBeUndefined();
        expect(a.ranAt).toBeUndefined();
    });

    it("Start erst nach festgehaltener Vermutung; danach ist sie fest", () => {
        const a = answersOf({}, task);
        expect(startAllowed(a)).toBe(false);
        expect(commitPrediction(task, a)).toBe(false);            // keine Antwort gewählt
        a.choice = 1;
        a.predict = "weil i bei 0 anfängt";
        expect(commitPrediction(task, a, new Date("2026-10-29T10:00:00Z"))).toBe(true);
        expect(commitPrediction(task, a)).toBe(false);            // nur einmal
        expect(startAllowed(a, new Date("2026-10-29T10:01:00Z"))).toBe("first");
        expect(startAllowed(a)).toBe("again");
        expect(a).toMatchObject({ predictedAt: "2026-10-29T10:00:00.000Z", ranAt: "2026-10-29T10:01:00.000Z" });
        expect(predictionText(task, a)).toBe("11 – weil i bei 0 anfängt");

        const settings: Record<string, unknown> = {};
        storeAnswers(settings, a);
        expect(answersOf(JSON.parse(JSON.stringify(settings)), task)).toEqual(a);
    });

    it("freie Vermutung braucht Text", () => {
        const free = { ...task, choices: [] };
        const a = answersOf({}, free);
        a.predict = "   ";
        expect(commitPrediction(free, a)).toBe(false);
        a.predict = "Es zählt bis 10.";
        expect(commitPrediction(free, a)).toBe(true);
        expect(predictionText(free, a)).toBe("Es zählt bis 10.");
        expect(progress(free, a)).toMatchObject({ predicted: true, ran: false, investigated: 0, total: { investigate: 2, modify: 1 } });
    });

    it("Übersicht: gleiche Antworten zusammengefasst, Auswahl mit allen Möglichkeiten", () => {
        expect(tallyTexts(["Es zählt bis 10.", "es zählt  bis 10", "", "Nichts"])).toEqual([
            { label: "Es zählt bis 10.", count: 2 }, { label: "Nichts", count: 1 }]);
        const answers = [1, 1, 0, undefined].map((choice) => {
            const a = answersOf({}, task);
            a.choice = choice;
            if (choice !== undefined) a.predictedAt = "x";
            return a;
        });
        expect(tallyChoices(task, answers)).toEqual([{ label: "10", count: 1 }, { label: "11", count: 2 }, { label: "0", count: 0 }]);
    });
});
