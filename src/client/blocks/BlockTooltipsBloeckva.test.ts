import { describe, expect, test } from "vitest";
import "../../compiler/common/interpreter/Interpreter";
import "../../compiler/java/JavaCompiler";
import * as Blockly from "blockly/core";
import { B } from "./BlockTypes";
import { setTooltipApp } from "./BlockTooltips";
import { defineBlocks } from "./BlockDefinitions";

/** Blöckva: alle Blöcke ohne Java-Sprech im Tooltip (eigene Datei, weil die Blöcke nur einmal definiert werden) */

const JAVA = [
    /\bJava\b/, /\b(int|double|boolean|char|String|void|Integer|ArrayList|private|public|extends|this|new|while|for|return|println)\b/,
    /\[\]/, /@\w/, /Math\./, /\.\w+\(/, /\w\(\)/, /\+\+|--|\+=|-=/, /'.'/, /""/,
];
const JAVA_BLOCKS = new Set<string>([B.javaStatement, B.javaExpression, B.javaRaw]);

setTooltipApp(4);
defineBlocks();

describe("Tooltips ohne Java (Blöckva)", () => {
    test("kein Block zeigt Java im Tooltip", () => {
        let checked = 0;
        for (const type of [...new Set(Object.values(B) as string[])]) {
            if (!Blockly.Blocks[type] || JAVA_BLOCKS.has(type)) continue;
            const ws = new Blockly.Workspace();
            let t: unknown;
            try {
                t = ws.newBlock(type).getTooltip();
            } catch {
                continue;
            } finally {
                ws.dispose();
            }
            if (typeof t !== "string") continue;
            checked++;
            for (const re of JAVA) expect(t, `${type}: ${t}`).not.toMatch(re);
        }
        expect(checked).toBeGreaterThan(120);
    });
});
