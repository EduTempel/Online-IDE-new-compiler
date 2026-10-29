import { describe, expect, test } from "vitest";
// Ladereihenfolge der Compiler-Module wie in der IDE (sonst zyklische Importe)
import "../../compiler/common/interpreter/Interpreter";
import "../../compiler/java/JavaCompiler";
import * as Blockly from "blockly/core";
import { defineBlocks } from "./BlockDefinitions";
import { JavaBlockParser } from "./JavaBlockParser";
import { JavaBlockGenerator } from "./JavaBlockGenerator";
import { applyTypes, variablesFor } from "./BlockTypeSystem";
import { handleRename } from "./BlockOperations";
import { B, type WorkspaceState } from "./BlockTypes";
import { compileJava } from "./RunJava";
import { diagramsFromJava } from "../structogram/StructogramModel";

defineBlocks();

const NL = String.fromCharCode(10);
const lines = (...l: string[]) => l.join(NL) + NL;
const roundTrip = (code: string) => JavaBlockGenerator.generate(JavaBlockParser.parse(code).state).code;

/** Hauptprogramm mit Namen und zwei Programmteilen, die Tasten starten */
const GAME = lines(
    "// Hauptprogramm „Ballspiel“",
    "Circle ball = new Circle(400, 300, 30);",
    "int punkte = 0;",
    "int[] zahlen = new int[3];",
    "",
    "@WennTaste(\"ArrowUp\")",
    "void pfeilOben() {",
    "    ball.move(0, -10);",
    "    punkte++;",
    "    for (int z : zahlen) {",
    "        println(z);",
    "    }",
    "}",
    "",
    "@WennTaste(\" \")",
    "void springen() {",
    "    int hoehe = 5;",
    "    punkte += hoehe;",
    "}",
);

function load(code: string) {
    const ws = new Blockly.Workspace();
    // wie in der Blockansicht: Laden ohne Ereignisse (sonst „korrigieren“ geladene Programmteile ihre Tasten)
    Blockly.Events.disable();
    try {
        Blockly.serialization.workspaces.load(JavaBlockParser.parse(code).state, ws);
    } finally {
        Blockly.Events.enable();
    }
    applyTypes(ws);
    return ws;
}
const generate = (ws: Blockly.Workspace) => JavaBlockGenerator.generate(Blockly.serialization.workspaces.save(ws) as unknown as WorkspaceState).code;
const options = (b: Blockly.Block, field: string) => (b.getField(field) as Blockly.FieldDropdown).getOptions(false).map((o) => o[1]);
/** Blockly verschickt Ereignisse nach dem nächsten Bildaufbau */
const events = () => new Promise((r) => setTimeout(r, 60));
const warning = (b: Blockly.Block) => (b as Blockly.Block & { gsgTypeWarning?: string }).gsgTypeWarning;

describe("Name des Hauptprogramms und Programmteile „wenn Taste … gedrückt“ (Java ↔ Blöcke)", () => {
    test("Hin und zurück unverändert, alles als Blöcke (ohne Java-Text)", () => {
        expect(roundTrip(GAME)).toBe(GAME);
        const { state } = JavaBlockParser.parse(GAME);
        const [start, ...hats] = state.blocks.blocks;
        expect(start.fields?.NAME).toBe("Ballspiel");
        expect(hats.map((h) => [h.type, h.fields?.KEY, h.fields?.NAME])).toEqual([
            [B.keyStart, "ArrowUp", "pfeilOben"], [B.keyStart, " ", "springen"]]);
        expect(JSON.stringify(state)).not.toMatch(/j_java_(expr|stmt|raw)/);
    });

    test("ohne Namen kein Kommentar; ein anderer erster Kommentar bleibt ein Kommentar", () => {
        expect(roundTrip(lines("println(1);"))).toBe(lines("println(1);"));
        const code = lines("// Mein Programm", "println(1);");
        expect(roundTrip(code)).toBe(code);
        expect(JavaBlockParser.parse(code).state.blocks.blocks[0].fields?.NAME).toBeUndefined();
        // Name ohne Anweisungen im Hauptprogramm
        const onlyName = lines("// Hauptprogramm „Leer“");
        expect(roundTrip(onlyName)).toBe(onlyName);
    });

    test("erzeugter Code lässt sich übersetzen", async () => {
        expect(await compileJava(GAME)).toEqual([]);
    });

    test("Blockly: Variablen des Hauptprogramms gelten im Programmteil, eigene nur dort", () => {
        const ws = load(GAME);
        const [up, jump] = ws.getTopBlocks(true).filter((b) => b.type === B.keyStart);
        expect([...variablesFor(up).keys()]).toEqual(expect.arrayContaining(["ball", "punkte", "zahlen"]));
        expect(variablesFor(jump).has("hoehe")).toBe(true);
        expect(variablesFor(ws.getBlockById("start")!).has("hoehe")).toBe(false);
        expect(generate(ws)).toBe(GAME);
    });

    test("Blockly: zur Auswahl stehen nur freie Tasten; doppelte Taste und doppelter Name werden angemerkt", () => {
        const ws = load(GAME);
        const [up, jump] = ws.getTopBlocks(true).filter((b) => b.type === B.keyStart);
        expect(options(up, "KEY")).toContain("ArrowUp");
        expect(options(up, "KEY")).not.toContain(" ");
        expect(options(jump, "KEY")).not.toContain("ArrowUp");
        expect(options(up, "KEY")).toContain("ArrowDown");
        expect(warning(up)).toBeUndefined();

        const dup = load(lines("@WennTaste(\"a\")", "void eins() {", "}", "", "@WennTaste(\"A\")", "void eins() {", "}"));
        const [first, second] = dup.getTopBlocks(true).filter((b) => b.type === B.keyStart);
        expect(warning(second)).toMatch(/startet schon „eins“/);
        expect(warning(first)).toMatch(/Namen „eins“ gibt es schon/);
        expect(warning(first)).not.toMatch(/startet schon/);
    });

    test("Blockly: neuer Programmteil bekommt eine freie Taste und einen passenden Namen", async () => {
        const ws = load(GAME);
        const part = ws.newBlock(B.keyStart);   // Vorgabe: Leertaste – die hat schon „springen“
        await events();
        expect(part.getFieldValue("KEY")).toBe("ArrowRight");
        expect(part.getFieldValue("NAME")).toBe("pfeilRechts");
        part.setFieldValue("ArrowDown", "KEY");
        await events();
        expect(part.getFieldValue("NAME")).toBe("pfeilUnten");
        part.setFieldValue("schuss", "NAME");
        part.setFieldValue("ArrowLeft", "KEY");
        await events();
        expect(part.getFieldValue("NAME")).toBe("schuss");   // eigener Name bleibt
    });

    test("Blockly: Umbenennen einer Variablen des Hauptprogramms ändert sie auch im Programmteil", async () => {
        const ws = load(GAME);
        ws.addChangeListener((e) => { if (e instanceof Blockly.Events.BlockChange) handleRename(ws, e); });
        const decl = ws.getAllBlocks(true).find((b) => b.type === B.varDeclare && b.getFieldValue("NAME") === "punkte")!;
        decl.setFieldValue("score", "NAME");
        await events();
        const code = generate(ws);
        expect(code).toContain("    score++;");
        expect(code).toContain("    score += hoehe;");
    });

    test("Struktogramme: Titel mit Namen des Hauptprogramms und je Programmteil", () => {
        expect(diagramsFromJava(GAME).map((d) => d.title)).toEqual([
            "Hauptprogramm „Ballspiel“", "wenn Taste „Pfeil oben ↑“ gedrückt: pfeilOben", "wenn Taste „Leertaste“ gedrückt: springen"]);
    });
});
