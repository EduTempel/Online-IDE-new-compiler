import { describe, expect, test } from "vitest";
import "../../compiler/common/interpreter/Interpreter";
import "../../compiler/java/JavaCompiler";
import * as Blockly from "blockly/core";
import { defineBlocks } from "./BlockDefinitions";
import { handleRename } from "./BlockOperations";
import { JavaBlockParser } from "./JavaBlockParser";
import { JavaBlockGenerator } from "./JavaBlockGenerator";
import { applyTypes, SHAPE } from "./BlockTypeSystem";
import { B, type WorkspaceState } from "./BlockTypes";
import { ARRAYS, DYN, LISTS } from "./JavaBlocksPaket5.test";

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
const check = (b: Blockly.Block, input: string) => b.getInput(input)!.connection!.getCheck();
function press(block: Blockly.Block, text: string) {
    const button = block.inputList.flatMap((i) => i.fieldRow).find((f) => f.getText() === text);
    (button as unknown as { showEditor_(): void }).showEditor_();
}

describe("Paket 5 mit Blockly", () => {

    test("Laden und Speichern ändert den Code nicht", () => {
        for (const code of [ARRAYS, LISTS, DYN]) expect(generate(load(code))).toBe(code);
    });

    test("Typen: Elemente, Positionen, Werte, für jedes Element", () => {
        const ws = load(ARRAYS);
        const get = blocksOf(ws, B.arrayGet);
        const namen = get.find((b) => b.getFieldValue("NAME") === "namen")!;
        expect(namen.outputConnection!.getCheck()).toEqual(["String"]);
        expect(check(namen, "I")).toEqual(["int"]);
        const set = blocksOf(ws, B.arraySet)[0];
        expect(check(set, "V")).toEqual(["int"]);
        expect(blocksOf(ws, B.arrayLength)[0].getOutputShape()).toBe(SHAPE.ROUND);
        const values = blocksOf(ws, B.arrayValues)[0];
        expect(check(values, "V0")).toEqual(["String"]);
        // Variable aus "für jedes Element" hat den Elementtyp
        const name = blocksOf(ws, B.varGet).find((b) => b.getFieldValue("NAME") === "name")!;
        expect(name.outputConnection!.getCheck()).toEqual(["String"]);
        const wert = blocksOf(ws, B.varGet).find((b) => b.getFieldValue("NAME") === "wert")!;
        expect(wert.outputConnection!.getCheck()).toEqual(["int"]);

        const lists = load(LISTS);
        const listGet = blocksOf(lists, B.listGet).find((b) => b.getFieldValue("NAME") === "liste")!;
        expect(listGet.outputConnection!.getCheck()).toEqual(["int"]);
        expect(check(blocksOf(lists, B.listAdd).find((b) => b.getFieldValue("NAME") === "woerter")!, "V")).toEqual(["String"]);
        expect(blocksOf(lists, B.listContains)[0].outputConnection!.getCheck()).toEqual(["boolean"]);

        const dyn = load(DYN);
        const typed = blocksOf(dyn, B.dynGet).find((b) => b.getFieldValue("TYPE") === "int")!;
        expect(typed.outputConnection!.getCheck()).toEqual(["int"]);
        const any = blocksOf(dyn, B.dynGet).find((b) => b.getFieldValue("TYPE") === "Object")!;
        expect(any.outputConnection!.getCheck()).toBeNull();
        expect(check(blocksOf(dyn, B.dynAppend)[0], "V")).toBeNull();   // DynArray nimmt alles
    });

    test("Umbenennen einer Reihung nimmt alle Verwendungen mit", () => {
        const ws = load(ARRAYS);
        const decl = blocksOf(ws, B.arrayValues)[0];
        decl.setFieldValue("leute", "NAME");
        const Change = Blockly.Events.get(Blockly.Events.BLOCK_CHANGE);
        handleRename(ws, new Change(decl, "field", "NAME", "namen", "leute") as Blockly.Events.BlockChange);
        const code = generate(ws);
        expect(code).not.toContain("namen");
        expect(code).toContain("String[] leute = {");
        expect(code).toContain("leute[1].length()");
        expect(code).toContain("for (String name : leute) {");
    });

    test("Reihung mit Werten: ◂ ▸", () => {
        const ws = load(lines("int[] z = {1, 2};"));
        const b = blocksOf(ws, B.arrayValues)[0];
        press(b, "▸");
        expect(generate(ws)).toBe(lines("int[] z = {1, 2, };"));
        press(b, "◂");
        press(b, "◂");
        expect(generate(ws)).toBe(lines("int[] z = {1};"));
    });
});
