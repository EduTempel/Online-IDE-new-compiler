import { afterEach, describe, expect, it } from "vitest";
import "../../compiler/common/interpreter/Interpreter";
import "../../compiler/java/JavaCompiler";
import { Thread } from "../../compiler/common/interpreter/Thread";
import { runJava } from "../blocks/RunJava";
import { cell, evaluate, makeRow, render, toTable, variableNames, type TraceRow } from "./TraceData";

async function trace(code: string, libraries: string[] = []): Promise<TraceRow[]> {
    const rows: TraceRow[] = [];
    Thread.gsgTraceListener = (_t, line, comment, names, values, self, floats) => rows.push(makeRow(line, comment, names, values, self, floats));
    const r = await runJava(code, libraries);
    expect(r.errors).toEqual([]);
    return rows;
}

afterEach(() => { Thread.gsgTraceListener = undefined; });

describe("Tracetabelle (Paket 10)", () => {
    it("trace() im Hauptprogramm mit Schleife und Reihung", async () => {
        const rows = await trace(`int[] zahlen = {3, 9, 2};
int max = zahlen[0];
for (int i = 1; i < zahlen.length; i++) {
    if (zahlen[i] > max) {
        max = zahlen[i];
    }
    trace("nach Vergleich");
}
trace();`);
        expect(rows.length).toBe(3);
        expect(rows[0].comment).toBe("nach Vergleich");
        expect(rows[0].line).toBe(7);
        expect(cell("i", rows[0]).text).toBe("1");
        expect(cell("max", rows[0]).text).toBe("9");
        expect(cell("zahlen[i]", rows[1]).text).toBe("2");
        expect(cell("zahlen", rows[2]).text).toBe("[3, 9, 2]");
        expect(cell("i", rows[2]).error).toBeTruthy();     // nach der Schleife unbekannt
        expect(variableNames(rows)).toEqual(["zahlen", "max", "i"]);
    });

    it("Momentaufnahme: spätere Änderungen wirken nicht zurück; Kommazahlen", async () => {
        const rows = await trace(`ArrayList<Integer> liste = new ArrayList<>();
double summe = 0;
for (int k = 1; k <= 3; k++) {
    liste.add(k * k);
    summe = summe + k;
    trace();
}`);
        expect(rows.map((r) => cell("liste", r).text)).toEqual(["[1]", "[1, 4]", "[1, 4, 9]"]);
        expect(cell("liste.size()", rows[2]).text).toBe("3");
        expect(cell("liste.get(1) + 1", rows[2]).text).toBe("5");
        expect(cell("summe", rows[0]).text).toBe("1.0");
    });

    it("in Methoden: Parameter, lokale Variablen und Attribute", async () => {
        const rows = await trace(`new Konto().einzahlen(50);
class Konto {
    private int stand = 10;
    private String inhaber = "Ada";
    void einzahlen(int betrag) {
        stand = stand + betrag;
        trace("eingezahlt");
    }
}`);
        expect(rows.length).toBe(1);
        expect(cell("betrag", rows[0]).text).toBe("50");
        expect(cell("stand", rows[0]).text).toBe("60");
        expect(cell("this.inhaber", rows[0]).text).toBe('"Ada"');
    });

    it("eigene Methode trace hat Vorrang", async () => {
        const rows = await trace(`trace();
void trace() { println("eigene"); }`);
        expect(rows.length).toBe(0);
    });

    it("Niedersachsen: Stack und Queue", async () => {
        const rows = await trace(`Stack s = new Stack();
s.push(1); s.push(2);
Queue q = new Queue();
q.enqueue("a"); q.enqueue("bc");
trace();`, ["niedersachsen"]);
        expect(cell("s", rows[0]).text).toBe("[2, 1]");
        expect(cell("s.top()", rows[0]).text).toBe("2");
        expect(cell("q", rows[0]).text).toBe('[\'a\', "bc"]');
    });

    it("Ausdrücke und Fehler", () => {
        const row = makeRow(1, undefined, ["a", "w"], [7, "Hallo"], undefined);
        expect(evaluate("a * 2 - 1", row)).toBe(13);
        expect(evaluate("a / 2", row)).toBe(3);
        expect(evaluate("w.length()", row)).toBe(5);
        expect(cell("b", row).error).toContain("nicht bekannt");
        expect(render(null)).toBe("null");
        expect(toTable([row], ["a", "w"], ";")).toBe('Nr.;Zeile;a;w\n1;1;7;"""Hallo"""');
    });
});
