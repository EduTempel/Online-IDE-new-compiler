import { describe, expect, test } from "vitest";
import "../../compiler/common/interpreter/Interpreter";
import "../../compiler/java/JavaCompiler";
import * as Blockly from "blockly/core";
import { defineBlocks } from "../blocks/BlockDefinitions";
import { defineBloecklyBlocks } from "./BloecklyBlocks";
import { JavaBlockParser } from "../blocks/JavaBlockParser";
import { B, type BlockState } from "../blocks/BlockTypes";
import { BL_BLOCKS, BL_HATS } from "./BloecklySpec";
import { BL_HILFE, hilfeBeispiel, hilfeSchluessel } from "./BloecklyHilfe";

/** Paket 19j: Hilfe-Karte – jeder Block der Werkzeugleiste von Blöckly hat ein Beispiel, das sich als Blöcke zeigen lässt */

/** Blöcke, die Blöckly aus Blöckva übernimmt (siehe categoryItems und variableItems in BloecklyBlocks.ts) */
const ALLGEMEIN = [
    B.msgSend, B.msgSendWait, B.blSendWith, B.blSendWithWait, B.blWert,
    B.repeat, B.forever, B.if, `${B.if}:sonst`, B.while,
    B.arith, B.random, B.compare, B.logic, B.not, B.concat, B.strCharAt, B.strLength, B.strContains, B.math, B.number, B.text, B.bool,
    B.blVar, B.blList, B.varDeclare, B.varGet, B.varSet, B.varChange,
    B.listAdd, B.listRemove, B.listClear, B.listInsert, B.listSet, B.listGet, B.listIndexOf, B.listSize, B.listContains, B.collIsEmpty,
    B.blVon, B.method, B.call, B.callExpr, B.return, B.returnVoid,
];
const ALLE = [...BL_BLOCKS.map((b) => b.type), ...BL_HATS.map((h) => h.type), ...ALLGEMEIN];

function alle(blocks: BlockState[]): BlockState[] {
    const result: BlockState[] = [];
    const visit = (b: BlockState | undefined) => {
        for (; b; b = b.next?.block) {
            result.push(b);
            for (const i of Object.values(b.inputs ?? {})) visit(i.block);
        }
    };
    blocks.forEach(visit);
    return result;
}

describe("19j Hilfe-Karte", () => {
    test("jeder Block hat einen Satz und ein Beispiel", () => {
        const ohne = ALLE.filter((t) => !hilfeBeispiel(t)?.satz);
        expect(ohne).toEqual([]);
        // keine Beispiele für Blöcke, die es nicht gibt
        expect(Object.keys(BL_HILFE).filter((k) => !ALLE.includes(k))).toEqual([]);
    });

    test.each(ALLE)("%s: Beispiel lässt sich als Blöcke zeigen und enthält den Block", (schluessel) => {
        const b = hilfeBeispiel(schluessel)!;
        const { state } = JavaBlockParser.parse(b.text, { bloeckly: b.ctx });
        const blocks = alle(state.blocks.blocks);
        expect(blocks.filter((x) => /^j_java_/.test(x.type)).map((x) => x.fields?.CODE ?? x.extraState?.code)).toEqual([]);
        const [type, art] = schluessel.split(":");
        const treffer = blocks.filter((x) => x.type === type);
        expect(treffer.length).toBeGreaterThan(0);
        if (type === B.if) {
            const mitSonst = (x: BlockState) => (x.extraState as { hasElse?: boolean } | undefined)?.hasElse === true;
            expect(treffer.some((x) => hilfeSchluessel(x.type, mitSonst(x)) === schluessel)).toBe(true);
            if (!art) expect(treffer.some(mitSonst)).toBe(false);
        }
    });
});

describe("19b nachgebessert", () => {
    test("„x-Position von Pinguin“ zeigt nach dem Laden die Beschriftung, nicht den Methodennamen", () => {
        defineBlocks();
        defineBloecklyBlocks();
        const ws = new Blockly.Workspace();
        try {
            const b = Blockly.serialization.blocks.append({ type: B.blVon, fields: { ATTR: "xPosition", FIGUR: "Pinguin" } }, ws, { recordUndo: false });
            expect(b.getField("ATTR")!.getText()).toBe("x-Position");
        } finally {
            ws.dispose();
        }
    });
});
