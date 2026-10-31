import { describe, expect, test } from "vitest";
// Ladereihenfolge der Compiler-Module wie in der IDE (sonst zyklische Importe)
import { Interpreter } from "../../compiler/common/interpreter/Interpreter";
import { JavaCompiler } from "../../compiler/java/JavaCompiler";
import { JavaLibraryManager } from "../../compiler/java/runtime/JavaLibraryManager";
import { CompilerFile } from "../../compiler/common/module/CompilerFile";
import { StoreOutputPrintManager } from "../../test/StoreOutputPrintManager";
import {
    BUEHNEN_DATEI, buehnenQuelltext, figurQuelltext, freierName, HAUPTPROGRAMM, hauptprogrammQuelltext, klassenname,
    liesBuehne, liesFigur, liesHauptprogramm, liesProjekt, mitBuehnenbild, mitFigur, mitStart, namensFehler, umbenannt,
    globaleStellen, globaleUmbenannt, mitVariable, ohneVariable, variablenDerKlasse,
} from "./BloecklyProjekt";

/** Paket 18d: Projektdateien von Blöckly */

const datei = (name: string, text: string) => ({ name, getText: () => text });

describe("Blöckly-Projekt: Dateien erzeugen und lesen", () => {
    test("Figur, Bühne und Hauptprogramm hin und zurück", () => {
        const figur = figurQuelltext({ klasse: "Waschbär", figur: "Waschbaer", x: -100.4, y: 20 });
        expect(figur).toContain('super("Waschbaer", -100, 20);');
        expect(liesFigur(figur)).toEqual({ klasse: "Waschbär", figur: "Waschbaer", x: -100, y: 20 });
        expect(liesBuehne(buehnenQuelltext("Schulhof"))).toEqual({ klasse: "Spiel", bild: "Schulhof" });
        expect(liesBuehne(buehnenQuelltext(""))).toEqual({ klasse: "Spiel", bild: "" });
        const haupt = hauptprogrammQuelltext("Spiel", ["Waschbär", "RoterPanda"]);
        expect(liesHauptprogramm(haupt)).toEqual(["Spiel", "Waschbär", "RoterPanda"]);
        // ohne Startposition (von Hand geschrieben): Mitte
        expect(liesFigur("class Kim extends Figur { Kim() { super(\"Pinguin\"); } }")).toEqual({ klasse: "Kim", figur: "Pinguin", x: 0, y: 0 });
        expect(liesFigur("class Kim extends Object { }")).toBeUndefined();
    });

    test("Startposition, Aussehen und Bühnenbild ändern, ohne den Rest anzufassen", () => {
        const figur = figurQuelltext({ klasse: "Pinguin", figur: "Pinguin", x: 0, y: 0 }).replace("\n}\n", "    @BeimStart\n    void los() {\n        gehe(10);\n    }\n}\n");
        const neu = mitStart(figur, 120.7, -45);
        expect(neu).toContain('super("Pinguin", 121, -45);');
        expect(neu).toContain("gehe(10);");
        expect(mitFigur(neu, "Roboter")).toContain('super("Roboter", 121, -45);');
        expect(mitFigur("super(\"Pinguin\");", "Axolotl")).toBe("super(\"Axolotl\");");
        expect(liesBuehne(mitBuehnenbild(buehnenQuelltext("Wiese"), "Weltraum"))?.bild).toBe("Weltraum");
    });

    test("Umbenennen: Bezeichner und Zeichenketten, nicht Teile anderer Namen", () => {
        const text = [
            "class Waschbär extends Figur {",
            "    Waschbär() { super(\"Waschbaer\", 0, 0); }",
            "    Waschbär2 freund;",
            "    @BeimStart void los() { if (beruehrt(\"Waschbär\")) { sage(\"Waschbär!\"); } }",
            "}",
        ].join("\n");
        const neu = umbenannt(text, "Waschbär", "Flitzi");
        expect(neu).toContain("class Flitzi extends Figur");
        expect(neu).toContain("Flitzi() { super(\"Waschbaer\", 0, 0); }");
        expect(neu).toContain("Waschbär2 freund;");
        expect(neu).toContain("beruehrt(\"Flitzi\")");
        expect(neu).toContain("sage(\"Waschbär!\")");     // Text in Sätzen bleibt
        // Klasse heißt wie die Bibliotheksfigur: das Aussehen bleibt
        const panda = umbenannt(figurQuelltext({ klasse: "RoterPanda", figur: "RoterPanda", x: 1, y: 2 }), "RoterPanda", "Flitzi");
        expect(panda).toContain("class Flitzi extends Figur");
        expect(panda).toContain('super("RoterPanda", 1, 2);');
        expect(umbenannt(hauptprogrammQuelltext("Spiel", ["Waschbär", "Waschbär2"]), "Waschbär", "Flitzi"))
            .toContain("new Flitzi();\nnew Waschbär2();");
    });

    test("Namen prüfen und freie Namen finden", () => {
        expect(namensFehler("Flitzi", ["Waschbär"])).toBeUndefined();
        expect(namensFehler("Grüne Katze", [])).toMatch(/Leerzeichen/);
        expect(namensFehler("2Katzen", [])).toMatch(/Buchstaben/);
        expect(namensFehler("class", [])).toMatch(/Wort von Java/);
        expect(namensFehler("Figur", [])).toMatch(/vergeben/);
        expect(namensFehler("waschbär", ["Waschbär"])).toMatch(/gibt es schon/);
        expect(freierName("Waschbär", ["Waschbär", "Waschbär2"])).toBe("Waschbär3");
        expect(freierName("Pinguin", ["Waschbär"])).toBe("Pinguin");
        expect(klassenname("Roter Panda")).toBe("RoterPanda");
        expect(klassenname("Waschbär")).toBe("Waschbär");
    });

    test("Projekt lesen: Figuren in der Reihenfolge des Hauptprogramms", () => {
        const p = liesProjekt([
            datei("Pinguin", figurQuelltext({ klasse: "Pinguin", figur: "Pinguin", x: 10, y: 0 })),
            datei(BUEHNEN_DATEI, buehnenQuelltext("Wald")),
            datei("Waschbär", figurQuelltext({ klasse: "Waschbär", figur: "Waschbaer", x: 0, y: 0 })),
            datei("Notizen.struktogramm", "{}"),
            datei("Neu", figurQuelltext({ klasse: "Neu", figur: "Roboter", x: 0, y: 0 })),
            datei(HAUPTPROGRAMM, hauptprogrammQuelltext("Spiel", ["Waschbär", "Pinguin"])),
        ]);
        expect(p.haupt?.name).toBe(HAUPTPROGRAMM);
        expect(p.buehne?.info).toEqual({ klasse: "Spiel", bild: "Wald" });
        expect(p.figuren.map((f) => f.info.klasse)).toEqual(["Waschbär", "Pinguin", "Neu"]);
    });

    test("die erzeugten Dateien sind ein lauffähiges Java-Programm", async () => {
        const texte = [
            hauptprogrammQuelltext("Spiel", ["Waschbär", "RoterPanda"]),
            buehnenQuelltext("Schulhof").replace("\n}\n", "    @BeimStart\n    void los() {\n        println(buehnenbildName());\n    }\n}\n"),
            figurQuelltext({ klasse: "Waschbär", figur: "Waschbaer", x: -100, y: 30 })
                .replace("\n}\n", "    @BeimStart\n    void los() {\n        println(\"Waschbär \" + xPosition() + \" \" + yPosition() + \" \" + beruehrt(\"RoterPanda\"));\n    }\n}\n"),
            figurQuelltext({ klasse: "RoterPanda", figur: "RoterPanda", x: 150, y: -60 }),
        ];
        const files = texte.map((t, i) => {
            const f = new CompilerFile("Datei" + i);
            f.setText(t);
            return f;
        });
        const compiler = new JavaCompiler();
        new JavaLibraryManager().addLibrariesToCompiler(compiler);
        compiler.setFiles(files as never);
        const executable = await compiler.compileIfDirty();
        expect(executable!.getAllErrors().filter((e) => e.level == "error").map((e) => e.message)).toEqual([]);
        const printManager = new StoreOutputPrintManager();
        const keyboard = new Proxy({}, { get: () => () => undefined });
        const interpreter = new Interpreter(printManager, undefined, undefined, keyboard as never);
        interpreter.setExecutable(executable);
        interpreter.runMainProgramSynchronously();
        expect(printManager.output.split("\n").filter((l) => l).sort()).toEqual(["Schulhof", "Waschbär -100 30 false"]);
    });
});

describe("Variablen für alle Figuren umbenennen und löschen", () => {
    const ctx = { stage: "Spiel", globals: {} };
    const buehne = [
        "class Spiel extends Buehne {",
        "",
        "    static int punkte = 0;",
        "    static int leben = 3;",
        "",
        "    Spiel() {",
        "        super(\"Wiese\");",
        "    }",
        "",
        "    @BeimStart",
        "    void beimStart() {",
        "        punkte = 0;",
        "        Spiel.punkte = punkte + 1;",
        "        println(\"punkte\"); // punkte",
        "    }",
        "",
        "}",
        "",
    ].join("\n");
    const figur = [
        "class Waschbär extends Figur {",
        "    int punkte2 = 0;",
        "    Waschbär() { super(\"Waschbaer\", 0, 0); }",
        "    @WennAngeklickt",
        "    void wennAngeklickt() {",
        "        Spiel.punkte = Spiel.punkte + 1;",
        "        sage(\"Spiel.punkte\", 1);",
        "        punkte2 = Spiel.leben;",
        "    }",
        "}",
        "",
    ].join("\n");

    test("umbenennen: Bühne mit Deklaration, Figuren nur Spiel.name; Texte und Kommentare bleiben", () => {
        const b = globaleUmbenannt(buehne, "Spiel", "punkte", "score", true);
        expect(b).toContain("static int score = 0;");
        expect(b).toContain("        score = 0;");
        expect(b).toContain("Spiel.score = score + 1;");
        expect(b).toContain("println(\"punkte\"); // punkte");
        expect(variablenDerKlasse(b, ctx)).toEqual({ score: "int", leben: "int" });
        const f = globaleUmbenannt(figur, "Spiel", "punkte", "score", false);
        expect(f).toContain("Spiel.score = Spiel.score + 1;");
        expect(f).toContain("int punkte2 = 0;");
        expect(f).toContain("sage(\"Spiel.punkte\", 1);");
    });

    test("Stellen zählen (in der Bühne mit Deklaration)", () => {
        expect(globaleStellen(buehne, "Spiel", "punkte", true)).toBe(4);
        expect(globaleStellen(buehne, "Spiel", "leben", true)).toBe(1);
        expect(globaleStellen(figur, "Spiel", "punkte", false)).toBe(2);
        expect(globaleStellen(figur, "Spiel", "leben", false)).toBe(1);
    });

    test("löschen: Variable verschwindet aus dem Kopf der Bühne", () => {
        expect(variablenDerKlasse(ohneVariable(buehne, "leben", ctx), ctx)).toEqual({ punkte: "int" });
        expect(variablenDerKlasse(ohneVariable(buehne, "punkte", ctx), ctx)).toEqual({ leben: "int" });
        const eine = mitVariable(buehnenQuelltext("Wiese"), "zeit", "double", ctx);
        expect(variablenDerKlasse(eine, ctx)).toEqual({ zeit: "double" });
        expect(variablenDerKlasse(ohneVariable(eine, "zeit", ctx), ctx)).toEqual({});
        expect(ohneVariable(buehne, "gibtsnicht", ctx)).toBe(buehne);
    });
});
