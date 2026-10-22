import { describe, expect, test } from "vitest";
import "../../compiler/common/interpreter/Interpreter";
import "../../compiler/java/JavaCompiler";
import * as Blockly from "blockly/core";
import { defineBlocks } from "./BlockDefinitions";
import { handleRename, syncCalls } from "./BlockOperations";
import { JavaBlockParser } from "./JavaBlockParser";
import { JavaBlockGenerator } from "./JavaBlockGenerator";
import { applyTypes, SHAPE, variablesFor } from "./BlockTypeSystem";
import { B, type WorkspaceState } from "./BlockTypes";

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
const method = (ws: Blockly.Workspace, name: string) => blocksOf(ws, B.method).find((b) => b.getFieldValue("NAME") === name)!;
function press(block: Blockly.Block, text: string, nth = 0) {
    const buttons = block.inputList.flatMap((i) => i.fieldRow).filter((f) => f.getText() === text);
    (buttons[nth] as unknown as { showEditor_(): void }).showEditor_();
}
/** Feld ändern wie in der Oberfläche (mit Ereignis für das Umbenennen) */
function rename(ws: Blockly.Workspace, block: Blockly.Block, field: string, value: string) {
    const old = block.getFieldValue(field);
    block.setFieldValue(value, field);
    const Change = Blockly.Events.get(Blockly.Events.BLOCK_CHANGE);
    handleRename(ws, new Change(block, "field", field, old, value) as Blockly.Events.BlockChange);
}

const PROGRAM = lines(
    "String gruss = \"Hallo\";",
    "begruesse(gruss, 2);",
    "println(quadrat(3));",
    "",
    "void begruesse(String name, int anzahl) {",
    "    println(name + anzahl);",
    "}",
    "",
    "int quadrat(int x) {",
    "    int ergebnis = x * x;",
    "    return ergebnis;",
    "}",
);

describe("Paket 4 mit Blockly", () => {

    test("Laden und Speichern ändert den Code nicht", () => {
        const ws = load(PROGRAM);
        expect(generate(ws)).toBe(PROGRAM);
        expect(blocksOf(ws, B.method)).toHaveLength(2);
        const call = blocksOf(ws, B.call)[0];
        expect(call.inputList.flatMap((i) => i.fieldRow).map((f) => f.getText()).filter((t) => t.endsWith(":"))).toEqual(["name:", "anzahl:"]);
    });

    test("Typen: Ergebnis, Werte beim Aufruf, gib zurück, Parameter", () => {
        const ws = load(PROGRAM);
        const callExpr = blocksOf(ws, B.callExpr)[0];
        expect(callExpr.outputConnection!.getCheck()).toEqual(["int"]);
        expect(callExpr.getOutputShape()).toBe(SHAPE.ROUND);
        expect(callExpr.getInput("ARG0")!.connection!.getCheck()).toEqual(["int"]);
        const call = blocksOf(ws, B.call)[0];
        expect(call.getInput("ARG0")!.connection!.getCheck()).toEqual(["String"]);
        expect(call.getInput("ARG1")!.connection!.getCheck()).toEqual(["int"]);
        const ret = blocksOf(ws, B.return)[0];
        expect(ret.getInput("VALUE")!.connection!.getCheck()).toEqual(["int"]);
        // Parameter haben den Typ ihrer Deklaration; jede Operation hat eigene Variablen
        const nameUse = blocksOf(ws, B.varGet).find((b) => b.getFieldValue("NAME") === "name")!;
        expect(nameUse.outputConnection!.getCheck()).toEqual(["String"]);
        expect([...variablesFor(ret).keys()].sort()).toEqual(["ergebnis", "x"]);
        expect([...variablesFor(call).keys()]).toEqual(["gruss"]);
    });

    test("+ Parameter und ✕: Aufrufe passen sich an, Code folgt", () => {
        const ws = load(PROGRAM);
        const begruesse = method(ws, "begruesse");
        press(begruesse, "+ Parameter");
        expect(begruesse.getFieldValue("PNAME2")).toBe("wert");
        syncCalls(ws);
        const call = blocksOf(ws, B.call)[0];
        expect(call.getInput("ARG2")).toBeTruthy();
        expect(generate(ws)).toContain("begruesse(gruss, 2, 0);");   // neuer Wert mit Startwert
        // ersten Parameter entfernen: die übrigen rücken nach, der Aufruf verliert einen Wert
        press(begruesse, "✕", 0);
        expect(begruesse.getFieldValue("PNAME0")).toBe("anzahl");
        expect(begruesse.getFieldValue("PNAME1")).toBe("wert");
        syncCalls(ws);
        expect(call.getInput("ARG2")).toBeNull();
        expect(generate(ws)).toContain("void begruesse(int anzahl, int wert) {");
        expect(generate(ws)).toContain("begruesse(gruss, 2);");   // Werte bleiben, wo sie waren
    });

    test("Umbenennen: Operation nimmt Aufrufe mit, Parameter nimmt Verwendungen mit", () => {
        const ws = load(PROGRAM);
        rename(ws, method(ws, "quadrat"), "NAME", "hoch2");
        rename(ws, method(ws, "quadrat") ?? method(ws, "hoch2"), "PNAME0", "basis");
        const code = generate(ws);
        expect(code).toContain("println(hoch2(3));");
        expect(code).toContain("int hoch2(int basis) {");
        expect(code).toContain("int ergebnis = basis * basis;");
    });

    test("Rückgängig nach + Parameter / ✕: Name, Ergebnistyp und Parameter bleiben richtig", async () => {
        const settle = () => new Promise((r) => setTimeout(r, 250));
        const ws = new Blockly.Workspace();
        Blockly.serialization.workspaces.load(JavaBlockParser.parse(PROGRAM).state, ws);
        await settle();
        ws.clearUndo();
        press(method(ws, "quadrat"), "+ Parameter");
        await settle();
        expect(generate(ws)).toContain("int quadrat(int x, int wert) {");
        ws.undo(false);
        await settle();
        expect(generate(ws)).toBe(PROGRAM);
        press(method(ws, "begruesse"), "✕", 0);
        await settle();
        expect(generate(ws)).toContain("void begruesse(int anzahl) {");
        ws.undo(false);
        await settle();
        expect(generate(ws)).toBe(PROGRAM);
        ws.dispose();
    });

    test("Hinweise bei gib zurück / beende, die nicht zur Operation passen", () => {
        const ws = load(lines("return 1;", "", "void a() {", "    return 2;", "}", "", "int b() {", "    return;", "}"));
        const warnings = ws.getAllBlocks(false).map((b) => (b as Blockly.Block & { gsgTypeWarning?: string }).gsgTypeWarning).filter(Boolean);
        expect(warnings).toHaveLength(3);
        expect(warnings.join(" ")).toContain("Hauptprogramm");
    });
});
