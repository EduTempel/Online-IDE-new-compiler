import { expect, test } from "vitest";
import "../../compiler/common/interpreter/Interpreter";
import "../../compiler/java/JavaCompiler";
import * as Blockly from "blockly/core";
import { defineBlocks } from "./BlockDefinitions";
import { JavaBlockParser } from "./JavaBlockParser";
import { JavaBlockGenerator } from "./JavaBlockGenerator";
import type { WorkspaceState } from "./BlockTypes";

test("Blöcke laden und speichern (Blockly ohne Oberfläche) ändert den Code nicht", () => {
    defineBlocks();
    const code = [
        "// Würfeln",
        "int summe = 0;",
        "for (int i = 1; i <= 3; i++) {",
        "    int wurf = Random.randint(1, 6);",
        "    summe += wurf;",
        "    if (wurf == 6 || !(summe < 10)) {",
        "        println(\"Glück!\");",
        "    } else {",
        "        print(wurf + \" \");",
        "    }",
        "}",
        "double w = Math.sqrt(summe) * Input.readDouble(\"Faktor?\");",
        "class A {",
        "    int x;",
        "}",
        "",
    ].join("\n");
    const ws = new Blockly.Workspace();
    Blockly.serialization.workspaces.load(JavaBlockParser.parse(code).state, ws);
    const saved = Blockly.serialization.workspaces.save(ws) as WorkspaceState;
    expect(JavaBlockGenerator.generate(saved).code).toBe(code);
    // Programmstart lässt sich nicht löschen
    expect(ws.getBlockById("start")!.isDeletable()).toBe(false);
    ws.dispose();
});
