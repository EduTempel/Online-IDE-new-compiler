import { describe, expect, test } from "vitest";
// Ladereihenfolge der Compiler-Module wie in der IDE (sonst zyklische Importe)
import { Interpreter } from "../../compiler/common/interpreter/Interpreter";
import { JavaCompiler } from "../../compiler/java/JavaCompiler";
import { JavaLibraryManager } from "../../compiler/java/runtime/JavaLibraryManager";
import { CompilerFile } from "../../compiler/common/module/CompilerFile";
import { StoreOutputPrintManager } from "../../test/StoreOutputPrintManager";
import { partMethods } from "../../compiler/common/interpreter/GsgParts";

const NL = String.fromCharCode(10);
const lines = (...l: string[]) => l.join(NL) + NL;
const outputLines = (out: string) => out.split(NL).filter((l) => l !== "");

/** Programm übersetzen und synchron laufen lassen */
async function start(code: string) {
    const file = new CompilerFile();
    file.setText(code);
    const compiler = new JavaCompiler();
    new JavaLibraryManager().addLibrariesToCompiler(compiler);
    compiler.setFiles([<any>file]);
    const executable = await compiler.compileIfDirty();
    const errors = executable!.getAllErrors().filter((e) => e.level == "error").map((e) => e.message);
    expect(errors).toEqual([]);
    const keyboard = new Proxy({}, { get: () => () => undefined });
    const printManager = new StoreOutputPrintManager();
    const interpreter = new Interpreter(printManager, undefined, undefined, keyboard as never);
    interpreter.setExecutable(executable);
    interpreter.runMainProgramSynchronously();
    return { interpreter, printManager, executable: executable! };
}

describe("Programmteile mit Nachrichten und Programmstart (@WennNachricht, @BeimStart)", () => {
    test("sendeUndWarte startet alle Programmteile mit der Nachricht und wartet auf sie", async () => {
        const { printManager } = await start(lines(
            "println(\"A\");",
            "Nachricht.sendeUndWarte(\"hallo\");",
            "println(\"C\");",
            "",
            "@WennNachricht(\"hallo\")",
            "void eins() {",
            "    println(\"B1\");",
            "}",
            "",
            "@WennNachricht(\"hallo\")",
            "void zwei() {",
            "    for (int i = 0; i < 3; i++) {",
            "        println(\"B2\");",
            "    }",
            "}",
            "",
            "@WennNachricht(\"anders\")",
            "void nie() {",
            "    println(\"nie\");",
            "}",
        ));
        const out = outputLines(printManager.output);
        expect(out[0]).toBe("A");
        expect(out.at(-1)).toBe("C");
        expect(out.slice(1, -1).sort()).toEqual(["B1", "B2", "B2", "B2"]);
    });

    test("sende wartet nicht; Programmteile kennen die Variablen des Hauptprogramms", async () => {
        const { printManager } = await start(lines(
            "int zahl = 7;",
            "Nachricht.sende(\"los\");",
            "println(\"weiter\");",
            "",
            "@WennNachricht(\"los\")",
            "void los() {",
            "    println(\"los \" + zahl);",
            "}",
        ));
        expect(outputLines(printManager.output).sort()).toEqual(["los 7", "weiter"]);
    });

    test("Nachricht ohne Empfänger und sendeUndWarte an sich selbst laufen durch", async () => {
        const { printManager } = await start(lines(
            "Nachricht.sendeUndWarte(\"niemand\");",
            "Nachricht.sendeUndWarte(\"ping\");",
            "println(\"fertig\");",
            "",
            "@WennNachricht(\"ping\")",
            "void ping() {",
            "    Nachricht.sendeUndWarte(\"ping\");",
            "    println(\"ping\");",
            "}",
        ));
        expect(outputLines(printManager.output)).toEqual(["ping", "fertig"]);
    });

    test("„wenn das Programm startet“ beginnt, wenn das Hauptprogramm fertig ist (ohne Hauptprogramm sofort)", async () => {
        const a = await start(lines(
            "int zahl = 5;",
            "println(\"haupt\");",
            "",
            "@BeimStart",
            "void anfang() {",
            "    println(\"start \" + zahl);",
            "}",
        ));
        expect(outputLines(a.printManager.output)).toEqual(["haupt", "start 5"]);
        const b = await start(lines(
            "@BeimStart",
            "void anfang() {",
            "    println(\"allein\");",
            "}",
        ));
        expect(outputLines(b.printManager.output)).toEqual(["allein"]);
    });

    test("Programmteile werden erkannt: Taste (je Taste einmal), Nachricht, Klick, Start", async () => {
        const { executable } = await start(lines(
            "@WennTaste(\"a\") void a1() { }",
            "@WennTaste(\"A\") void a2() { }",
            "@WennNachricht(\"x\") void x1() { }",
            "@WennNachricht(\"x\") void x2() { }",
            "@WennAngeklickt(\"ball\") void klick() { }",
            "@BeimStart void los() { }",
            "@WennNachricht(\"y\") void mitParameter(int n) { }",
        ));
        const module = executable.getModuleManager().getModules()[0] as unknown as { getClassWithStartableMainMethod(): { getOwnMethods(): unknown[] } };
        const parts = partMethods(module.getClassWithStartableMainMethod()).map((p) => `${p.kind}:${p.trigger}:${p.method.identifier}`);
        expect(parts).toEqual(["key:a:a1", "message:x:x1", "message:x:x2", "click:ball:klick", "start::los"]);
    });
});
