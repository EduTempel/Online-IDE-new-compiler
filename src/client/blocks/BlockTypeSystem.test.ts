import { describe, expect, test } from "vitest";
import "../../compiler/common/interpreter/Interpreter";
import "../../compiler/java/JavaCompiler";
import * as Blockly from "blockly/core";
import { defineBlocks } from "./BlockDefinitions";
import { JavaBlockParser } from "./JavaBlockParser";
import { JavaBlockGenerator } from "./JavaBlockGenerator";
import { adaptDeclarationValue, applyTypes, collectVariables, convertLiteral, inputShape, SHAPE } from "./BlockTypeSystem";
import { B, type WorkspaceState } from "./BlockTypes";

defineBlocks();

function load(code: string) {
    const ws = new Blockly.Workspace();
    Blockly.serialization.workspaces.load(JavaBlockParser.parse(code).state, ws);
    applyTypes(ws);
    return ws;
}
const blocksOf = (ws: Blockly.Workspace, type: string) => ws.getAllBlocks(true).filter((b) => b.type === type);

describe("Datentypen der Blöcke", () => {

    test("Variablen und Werte bekommen Typ und Form", () => {
        const ws = load([
            "int zahl = 5;",
            "double wert = 2.5;",
            "String name = \"Ada\";",
            "boolean gross = zahl > 3;",
            "char c = 'x';",
            "println(name + zahl);",
            "println(zahl * wert);",
            "",
        ].join("\n"));
        expect(Object.fromEntries(collectVariables(ws))).toEqual({ zahl: "int", wert: "double", name: "String", gross: "boolean", c: "char" });

        const [nZahl, nWert] = blocksOf(ws, B.number);
        expect(nZahl.outputConnection!.getCheck()).toEqual(["int"]);
        expect(nZahl.getOutputShape()).toBe(SHAPE.ROUND);
        expect(nWert.outputConnection!.getCheck()).toEqual(["double"]);
        expect(blocksOf(ws, B.text)[0].getOutputShape()).toBe(SHAPE.SQUARE);
        expect(blocksOf(ws, B.compare)[0].getOutputShape()).toBe(SHAPE.HEXAGON);

        const zahlGet = blocksOf(ws, B.varGet).find((b) => b.getFieldValue("NAME") === "zahl")!;
        expect(zahlGet.outputConnection!.getCheck()).toEqual(["int"]);
        expect(zahlGet.getOutputShape()).toBe(SHAPE.ROUND);
        const nameGet = blocksOf(ws, B.varGet).find((b) => b.getFieldValue("NAME") === "name")!;
        expect(nameGet.getOutputShape()).toBe(SHAPE.SQUARE);

        // "+" mit Text wird Text, "*" mit Kommazahl wird Kommazahl
        const [plus, mal] = blocksOf(ws, B.arith);
        expect(plus.outputConnection!.getCheck()).toEqual(["String"]);
        expect(plus.getOutputShape()).toBe(SHAPE.SQUARE);
        expect(mal.outputConnection!.getCheck()).toEqual(["double"]);

        // Löcher: Typ der Deklaration, Ausgabe nimmt alles (Wellenform)
        const decls = blocksOf(ws, B.varDeclare);
        const valueCheck = (b: Blockly.Block) => b.getInput("VALUE")!.connection!.getCheck();
        expect(decls.map(valueCheck)).toEqual([["int"], ["double", "int"], ["String"], ["boolean"], ["char"]]);
        expect(decls.map((b) => inputShape(b.getInput("VALUE")))).toEqual([SHAPE.ROUND, SHAPE.ROUND, SHAPE.SQUARE, SHAPE.HEXAGON, SHAPE.BEVEL]);
        const print = blocksOf(ws, B.print)[0];
        expect(print.getInput("VALUE")!.connection!.getCheck()).toBeNull();
        expect(inputShape(print.getInput("VALUE"))).toBe(SHAPE.WAVE);
        ws.dispose();
    });

    test("Nur Passendes lässt sich einstecken", () => {
        const ws = load("boolean fertig = true;\nif (fertig) {\n    println(1);\n}\n");
        const checker = ws.connectionChecker;
        const ifBlock = blocksOf(ws, B.if)[0];
        const cond = ifBlock.getInput("COND")!.connection!;
        const number = ws.newBlock(B.number);
        number.setFieldValue("3", "NUM");
        const text = ws.newBlock(B.text);
        applyTypes(ws);
        cond.disconnect();
        expect(checker.canConnect(cond, number.outputConnection!, false)).toBe(false);
        expect(checker.canConnect(cond, text.outputConnection!, false)).toBe(false);
        const cmp = ws.newBlock(B.compare);
        applyTypes(ws);
        expect(checker.canConnect(cond, cmp.outputConnection!, false)).toBe(true);
        ws.dispose();
    });

    test("gleich/ungleich: die andere Seite gibt die Form vor (morphen)", () => {
        const ws = load("boolean b = name == \"x\";\nboolean c = 1 != 2;\n");
        const [eqText, neNum] = blocksOf(ws, B.compare);
        // A ist unbekannt (Variable nicht deklariert), B ist Text -> A nimmt nur Text
        expect(eqText.getInput("A")!.connection!.getCheck()).toEqual(["String"]);
        expect(neNum.getInput("A")!.connection!.getCheck()).toEqual(["int", "double", "char"]);
        // Wert in B herausnehmen: A wird wieder offen
        eqText.getInputTargetBlock("B")!.unplug();
        applyTypes(ws);
        expect(eqText.getInput("A")!.connection!.getCheck()).toBeNull();
        expect(inputShape(eqText.getInput("A"))).toBe(SHAPE.WAVE);
        ws.dispose();
    });

    test("Typfehler aus dem Java-Code: nichts wird herausgeworfen, Code bleibt gleich", () => {
        const code = "int x = \"Hallo\";\nboolean b = 5;\nif (x) {\n    println(x);\n}\n";
        const ws = load(code);
        const state = Blockly.serialization.workspaces.save(ws) as unknown as WorkspaceState;
        expect(JavaBlockGenerator.generate(state).code).toBe(code);
        ws.dispose();
    });

    test("Typ einer Variablen ändern: Verwendungen ändern ihre Form", () => {
        const ws = load("int zahl = 1;\nprintln(zahl);\n");
        const get = blocksOf(ws, B.varGet)[0];
        expect(get.getOutputShape()).toBe(SHAPE.ROUND);
        const decl = blocksOf(ws, B.varDeclare)[0];
        decl.getInputTargetBlock("VALUE")!.dispose(false);
        decl.setFieldValue("String", "TYPE");
        applyTypes(ws);
        expect(get.getOutputShape()).toBe(SHAPE.SQUARE);
        expect(decl.getInput("VALUE")!.connection!.getCheck()).toEqual(["String"]);
        ws.dispose();
    });

    test("Datentyp wechseln: der Startwert wird passend umgestellt", () => {
        const NL = String.fromCharCode(10);
        const ws = load("int zahl = 5;" + NL + "int wert = Input.readInt(\"?\");" + NL);
        const [decl, withInput] = blocksOf(ws, B.varDeclare);
        const code = () => JavaBlockGenerator.generate(Blockly.serialization.workspaces.save(ws) as unknown as WorkspaceState).code.split(NL)[0];
        const steps: [string, string][] = [["double", "double zahl = 5.0;"], ["String", "String zahl = \"5.0\";"],
            ["char", "char zahl = '5';"], ["boolean", "boolean zahl = false;"], ["int", "int zahl = 0;"]];
        for (const [type, expected] of steps) {
            decl.setFieldValue(type, "TYPE");
            adaptDeclarationValue(decl, type as never);
            applyTypes(ws);
            expect(code()).toBe(expected);
        }
        // leeres Loch bekommt einen Startwert, Ausdrücke bleiben unverändert
        decl.getInputTargetBlock("VALUE")!.dispose(false);
        decl.setFieldValue("String", "TYPE");
        adaptDeclarationValue(decl, "String");
        expect(code()).toBe("String zahl = \"\";");
        withInput.setFieldValue("double", "TYPE");
        adaptDeclarationValue(withInput, "double");
        expect(withInput.getInputTargetBlock("VALUE")!.type).toBe(B.input);
        ws.dispose();
    });

    test("Werte umwandeln", () => {
        expect(convertLiteral("12", "int")).toEqual({ type: B.number, fields: { NUM: "12" } });
        expect(convertLiteral("2.9", "int")).toEqual({ type: B.number, fields: { NUM: "2" } });
        expect(convertLiteral("Ada", "int")).toEqual({ type: B.number, fields: { NUM: "0" } });
        expect(convertLiteral("7", "double")).toEqual({ type: B.number, fields: { NUM: "7.0" } });
        expect(convertLiteral("true", "boolean")).toEqual({ type: B.bool, fields: { VALUE: "true" } });
        expect(convertLiteral("Ada", "char")).toEqual({ type: B.char, fields: { CHAR: "A" } });
        expect(convertLiteral(null, "String")).toEqual({ type: B.text, fields: { TEXT: "" } });
    });
});
