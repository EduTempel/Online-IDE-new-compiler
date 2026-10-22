import { describe, expect, test } from "vitest";
import "../../compiler/common/interpreter/Interpreter";
import "../../compiler/java/JavaCompiler";
import * as Blockly from "blockly/core";
import { defineBlocks } from "./BlockDefinitions";
import { JavaBlockParser } from "./JavaBlockParser";
import { JavaBlockGenerator } from "./JavaBlockGenerator";
import { applyTypes } from "./BlockTypeSystem";
import { B, type WorkspaceState } from "./BlockTypes";
import { ADT } from "./JavaBlocksAdt.test";

defineBlocks();

function load(code: string) {
    const ws = new Blockly.Workspace();
    Blockly.serialization.workspaces.load(JavaBlockParser.parse(code).state, ws);
    applyTypes(ws);
    return ws;
}
const generate = (ws: Blockly.Workspace) => JavaBlockGenerator.generate(Blockly.serialization.workspaces.save(ws) as unknown as WorkspaceState).code;
const blocksOf = (ws: Blockly.Workspace, type: string) => ws.getAllBlocks(true).filter((b) => b.type === type);
const options = (b: Blockly.Block, field: string) => (b.getField(field) as Blockly.FieldDropdown).getOptions(false).map((o) => o[1]);

describe("ADT mit Blockly", () => {
    test("Stapel, Schlange, Binärbaum laden und unverändert erzeugen", () => {
        expect(generate(load(ADT))).toBe(ADT);
    });

    test("Namensauswahl passend zur Art; ist leer für alle drei", () => {
        const ws = load(ADT);
        expect(options(blocksOf(ws, B.stackPush)[0], "NAME")).toEqual(["stapel"]);
        expect(options(blocksOf(ws, B.treeSetChild)[0], "NAME")).toEqual(["baum", "links"]);
        expect(options(blocksOf(ws, B.adtIsEmpty)[0], "NAME")).toEqual(["baum", "links", "schlange", "stapel"]);
    });

    test("Typen: Lesen als Ganzzahl ist eine Zahl, Teilbaum ist ein Binärbaum", () => {
        const ws = load(ADT);
        const top = blocksOf(ws, B.stackGet)[0];
        expect(top.getFieldValue("TYPE")).toBe("int");
        expect(top.outputConnection?.getCheck()).toEqual(["int"]);
        expect(blocksOf(ws, B.treeChild)[0].outputConnection?.getCheck()).toEqual(["BinTree"]);
        expect(blocksOf(ws, B.adtIsEmpty)[0].outputConnection?.getCheck()).toEqual(["boolean"]);
    });

    test("Binärbaum ohne Inhalt", () => {
        const code = "BinTree leer = new BinTree();\nprintln(leer.isEmpty());\n";
        expect(generate(load(code))).toBe(code);
    });
});
