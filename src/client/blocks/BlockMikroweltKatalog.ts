import * as Blockly from "blockly/core";
import { B } from "./BlockTypes";
import { blockSchluessel, type KatalogBlock, type KatalogKategorie, type ToolboxEintrag } from "./BlockMikrowelt";

/**
 * GSG (Paket 19k): Katalog für den Aufgaben-Editor – alle Blöcke der Werkzeugleiste je Kategorie, mit einer
 * kurzen Beschriftung („gehe ( 10 ) Schritte“). Dynamische Kategorien (Variablen, eigene Blöcke …) zeigen je nach
 * Projekt nicht alle Blöcke; die fehlenden ergänzt EXTRAS mit Beispielnamen.
 */

const v = (name: string) => ({ NAME: name });
const LISTEN = [B.listAdd, B.listRemove, B.listClear, B.listInsert, B.listSet, B.listGet, B.listIndexOf, B.listSize, B.listContains, B.collIsEmpty];

/** Blöcke, die erst mit Variablen bzw. eigenen Blöcken erscheinen (Kategorie -> Einträge) */
const EXTRAS: Record<string, ToolboxEintrag[]> = {
    variablen: [
        { kind: "block", type: B.varGet, fields: v("punkte") },
        { kind: "block", type: B.varSet, fields: v("punkte") },
        { kind: "block", type: B.varChange, fields: { OP: "+", NAME: "punkte" } },
    ],
    meine: [{ kind: "block", type: B.call, fields: v("meinBlock") }, { kind: "block", type: B.callExpr, fields: v("meinBlock") }],
    operationen: [{ kind: "block", type: B.call, fields: v("meineOperation") }, { kind: "block", type: B.callExpr, fields: v("meineOperation") }],
};
/** Blöckly: Listen stehen unter Variablen */
const BLOECKLY_EXTRAS: Record<string, ToolboxEintrag[]> = {
    variablen: LISTEN.map((type) => ({ kind: "block", type, fields: v("liste") })),
};

type Kategorie = ToolboxEintrag & { name?: string; colour?: string; custom?: string };

/** sichtbare Beschriftung eines Blocks mit den Werten in seinen Eingängen (ohne Java-Hinweise, ohne Inhalt) */
function text(b: Blockly.Block): string {
    const teile: string[] = [];
    for (const input of b.inputList) {
        if (!input.isVisible()) continue;
        for (const f of input.fieldRow) {
            const t = f.isVisible() ? f.getText().trim() : "";
            if (t) teile.push(t);
        }
        if (input.type !== Blockly.inputs.inputTypes.VALUE) continue;
        const kind = input.connection?.targetBlock();
        teile.push(kind ? text(kind) : "…");
    }
    return teile.join(" ");
}

/** Beschriftung eines Blocks (ohne Arbeitsfläche gebaut); geht das nicht: der Blocktyp */
function beschriftung(ws: Blockly.Workspace, e: ToolboxEintrag): string {
    try {
        const b = Blockly.serialization.blocks.append(e as Blockly.serialization.blocks.State, ws, { recordUndo: false });
        return text(b).replace(/\s+/g, " ").trim() || String(e.type);
    } catch {
        return String(e.type);
    } finally {
        ws.clear();
    }
}

/**
 * Katalog aus der Werkzeugleiste: Kategorien (auch Unterkategorien) mit ihren Blöcken, jeder Schlüssel einmal.
 * inhalt liefert den Inhalt einer Kategorie (feste Einträge oder die der dynamischen Kategorie).
 */
export function katalogAus(def: { contents?: unknown }, inhalt: (k: Kategorie) => ToolboxEintrag[], bloeckly: boolean): KatalogKategorie[] {
    const ws = new Blockly.Workspace();
    const result: KatalogKategorie[] = [];
    try {
        const walk = (items: Kategorie[], tiefe: number) => {
            for (const c of items) {
                if (c.kind !== "category") continue;
                const id = c.toolboxitemid ?? "";
                const basis = id.replace(/^bl-/, "");   // Blöckly: bl-variablen …
                const eintraege = [...inhalt(c), ...(EXTRAS[basis] ?? []), ...(bloeckly ? BLOECKLY_EXTRAS[basis] ?? [] : [])];
                const bloecke: KatalogBlock[] = [];
                const gesehen = new Set<string>();
                for (const e of eintraege) {
                    if (e.kind !== "block") continue;
                    const schluessel = blockSchluessel(e);
                    if (!schluessel || gesehen.has(schluessel)) continue;
                    gesehen.add(schluessel);
                    bloecke.push({ schluessel, text: beschriftung(ws, e) });
                }
                result.push({ id, name: String(c.name ?? id), colour: c.colour, tiefe, bloecke });
                if (Array.isArray(c.contents)) walk(c.contents as Kategorie[], tiefe + 1);
            }
        };
        walk((def.contents ?? []) as Kategorie[], 0);
    } finally {
        ws.dispose();
    }
    return result;
}
