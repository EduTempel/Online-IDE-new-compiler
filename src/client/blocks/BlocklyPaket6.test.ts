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
import { ZOO } from "./JavaBlocksPaket6.test";
import { runJava } from "./RunJava";

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
const out = (b: Blockly.Block) => b.outputConnection!.getCheck();
function press(block: Blockly.Block, text: string, nth = 0) {
    const buttons = block.inputList.flatMap((i) => i.fieldRow).filter((f) => f.getText() === text);
    (buttons[nth] as unknown as { showEditor_(): void }).showEditor_();
}
function rename(ws: Blockly.Workspace, block: Blockly.Block, field: string, value: string) {
    const old = block.getFieldValue(field);
    block.setFieldValue(value, field);
    const Change = Blockly.Events.get(Blockly.Events.BLOCK_CHANGE);
    handleRename(ws, new Change(block, "field", field, old, value) as Blockly.Events.BlockChange);
}
const classBlock = (ws: Blockly.Workspace, name: string) => blocksOf(ws, B.class).find((b) => b.getFieldValue("NAME") === name)!;
const memberOf = (cls: Blockly.Block, type: string, name?: string) =>
    cls.getDescendants(false).find((b) => b.type === type && (name === undefined || b.getFieldValue("NAME") === name))!;

describe("Paket 6 mit Blockly", () => {

    test("Laden und Speichern ändert den Code nicht", () => {
        expect(generate(load(ZOO))).toBe(ZOO);
    });

    test("Typen: Objekte, Unterklassen, Ergebnisse, Konstruktor-Werte", () => {
        const ws = load(ZOO);
        const hundNew = blocksOf(ws, B.objNew).find((b) => b.getFieldValue("CLASS") === "Hund")!;
        expect(out(hundNew)).toEqual(["Hund"]);
        expect(hundNew.getOutputShape()).toBe(SHAPE.OBJECT);
        expect(check(hundNew, "ARG0")).toEqual(["String"]);
        expect(check(hundNew, "ARG1")).toEqual(["int"]);
        // ein Hund passt in eine Liste von Tieren (Unterklasse)
        const add = blocksOf(ws, B.listAdd)[0];
        expect(check(add, "V")).toEqual(expect.arrayContaining(["Tier", "Hund"]));
        // Ergebnis einer Operation: Typ aus der Klasse (auch geerbt)
        const getAlter = blocksOf(ws, B.objCallExpr).find((b) => b.getFieldValue("METHOD") === "getAlter")!;
        expect(out(getAlter)).toEqual(["int"]);
        const getName = blocksOf(ws, B.objCallExpr).find((b) => b.getFieldValue("METHOD") === "getName")!;
        expect(out(getName)).toEqual(["String"]);
        const setAlter = blocksOf(ws, B.objCall).find((b) => b.getFieldValue("METHOD") === "setAlter")!;
        expect(check(setAlter, "ARG0")).toEqual(["int"]);
        // super(name) passt zum Konstruktor der Oberklasse
        expect(check(blocksOf(ws, B.superCall)[0], "ARG0")).toEqual(["String"]);
        // Beschriftung der Werte: Parameternamen
        expect(hundNew.inputList.flatMap((i) => i.fieldRow).map((f) => f.getText()).filter((t) => t.endsWith(":"))).toEqual(["name:", "alter:"]);
        // keine Hinweise im ganzen Programm
        expect(ws.getAllBlocks(false).map((b) => (b as Blockly.Block & { gsgTypeWarning?: string }).gsgTypeWarning).filter(Boolean)).toEqual([]);
    });

    test("Variablen in Klassen: Attribute (auch geerbte), Parameter, lokale", () => {
        const ws = load(ZOO);
        const hund = classBlock(ws, "Hund");
        const bellen = memberOf(hund, B.classMethod, "bellen");
        const inBellen = bellen.getInputTargetBlock("BODY")!;
        expect([...variablesFor(inBellen).keys()].sort()).toEqual(["alter", "name"]);
        const ctor = memberOf(hund, B.ctor);
        expect([...variablesFor(ctor.getInputTargetBlock("BODY")!).entries()].sort()).toEqual([["alter", "int"], ["name", "String"]]);
        const main = ws.getBlockById("start")!.getInputTargetBlock("BODY")!;
        expect(variablesFor(main).get("bello")).toBe("Hund");
        expect(variablesFor(main).has("alter")).toBe(false);
    });

    test("+ get/set erzeugt Operationen; der Code läuft", async () => {
        const ws = load(lines(
            "Konto k = new Konto();",
            "k.setStand(5.5);",
            "println(k.getStand());",
            "",
            "class Konto {",
            "    private double stand;",
            "}",
        ));
        const attr = blocksOf(ws, B.attribute)[0];
        press(attr, "+ get/set");
        press(attr, "+ get/set");   // zweimal: nichts doppelt
        const code = generate(ws);
        expect(code).toBe(lines(
            "Konto k = new Konto();",
            "k.setStand(5.5);",
            "println(k.getStand());",
            "",
            "class Konto {",
            "    private double stand;",
            "",
            "    public double getStand() {",
            "        return stand;",
            "    }",
            "",
            "    public void setStand(double stand) {",
            "        this.stand = stand;",
            "    }",
            "}",
        ));
        const r = await runJava(code);
        expect(r.errors).toEqual([]);
        expect(r.output).toBe(lines("5.5"));
    });

    test("Konstruktor ändern: neue Objekte passen sich an", () => {
        const ws = load(ZOO);
        const tier = classBlock(ws, "Tier");
        const ctor = memberOf(tier, B.ctor);
        press(ctor, "+ Parameter");
        syncCalls(ws);
        const katze = blocksOf(ws, B.objNew).find((b) => b.getFieldValue("CLASS") === "Tier")!;
        expect(katze.getInput("ARG1")).toBeTruthy();
        expect(generate(ws)).toContain("tiere.add(new Tier(\"Katze\", 0));");
        expect(generate(ws)).toContain("super(name, 0);");   // auch der Aufruf in der Unterklasse
    });

    test("Umbenennen: Klasse, Attribut, Operation", () => {
        const ws = load(ZOO);
        rename(ws, classBlock(ws, "Tier"), "NAME", "Lebewesen");
        rename(ws, memberOf(classBlock(ws, "Hund"), B.attribute, "alter"), "NAME", "jahre");
        rename(ws, memberOf(classBlock(ws, "Hund"), B.classMethod, "bellen"), "NAME", "gibLaut");
        const code = generate(ws);
        expect(code).toContain("ArrayList<Lebewesen> tiere = new ArrayList<Lebewesen>();");
        expect(code).toContain("tiere.add(new Lebewesen(\"Katze\"));");
        expect(code).toContain("for (Lebewesen t : tiere) {");
        expect(code).toContain("class Hund extends Lebewesen {");
        expect(code).toContain("    public Lebewesen(String name) {");
        expect(code).toContain("    private int jahre = 0;");
        expect(code).toContain("        this.jahre = alter;");   // Parameter alter bleibt, das Attribut heißt jetzt jahre
        expect(code).toContain("        return jahre;");
        expect(code).toContain("bello.gibLaut();");
        expect(code).toContain("    public void gibLaut() {");
    });

    test("Hinweise: Teile außerhalb einer Klasse, super() außerhalb eines Konstruktors", () => {
        const ws = load(ZOO);
        const hund = classBlock(ws, "Hund");
        const attr = memberOf(hund, B.attribute, "alter");
        attr.unplug(true);
        ws.getBlockById("start")!.getInputTargetBlock("BODY")!.getNextBlock()!.unplug();
        const print = ws.newBlock(B.print);
        memberOf(classBlock(ws, "Tier"), B.classMethod, "getName").nextConnection!.connect(print.previousConnection!);
        applyTypes(ws);
        const warning = (b: Blockly.Block) => (b as Blockly.Block & { gsgTypeWarning?: string }).gsgTypeWarning ?? "";
        expect(warning(attr)).toContain("Klasse");
        expect(warning(print)).toContain("Operation oder einen Konstruktor");
    });
});
