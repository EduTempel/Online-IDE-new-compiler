import { describe, expect, test } from "vitest";
import "../../compiler/common/interpreter/Interpreter";
import "../../compiler/java/JavaCompiler";
import * as Blockly from "blockly/core";
import { defineBlocks } from "../blocks/BlockDefinitions";
import { defineBloecklyBlocks } from "./BloecklyBlocks";
import { JavaBlockParser } from "../blocks/JavaBlockParser";
import { JavaBlockGenerator } from "../blocks/JavaBlockGenerator";
import { B, type BlockState, type WorkspaceState } from "../blocks/BlockTypes";
import { kopfAusFlaeche } from "./BloecklyKopf";
import { figurQuelltext, hatFlagge, ohneVariable, variablenDerKlasse } from "./BloecklyProjekt";
import type { BloecklyContext } from "./BloecklySpec";

/**
 * 11.11.2026: kein Kopfblock mehr in der Fläche. „erstelle Variable …“ steht oben in einem Skript; im Java-Code steht
 * die Variable direkt vor dem Skript (Figur: nur für diese Figur, Bühne: static, für alle Figuren).
 */

defineBlocks();
defineBloecklyBlocks();

const CTX: BloecklyContext = { stage: "Spiel", globals: {} };

const figur = (...rumpf: string[]) => [
    "class Waschbär extends Figur {",
    "",
    "    Waschbär() {",
    "        super(\"Waschbaer\", 0, 0);",
    "    }",
    ...rumpf,
    "}",
    "",
].join("\n");

const FLAGGE_MIT_VARIABLE = figur(
    "",
    "    int leben = 3;",
    "    @BeimStart",
    "    void beimStart() {",
    "        gehe(10);",
    "    }",
    "",
    "    @WennNachricht(\"los\")",
    "    void beiLos() {",
    "        leben = leben - 1;",
    "    }",
    "",
);

/** wie die Blockansicht: Kopf heraus, Rest in eine Blockfläche */
function lade(code: string, flaggeAnderswo = false): { ws: Blockly.Workspace; kopf?: BlockState } {
    const { state } = JavaBlockParser.parse(code, { bloeckly: CTX });
    const kopf = kopfAusFlaeche(state, flaggeAnderswo);
    const ws = new Blockly.Workspace();
    Blockly.serialization.workspaces.load(state, ws);
    return { ws, kopf };
}

/** wie die Blockansicht beim Zurückschreiben */
function schreibe(ws: Blockly.Workspace, kopf: BlockState | undefined, ctx = CTX): string {
    const state = Blockly.serialization.workspaces.save(ws) as unknown as WorkspaceState;
    if (kopf) state.blocks = { languageVersion: 0, blocks: [kopf, ...(state.blocks?.blocks ?? [])] };
    return JavaBlockGenerator.generate(state, { bloeckly: ctx }).code;
}

const kette = (b: Blockly.Block | null) => {
    const typen: string[] = [];
    for (; b; b = b.getNextBlock()) typen.push(b.type);
    return typen;
};
const erster = (ws: Blockly.Workspace, type: string) => ws.getAllBlocks(true).find((b) => b.type === type)!;

describe("Blocks ohne Kopfblock: Variablen oben im Skript", () => {
    test("Variable vor einem Skript steht oben darin; Zurückschreiben ergibt denselben Text", () => {
        const { ws, kopf } = lade(FLAGGE_MIT_VARIABLE);
        expect(ws.getTopBlocks(false).map((b) => b.type)).not.toContain(B.blFigure);
        expect(kette(erster(ws, B.blFlag).getInputTargetBlock("BODY"))).toEqual([B.blVar, "bl_gehe"]);
        expect(schreibe(ws, kopf)).toBe(FLAGGE_MIT_VARIABLE);
        // gilt in allen Skripten der Figur
        expect(variablenDerKlasse(FLAGGE_MIT_VARIABLE, CTX)).toEqual({ leben: "int" });
        ws.dispose();
    });

    test("Bühne: Variable im Skript wird static (für alle Figuren)", () => {
        const code = [
            "class Spiel extends Buehne {",
            "",
            "    Spiel() {",
            "        super(\"Wiese\");",
            "    }",
            "",
            "    @WennNachricht(\"los\")",
            "    void beiLos() {",
            "    }",
            "",
            "}",
            "",
        ].join("\n");
        const { ws, kopf } = lade(code);
        const skript = erster(ws, B.blMsg);
        const v = ws.newBlock(B.blVar);
        v.setFieldValue("punkte", "NAME");
        skript.getInput("BODY")!.connection!.connect(v.previousConnection!);
        const neu = schreibe(ws, kopf);
        expect(neu).toContain("    static double punkte;\n    @WennNachricht(\"los\")");
        expect(variablenDerKlasse(neu, CTX)).toEqual({ punkte: "double" });
        expect(ohneVariable(neu, "punkte", CTX)).toBe(code);
        ws.dispose();
    });

    test("ältere Projekte: Variablen oben in der Klasse wandern in „Wenn 🚩 angeklickt“, Kommentare bleiben im Kopf", () => {
        const code = [
            "class Waschbär extends Figur {",
            "",
            "    // Leben",
            "    int leben = 3;",
            "    double tempo = 2;",
            "",
            "    Waschbär() {",
            "        super(\"Waschbaer\", 0, 0);",
            "    }",
            "",
            "    @WennTaste(\" \")",
            "    void wennLeertaste() {",
            "    }",
            "",
            "    @BeimStart",
            "    void beimStart() {",
            "        gehe(tempo);",
            "    }",
            "",
            "}",
            "",
        ].join("\n");
        const { ws, kopf } = lade(code);
        expect(kette(erster(ws, B.blFlag).getInputTargetBlock("BODY"))).toEqual([B.blVar, B.blVar, "bl_gehe"]);
        expect(kopf?.inputs?.VARS?.block?.type).toBe(B.comment);
        expect(kopf?.inputs?.VARS?.block?.next).toBeUndefined();
        // gleiche Bedeutung: jetzt vor dem Skript
        const neu = schreibe(ws, kopf);
        expect(neu).toContain("    int leben = 3;\n    double tempo = 2;\n    @BeimStart");
        expect(variablenDerKlasse(neu, CTX)).toEqual({ leben: "int", tempo: "double" });
        ws.dispose();
    });

    test("ältere Projekte ohne Skript: neues Skript mit der Flagge – oder „Wenn ich los empfange“, wenn es die Flagge schon gibt", () => {
        const code = figurQuelltext({ klasse: "Waschbär", figur: "Waschbaer", x: 0, y: 0 }).replace("\n\n    Waschbär()", "\n\n    int leben = 3;\n\n    Waschbär()");
        const frei = lade(code);
        expect(kette(erster(frei.ws, B.blFlag).getInputTargetBlock("BODY"))).toEqual([B.blVar]);
        frei.ws.dispose();
        const besetzt = lade(code, true);
        expect(besetzt.ws.getTopBlocks(false).map((b) => b.type)).toEqual([B.blMsg]);
        expect(schreibe(besetzt.ws, besetzt.kopf)).toContain("    int leben = 3;\n    @WennNachricht(\"los\")");
        besetzt.ws.dispose();
    });

    test("„erstelle Variable“ passt nur oben in ein Skript; nichts schiebt sich davor", () => {
        const { ws } = lade(FLAGGE_MIT_VARIABLE);
        const checker = ws.connectionChecker;
        const flagge = erster(ws, B.blFlag);
        const body = flagge.getInput("BODY")!.connection!;
        const leben = erster(ws, B.blVar);
        const gehe = erster(ws, "bl_gehe");
        const neu = ws.newBlock(B.blVar);
        // unter eine Variable oben: ja; unter „gehe“: nein
        expect(checker.canConnect(leben.nextConnection!, neu.previousConnection!, false)).toBe(true);
        expect(checker.canConnect(gehe.nextConnection!, neu.previousConnection!, false)).toBe(false);
        // in eine Schleife: nein
        const schleife = ws.newBlock(B.forever);
        gehe.nextConnection!.connect(schleife.previousConnection!);
        expect(checker.canConnect(schleife.getInput("DO")!.connection!, neu.previousConnection!, false)).toBe(false);
        // „frage“ nicht zwischen Hut und Variable, wohl aber unter die Variablen
        const frage = ws.newBlock("bl_frage");
        expect(checker.canConnect(body, frage.previousConnection!, false)).toBe(false);
        expect(checker.canConnect(leben.nextConnection!, frage.previousConnection!, false)).toBe(true);
        // lose Variablen dürfen aneinanderhängen
        const lose = ws.newBlock(B.blVar);
        expect(checker.canConnect(neu.nextConnection!, lose.previousConnection!, false)).toBe(true);
        ws.dispose();
    });

    test("„erstelle Liste“ wie in Mix: oben im Skript, Liste der Figur; auf der Bühne für alle", () => {
        const code = figur(
            "",
            "    Liste<String> einkauf = new Liste<>();",
            "    int position = 0;",
            "    @BeimStart",
            "    void beimStart() {",
            "        einkauf.add(\"Brot\");",
            "        sage(einkauf.get(position));",
            "    }",
            "",
        );
        const { ws, kopf } = lade(code);
        const body = erster(ws, B.blFlag).getInputTargetBlock("BODY");
        expect(kette(body)).toEqual([B.blList, B.blVar, B.listAdd, "bl_sage"]);
        expect(body?.getFieldValue("TYPE")).toBe("Liste<String>");
        expect(schreibe(ws, kopf)).toBe(code);
        expect(variablenDerKlasse(code, CTX)).toEqual({ einkauf: "Liste<String>", position: "int" });
        // nicht unter „füge … hinzu“, wohl aber unter eine Variable oben
        const liste = ws.newBlock(B.blList);
        const checker = ws.connectionChecker;
        expect(checker.canConnect(erster(ws, B.listAdd).nextConnection!, liste.previousConnection!, false)).toBe(false);
        expect(checker.canConnect(erster(ws, B.blVar).nextConnection!, liste.previousConnection!, false)).toBe(true);
        ws.dispose();
        // Bühne: static
        const buehne = [
            "class Spiel extends Buehne {", "", "    Spiel() {", "        super(\"Wiese\");", "    }", "",
            "    static Liste<Double> zahlen = new Liste<>();",
            "    @WennNachricht(\"los\")", "    void beiLos() {", "        zahlen.add(1);", "    }", "", "}", "",
        ].join("\n");
        const b = lade(buehne);
        expect(kette(erster(b.ws, B.blMsg).getInputTargetBlock("BODY"))).toEqual([B.blList, B.listAdd]);
        expect(schreibe(b.ws, b.kopf)).toBe(buehne);
        expect(ohneVariable(buehne, "zahlen", CTX)).not.toContain("zahlen = new");
        b.ws.dispose();
    });

    test("neue Figur: mit leerem „Wenn 🚩 angeklickt“, solange es keins gibt", () => {
        const mit = figurQuelltext({ klasse: "Kim", figur: "Pinguin", x: 0, y: 0 }, true);
        expect(hatFlagge([mit])).toBe(true);
        expect(hatFlagge([figurQuelltext({ klasse: "Kim", figur: "Pinguin", x: 0, y: 0 })])).toBe(false);
        const { ws, kopf } = lade(mit);
        expect(ws.getTopBlocks(false).map((b) => b.type)).toEqual([B.blFlag]);
        expect(schreibe(ws, kopf)).toBe(mit);
        ws.dispose();
    });
});
