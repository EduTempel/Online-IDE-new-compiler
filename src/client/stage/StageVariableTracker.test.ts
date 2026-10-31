import { describe, expect, test } from "vitest";
// Ladereihenfolge der Compiler-Module wie in der IDE (sonst zyklische Importe)
import { Interpreter } from "../../compiler/common/interpreter/Interpreter";
import { JavaCompiler } from "../../compiler/java/JavaCompiler";
import { SchedulerState } from "../../compiler/common/interpreter/SchedulerState";
import { CompilerFile } from "../../compiler/common/module/CompilerFile";
import { JavaLibraryManager } from "../../compiler/java/runtime/JavaLibraryManager";
import { StoreOutputPrintManager } from "../../test/StoreOutputPrintManager";
import { StageVariableTracker, type Monitor } from "./StageVariableTracker";

async function setup(code: string, libraries: string[] = []) {
    const file = new CompilerFile();
    file.setText(code);
    const compiler = new JavaCompiler();
    const libManager = new JavaLibraryManager();
    libManager.addLibraries(...libraries);
    libManager.addLibrariesToCompiler(compiler);
    compiler.setFiles([<any>file]);
    const executable = await compiler.compileIfDirty();
    expect(executable!.getAllErrors().filter((e) => e.level == "error")).toEqual([]);
    const interpreter = new Interpreter(new StoreOutputPrintManager());
    interpreter.setExecutable(executable!);
    const history: Monitor[][] = [];
    const tracker = new StageVariableTracker(() => history.push(tracker.monitors));
    tracker.attach(interpreter);
    tracker.attach(interpreter);   // zweimal anhängen schadet nicht
    return { interpreter, tracker, history };
}

const show = (monitors: Monitor[]) => monitors.map((m) => `${m.name}: ${m.text}`);

/** Schritt für Schritt laufen lassen (wie in der IDE bei langsamer Geschwindigkeit) und nach jedem Schritt abfragen */
function runStepwise(interpreter: Interpreter, tracker: StageVariableTracker): string[][] {
    const seen: string[][] = [];
    interpreter.start();
    interpreter.scheduler.runsSynchronously = true;
    for (let i = 0; i < 200 && interpreter.scheduler.state == SchedulerState.running; i++) {
        interpreter.scheduler.run(1);
        tracker.poll(interpreter);
        seen.push(show(tracker.monitors));
    }
    return seen;
}

describe("Variablen auf der Bühne", () => {
    test("kurzes Programm (ohne Abfrage während des Laufs): am Ende alle Variablen mit Endwerten", async () => {
        const { interpreter, tracker } = await setup(`int punkte = 1;
String name = "Ball";
punkte = punkte + 5;
double tempo = 2.5;
boolean fertig = true;
`);
        interpreter.runMainProgramSynchronously();
        expect(show(tracker.monitors)).toEqual(["punkte: 6", 'name: "Ball"', "tempo: 2.5", "fertig: true"]);
    });

    test("Variablen nach einer Schleife und spät angelegte Variablen erscheinen", async () => {
        const { interpreter, tracker } = await setup(`int summe = 0;
for (int i = 1; i <= 4; i++) {
    summe = summe + i;
}
int spaet = summe * 2;
`);
        interpreter.runMainProgramSynchronously();
        expect(show(tracker.monitors)).toEqual(["summe: 10", "spaet: 20"]);
    });

    test("während des Laufs die schon angelegten Variablen, am Ende alle", async () => {
        const { interpreter, tracker } = await setup(`int a = 1;
a = 2;
int b = 3;
`);
        const seen = runStepwise(interpreter, tracker);
        expect(seen).toContainEqual(["a: 1"]);
        expect(seen).toContainEqual(["a: 2"]);
        // nie noch nicht angelegte Variablen mit Vorgabewerten
        expect(seen.flat()).not.toContain("b: 0");
        expect(show(tracker.monitors)).toEqual(["a: 2", "b: 3"]);
    });

    test("neuer Start leert die Anzeige (keine Werte vom letzten Lauf)", async () => {
        const { interpreter, tracker, history } = await setup(`int x = 7;
`);
        interpreter.runMainProgramSynchronously();
        expect(show(tracker.monitors)).toEqual(["x: 7"]);
        history.length = 0;
        interpreter.runMainProgramSynchronously();
        expect(history.map(show)).toContainEqual([]);
        expect(show(tracker.monitors)).toEqual(["x: 7"]);
    });

    test("neu übersetzen nach dem Lauf (z. B. Block verschoben): Endwerte bleiben stehen", async () => {
        const code = `ArrayList<Integer> liste = new ArrayList<Integer>();
liste.add(5);
int zahl = 3;
`;
        const { interpreter, tracker } = await setup(code);
        interpreter.runMainProgramSynchronously();
        expect(show(tracker.monitors)).toEqual(["liste: [5]", "zahl: 3"]);
        // die IDE übersetzt bei jeder Änderung neu; das meldet dem Interpreter "gestoppt"
        const file = new CompilerFile();
        file.setText(code + "\n");
        const compiler = new JavaCompiler();
        compiler.setFiles([<any>file]);
        interpreter.setExecutable((await compiler.compileIfDirty())!);
        expect(show(tracker.monitors)).toEqual(["liste: [5]", "zahl: 3"]);
    });

    test("Ausnahme: nur die Variablen bis zur Stelle des Fehlers", async () => {
        const { interpreter, tracker } = await setup(`int a = 1;
int[] zahlen = new int[2];
zahlen[5] = 3;
int danach = 9;
`);
        runStepwise(interpreter, tracker);
        expect(interpreter.scheduler.state).toBe(SchedulerState.error);
        expect(show(tracker.monitors)).toEqual(["a: 1", "zahlen: [0, 0]"]);
    });
});

describe("Listenanzeige: Positionen und Länge", () => {
    test("Liste, Reihung und dynamische Reihung: Elemente einzeln und Länge; nach clear leer", async () => {
        const { interpreter, tracker } = await setup(`ArrayList<Double> werte = new ArrayList<Double>();
werte.add(1.0);
werte.add(2.5);
char[] zeichen = {'a', 'b', 'c'};
DynArray d = new DynArray();
d.append("Ada");
ArrayList<String> leer = new ArrayList<String>();
leer.add("weg");
leer.clear();
int zahl = 4;
`, ["niedersachsen"]);
        interpreter.runMainProgramSynchronously();
        const byName = new Map(tracker.monitors.map((m) => [m.name, m]));
        expect(byName.get("werte")?.list).toEqual({ items: ["1.0", "2.5"], length: 2 });
        expect(byName.get("zeichen")?.list).toEqual({ items: ["'a'", "'b'", "'c'"], length: 3 });
        expect(byName.get("d")?.list).toEqual({ items: ['"Ada"'], length: 1 });
        expect(byName.get("leer")?.list).toEqual({ items: [], length: 0 });
        expect(byName.get("zahl")?.list).toBeUndefined();
    });

    test("lange Liste: höchstens 100 Elemente, Länge stimmt", async () => {
        const { interpreter, tracker } = await setup(`ArrayList<Integer> viele = new ArrayList<Integer>();
for (int i = 0; i < 150; i++) {
    viele.add(i);
}
`);
        interpreter.runMainProgramSynchronously();
        const list = tracker.monitors.find((m) => m.name === "viele")?.list;
        expect(list?.length).toBe(150);
        expect(list?.items.length).toBe(100);
        expect(list?.items[99]).toBe("99");
    });
});

describe("Gültigkeitsbereiche (Paket 16g)", () => {
    /** Bereiche in Reihenfolge: „Titel: a=1, b=2“ (innere Blöcke mit „  “ eingerückt) */
    const groups = (monitors: Monitor[]) => {
        const result = new Map<string, string[]>();
        for (const m of monitors) {
            const title = (m.scope?.inner ? "  " : "") + (m.scope?.title ?? "?");
            const key = (m.scope?.key ?? "?") + title;
            if (!result.has(key)) result.set(key, [title + ":"]);
            result.get(key)!.push(`${m.name}=${m.text}`);
        }
        return [...result.values()].map(([title, ...vars]) => `${title} ${vars.join(", ")}`);
    };
    function stepwiseGroups(interpreter: Interpreter, tracker: StageVariableTracker): string[][] {
        const seen: string[][] = [];
        interpreter.start();
        interpreter.scheduler.runsSynchronously = true;
        for (let i = 0; i < 400 && interpreter.scheduler.state == SchedulerState.running; i++) {
            interpreter.scheduler.run(1);
            tracker.poll(interpreter);
            seen.push(groups(tracker.monitors));
        }
        return seen;
    }
    const PROGRAM = [
        "int summe = 0;",
        "for (int i = 1; i <= 2; i++) {",
        "    int quadrat = i * i;",
        "    summe += zeige(quadrat);",
        "}",
        "int zeige(int wert) {",
        "    int doppelt = 2 * wert;",
        "    return doppelt;",
        "}"].join("\n") + "\n";
    const has = (seen: string[][], expected: string[]) => seen.some((s) => JSON.stringify(s) === JSON.stringify(expected));

    test("Hauptprogramm, Schleife und laufende Methode als eigene Bereiche; am Ende nur das Hauptprogramm", async () => {
        const { interpreter, tracker } = await setup(PROGRAM);
        const seen = stepwiseGroups(interpreter, tracker);
        expect(has(seen, ["Hauptprogramm: summe=0", "  in der for-Schleife (Zeile 2–5): i=1, quadrat=1"])).toBe(true);
        expect(has(seen, ["Hauptprogramm: summe=0", "  in der for-Schleife (Zeile 2–5): i=1, quadrat=1", "Methode zeige(): wert=1, doppelt=2"])).toBe(true);
        expect(groups(tracker.monitors)).toEqual(["Hauptprogramm: summe=10"]);
    });

    test("Blöcke: Namen der Blöcke statt Java-Wörtern", async () => {
        const { interpreter } = await setup(PROGRAM);
        const tracker = new StageVariableTracker(() => { }, () => undefined, () => "blocks");
        tracker.attach(interpreter);
        const seen = stepwiseGroups(interpreter, tracker);
        expect(has(seen, ["Hauptprogramm: summe=0", "  in „wiederhole für …“: i=1, quadrat=1", "Operation zeige: wert=1, doppelt=2"])).toBe(true);
    });

    test("Rekursion: jeder Aufruf hat seine eigenen Variablen", async () => {
        const { interpreter, tracker } = await setup([
            "int ergebnis = fak(3);",
            "int fak(int n) {",
            "    if (n <= 1) {",
            "        return 1;",
            "    }",
            "    return n * fak(n - 1);",
            "}"].join("\n") + "\n");
        const seen = stepwiseGroups(interpreter, tracker);
        expect(has(seen, ["Methode fak() – 1. Aufruf: n=3", "Methode fak() – 2. Aufruf: n=2", "Methode fak() – 3. Aufruf: n=1"])).toBe(true);
        expect(groups(tracker.monitors)).toEqual(["Hauptprogramm: ergebnis=6"]);
    });

    test("Methode einer Klasse und Konstruktor", async () => {
        const { interpreter, tracker } = await setup([
            "Konto k = new Konto(5);",
            "k.einzahlen(3);",
            "class Konto {",
            "    int stand;",
            "    Konto(int start) {",
            "        stand = start;",
            "    }",
            "    void einzahlen(int betrag) {",
            "        stand += betrag;",
            "    }",
            "}"].join("\n") + "\n");
        const titles = new Set(stepwiseGroups(interpreter, tracker).flat().map((g) => g.split(":")[0]));
        expect(titles).toContain("Konstruktor von Konto");
        expect(titles).toContain("Methode einzahlen() von Konto");
    });

    test("Programmteil (eigener Thread) als eigener Bereich", async () => {
        const { interpreter, tracker } = await setup([
            "int punkte = 0;",
            "",
            "@BeimStart",
            "void zaehlen() {",
            "    int schritt = 2;",
            "    for (int k = 0; k < 2; k++) {",
            "        punkte += schritt;",
            "    }",
            "}"].join("\n") + "\n");
        const seen = stepwiseGroups(interpreter, tracker).flat();
        expect(seen).toContain("Programmteil zaehlen() – @BeimStart: schritt=2");
        expect(seen.some((g) => g.startsWith("  in der for-Schleife (Zeile 6–8): k="))).toBe(true);
        const blocks = new StageVariableTracker(() => { }, () => undefined, () => "blocks");
        const again = await setup(["int punkte = 0;", "@BeimStart", "void zaehlen() {", "    int schritt = 2;", "    punkte += schritt;", "}"].join("\n") + "\n");
        blocks.attach(again.interpreter);
        expect(stepwiseGroups(again.interpreter, blocks).flat()).toContain("Programmteil „wenn das Programm startet“: schritt=2");
    });
});
