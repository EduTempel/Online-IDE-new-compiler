import { describe, expect, test } from "vitest";
import "../../compiler/common/interpreter/Interpreter";
import { CompilerFile } from "../../compiler/common/module/CompilerFile";
import { JavaCompiler } from "../../compiler/java/JavaCompiler";
import { JavaLibraryManager } from "../../compiler/java/runtime/JavaLibraryManager";
import { BLOCK_HANDBOOK } from "../handbook/HandbookBlocks";
import { JAVA_HANDBOOK } from "../handbook/HandbookJava";
import { mainVariableScopeRanges } from "../../compiler/java/monacoproviders/GsgScopeRanges";

/** Paket 16f: verständliche Meldungen zum Gültigkeitsbereich und zur Sichtbarkeit (Java) */

const lines = (...l: string[]) => l.join("\n") + "\n";

async function messages(code: string): Promise<{ line: number; level: string; text: string }[]> {
    const file = new CompilerFile();
    file.setText(code);
    const compiler = new JavaCompiler();
    new JavaLibraryManager().addLibrariesToCompiler(compiler);
    compiler.setFiles([<any>file]);
    const executable = await compiler.compileIfDirty();
    return (executable?.getAllErrors() ?? []).map((e) => ({ line: e.range.startLineNumber, level: e.level, text: e.message }));
}
const at = async (code: string, line: number) => (await messages(code)).filter((m) => m.line == line);

describe("Unbekannte Variable: wo gilt sie?", () => {
    test("in der for-Schleife angelegt, danach benutzt", async () => {
        const code = lines(
            "int summe = 0;",
            "for (int i = 1; i <= 3; i++) {",
            "    int quadrat = i * i;",
            "    summe += quadrat;",
            "}",
            "println(quadrat);",
            "println(i);");
        expect((await at(code, 6))[0].text).toBe("Die Variable quadrat gibt es hier nicht: Sie wurde in Zeile 3 in der for-Schleife angelegt und gilt nur dort (Zeile 2 bis 5). Soll sie auch hier gelten, lege sie vor diesem Block an.");
        expect((await at(code, 7))[0].text).toContain("Sie wurde in Zeile 2 als Zählvariable der for-Schleife angelegt");
    });

    test("im if-Zweig und in der while-Schleife", async () => {
        const code = lines(
            "int a = 3;",
            "if (a > 2) {",
            "    int b = 4;",
            "}",
            "while (a > 0) {",
            "    int c = a;",
            "    a--;",
            "}",
            "println(b + c);");
        const texts = (await at(code, 9)).map((m) => m.text);
        expect(texts.find((t) => t.includes(" b "))).toContain("im if-Zweig angelegt");
        expect(texts.find((t) => t.includes(" c "))).toContain("in der while-Schleife angelegt");
    });

    test("erst weiter unten angelegt", async () => {
        const code = lines("void zeige() {", "    println(x);", "    int x = 1;", "}", "zeige();");
        expect((await at(code, 2))[0].text).toBe("Die Variable x gibt es hier noch nicht: Sie wird erst in Zeile 3 angelegt. Eine Variable gilt erst ab der Stelle, an der sie angelegt wird.");
    });

    test("gehört zu einer anderen Methode bzw. einem Parameter", async () => {
        const code = lines(
            "zeige(3);",
            "",
            "void zeige(int wert) {",
            "    int doppelt = 2 * wert;",
            "    rechne();",
            "}",
            "",
            "void rechne() {",
            "    println(doppelt + wert);",
            "}");
        const texts = (await at(code, 9)).map((m) => m.text);
        expect(texts.find((t) => t.includes("doppelt"))).toBe("Die Variable doppelt gehört zur Methode zeige() (Zeile 4). Jede Methode hat ihre eigenen Variablen – übergib den Wert als Parameter oder lege hier eine eigene Variable an.");
        expect(texts.find((t) => t.includes("wert"))).toContain("gehört zur Methode zeige() (Zeile 3)");
    });

    test("Groß- und Kleinschreibung", async () => {
        const code = lines("int punkte = 0;", "println(Punkte);");
        expect((await at(code, 2))[0].text).toContain("Meinst du punkte?");
    });

    test("ganz unbekannt: Meldung bleibt", async () => {
        expect((await at(lines("println(gibtsnicht);"), 1))[0].text).toBe("Der Bezeichner gibtsnicht ist an dieser Stelle nicht definiert.");
    });
});

describe("Verdeckung und Selbstzuweisung", () => {
    const KONTO = lines(
        "Konto k = new Konto(5);",
        "",
        "class Konto {",
        "    private int kontostand;",
        "    private String name;",
        "",
        "    Konto(int kontostand) {",
        "        kontostand = kontostand;",
        "        String name = \"Ida\";",
        "    }",
        "",
        "    int getKontostand() {",
        "        return kontostand;",
        "    }",
        "}");

    test("name = name: Meinst du this.name = name?", async () => {
        const m = await at(KONTO, 8);
        expect(m).toEqual([{ line: 8, level: "warning", text: "kontostand = kontostand weist der Variablen ihren eigenen Wert zu – das Attribut kontostand ändert sich dadurch nicht. Meinst du this.kontostand = kontostand?" }]);
    });

    test("lokale Variable verdeckt Attribut", async () => {
        const m = (await at(KONTO, 9)).filter((x) => x.level == "warning");
        expect(m).toEqual([{ line: 9, level: "warning", text: "Die lokale Variable name verdeckt das Attribut name der Klasse Konto: Ohne this. ist ab hier immer die lokale Variable gemeint. Für das Attribut schreibe this.name." }]);
    });

    test("this.name = name bleibt ohne Warnung", async () => {
        const code = lines("Hund h = new Hund(\"Bello\");", "", "class Hund {", "    String name;", "    Hund(String name) {", "        this.name = name;", "    }", "}");
        expect(await messages(code)).toEqual([]);
    });

    test("private Attribut und private Methode von außen", async () => {
        const code = lines(
            "Konto k = new Konto();",
            "println(k.kontostand);",
            "k.pruefe();",
            "",
            "class Konto {",
            "    private int kontostand;",
            "    private void pruefe() { }",
            "}");
        expect((await at(code, 2))[0].text).toBe("Das Attribut kontostand ist private: Nur die Klasse Konto selbst kann es benutzen. Von außen geht das über eine Methode der Klasse (z. B. getKontostand()).");
        expect((await at(code, 3))[0].text).toBe("Die Methode pruefe ist private: Nur die Klasse Konto selbst kann sie aufrufen.");
    });
});

describe("Variablen des Hauptprogramms in Methoden (wie in echtem Java)", () => {
    test("Methode benutzt Variable des Hauptprogramms: eine Warnung je Methode und Variable", async () => {
        const code = lines(
            "int punkte = 0;",
            "zeige();",
            "",
            "void zeige() {",
            "    println(punkte);",
            "    punkte++;",
            "}");
        const m = (await messages(code)).filter((x) => x.level == "warning");
        expect(m).toEqual([{ line: 5, level: "warning", text: "punkte ist eine Variable des Hauptprogramms (Zeile 1). In echtem Java kennt die Methode zeige() sie nicht – jede Methode hat ihre eigenen Variablen. Übergib den Wert als Parameter und gib ein Ergebnis mit return zurück." }]);
    });

    test("Hauptprogramm, Programmteile und Klassen bleiben ohne Warnung", async () => {
        const code = lines(
            "int punkte = 0;",
            "punkte++;",
            "",
            "@WennTaste(\"a\")",
            "void taste() {",
            "    punkte++;",
            "}",
            "",
            "class Zaehler {",
            "    int punkte;",
            "    void erhoehe() {",
            "        punkte++;",
            "    }",
            "}");
        expect((await messages(code)).filter((x) => x.level == "warning")).toEqual([]);
    });
});

describe("Grüner Balken für Variablen des Hauptprogramms", () => {
    test("ab der Deklaration bis zur letzten Anweisung, ohne Methoden und Klassen, mit Programmteilen", async () => {
        const code = lines(
            "println(\"Start\");",          // 1
            "int punkte = 0;",                 // 2
            "zeige();",                        // 3
            "",                                // 4
            "void zeige() {",                  // 5
            "    println(1);",                 // 6
            "}",                               // 7
            "",                                // 8
            "punkte++;",                       // 9
            "",                                // 10
            "@WennTaste(\"a\")",              // 11
            "void taste() {",                  // 12
            "    punkte++;",                   // 13
            "}",                               // 14
            "",                                // 15
            "class Konto {",                   // 16
            "}");                              // 17
        const file = new CompilerFile();
        file.setText(code);
        const compiler = new JavaCompiler();
        new JavaLibraryManager().addLibrariesToCompiler(compiler);
        compiler.setFiles([<any>file]);
        const executable = await compiler.compileIfDirty();
        const module = (executable as any).moduleManager.getModuleFromFile(<any>file) as any;
        const ranges = mainVariableScopeRanges(module, 2).map((r) => `${r.startLineNumber}-${r.endLineNumber}`);
        expect(ranges).toEqual(["2-3", "9-9", "12-14"]);
    });
});

describe("Handbuch-Beispiele", () => {
    const entries = [...BLOCK_HANDBOOK, ...JAVA_HANDBOOK].flatMap((s) => s.entries.map((e) => ({ section: s.id, ...e })));
    test.each(entries.map((e) => [`${e.section}: ${e.title}`, e] as const))("%s: keine Warnung zu Verdeckung/Selbstzuweisung/Hauptprogramm", async (_, e) => {
        if (e.libs?.length) return;   // Beispiele mit Bibliotheken prüft Handbook.test.ts
        // Übung „Finde den Fehler“: die Lösung ohne Meldung, das fehlerhafte Programm mit
        const scopeMessage = /gibt es hier nicht|verdeckt|eigenen Wert zu|Variable des Hauptprogramms/;
        const warnings = (await messages(e.solution?.code ?? e.code)).filter((m) => scopeMessage.test(m.text));
        expect(warnings).toEqual([]);
        if (e.solution) expect((await messages(e.code)).filter((m) => scopeMessage.test(m.text)).length).toBeGreaterThan(0);
    });
});
