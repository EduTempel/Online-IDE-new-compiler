import { describe, expect, test } from "vitest";
// Ladereihenfolge der Compiler-Module wie in der IDE (sonst zyklische Importe)
import { Interpreter } from "../../compiler/common/interpreter/Interpreter";
import { SchedulerState } from "../../compiler/common/interpreter/SchedulerState";
import { JavaCompiler } from "../../compiler/java/JavaCompiler";
import { JavaLibraryManager } from "../../compiler/java/runtime/JavaLibraryManager";
import { CompilerFile } from "../../compiler/common/module/CompilerFile";
import { StoreOutputPrintManager } from "../../test/StoreOutputPrintManager";
import { StageVariableTracker } from "../stage/StageVariableTracker";

const lines = (...l: string[]) => l.join("\n") + "\n";

/** Programm übersetzen und starten; Tasten werden über keyParts.onKey simuliert */
async function start(code: string) {
    const file = new CompilerFile();
    file.setText(code);
    const compiler = new JavaCompiler();
    new JavaLibraryManager().addLibrariesToCompiler(compiler);
    compiler.setFiles([<any>file]);
    const executable = await compiler.compileIfDirty();
    const errors = executable!.getAllErrors().filter((e) => e.level == "error").map((e) => e.message);
    expect(errors).toEqual([]);
    const listeners: ((key: string) => void)[] = [];
    // Tastatur ohne Browser: nur das, was Interpreter und Programmteile brauchen
    const keyboard = new Proxy({ addKeyDownListener: (l: (key: string) => void) => listeners.push(l) }, {
        get: (target, prop) => (target as Record<string | symbol, unknown>)[prop] ?? (() => undefined),
    });
    const printManager = new StoreOutputPrintManager();
    const interpreter = new Interpreter(printManager, undefined, undefined, keyboard as never);
    interpreter.setExecutable(executable);
    interpreter.runMainProgramSynchronously();
    const press = (key: string) => {
        for (const l of listeners) l(key);
        interpreter.runREPLSynchronously();
    };
    return { interpreter, printManager, press, listeners };
}

describe("Programmteile „wenn Taste … gedrückt“ (@WennTaste)", () => {
    test("Taste startet den Programmteil, Variablen sind die des Hauptprogramms; das Programm wartet weiter", async () => {
        const { interpreter, printManager, press } = await start(lines(
            "int punkte = 0;",
            "println(\"Start\");",
            "",
            "@WennTaste(\"ArrowUp\")",
            "void hoch() {",
            "    punkte++;",
            "    println(\"hoch \" + punkte);",
            "}",
            "",
            "@WennTaste(\" \")",
            "void springen() {",
            "    println(\"springen\");",
            "}",
        ));
        expect(printManager.output).toBe("Start\n");
        expect(interpreter.scheduler.state).toBe(SchedulerState.running);   // wartet auf Tasten
        press("ArrowUp");
        press("arrowup");      // Groß/klein egal
        press(" ");
        press("x");            // keine Taste mit Programmteil
        expect(printManager.output).toBe("Start\nhoch 1\nhoch 2\nspringen\n");
    });

    test("ohne Anweisungen im Hauptprogramm startbar; doppelte Taste zählt nur einmal; Stopp beendet", async () => {
        const { interpreter, printManager, press } = await start(lines(
            "@WennTaste(\"a\")",
            "void erster() {",
            "    println(\"erster\");",
            "}",
            "",
            "@WennTaste(\"a\")",
            "void zweiter() {",
            "    println(\"zweiter\");",
            "}",
        ));
        press("a");
        expect(printManager.output).toBe("erster\n");
        interpreter.setState(SchedulerState.stopped);
        expect(interpreter.parts.isActive()).toBe(false);
    });

    test("läuft der Programmteil noch, zählt erneutes Drücken nicht", async () => {
        const { interpreter, printManager } = await start(lines(
            "@WennTaste(\"b\")",
            "void lang() {",
            "    println(\"los\");",
            "    Thread.sleep(100000);",
            "}",
        ));
        interpreter.parts.onKey("b");
        interpreter.runREPLSynchronously();
        interpreter.parts.onKey("b");
        interpreter.runREPLSynchronously();
        expect(printManager.output).toBe("los\n");
    });

    test("ohne Programmteile endet das Programm wie bisher", async () => {
        const { interpreter, printManager } = await start(lines("println(1);"));
        expect(printManager.output).toBe("1\n");
        expect(interpreter.scheduler.state).not.toBe(SchedulerState.running);
    });
});

describe("dieselbe Taste im Hauptprogramm („Taste … gedrückt“) und als Programmteil", () => {
    test("beide reagieren: das Hauptprogramm, solange die Taste unten ist; der Programmteil je Tastendruck", async () => {
        const file = new CompilerFile();
        file.setText(lines(
            "int haupt = 0;",
            "int teil = 0;",
            "while (true) {",
            "    if (Input.isKeyDown(\"ArrowUp\")) {",
            "        haupt++;",
            "    }",
            "}",
            "",
            "@WennTaste(\"ArrowUp\")",
            "void hoch() {",
            "    teil++;",
            "}",
        ));
        const compiler = new JavaCompiler();
        new JavaLibraryManager().addLibrariesToCompiler(compiler);
        compiler.setFiles([<any>file]);
        const executable = await compiler.compileIfDirty();
        expect(executable!.getAllErrors().filter((e) => e.level == "error")).toEqual([]);
        const listeners: ((key: string) => void)[] = [];
        let pressed = false;
        const keyboard = new Proxy({
            addKeyDownListener: (l: (key: string) => void) => listeners.push(l),
            isPressed: (key: string) => pressed && key.toLowerCase() === "arrowup",
        }, { get: (target, prop) => (target as Record<string | symbol, unknown>)[prop] ?? (() => undefined) });
        const interpreter = new Interpreter(new StoreOutputPrintManager(), undefined, undefined, keyboard as never);
        interpreter.setExecutable(executable!);
        interpreter.start();
        interpreter.scheduler.runsSynchronously = true;
        const steps = (n: number) => { for (let i = 0; i < n; i++) interpreter.scheduler.run(1); };
        // Werte der Variablen des Hauptprogramms wie im Reiter „Variablen“
        const tracker = new StageVariableTracker(() => undefined);
        const value = (name: string) => {
            tracker.poll(interpreter);
            return Number(tracker.monitors.find((m) => m.name === name)?.text);
        };

        steps(300);
        expect([value("haupt"), value("teil")]).toEqual([0, 0]);   // nichts gedrückt

        pressed = true;                                    // Taste runter: ein keydown-Ereignis
        for (const l of listeners) l("ArrowUp");
        steps(300);
        const hauptGedrueckt = value("haupt");
        expect(hauptGedrueckt).toBeGreaterThan(1);         // Hauptprogramm: bei jeder Abfrage, solange unten
        expect(value("teil")).toBe(1);                     // Programmteil: einmal

        for (const l of listeners) l("ArrowUp");           // gehalten: der Browser wiederholt keydown
        steps(300);
        expect(value("teil")).toBe(2);

        pressed = false;                                   // losgelassen
        steps(300);
        const hauptLos = value("haupt");
        steps(300);
        expect(value("haupt")).toBe(hauptLos);             // zählt nicht mehr weiter
        interpreter.setState(SchedulerState.stopped);
    });
});
