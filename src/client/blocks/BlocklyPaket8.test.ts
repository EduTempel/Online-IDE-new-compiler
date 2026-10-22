import { describe, expect, test } from "vitest";
import "../../compiler/common/interpreter/Interpreter";
import "../../compiler/java/JavaCompiler";
import * as Blockly from "blockly/core";
import { defineBlocks } from "./BlockDefinitions";
import { JavaBlockParser } from "./JavaBlockParser";
import { JavaBlockGenerator } from "./JavaBlockGenerator";
import { applyTypes, SHAPE } from "./BlockTypeSystem";
import { B, type WorkspaceState } from "./BlockTypes";
import { GAME } from "./JavaBlocksPaket8.test";

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

describe("Paket 8 mit Blockly", () => {
    test("Spielschleife laden und unverändert erzeugen", () => {
        const ws = load(GAME);
        expect(generate(ws)).toBe(GAME);
    });

    test("Figurenauswahl kennt die angelegten Figuren (passend zur Art)", () => {
        const ws = load(GAME);
        const move = blocksOf(ws, B.figMove)[0];
        expect(options(move, "NAME")).toEqual(["anzeige", "ball", "figur", "wand"]);
        const setText = blocksOf(ws, B.figSetText)[0];
        expect(options(setText, "NAME")).toEqual(["anzeige"]);
        const colour = blocksOf(ws, B.figColor)[0];
        expect(options(colour, "NAME")).not.toContain("figur");   // Sprites haben keine Füllfarbe
    });

    test("Formen: Bedingungen sechseckig, Zahlen rund", () => {
        const ws = load(GAME);
        expect(blocksOf(ws, B.keyDown)[0].outputConnection?.getCheck()).toEqual(["boolean"]);
        expect(blocksOf(ws, B.figProp)[0].outputConnection?.getCheck()).toEqual(["double"]);
        const move = blocksOf(ws, B.figMove)[0];
        expect(move.getInput("DX")?.connection?.getCheck()).toEqual(["int", "double"]);
        void SHAPE;
    });

    test("unbekannte Farbe und Taste bleiben auswählbar", () => {
        const ws = load("Circle c = new Circle(1, 2, 3);\nc.setFillColor(\"#ff8800\");\nboolean b = Input.isKeyDown(\"F1\");\n");
        expect(options(blocksOf(ws, B.figColor)[0], "COLOR")).toContain("#ff8800");
        expect(options(blocksOf(ws, B.keyDown)[0], "KEY")).toContain("F1");
        expect(generate(ws)).toContain("c.setFillColor(\"#ff8800\");");
    });
});
