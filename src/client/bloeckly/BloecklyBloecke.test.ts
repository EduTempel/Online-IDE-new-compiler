import { describe, expect, test } from "vitest";
// Ladereihenfolge der Compiler-Module wie in der IDE (sonst zyklische Importe)
import { Interpreter } from "../../compiler/common/interpreter/Interpreter";
import { JavaCompiler } from "../../compiler/java/JavaCompiler";
import { JavaLibraryManager } from "../../compiler/java/runtime/JavaLibraryManager";
import { CompilerFile } from "../../compiler/common/module/CompilerFile";
import { StoreOutputPrintManager } from "../../test/StoreOutputPrintManager";
import { B, type BlockState } from "../blocks/BlockTypes";
import { JavaBlockGenerator } from "../blocks/JavaBlockGenerator";
import { JavaBlockParser } from "../blocks/JavaBlockParser";
import { availableFor, BL_BLOCKS, formAvailable, parsedForm, type BlBlock, type BlForm, type BloecklyContext } from "./BloecklySpec";
import { buehnenQuelltext, figurQuelltext, hauptprogrammQuelltext } from "./BloecklyProjekt";
import { bloecklyPuzzleLine, checkPuzzle, scramble } from "../blocks/BlockPuzzle";
import { bloecklyVariablen, skriptTitel } from "./BloecklyVariablen";
import { SchedulerState } from "../../compiler/common/interpreter/SchedulerState";

/** Paket 18e: Blöcke von Blöckly – Java -> Blöcke -> Java für jeden Block und jede Form */

const CTX: BloecklyContext = { stage: "Spiel", globals: { leben: "int", name: "String" } };

/** Beispielwert für einen Platzhalter der Form */
function sample(spec: BlBlock, form: BlForm, name: string): string {
    const when = form.when?.[name];
    const arg = spec.args.find((a) => a.name === name)!;
    if (arg.kind !== "choice") return arg.kind === "num" ? "5" : '"Hi"';
    if (when) throw new Error("Platzhalter mit fester Auswahl");
    const values: Record<string, string> = { figuren: "Pinguin", kostueme: "laufen 1", buehnenbilder: "Wald", tasten: "a" };
    return JSON.stringify(arg.source ? values[arg.source] : arg.options!.find((o) => !o[1].startsWith("@"))![1]);
}

/** alle Formen aller Blöcke als Java-Zeilen (Einrückung wie im Skript); Werte stecken in sage(…) bzw. if (…) */
function allForms(stage: boolean): { lines: string[]; types: string[] } {
    const lines: string[] = [], types: string[] = [];
    for (const spec of BL_BLOCKS) {
        if (!availableFor(spec, stage)) continue;
        for (const form of spec.forms) {
            if (!formAvailable(spec, form, stage)) continue;
            const p = parsedForm(form);
            const call = `${p.method}(${p.params.map((n) => sample(spec, form, n)).join(", ")})`;
            types.push(spec.type);
            if (!spec.output) lines.push(`        ${call};`);
            else if (spec.output === "boolean") lines.push(`        if (${call}) {`, "            stoppeAlles();", "        }");
            else if (stage) lines.push(`        leben = (int) ${call === "buehnenbildName()" ? call + ".length()" : call};`);
            else lines.push(`        sage(${call});`);
        }
    }
    return { lines, types };
}

function figurMitSkripten(body: string[]): string {
    return [
        "class Waschbär extends Figur {",
        "",
        "    int punkte = 0;",
        "    String ruf = \"Hallo\";",
        "",
        "    Waschbär() {",
        "        super(\"Waschbaer\", -100, 20);",
        "    }",
        "",
        "    @BeimStart",
        "    void beimStart() {",
        ...body,
        "    }",
        "",
        "    @WennTaste(\" \")",
        "    void wennLeertaste() {",
        "        Spiel.leben--;",
        "        Spiel.leben = Spiel.leben + punkte;",
        "        Spiel.name = ruf + Spiel.leben;",
        "        punkte += 2;",
        "    }",
        "",
        "    @WennAngeklickt",
        "    void wennAngeklickt() {",
        "        erzeugeKlon();",
        "    }",
        "",
        "    @WennNachricht(\"Tor!\")",
        "    void beiTor() {",
        "        springe(10);",
        "    }",
        "",
        "    @WennIchAlsKlonEntstehe",
        "    void alsKlon() {",
        "        wechsleZuKostuem(\"winken\");",
        "    }",
        "",
        "    @BeimStart",
        "    void beimStart2() {",
        "        Nachricht.sende(\"Tor!\");",
        "    }",
        "",
        "    @BeimStart",
        "    void losGehts() {",
        "        warte(0.5);",
        "    }",
        "",
        "    void springe(double hoehe) {",
        "        aendereYUm(hoehe);",
        "        aendereYUm(0 - hoehe);",
        "    }",
        "",
        "}",
        "",
    ].join("\n");
}

function buehne(body: string[]): string {
    return [
        "class Spiel extends Buehne {",
        "",
        "    static int leben = 3;",
        "    static String name = \"\";",
        "",
        "    Spiel() {",
        "        super(\"Schulhof\");",
        "    }",
        "",
        "    @WennAngeklickt",
        "    void wennAngeklickt() {",
        ...body,
        "    }",
        "",
        "}",
        "",
    ].join("\n");
}

/** alle Blöcke (auch in Eingängen und Folgeblöcken) */
function allBlocks(blocks: BlockState[]): BlockState[] {
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

const JAVA_BLOCKS: string[] = [B.javaRaw, B.javaStatement, B.javaExpression];

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
    const line = (n: number) => texts.map((t) => t.split("\n")[n - 1] ?? "").join(" | ");
    return { executable, errors: executable!.getAllErrors().filter((e) => e.level == "error").map((e) => `${e.message} (Zeile ${e.range.startLineNumber}: ${line(e.range.startLineNumber)})`) };
}

describe("Blöckly: Java -> Blöcke -> Java", () => {
    test("jeder Block einer Figur wird erkannt und genauso zurückgeschrieben", () => {
        const { lines, types } = allForms(false);
        const text = figurMitSkripten(lines);
        const { state } = JavaBlockParser.parse(text, { bloeckly: CTX });
        const blocks = allBlocks(state.blocks.blocks);
        expect(blocks.filter((b) => JAVA_BLOCKS.includes(b.type)).map((b) => b.fields?.CODE ?? b.extraState?.code)).toEqual([]);
        const found = new Set(blocks.map((b) => b.type));
        expect(types.filter((t) => !found.has(t))).toEqual([]);
        expect(JavaBlockGenerator.generate(state, { bloeckly: CTX }).code).toBe(text);
    });

    test("Kopf, Skripte und eigene Blöcke", () => {
        const { state } = JavaBlockParser.parse(figurMitSkripten(["        gehe(10);"]), { bloeckly: CTX });
        const top = state.blocks.blocks;
        expect(top.map((b) => b.type)).toEqual([B.blFigure, B.blFlag, B.blKey, B.blClick, B.blMsg, B.blClone, B.blFlag, B.blFlag, B.method]);
        const header = top[0];
        expect(header.id).toBe("start");
        expect(header.extraState).toMatchObject({ klasse: "Waschbär", oberklasse: "Figur", ctor: "Waschbär() {\n        super(\"Waschbaer\", -100, 20);\n    }" });
        const vars = allBlocks([header.inputs!.VARS.block]);
        expect(vars.filter((b) => b.type === B.blVar).map((b) => [b.fields!.TYPE, b.fields!.NAME])).toEqual([["int", "punkte"], ["String", "ruf"]]);
        // vorgeschlagene Namen werden nicht gespeichert, eigene schon
        expect(top.slice(1, 8).map((b) => b.extraState?.name)).toEqual([undefined, undefined, undefined, undefined, undefined, undefined, "losGehts"]);
        expect(top[2].fields).toEqual({ KEY: " " });
        expect(top[4].fields).toEqual({ MSG: "Tor!" });
        // Variablen für alle Figuren: Spiel.leben ist ein Variablen-Block „leben“
        const key = allBlocks([top[2].inputs!.BODY.block]);
        expect(key.filter((b) => b.type === B.varChange || b.type === B.varSet || b.type === B.varGet).map((b) => b.fields!.NAME))
            .toEqual(["leben", "leben", "leben", "punkte", "name", "ruf", "leben", "punkte"]);
        // Auswahlfelder statt Text: gehe zu „Pinguin“, berührt Rand
        const { state: s2 } = JavaBlockParser.parse(figurMitSkripten(["        geheZu(\"Pinguin\");", "        if (beruehrtRand()) {", "            geheZuMauszeiger();", "        }"]), { bloeckly: CTX });
        const b2 = allBlocks([s2.blocks.blocks[1].inputs!.BODY.block]);
        expect(b2.filter((b) => b.type.startsWith("bl_")).map((b) => [b.type, b.fields])).toEqual([
            ["bl_gehe_zu", { ZIEL: "Pinguin" }], ["bl_beruehrt", { WAS: "@rand" }], ["bl_gehe_zu", { ZIEL: "@maus" }],
        ]);
    });

    test("Namen der Skripte: neue bekommen einen freien Vorschlag, Auslöser ändern ändert den Namen mit", () => {
        const { state } = JavaBlockParser.parse(figurQuelltext({ klasse: "Kim", figur: "Pinguin", x: 0, y: 0 }), { bloeckly: CTX });
        const blocks = state.blocks.blocks;
        blocks.push(
            { type: B.blKey, id: "k1", y: 300, fields: { KEY: "ArrowUp" }, inputs: { BODY: { block: { type: "bl_gehe", inputs: { N: { block: { type: B.number, fields: { NUM: "10" } } } } } } } },
            { type: B.blFlag, id: "f1", y: 400 },
            { type: B.blFlag, id: "f2", y: 500 },
            { type: B.blMsg, id: "m1", y: 600, fields: { MSG: "Spiel vorbei" }, extraState: { name: "ende" } },
        );
        const code = JavaBlockGenerator.generate(state, { bloeckly: CTX }).code;
        expect(code).toBe([
            "class Kim extends Figur {", "", "    Kim() {", "        super(\"Pinguin\", 0, 0);", "    }", "",
            "    @WennTaste(\"ArrowUp\")", "    void wennPfeilOben() {", "        gehe(10);", "    }", "",
            "    @BeimStart", "    void beimStart() {", "    }", "",
            "    @BeimStart", "    void beimStart2() {", "    }", "",
            "    @WennNachricht(\"Spiel vorbei\")", "    void ende() {", "    }", "",
            "}", "",
        ].join("\n"));
    });

    test("leere Figur: genau die Datei, die die Figurenliste anlegt", () => {
        const text = figurQuelltext({ klasse: "Waschbär", figur: "Waschbaer", x: 0, y: 0 });
        const { state } = JavaBlockParser.parse(text, { bloeckly: CTX });
        expect(state.blocks.blocks.map((b) => b.type)).toEqual([B.blFigure]);
        expect(JavaBlockGenerator.generate(state, { bloeckly: CTX }).code).toBe(text);
        const stage = buehnenQuelltext("Wiese");
        expect(JavaBlockGenerator.generate(JavaBlockParser.parse(stage, { bloeckly: CTX }).state, { bloeckly: CTX }).code).toBe(stage);
    });

    test("Bühne: nur ihre Blöcke; Variablen für alle Figuren sind static", () => {
        const { lines, types } = allForms(true);
        const text = buehne(lines);
        const { state } = JavaBlockParser.parse(text, { bloeckly: CTX });
        const blocks = allBlocks(state.blocks.blocks);
        expect(blocks.filter((b) => JAVA_BLOCKS.includes(b.type)).map((b) => b.fields?.CODE ?? b.extraState?.code)).toEqual([]);
        expect(types.filter((t) => !blocks.some((b) => b.type === t))).toEqual([]);
        expect(blocks.filter((b) => b.type === B.blVar).map((b) => b.fields!.NAME)).toEqual(["leben", "name"]);
        expect(JavaBlockGenerator.generate(state, { bloeckly: CTX }).code).toBe(text);
        // Figuren-Blöcke gibt es auf der Bühne nicht: bleiben Aufrufe
        const { state: s2 } = JavaBlockParser.parse(buehne(["        gehe(10);"]), { bloeckly: CTX });
        expect(allBlocks(s2.blocks.blocks).some((b) => b.type === "bl_gehe")).toBe(false);
    });

    test("Fremdes bleibt erhalten: Kommentare, andere Klassenteile, Java-Text", () => {
        const text = [
            "// Mein Waschbär",
            "class Waschbär extends Figur {",
            "",
            "    // Punkte",
            "    int punkte = 0;",
            "    public static final int MAX = 10;",
            "",
            "    Waschbär() {",
            "        super(\"Waschbaer\", 0, 0);",
            "    }",
            "",
            "    @BeimStart",
            "    void beimStart() {",
            "        System.out.println(\"x\");",
            "        gehe(Math.max(1, 2));",
            "    }",
            "",
            "}",
            "",
        ].join("\n");
        const { state } = JavaBlockParser.parse(text, { bloeckly: CTX });
        expect(JavaBlockGenerator.generate(state, { bloeckly: CTX }).code).toBe(text);
    });

    test("ohne Figur oder Bühne: wie in Blöckva (Hauptprogramm)", () => {
        const { state } = JavaBlockParser.parse(hauptprogrammQuelltext("Spiel", ["Waschbär"]), { bloeckly: CTX });
        expect(state.blocks.blocks[0].type).toBe(B.start);
    });

    test("alle Blöcke ergeben ein Programm ohne Fehler, das läuft", async () => {
        const figur = figurMitSkripten(allForms(false).lines);
        const stage = buehne(allForms(true).lines);
        const pinguin = figurQuelltext({ klasse: "Pinguin", figur: "Pinguin", x: 100, y: 0 });
        const { errors } = await compile([hauptprogrammQuelltext("Spiel", ["Waschbär", "Pinguin"]), stage, figur, pinguin]);
        expect(errors).toEqual([]);

        const kurz = figurQuelltext({ klasse: "Kim", figur: "Pinguin", x: 10, y: 20 }).replace("\n}\n", [
            "    int schritte = 3;",
            "",
            "    @BeimStart",
            "    void beimStart() {",
            "        geheZu(\"Pinguin\");",
            "        Spiel.leben += 2;",
            "        println(xPosition() + \" \" + abstandZu(\"Pinguin\") + \" \" + Spiel.leben);",
            "    }",
            "}",
            "",
        ].join("\n"));
        const run = await compile([hauptprogrammQuelltext("Spiel", ["Kim", "Pinguin"]), buehne([]), kurz, pinguin]);
        expect(run.errors).toEqual([]);
        const printManager = new StoreOutputPrintManager();
        const keyboard = new Proxy({}, { get: () => () => undefined });
        const interpreter = new Interpreter(printManager, undefined, undefined, keyboard as never);
        interpreter.setExecutable(run.executable);
        interpreter.runMainProgramSynchronously();
        expect(printManager.output.trim()).toBe("100 0 5");
        // Reiter „Variablen“ (18f): für alle Figuren, dann je Figur
        const vars = bloecklyVariablen(interpreter).map((r) => [r.scope?.title, r.name, r.value]);
        expect(vars).toContainEqual(["🎭 Für alle Figuren", "leben", 5]);
        expect(vars).toContainEqual(["🐾 Kim", "schritte", 3]);
        expect(vars.filter((v) => v[0] === "🐾 Pinguin")).toEqual([]);   // Pinguin hat keine eigenen Variablen
    });

    test("Puzzle (18f): Skripte einer Figur mischen, Kopf und Startblöcke bleiben, Prüfen erkennt die Lösung", () => {
        const text = figurQuelltext({ klasse: "Kim", figur: "Pinguin", x: 0, y: 0 }).replace("\n}\n", [
            "    int punkte = 0;",
            "",
            "    @BeimStart",
            "    void beimStart() {",
            "        geheZu(0, 0);",
            "        while (true) {",
            "            gehe(10);",
            "            pralleVomRandAb();",
            "            Spiel.leben++;",
            "        }",
            "    }",
            "}",
            "",
        ].join("\n"));
        const parsed = JavaBlockParser.parse(text, { bloeckly: CTX }).state;
        const solution = JavaBlockGenerator.generate(parsed, { bloeckly: CTX }).code;
        let seed = 7;
        const random = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
        const mixed = JavaBlockGenerator.generate(scramble(parsed, random), { bloeckly: CTX }).code;
        expect(mixed).not.toBe(solution);
        // gemischt bleibt es ein Blöckly-Skript: Kopf mit Variable, Startblock, keine Java-Blöcke
        const again = JavaBlockParser.parse(mixed, { bloeckly: CTX }).state;
        expect(again.blocks.blocks.map((b) => b.type)).toEqual([B.blFigure, B.blFlag]);
        expect(allBlocks(again.blocks.blocks).filter((b) => JAVA_BLOCKS.includes(b.type))).toEqual([]);
        expect(mixed).toContain("Spiel.leben++;");
        expect(checkPuzzle(mixed, solution).correct).toBe(false);
        expect(checkPuzzle(solution, solution).correct).toBe(true);
        const r = checkPuzzle(mixed, solution);
        expect(r.right).toBeLessThan(r.total);
        // gezählt werden nur die Blöcke der Skripte (5), nicht Kopf, Variable und Konstruktor
        expect(checkPuzzle(solution, solution, bloecklyPuzzleLine)).toEqual({ correct: true, right: 5, total: 5 });
        expect(checkPuzzle(mixed, solution, bloecklyPuzzleLine).total).toBe(5);
    });

    test("Variablen im Skript wie in Blöckva: „erstelle neue Variable …“ wird ein Block und genauso zurückgeschrieben", () => {
        const text = figurQuelltext({ klasse: "Kim", figur: "Pinguin", x: 0, y: 0 }).replace("\n}\n", [
            "",
            "    @BeimStart",
            "    void beimStart() {",
            "        int zahl = 0;",
            "        String gruss = \"Hi\";",
            "        while (zahl < 3) {",
            "            zahl++;",
            "            gehe(zahl);",
            "        }",
            "        sage(gruss + zahl);",
            "        Spiel.leben = zahl;",
            "    }",
            "",
            "    @WennTaste(\"a\")",
            "    void wennTasteA() {",
            "        double tempo = 2.5;",
            "        gehe(tempo);",
            "    }",
            "",
            "}",
            "",
        ].join("\n"));
        const parsed = JavaBlockParser.parse(text, { bloeckly: CTX }).state;
        const blocks = allBlocks(parsed.blocks.blocks);
        expect(blocks.filter((b) => b.type === B.varDeclare).map((b) => [b.fields?.NAME, b.fields?.TYPE])).toEqual([["zahl", "int"], ["gruss", "String"], ["tempo", "double"]]);
        expect(blocks.filter((b) => JAVA_BLOCKS.includes(b.type))).toEqual([]);
        expect(blocks.filter((b) => b.type === B.blVar)).toEqual([]);
        expect(JavaBlockGenerator.generate(parsed, { bloeckly: CTX }).code).toBe(text);
        // der Kopf läuft unsichtbar mit (die Blockansicht zeigt ihn nicht): die Skripte beginnen oben
        const hats = parsed.blocks.blocks.filter((b) => b.type !== B.blFigure);
        expect(hats.map((h) => [h.type, h.y])).toEqual([[B.blFlag, 20], [B.blKey, 220]]);
        // ohne Kopf in der Fläche: Kopf vorn wieder anhängen ergibt denselben Text
        const head = parsed.blocks.blocks.find((b) => b.type === B.blFigure)!;
        expect(JavaBlockGenerator.generate({ blocks: { languageVersion: 0, blocks: [head, ...hats] } }, { bloeckly: CTX }).code).toBe(text);
    });

    test("Namen der Skripte für den Reiter „Variablen“", () => {
        const t = (a: string, p = "", stage = false) => skriptTitel(new Map([[a, p]]), stage);
        expect(t("BeimStart")).toBe("Wenn 🚩 angeklickt");
        expect(t("WennTaste", " ")).toBe("Wenn Taste Leertaste gedrückt");
        expect(t("WennAngeklickt")).toBe("Wenn diese Figur angeklickt");
        expect(t("WennAngeklickt", "", true)).toBe("Wenn die Bühne angeklickt");
        expect(t("WennNachricht", "los")).toBe("Wenn ich los empfange");
        expect(t("WennIchAlsKlonEntstehe")).toBe("Wenn ich als Klon entstehe");
        expect(skriptTitel(new Map(), false)).toBe("Skript");
    });

    test("Reiter „Variablen“: die Variablen laufender Skripte stehen bei ihrer Figur", async () => {
        const kim = figurQuelltext({ klasse: "Kim", figur: "Pinguin", x: 10, y: 20 }).replace("\n}\n", [
            "    @BeimStart",
            "    void beimStart() {",
            "        int schritte = 3;",
            "        boolean fertig = false;",
            "        println(\"bereit\");",
            "        warte(5);",
            "    }",
            "}",
            "",
        ].join("\n"));
        const run = await compile([hauptprogrammQuelltext("Spiel", ["Kim"]), buehne([]), kim]);
        expect(run.errors).toEqual([]);
        const printManager = new StoreOutputPrintManager();
        const keyboard = new Proxy({}, { get: () => () => undefined });
        const interpreter = new Interpreter(printManager, undefined, undefined, keyboard as never);
        interpreter.setExecutable(run.executable);
        interpreter.start();
        const scheduler = interpreter.scheduler;
        const ende = Date.now() + 2000;
        while (Date.now() < ende && scheduler.state === SchedulerState.running && !printManager.output.includes("bereit")) {
            scheduler.runsSynchronously = true;
            try {
                scheduler.run(100);
            } finally {
                scheduler.runsSynchronously = false;
            }
            await new Promise((resolve) => setTimeout(resolve, 2));
        }
        expect(printManager.output).toContain("bereit");
        const vars = bloecklyVariablen(interpreter).map((r) => [r.scope?.title, r.name, r.value]);
        expect(vars).toContainEqual(["🐾 Kim · Wenn 🚩 angeklickt", "schritte", 3]);
        expect(vars).toContainEqual(["🐾 Kim · Wenn 🚩 angeklickt", "fertig", false]);
        expect(vars.filter((v) => v[1] === "this")).toEqual([]);
        expect(vars.filter((v) => v[0] === "🎭 Für alle Figuren").map((v) => v[1])).toEqual(["leben", "name"]);
        for (const thread of scheduler.getAllThreads()) scheduler.killThread(thread);
    });
});
