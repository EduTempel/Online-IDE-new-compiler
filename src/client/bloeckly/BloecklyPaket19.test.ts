import { afterEach, describe, expect, test } from "vitest";
// Ladereihenfolge der Compiler-Module wie in der IDE (sonst zyklische Importe)
import { Interpreter } from "../../compiler/common/interpreter/Interpreter";
import { JavaCompiler } from "../../compiler/java/JavaCompiler";
import { JavaLibraryManager } from "../../compiler/java/runtime/JavaLibraryManager";
import { CompilerFile } from "../../compiler/common/module/CompilerFile";
import { SchedulerState } from "../../compiler/common/interpreter/SchedulerState";
import { StoreOutputPrintManager } from "../../test/StoreOutputPrintManager";
import { BuehneClass } from "../../compiler/java/runtime/graphics/BuehneClass";
import { antwortAlsZahl } from "../../compiler/java/runtime/graphics/GsgFrage";
import { zurGrafik } from "../../compiler/java/runtime/graphics/GsgBuehnenLogik";
import { gsgClickListeners } from "../../compiler/common/interpreter/GsgParts";
import { farbeAlsZahl, farbeAus, farbeVerschoben } from "../../compiler/java/runtime/graphics/GsgMalstift";
import { figurQuelltext, hauptprogrammQuelltext } from "./BloecklyProjekt";
import { JavaBlockParser } from "../blocks/JavaBlockParser";
import { JavaBlockGenerator } from "../blocks/JavaBlockGenerator";
import { B, type BlockState } from "../blocks/BlockTypes";
import type { BloecklyContext } from "./BloecklySpec";
import { variablenDerKlasse, mitVariable } from "./BloecklyProjekt";

const CTX: BloecklyContext = { stage: "Spiel", globals: {} };

/** alle Blöcke (auch in Eingängen und Folgeblöcken) */
function alle(blocks: BlockState[]): BlockState[] {
    const result: BlockState[] = [];
    const visit = (b: BlockState | undefined) => {
        for (; b; b = b.next?.block) {
            result.push(b);
            for (const i of Object.values(b.inputs ?? {})) visit(i.block);
        }
    };
    blocks.forEach(visit);
    return result;
}

/** Java -> Blöcke -> Java: derselbe Text; liefert die Blöcke */
function rundweg(text: string, ctx = CTX): BlockState[] {
    const { state } = JavaBlockParser.parse(text, { bloeckly: ctx });
    const blocks = alle(state.blocks.blocks);
    expect(blocks.filter((b) => /^j_java_/.test(b.type)).map((b) => b.fields?.CODE ?? b.extraState?.code)).toEqual([]);
    expect(JavaBlockGenerator.generate(state, { bloeckly: ctx }).code).toBe(text);
    return blocks;
}

/** Paket 19: neue Blöcke von Blöckly – Laufzeit ohne Grafik */

function buehne(teile: string[] = []): string {
    return ["class Spiel extends Buehne {", "", "    Spiel() {", "        super(\"Schulhof\");", "    }", "", ...teile, "}", ""].join("\n");
}

/** Figur Kim (Pinguin) mit diesen Klassenteilen */
function kim(teile: string[]): string {
    return figurQuelltext({ klasse: "Kim", figur: "Pinguin", x: 10, y: 20 }).replace("\n}\n", "\n" + teile.join("\n") + "\n\n}\n");
}

async function compile(texts: string[]) {
    const files = texts.map((t, i) => {
        const f = new CompilerFile("Datei" + i);
        f.setText(t);
        return f;
    });
    const compiler = new JavaCompiler();
    new JavaLibraryManager().addLibrariesToCompiler(compiler);
    compiler.setFiles(files as never);
    const executable = await compiler.compileIfDirty();
    return { executable, errors: executable!.getAllErrors().filter((e) => e.level == "error").map((e) => `${e.message} (Zeile ${e.range.startLineNumber})`) };
}

let laufend: Interpreter | undefined;
let ausgabe: StoreOutputPrintManager | undefined;

/** das laufende Programm weiterlaufen lassen, bis die Ausgabe `bis` enthält (oder 2 s vergangen sind) */
async function weiter(bis: string): Promise<string> {
    const scheduler = laufend!.scheduler;
    const ende = Date.now() + 2000;
    while (Date.now() < ende && scheduler.state === SchedulerState.running && !ausgabe!.output.includes(bis)) {
        scheduler.runsSynchronously = true;
        try {
            scheduler.run(100);
        } finally {
            scheduler.runsSynchronously = false;
        }
        await new Promise((resolve) => setTimeout(resolve, 2));
    }
    return ausgabe!.output.trim();
}

/** Projekt starten und laufen lassen, bis die Ausgabe `bis` enthält (oder 2 s vergangen sind) */
async function laufe(figuren: Record<string, string>, stage = buehne(), bis = "ENDE"): Promise<string> {
    const run = await compile([hauptprogrammQuelltext("Spiel", Object.keys(figuren)), stage, ...Object.values(figuren)]);
    expect(run.errors).toEqual([]);
    const printManager = ausgabe = new StoreOutputPrintManager();
    const keyboard = new Proxy({}, { get: () => () => undefined });
    const interpreter = new Interpreter(printManager, undefined, undefined, keyboard as never);
    laufend = interpreter;
    interpreter.setExecutable(run.executable);
    interpreter.start();
    const scheduler = interpreter.scheduler;
    const ende = Date.now() + 2000;
    while (Date.now() < ende && scheduler.state === SchedulerState.running && !printManager.output.includes(bis)) {
        scheduler.runsSynchronously = true;
        try {
            scheduler.run(100);
        } finally {
            scheduler.runsSynchronously = false;
        }
        await new Promise((resolve) => setTimeout(resolve, 2));
    }
    return printManager.output.trim();
}

afterEach(() => {
    const s = laufend?.scheduler;
    if (s) for (const thread of s.getAllThreads()) s.killThread(thread);
    laufend = undefined;
    BuehneClass.testAntwort = undefined;
});

describe("19a frage … und warte / Antwort", () => {
    test("Antwort als Zahl: Komma und Punkt, sonst 0", () => {
        expect(antwortAlsZahl("3,5")).toBe(3.5);
        expect(antwortAlsZahl(" 12 ")).toBe(12);
        expect(antwortAlsZahl("zwölf")).toBe(0);
        expect(antwortAlsZahl("")).toBe(0);
    });

    test("Figur und Bühne fragen nacheinander, die Antwort gilt für alle", async () => {
        const fragen: string[] = [];
        let n = 0;
        BuehneClass.testAntwort = (frage) => {
            fragen.push(frage);
            return ["3,5", "Kim"][n++] ?? "";
        };
        const out = await laufe({
            Kim: kim([
                "    @BeimStart",
                "    void beimStart() {",
                "        frage(\"Zahl?\");",
                "        println(antwortAlsZahl() * 2 + \" \" + antwort());",
                "        Nachricht.sendeUndWarte(\"Name\");",
                "        println(antwort() + \" ENDE\");",
                "    }",
            ]),
        }, buehne([
            "    @WennNachricht(\"Name\")",
            "    void beiName() {",
            "        frage(\"Wie heißt du?\");",
            "    }",
            "",
        ]));
        expect(out).toBe("7 3,5\nKim ENDE");
        expect(fragen).toEqual(["Zahl?", "Wie heißt du?"]);
    });
});

describe("19c Datum und Uhrzeit", () => {
    test("Werte von jetzt, Wochentag 1 = Montag", async () => {
        const out = await laufe({
            Kim: kim([
                "    @BeimStart",
                "    void beimStart() {",
                "        println(aktuellesJahr() + \" \" + aktuellerMonat() + \" \" + aktuellerWochentag() + \" \" + aktuelleStunde() + \" \" + (tageSeit2000() > 9000) + \" ENDE\");",
                "    }",
            ]),
        });
        const [jahr, monat, wochentag, stunde, tage] = out.split(" ");
        const jetzt = new Date();
        expect(Number(jahr)).toBe(jetzt.getFullYear());
        expect(Number(monat)).toBe(jetzt.getMonth() + 1);
        expect(Number(wochentag)).toBe(jetzt.getDay() === 0 ? 7 : jetzt.getDay());
        expect(Number(stunde)).toBeGreaterThanOrEqual(0);
        expect(tage).toBe("true");
    });
});

describe("19b Werte anderer Figuren", () => {
    const skript = [
        "    @BeimStart",
        "    void beimStart() {",
        "        sage(figur(\"Pinguin\").xPosition());",
        "        sage(\"Kostüm: \" + figur(\"Pinguin\").kostuemName());",
        "        sage(((Pinguin) figur(\"Pinguin\")).punkte + 1);",
        "        sage(buehnenbildName());",
        "        println(figur(\"Pinguin\").xPosition() + \" \" + ((Pinguin) figur(\"Pinguin\")).punkte + \" \" + buehnenbildName() + \" ENDE\");",
        "    }",
    ];

    test("Java -> Blöcke -> Java: Figur und Bühne", () => {
        const blocks = rundweg(kim(skript));
        expect(blocks.filter((b) => b.type === B.blVon).map((b) => [b.fields!.ATTR, b.fields!.FIGUR])).toEqual([
            ["xPosition", "Pinguin"], ["kostuemName", "Pinguin"], ["v:punkte", "Pinguin"], ["@bild", "@buehne"],
            ["xPosition", "Pinguin"], ["v:punkte", "Pinguin"], ["@bild", "@buehne"],
        ]);
        const stage = rundweg(buehne(["    @WennAngeklickt", "    void wennAngeklickt() {", "        println(figur(\"Kim\").richtung());", "    }", ""]));
        expect(stage.filter((b) => b.type === B.blVon).map((b) => b.fields)).toEqual([{ ATTR: "richtung", FIGUR: "Kim" }]);
    });

    test("läuft: Werte des Originals, Variablen mit Typumwandlung, Bühnenbild", async () => {
        const pinguin = figurQuelltext({ klasse: "Pinguin", figur: "Pinguin", x: 100, y: 0 }).replace("\n}\n", "\n    int punkte = 7;\n\n}\n");
        const out = await laufe({ Kim: kim(skript), Pinguin: pinguin });
        expect(out).toBe("100 7 Schulhof ENDE");
    });
});

describe("19d Hüte: Bühnenbild und Stoppuhr", () => {
    const skripte = [
        "    @WennBuehnenbild(\"Wald\")",
        "    void wennBuehnenbildWald() {",
        "        println(\"Wald!\");",
        "    }",
        "",
        "    @WennStoppuhrUeber(0.2)",
        "    void wennStoppuhr() {",
        "        println(\"Zeit ENDE\");",
        "    }",
        "",
        "    @BeimStart",
        "    void beimStart() {",
        "        wechsleZuBuehnenbild(\"Wald\");",
        "    }",
    ];

    test("Java -> Blöcke -> Java", () => {
        const blocks = rundweg(kim(skripte));
        expect(blocks.filter((b) => b.type === B.blBackdrop || b.type === B.blTimer).map((b) => [b.type, b.fields, b.extraState])).toEqual([
            [B.blBackdrop, { BILD: "Wald" }, undefined], [B.blTimer, { SEK: "0.2" }, undefined],
        ]);
    });

    test("läuft: Bühnenbild-Wechsel und Stoppuhr starten die Skripte", async () => {
        const out = await laufe({ Kim: kim(skripte) });
        expect(out.split("\n")).toEqual(["Wald!", "Zeit ENDE"]);
    });
});

describe("19e Nachrichten mit Daten", () => {
    const kimSkripte = [
        "    @WennNachricht(\"Treffer\")",
        "    void beiTreffer(double wert) {",
        "        println(\"Treffer \" + wert * 2);",
        "    }",
        "",
        "    @WennNachricht(\"Name\")",
        "    void beiName(String wert) {",
        "        println(\"Name \" + wert);",
        "    }",
        "",
        "    @WennNachricht(\"Treffer\")",
        "    void beiTreffer2() {",
        "        println(\"auch ohne Wert\");",
        "    }",
        "",
        "    @BeimStart",
        "    void beimStart() {",
        "        Nachricht.sendeUndWarte(\"Treffer\", 10);",
        "        Nachricht.sendeUndWarte(\"Name\", \"Kim\");",
        "        Nachricht.sendeUndWarte(\"Treffer\");",
        "        println(\"ENDE\");",
        "    }",
    ];

    test("Java -> Blöcke -> Java: Hut mit Wert, Wert-Block, sende … mit …", () => {
        const blocks = rundweg(kim(kimSkripte));
        expect(blocks.filter((b) => b.type === B.blMsgData).map((b) => b.fields)).toEqual([{ MSG: "Treffer", TYPE: "double" }, { MSG: "Name", TYPE: "String" }]);
        expect(blocks.filter((b) => b.type === B.blWert).length).toBe(2);
        expect(blocks.filter((b) => b.type === B.blSendWithWait).map((b) => b.fields)).toEqual([{ MSG: "Treffer" }, { MSG: "Name" }]);
        expect(blocks.filter((b) => b.type === B.msgSendWait).length).toBe(1);
    });

    test("läuft: der Wert kommt an, ohne Wert 0", async () => {
        const out = await laufe({ Kim: kim(kimSkripte) });
        expect(out.split("\n").sort()).toEqual(["ENDE", "Name Kim", "Treffer 0", "Treffer 20", "auch ohne Wert", "auch ohne Wert"].sort());
    });
});

describe("19i Figuren ziehbar", () => {
    const skripte = [
        "    @WennAngeklickt",
        "    void wennAngeklickt() {",
        "        println(\"Klick \" + xPosition() + \" \" + yPosition());",
        "    }",
        "",
        "    @BeimStart",
        "    void beimStart() {",
        "        setzeZiehbar(true);",
        "        setzeZiehbar(false);",
        "        setzeZiehbar(true);",
        "        println(\"BEREIT\");",
        "    }",
    ];

    test("Java -> Blöcke -> Java", () => {
        const blocks = rundweg(kim(skripte));
        expect(blocks.filter((b) => b.type === "bl_ziehbar").map((b) => b.fields)).toEqual([{ WIE: "ja" }, { WIE: "nein" }, { WIE: "ja" }]);
    });

    test("läuft: Ziehen verschiebt die Figur ohne Klick, Klicken ohne Ziehen startet „wenn angeklickt“", async () => {
        await laufe({ Kim: kim(skripte) }, buehne(), "BEREIT");
        const maus = (kind: string | undefined, x: number, y: number) => {
            const p = zurGrafik(x, y);
            for (const l of gsgClickListeners) l(p.x, p.y, kind);
        };
        maus(undefined, 12, 22);           // Kim steht bei (10|20)
        maus("mousemove", 13, 22);         // Wackeln
        maus("mousemove", 62, 72);
        maus("mouseup", 62, 72);
        maus(undefined, 60, 70);
        maus("mouseup", 60, 70);
        const out = await weiter("Klick");
        expect(out.split("\n")).toEqual(["BEREIT", "Klick 60 70"]);
    });
});

describe("19g Malstift", () => {
    test("Farben: Namen, #rrggbb, Farbkreis", () => {
        expect(farbeAlsZahl(farbeAus("rot")!)).toBe(0xe60000);
        expect(farbeAlsZahl(farbeAus("Grün")!)).toBe(farbeAlsZahl(farbeAus("gruen")!));
        expect(farbeAlsZahl(farbeAus("#ff8800")!)).toBe(0xff8800);
        expect(farbeAus("pink")).toBeUndefined();
        expect(farbeVerschoben({ h: 350, s: 1, v: 1 }, 10).h).toBeCloseTo(26);
        expect(farbeVerschoben({ h: 10, s: 1, v: 1 }, -10).h).toBeCloseTo(334);
    });

    const skript = [
        "    @BeimStart",
        "    void beimStart() {",
        "        loescheAlles();",
        "        setzeStiftfarbe(\"grün\");",
        "        setzeStiftdicke(3);",
        "        aendereStiftdickeUm(-5);",
        "        aendereStiftfarbeUm(10);",
        "        stiftRunter();",
        "        gehe(10);",
        "        gehe(10);",
        "        stiftHoch();",
        "        gehe(10);",
        "        stempel();",
        "        erzeugeKlon();",
        "        println(\"ENDE\");",
        "    }",
        "",
        "    @WennIchAlsKlonEntstehe",
        "    void wennIchAlsKlonEntstehe() {",
        "        stiftRunter();",
        "        gehe(5);",
        "        println(\"KLON\");",
        "    }",
        "",
        "    @WennAngeklickt",
        "    void wennAngeklickt() {",
        "        stiftHoch();",
        "    }",
    ];

    test("Java -> Blöcke -> Java", () => {
        const blocks = rundweg(kim(skript));
        expect(blocks.filter((b) => b.type.startsWith("bl_stift") || b.type === "bl_stempel").map((b) => b.type)).toEqual([
            "bl_stift_loeschen", "bl_stift_farbe", "bl_stift_dicke", "bl_stift_dicke_um", "bl_stift_farbe_um", "bl_stift_runter", "bl_stift_hoch", "bl_stempel", "bl_stift_runter", "bl_stift_hoch",
        ]);
        expect(rundweg(buehne(["    @BeimStart", "    void beimStart() {", "        loescheAlles();", "    }", ""])).map((b) => b.type)).toContain("bl_stift_loeschen");
    });

    test("läuft: Linien nur mit abgesetztem Stift, Abdruck, Klon erbt den Stift", async () => {
        const out = await laufe({ Kim: kim(skript) }, buehne(), "KLON");
        expect(out.split("\n").sort()).toEqual(["ENDE", "KLON"]);
        // Punkt beim Absetzen + 2 Linien; der Klon: Punkt + 1 Linie
        const ebene = BuehneClass.von(laufend!)!.stiftEbene!;
        expect(ebene.linien).toBe(5);
        expect(ebene.abdruecke).toBe(1);
    });
});

describe("19f Listen", () => {
    const LISTEN = [
        "    static Liste<Double> zahlen = new Liste<>();",
        "    static Liste<String> namen = new Liste<>();",
        "",
    ];
    const CTX_L: BloecklyContext = { stage: "Spiel", globals: { zahlen: "Liste<Double>", namen: "Liste<String>" } };
    const skript = [
        "    @BeimStart",
        "    void beimStart() {",
        "        Spiel.zahlen.clear();",
        "        Spiel.zahlen.add(3);",
        "        Spiel.zahlen.add(7.5);",
        "        Spiel.zahlen.add(0, 1);",
        "        Spiel.zahlen.set(2, 9);",
        "        Spiel.zahlen.remove(0);",
        "        Spiel.namen.add(\"Kim\");",
        "        println(Spiel.zahlen.get(0) + Spiel.zahlen.size());",
        "        println(Spiel.zahlen.indexOf(9) + \" \" + Spiel.zahlen.indexOf(4));",
        "        if (Spiel.namen.contains(\"Kim\")) {",
        "            println(Spiel.namen.get(0));",
        "        }",
        "        println(\"ENDE\");",
        "    }",
    ];

    test("Listen im Kopf der Bühne: Variablen mit Java-Typ, neue Liste ohne Startwert", () => {
        // so schreibt der Generator die Bühne: Variablen vor dem Konstruktor
        const stage = ["class Spiel extends Buehne {", "", ...LISTEN, "    Spiel() {", "        super(\"Schulhof\");", "    }", "", "}", ""].join("\n");
        const blocks = rundweg(stage);
        expect(blocks.filter((b) => b.type === B.blList).map((b) => [b.fields?.NAME, b.fields?.TYPE, !!b.inputs?.VALUE])).toEqual([
            ["zahlen", "Liste<Double>", false], ["namen", "Liste<String>", false],
        ]);
        expect(variablenDerKlasse(stage, CTX)).toEqual({ zahlen: "Liste<Double>", namen: "Liste<String>" });
        expect(mitVariable(buehne(), "einkauf", "ArrayList<String>", CTX)).toContain("    static Liste<String> einkauf = new Liste<>();");
        // auch ältere Programme mit ArrayList werden zur Liste
        const kurz = JavaBlockParser.parse(buehne(["    static ArrayList<Double> z = new ArrayList<>();", ""]), { bloeckly: CTX }).state;
        expect(alle(kurz.blocks.blocks).find((b) => b.type === B.blList)?.fields?.TYPE).toBe("Liste<Double>");
    });

    test("Java -> Blöcke -> Java: Spiel.liste in einer Figur", () => {
        const blocks = rundweg(kim(skript), CTX_L);
        expect(blocks.filter((b) => b.type.startsWith("j_list")).map((b) => b.type)).toEqual([
            B.listClear, B.listAdd, B.listAdd, B.listInsert, B.listSet, B.listRemove, B.listAdd, B.listGet, B.listSize, B.listIndexOf, B.listIndexOf,
            B.listContains, B.listGet,
        ]);
    });

    test("läuft: Positionen ab 0, Position von, enthält", async () => {
        const out = await laufe({ Kim: kim(skript) }, buehne(LISTEN));
        expect(out.split("\n")).toEqual(["5", "1 -1", "Kim", "ENDE"]);
    });
});
