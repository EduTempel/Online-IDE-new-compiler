import { describe, expect, test } from "vitest";
import "../../compiler/common/interpreter/Interpreter";
import "../../compiler/java/JavaCompiler";
import * as Blockly from "blockly/core";
import { B } from "./BlockTypes";
import { setTooltipApp, tip } from "./BlockTooltips";
import { defineBlocks } from "./BlockDefinitions";
import { defineBloecklyBlocks } from "../bloeckly/BloecklyBlocks";
import { BL_BLOCKS, BL_HATS } from "../bloeckly/BloecklySpec";

/**
 * Tooltips ohne Java in Blöckly (Sek. I) und Blöckva. Die Blöcke werden hier für Blöckly erzeugt; Blöckva bekommt
 * dieselben Texte, nur ohne die eigenen Blöckly-Fassungen (siehe tip()).
 */

/** Java-Sprech: Schlüsselwörter, Typen, Aufrufe, Operatoren, Annotationen */
const JAVA = [
    /\bJava\b/, /\b(int|double|boolean|char|String|void|Integer|ArrayList|private|public|extends|this|new|while|for|return|println)\b/,
    /\[\]/, /@\w/, /Math\./, /\.\w+\(/, /\w\(\)/, /\+\+|--|\+=|-=/, /'.'/, /""/, /\bsetName|getName\b/,
];
/** Begriffe von Blöckva, die es in Blöckly nicht gibt (dort: Skripte) */
const NOT_SEK1 = [/Programmteil/, /Hauptprogramm/];
/** Blöcke mit Java-Code als Inhalt (in Blöckly nur „gibt es nicht als Block“) */
const JAVA_BLOCKS = new Set<string>([B.javaStatement, B.javaExpression]);

setTooltipApp(6);
defineBlocks();
defineBloecklyBlocks();

function tooltipOf(type: string): string | undefined {
    const ws = new Blockly.Workspace();
    try {
        const t = ws.newBlock(type).getTooltip();
        return typeof t === "string" ? t : undefined;
    } catch {
        return undefined;   // Block braucht einen Zustand (z. B. Aufruf ohne Operation)
    } finally {
        ws.dispose();
    }
}

const ALL = [...new Set(Object.values(B) as string[])].filter((t) => Blockly.Blocks[t]);

/** gemeinsame Blöcke in der Werkzeugleiste von Blöckly (BloecklyBlocks.categoryItems) */
const BLOECKLY_SHARED = [B.msgSend, B.msgSendWait, B.repeat, B.forever, B.if, B.while, B.arith, B.random, B.compare, B.logic,
    B.not, B.concat, B.strCharAt, B.strLength, B.strContains, B.math, B.number, B.text, B.bool, B.varDeclare, B.varGet,
    B.varSet, B.varChange, B.method, B.call, B.callExpr, B.return, B.returnVoid, B.javaRaw];

describe("Tooltips ohne Java (Blocks, Mix)", () => {
    test("tip(): Java nur in Code, eigener Text für Blocks", () => {
        setTooltipApp(1);
        expect(tip("Erhöht.", "zahl++;", "Zählt eins dazu.")).toBe("Erhöht.\nCode: zahl++;");
        setTooltipApp(4);
        expect(tip("Erhöht.", "zahl++;", "Zählt eins dazu.")).toBe("Erhöht.");
        setTooltipApp(6);
        expect(tip("Erhöht.", "zahl++;", "Zählt eins dazu.")).toBe("Zählt eins dazu.");
        expect(tip("Erhöht.", "zahl++;")).toBe("Erhöht.");
    });

    test("kein Block zeigt Java im Tooltip", () => {
        const checked: string[] = [];
        for (const type of ALL) {
            if (JAVA_BLOCKS.has(type)) continue;
            const t = tooltipOf(type);
            if (t === undefined) continue;
            checked.push(type);
            for (const re of JAVA) expect(t, `${type}: ${t}`).not.toMatch(re);
        }
        expect(checked.length).toBeGreaterThan(120);
    });

    test("Blocks: Texte für die Sek. I (Skripte statt Programmteile, kein Hauptprogramm)", () => {
        const types = [...BLOECKLY_SHARED, ...BL_BLOCKS.map((b) => b.type), ...BL_HATS.map((h) => h.type), B.blFigure, B.blVar, B.blList];
        let checked = 0;
        for (const type of types) {
            const t = tooltipOf(type);
            if (t === undefined) continue;
            checked++;
            expect(t, type).not.toBe("");
            for (const re of [...JAVA, ...NOT_SEK1]) expect(t, `${type}: ${t}`).not.toMatch(re);
        }
        expect(checked).toBeGreaterThan(types.length - 5);
    });
});
