import { describe, expect, test } from "vitest";
// Ladereihenfolge der Compiler-Module wie in der IDE (sonst zyklische Importe)
import { Interpreter } from "../../compiler/common/interpreter/Interpreter";
import { JavaCompiler } from "../../compiler/java/JavaCompiler";
import { SchedulerState } from "../../compiler/common/interpreter/SchedulerState";
import { CompilerFile } from "../../compiler/common/module/CompilerFile";
import { StoreOutputPrintManager } from "../../test/StoreOutputPrintManager";
import { StageVariableTracker, type Monitor } from "./StageVariableTracker";

async function setup(code: string) {
    const file = new CompilerFile();
    file.setText(code);
    const compiler = new JavaCompiler();
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
