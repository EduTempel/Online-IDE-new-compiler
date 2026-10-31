import { describe, expect, it } from "vitest";
import { Interpreter } from "../compiler/common/interpreter/Interpreter";
import { JavaCompiler } from "../compiler/java/JavaCompiler";
import { JavaLibraryManager } from "../compiler/java/runtime/JavaLibraryManager";
import { CompilerFile } from "../compiler/common/module/CompilerFile";

/** GSG: „int x = ;“ (Startwert fehlt) ist ein Fehler – bei lokalen Variablen, Attributen und im Hauptprogramm */
async function fehler(code: string): Promise<string[]> {
    void Interpreter;
    const file = new CompilerFile();
    file.setText(code);
    const compiler = new JavaCompiler();
    new JavaLibraryManager().addLibrariesToCompiler(compiler);
    compiler.setFiles([<any>file]);
    const executable = await compiler.compileIfDirty();
    return executable!.getAllErrors().filter((e) => e.level == "error").map((e) => e.message);
}

describe("Startwert nach = fehlt", () => {
    it("Hauptprogramm", async () => {
        expect(await fehler("int x = ;\nprintln(x);\n")).toEqual(["Nach dem = wird ein Wert erwartet (z. B. 0). Gefunden wurde: ;"]);
    });
    it("lokale Variable in einer Methode", async () => {
        const f = await fehler("class A {\n  void m() {\n    double d = ;\n  }\n}\n");
        expect(f).toContain("Nach dem = wird ein Wert erwartet (z. B. 0). Gefunden wurde: ;");
    });
    it("Attribut", async () => {
        const f = await fehler("class A {\n  int a = ;\n}\n");
        expect(f).toContain("Nach dem = wird ein Wert erwartet (z. B. 0). Gefunden wurde: ;");
    });
    it("mit Wert: kein Fehler", async () => {
        expect(await fehler("int x = 3;\nclass A {\n  int a = 1;\n  static int s = 2;\n}\n")).toEqual([]);
    });
});
