import { describe, expect, test } from "vitest";
// Ladereihenfolge der Compiler-Module wie in der IDE (sonst zyklische Importe)
import "../../compiler/common/interpreter/Interpreter";
import "../../compiler/java/JavaCompiler";
import { JavaBlockParser } from "../blocks/JavaBlockParser";
import { JavaBlockGenerator } from "../blocks/JavaBlockGenerator";
import { B, type BlockState } from "../blocks/BlockTypes";
import { compileJava, runJava } from "../blocks/RunJava";
import { BLOCK_HANDBOOK } from "./HandbookBlocks";
import { JAVA_HANDBOOK } from "./HandbookJava";
import { STRUCTOGRAM_HANDBOOK } from "./HandbookStructogram";
import { docToJava } from "../structogram/PseudoJava";
import { definedTypes, exampleFileName, findBlockEntry } from "./HandbookSearch";
import * as Blockly from "blockly/core";
import { categoryOfColour, registerBlockHelpMenu } from "../blocks/BlockHelp";
import { setHandbookOpener, type OpenOptions } from "./Handbook";
import { BLOCK_CATEGORY_IDS, COLOURS } from "../blocks/BlockDefinitions";
import { ADT_COLOUR } from "../blocks/BlockCollections";

const roundTrip = (code: string) => JavaBlockGenerator.generate(JavaBlockParser.parse(code).state).code;

export const blockTypesOf = (code: string) => {
    const result = new Set<string>();
    const visit = (b: BlockState | undefined) => {
        for (; b; b = b.next?.block) {
            result.add(b.type);
            for (const i of Object.values(b.inputs ?? {})) visit(i.block);
        }
    };
    for (const top of JavaBlockParser.parse(code).state.blocks.blocks) visit(top);
    return result;
};

const blockEntries = BLOCK_HANDBOOK.flatMap((s) => s.entries.map((e) => ({ section: s.id, ...e })));

describe("Handbuch: Blöcke", () => {
    test("Abschnitte entsprechen den Kategorien der Werkzeugleiste", () => {
        expect(BLOCK_HANDBOOK.map((s) => s.id).sort()).toEqual([...BLOCK_CATEGORY_IDS].sort());
    });

    test.each(blockEntries.map((e) => [`${e.section}: ${e.title}`, e] as const))("%s: Blöcke ↔ Java unverändert", (_, e) => {
        expect(roundTrip(e.code)).toBe(e.code);
        if (e.section !== "java") expect(JSON.stringify(JavaBlockParser.parse(e.code).state)).not.toMatch(/j_java_(expr|stmt|raw)/);
    });

    test("jeder Block der Werkzeugleiste kommt in einem Beispiel vor", () => {
        // nicht in der Werkzeugleiste: alte Formen, Java-Text aus dem Parser, nur für Struktogramme
        const notInToolbox: string[] = [B.varSub, B.varInc, B.varDec, B.dynIsEmpty, B.javaRaw, B.switch, B.doWhile];
        const used = new Set(blockEntries.flatMap((e) => [...blockTypesOf(e.code)]));
        expect(Object.values(B).filter((t) => !used.has(t) && !notInToolbox.includes(t))).toEqual([]);
    });

    test.each(blockEntries.map((e) => [`${e.section}: ${e.title}`, e] as const))("%s: übersetzbar, ggf. lauffähig", async (_, e) => {
        if (e.runs) expect((await runJava(e.code, e.libs)).errors).toEqual([]);
        else expect(await compileJava(e.code, e.libs)).toEqual([]);
    });
});

const javaEntries = JAVA_HANDBOOK.flatMap((s) => s.entries.map((e) => ({ section: s.id, ...e })));

describe("Handbuch: Java", () => {
    test("Kennungen und Titel sind eindeutig", () => {
        expect(new Set(JAVA_HANDBOOK.map((s) => s.id)).size).toBe(JAVA_HANDBOOK.length);
        expect(new Set(javaEntries.map((e) => e.title)).size).toBe(javaEntries.length);
    });

    test.each(javaEntries.map((e) => [`${e.section}: ${e.title}`, e] as const))("%s: übersetzbar, ggf. lauffähig", async (_, e) => {
        expect(e.code.endsWith("\n")).toBe(true);
        if (e.runs) {
            const r = await runJava(e.code, e.libs);
            expect(r.errors).toEqual([]);
            expect(r.output).not.toMatch(/Exception|Fehler/);
        } else expect(await compileJava(e.code, e.libs)).toEqual([]);
    });
});

const structogramEntries = STRUCTOGRAM_HANDBOOK.flatMap((s) => s.entries.map((e) => ({ section: s.id, ...e })));

describe("Handbuch: Struktogramme", () => {
    test("Kennungen und Titel sind eindeutig", () => {
        expect(new Set(STRUCTOGRAM_HANDBOOK.map((s) => s.id)).size).toBe(STRUCTOGRAM_HANDBOOK.length);
        expect(new Set(structogramEntries.map((e) => e.title)).size).toBe(structogramEntries.length);
    });

    test.each(structogramEntries.map((e) => [`${e.section}: ${e.title}`, e] as const))("%s: vollständig in Java umwandelbar, übersetzbar, ggf. lauffähig", async (_, e) => {
        expect(e.structogram).toBeDefined();
        expect(docToJava(e.structogram!).todos, e.code).toBe(0);
        // Operationen: im Test mit einem Aufruf davor (wie Hauptprogramm + Operation in einer Datei)
        const program = (e.call ? e.call + "\n\n" : "") + e.code;
        if (e.runs) {
            const r = await runJava(program, e.libs);
            expect(r.errors, program).toEqual([]);
            expect(r.output).not.toMatch(/Exception|Fehler/);
        } else expect(await compileJava(program, e.libs), program).toEqual([]);
    });
});

describe("Handbuch: Hilfe und Ausprobieren", () => {
    test("Hilfe per Rechtsklick findet für jeden Block ein Beispiel in seiner Kategorie", () => {
        for (const s of BLOCK_HANDBOOK) {
            for (const e of s.entries) {
                for (const type of blockTypesOf(e.code)) {
                    const hit = findBlockEntry(BLOCK_HANDBOOK, type, s.id);
                    const hitSection = BLOCK_HANDBOOK.find((x) => x.id === hit?.section);
                    // im eigenen Abschnitt oder einem seiner Unterabschnitte
                    expect(hit?.section === s.id || hitSection?.parent === s.id, `${type} aus ${s.id} → ${hit?.section}`).toBe(true);
                }
            }
        }
        // Beispiel: „gib aus“ führt aus der Kategorie Ausgabe zum ersten Ausgabe-Beispiel
        expect(findBlockEntry(BLOCK_HANDBOOK, B.print, "ausgabe")).toEqual({ section: "ausgabe", index: 0 });
        expect(findBlockEntry(BLOCK_HANDBOOK, B.stackPush, "adt")?.section).toBe("adt");
        expect(findBlockEntry(BLOCK_HANDBOOK, "gibt_es_nicht", "adt")).toBeUndefined();
    });

    test("Dateiname aus dem Titel, definierte Klassen", () => {
        expect(exampleFileName("falls … dann … sonst")).toBe("falls dann sonst.java");
        expect(exampleFileName("Öffentliche Attribute und „dieses Objekt“")).toBe("Öffentliche Attribute und dieses Objekt.java");
        expect(exampleFileName("Einfügen, ersetzen, entfernen, lesen")).toBe("Einfügen, ersetzen, entfernen, lesen.java");
        expect(definedTypes("x();\n\nabstract class Form {\n}\nclass Kreis extends Form {\n}\ninterface Sprecher {\n}\n")).toEqual(["Form", "Kreis", "Sprecher"]);
    });

    test("Blockfarbe → Kategorie", () => {
        expect(categoryOfColour(COLOURS.control)).toBe("steuerung");
        expect(categoryOfColour(ADT_COLOUR.toUpperCase())).toBe("adt");
        expect(categoryOfColour("#123456")).toBeUndefined();
    });

    test("Rechtsklick „Hilfe“ öffnet das Handbuch beim Block und seiner Kategorie", () => {
        registerBlockHelpMenu();
        registerBlockHelpMenu();   // zweite Blockansicht: keine doppelte Anmeldung
        const item = Blockly.ContextMenuRegistry.registry.getItem("gsg_block_help") as unknown as {
            scopeType: string; preconditionFn: () => string; callback: (scope: Blockly.ContextMenuRegistry.Scope) => void;
        };
        expect(item.scopeType).toBe(Blockly.ContextMenuRegistry.ScopeType.BLOCK);
        let opened: OpenOptions | undefined;
        setHandbookOpener((o) => { opened = o; });
        expect(item.preconditionFn()).toBe("enabled");
        item.callback({ block: { type: B.stackPush, getColour: () => ADT_COLOUR } as never });
        expect(opened).toEqual({ kind: "blocks", blockType: B.stackPush, section: "adt" });
    });
});
