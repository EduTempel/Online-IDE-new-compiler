import { describe, expect, test } from "vitest";
import "../../compiler/common/interpreter/Interpreter";
import "../../compiler/java/JavaCompiler";
import * as Blockly from "blockly/core";
import { defineBlocks, toolbox } from "./BlockDefinitions";
import { JavaBlockParser } from "./JavaBlockParser";
import { JavaBlockGenerator } from "./JavaBlockGenerator";
import { applyTypes, SHAPE } from "./BlockTypeSystem";
import { B, type BlockState, type WorkspaceState } from "./BlockTypes";

defineBlocks();
const NL = String.fromCharCode(10);
const lines = (...l: string[]) => l.join(NL) + NL;

function load(code: string) {
    const ws = new Blockly.Workspace();
    Blockly.serialization.workspaces.load(JavaBlockParser.parse(code).state, ws);
    applyTypes(ws);
    return ws;
}
const generate = (ws: Blockly.Workspace) => JavaBlockGenerator.generate(Blockly.serialization.workspaces.save(ws) as unknown as WorkspaceState).code;
const blocksOf = (ws: Blockly.Workspace, type: string) => ws.getAllBlocks(true).filter((b) => b.type === type);
/** wie load, aber Falls-Blöcke umbaubar (mit Knöpfen) statt in fester Form */
function loadFlexible(code: string) {
    const state = JavaBlockParser.parse(code).state;
    const strip = (b: BlockState | undefined) => {
        for (; b; b = b.next?.block) {
            if (b.type === B.if && b.extraState) delete b.extraState.fixed;
            for (const i of Object.values(b.inputs ?? {})) strip(i.block);
        }
    };
    state.blocks.blocks.forEach(strip);
    const ws = new Blockly.Workspace();
    Blockly.serialization.workspaces.load(state, ws);
    applyTypes(ws);
    return ws;
}
/** Knopf im Block drücken (wie ein Klick) */
function press(block: Blockly.Block, text: string, nth = 0) {
    const buttons = block.inputList.flatMap((i) => i.fieldRow).filter((f) => f.getText() === text);
    (buttons[nth] as unknown as { showEditor_(): void }).showEditor_();
}

describe("Paket 1 mit Blockly", () => {

    test("alle neuen Blöcke laden und erzeugen denselben Code", () => {
        const code = lines(
            "int n = 5;",
            "String s = \"Hallo\";",
            "if (n > 10) {",
            "    println(\"groß\");",
            "} else if (n > 5) {",
            "    println(\"mittel\");",
            "} else {",
            "    println(s + \" \" + n + \" \" + s.length());",
            "}",
            "while (true) {",
            "    for (int durchlauf = 1; durchlauf <= 3; durchlauf++) {",
            "        Thread.sleep(500);",
            "    }",
            "    for (int i = 10; i >= 0; i -= 2) {",
            "        n -= i;",
            "        n++;",
            "        n--;",
            "    }",
            "    char c = s.charAt(0);",
            "    int code = (int) c;",
            "    boolean b = s.substring(1, 3).toUpperCase().equals(\"AL\") || s.contains(\"x\");",
            "    int v = s.compareTo(\"Hallo\") + Math.max(1, Random.randint(1, 6));",
            "    double z = (double) n / 2 + Math.random();",
            "    String t = \"Wert: \" + Math.round(z);",
            "}",
        );
        const ws = load(code);
        expect(generate(ws)).toBe(code);
        expect(JSON.stringify(Blockly.serialization.workspaces.save(ws))).not.toMatch(/j_java_(expr|stmt|raw)/);
        ws.dispose();
    });

    test("Typen und Formen der Textblöcke", () => {
        const ws = load(lines("int n = s.length();", "char c = s.charAt(2);", "boolean g = s.equals(t);", "String u = \"a\" + n;"));
        expect(blocksOf(ws, B.strLength)[0].getOutputShape()).toBe(SHAPE.ROUND);
        expect(blocksOf(ws, B.strCharAt)[0].getOutputShape()).toBe(SHAPE.BEVEL);
        expect(blocksOf(ws, B.strEquals)[0].getOutputShape()).toBe(SHAPE.HEXAGON);
        expect(blocksOf(ws, B.concat)[0].getOutputShape()).toBe(SHAPE.SQUARE);
        expect(blocksOf(ws, B.strCharAt)[0].getInput("INDEX")!.connection!.getCheck()).toEqual(["int"]);
        ws.dispose();
    });

    test("falls: Zweige per Knopf hinzufügen und entfernen", () => {
        const ws = loadFlexible(lines("if (a) {", "    println(1);", "}"));
        const ifBlock = blocksOf(ws, B.if)[0];
        press(ifBlock, "+ sonst falls");
        press(ifBlock, "+ sonst");
        expect(ifBlock.inputList.map((i) => i.name)).toEqual(
            ["COND", "COND_HINT", "DO", "COND1", "COND_HINT1", "DO1", "ELSE_LABEL", "ELSE", "ADD"]);
        // Bedingung in den neuen Zweig stecken, dann den Zweig wieder entfernen
        const cond = ws.newBlock(B.bool);
        ifBlock.getInput("COND1")!.connection!.connect(cond.outputConnection!);
        expect(generate(ws)).toBe(lines("if (a) {", "    println(1);", "} else if (true) {", "} else {", "}"));
        press(ifBlock, "✕", 0);
        expect(generate(ws)).toBe(lines("if (a) {", "    println(1);", "} else {", "}"));
        expect(cond.getParent()).toBeNull();   // herausgenommen, nicht gelöscht
        press(ifBlock, "✕", 0);
        expect(generate(ws)).toBe(lines("if (a) {", "    println(1);", "}"));
        ws.dispose();
    });

    test("falls: feste Formen ohne Knöpfe, dritter Block der Werkzeugleiste mit Knöpfen", () => {
        const ws = load(lines("if (a) {", "    println(1);", "}", "if (b) {", "} else {", "    println(2);", "}"));
        const [simple, withElse] = blocksOf(ws, B.if);
        const texts = (blk: Blockly.Block) => blk.inputList.flatMap((i) => i.fieldRow).filter((f) => f.isVisible()).map((f) => f.getText());
        expect(texts(simple)).toEqual(["falls", "dann"]);
        expect(texts(withElse)).toEqual(["falls", "dann", "sonst"]);
        expect(generate(ws)).toBe(lines("if (a) {", "    println(1);", "}", "if (b) {", "} else {", "    println(2);", "}"));
        // Werkzeugleiste "Steuerung": falls … dann / … sonst (fest), falls … sonst falls (mit Knöpfen)
        const control = (toolbox() as { contents: { name?: string; contents?: { type?: string; extraState?: object }[] }[] })
            .contents.find((c) => c.name === "Steuerung")!.contents!.filter((x) => x.type === B.if);
        expect(control.map((x) => x.extraState)).toEqual([
            { elseIfs: 0, hasElse: false, fixed: true }, { elseIfs: 0, hasElse: true, fixed: true }, { elseIfs: 1, hasElse: false }]);
        Blockly.serialization.blocks.append({ type: B.if, extraState: control[2].extraState } as Blockly.serialization.blocks.State, ws);
        const flexible = blocksOf(ws, B.if).find((b) => b !== simple && b !== withElse)!;
        expect(texts(flexible)).toEqual(["falls", "dann", "✕", "sonst falls", "dann", "+ sonst falls", "+ sonst"]);
        ws.dispose();
    });

    test("falls: mittleren Zweig entfernen, Inhalte rücken nach", () => {
        const ws = load(lines("if (a) {", "} else if (b) {", "    println(2);", "} else if (c) {", "    println(3);", "}"));
        const ifBlock = blocksOf(ws, B.if)[0];
        press(ifBlock, "✕", 0);   // entfernt "else if (b)"
        expect(generate(ws)).toBe(lines("if (a) {", "} else if (c) {", "    println(3);", "}"));
        ws.dispose();
    });

    test("gib aus: Werte per ◂ ▸", () => {
        const ws = load(lines("println(x);"));
        const print = blocksOf(ws, B.print)[0];
        press(print, "▸");
        press(print, "▸");
        const n = ws.newBlock(B.number);
        n.setFieldValue("5", "NUM");
        applyTypes(ws);
        print.getInput("VALUE2")!.connection!.connect(n.outputConnection!);
        expect(generate(ws)).toBe(lines("println(x + \" \" + \"\" + \" \" + 5);"));
        press(print, "◂");
        expect(generate(ws)).toBe(lines("println(x + \" \" + \"\");"));
        expect(print.getFieldValue("MODE")).toBe("println");
        ws.dispose();
    });

    test("Rückgängig nach einem Knopfdruck", async () => {
        // Blockly meldet Ereignisse erst im nächsten Bild (requestAnimationFrame)
        const settle = () => new Promise((r) => setTimeout(r, 250));
        const ws = loadFlexible(lines("if (a) {", "}"));   // umbaubare Form (mit Knöpfen)
        await settle();
        ws.clearUndo();
        press(blocksOf(ws, B.if)[0], "+ sonst");
        await settle();
        expect(generate(ws)).toBe(lines("if (a) {", "} else {", "}"));
        ws.undo(false);
        await settle();
        expect(generate(ws)).toBe(lines("if (a) {", "}"));
        ws.dispose();
    });

    test("Hinweis, wenn Texte mit == verglichen werden", () => {
        const ws = load(lines("String a = \"x\";", "String b = \"y\";", "boolean g = a == b;", "boolean h = 1 == 2;"));
        const [textCompare, numberCompare] = blocksOf(ws, B.compare);
        expect((textCompare as unknown as { gsgTypeWarning?: string }).gsgTypeWarning).toContain("ist gleich");
        expect((numberCompare as unknown as { gsgTypeWarning?: string }).gsgTypeWarning).toBeUndefined();
        ws.dispose();
    });
});
