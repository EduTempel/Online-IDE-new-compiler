import { describe, expect, test } from "vitest";
import { blockSchluessel, filtereEintraege, knopfGehoertZu, mikroweltAus, mikroweltDerAufgabe, mikroweltToolbox, type ToolboxEintrag } from "./BlockMikrowelt";
import { toolbox } from "./BlockDefinitions";
import { B } from "./BlockTypes";

/** Paket 19k: Mikrowelten – nur ausgewählte Blöcke in der Werkzeugleiste */

const blk = (type: string, extra: Partial<ToolboxEintrag> = {}): ToolboxEintrag => ({ kind: "block", type, ...extra });
const label = (text: string): ToolboxEintrag => ({ kind: "label", text });

describe("19k Mikrowelten", () => {
    test("Schlüssel: Typ, bei Rechnen/Vergleichen mit Zeichen, „falls … sonst“ eigens", () => {
        expect(blockSchluessel(blk(B.arith, { fields: { OP: "+" } }))).toBe(`${B.arith}:+`);
        expect(blockSchluessel(blk(B.math, { fields: { FUNC: "round" } }))).toBe(`${B.math}:round`);
        expect(blockSchluessel(blk(B.if, { extraState: { elseIfs: 0, hasElse: true, fixed: true } }))).toBe(`${B.if}:sonst`);
        expect(blockSchluessel(blk(B.if, { extraState: { elseIfs: 0, hasElse: false, fixed: true } }))).toBe(B.if);
        expect(blockSchluessel(blk(B.varGet, { fields: { NAME: "punkte" } }))).toBe(B.varGet);
    });

    test("Auswahl aus der Aufgabe: bereinigt, leer = keine Einschränkung", () => {
        expect(mikroweltAus({ bewegung: ["bl_gehe", "bl_gehe", 3, ""], aussehen: [] , x: "nein" })).toEqual({ bewegung: ["bl_gehe"] });
        expect(mikroweltAus({ bewegung: [] })).toBeUndefined();
        expect(mikroweltAus(["bl_gehe"])).toBeUndefined();
        expect(mikroweltDerAufgabe({ gsgTask: { title: "A", bloecke: { steuerung: [B.repeat] } } })).toEqual({ steuerung: [B.repeat] });
        expect(mikroweltDerAufgabe({})).toBeUndefined();
    });

    test("Kategorie kürzen: Beschriftungen ohne übrige Blöcke fallen weg, Hinweise bleiben, Knöpfe nach Zuordnung", () => {
        knopfGehoertZu("TEST_LISTE", [B.listAdd]);
        const items: ToolboxEintrag[] = [
            label("Rechnen"), blk(B.arith, { fields: { OP: "+" } }), blk(B.arith, { fields: { OP: "*" } }),
            label("Werte"), blk(B.number), blk(B.text),
            label("Lege eine Variable an."),
            label("Listen"), { kind: "button", text: "Neue Liste", callbackKey: "TEST_LISTE" },
            label("Anderes"), { kind: "button", text: "Sonstiges", callbackKey: "ANDERER" },
        ];
        const r = filtereEintraege(items, [`${B.arith}:+`]);
        expect(r.map((e) => e.text ?? blockSchluessel(e))).toEqual(["Rechnen", `${B.arith}:+`, "Lege eine Variable an.", "Anderes", "Sonstiges"]);
        expect(filtereEintraege(items, [B.listAdd]).map((e) => e.text ?? blockSchluessel(e)))
            .toEqual(["Lege eine Variable an.", "Listen", "Neue Liste", "Anderes", "Sonstiges"]);
    });

    test("Werkzeugleiste von Mix: leere Kategorien verschwinden, Variablen bleiben als Ordner für Listen", () => {
        const def = toolbox() as { contents: ToolboxEintrag[] };
        const r = mikroweltToolbox(def, { steuerung: [B.repeat], listen: [B.listAdd] });
        const ids = (items: ToolboxEintrag[]): unknown[] => items.filter((c) => c.kind === "category")
            .map((c) => Array.isArray(c.contents) && (c.contents as ToolboxEintrag[]).some((x) => x.kind === "category")
                ? [c.toolboxitemid, ids(c.contents as ToolboxEintrag[])] : c.toolboxitemid);
        expect(ids(r.contents)).toEqual(["steuerung", ["variablen", ["listen"]]]);
        const steuerung = r.contents.find((c) => c.toolboxitemid === "steuerung")!.contents as ToolboxEintrag[];
        expect(steuerung.filter((e) => e.kind === "block").map((e) => e.type)).toEqual([B.repeat]);
        // ohne Auswahl: unverändert
        expect(mikroweltToolbox(def, undefined)).toBe(def);
    });
});
