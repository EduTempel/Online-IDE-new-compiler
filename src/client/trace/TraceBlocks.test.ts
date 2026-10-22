import { describe, expect, test } from "vitest";
import "../../compiler/common/interpreter/Interpreter";
import "../../compiler/java/JavaCompiler";
import * as Blockly from "blockly/core";
import { defineBlocks } from "../blocks/BlockDefinitions";
import { JavaBlockParser } from "../blocks/JavaBlockParser";
import { JavaBlockGenerator } from "../blocks/JavaBlockGenerator";
import { applyTypes } from "../blocks/BlockTypeSystem";
import { B, type WorkspaceState } from "../blocks/BlockTypes";
import { docToJava } from "../structogram/PseudoJava";
import { docFromDiagram } from "../structogram/StructogramDoc";
import { diagramsFromJava } from "../structogram/StructogramModel";

defineBlocks();
const NL = String.fromCharCode(10);
const lines = (...l: string[]) => l.join(NL) + NL;

function roundTrip(code: string) {
    const ws = new Blockly.Workspace();
    Blockly.serialization.workspaces.load(JavaBlockParser.parse(code).state, ws);
    applyTypes(ws);
    return { ws, code: JavaBlockGenerator.generate(Blockly.serialization.workspaces.save(ws) as unknown as WorkspaceState).code };
}

describe("Tracetabelle: Block und Struktogramm (Paket 10)", () => {
    test("trace(); und trace(\"…\"); werden Blöcke und zurück", () => {
        const code = lines(
            "int i = 0;",
            "while (i < 3) {",
            "    i++;",
            "    trace();",
            "}",
            "trace(\"Ende \\\"fertig\\\"\");",
        );
        const r = roundTrip(code);
        const traces = r.ws.getAllBlocks(true).filter((b) => b.type === B.trace);
        expect(traces.length).toBe(2);
        expect(traces.map((b) => b.getFieldValue("TEXT"))).toContain("Ende \"fertig\"");
        expect(r.code).toBe(code);
    });

    test("eigene Operation trace bleibt ein Aufruf", () => {
        const code = lines("trace();", "", "void trace() {", "    println(1);", "}");
        const r = roundTrip(code);
        expect(r.ws.getAllBlocks(true).some((b) => b.type === B.trace)).toBe(false);
    });

    test("trace mit Ausdruck bleibt Java-Text", () => {
        const r = roundTrip(lines("int a = 1;", "trace(\"a\" + a);"));
        expect(r.ws.getAllBlocks(true).some((b) => b.type === B.trace)).toBe(false);
        expect(r.code).toContain("trace(\"a\" + a);");
    });

    test("Struktogramm: Java -> Text -> Java", () => {
        const java = lines("int x = 1;", "trace();", "trace(\"nach x\");");
        const d = diagramsFromJava(java)[0];
        expect(JSON.stringify(d)).toContain("trage in die Tracetabelle ein");
        expect(JSON.stringify(d)).toContain("trage in die Tracetabelle ein („nach x“)");
        expect(docToJava(docFromDiagram(d)).code).toBe(java);
    });
});
