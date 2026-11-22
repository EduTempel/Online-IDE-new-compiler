import { B, istErstelleBlock, type BlockState, type WorkspaceState } from "../blocks/BlockTypes";
import { DEFAULT_MESSAGE } from "../blocks/BlockParts";
import { blHat } from "./BloecklySpec";

/**
 * Blöckly, 11.11.2026: Der Kopfblock einer Figur bzw. der Bühne („🐾 Waschbär – Variablen nur für diese Figur“) steht
 * nicht mehr in der Fläche. Variablen legt man mit „erstelle Variable …“ oben in einem Skript an; in einer Figur gelten
 * sie nur für diese Figur, auf der Bühne für alle Figuren.
 *
 * kopfAusFlaeche nimmt den Kopf (Klassenname, Konstruktor, Kommentare) aus dem geladenen Zustand – die Blockansicht
 * hält ihn unsichtbar und setzt ihn beim Zurückschreiben wieder davor. Variablen, die noch im Kopf stehen (ältere
 * Projekte, „Neue Liste für alle Figuren“), wandern oben in ein Skript: „Wenn 🚩 angeklickt“, sonst das oberste.
 * Gibt es kein Skript, entsteht eins – „Wenn 🚩 angeklickt“, wenn die Flagge im Projekt noch frei ist, sonst
 * „Wenn ich los empfange“. Der Java-Code ändert sich erst beim nächsten Schreiben (die Variable steht dann vor dem
 * Skript statt oben in der Klasse – gleiche Bedeutung).
 */
export function kopfAusFlaeche(state: WorkspaceState, flaggeAnderswo: boolean): BlockState | undefined {
    const oben = state.blocks?.blocks ?? [];
    const kopf = oben.find((b) => b.type === B.blFigure);
    if (!kopf) return undefined;
    const rest = oben.filter((b) => b !== kopf);
    // Variablen aus dem Kopf lösen; Kommentare und nicht erkannter Text bleiben dort
    const variablen: BlockState[] = [];
    const bleibt: BlockState[] = [];
    for (let v = kopf.inputs?.VARS?.block; v; v = v.next?.block) (istErstelleBlock(v.type) ? variablen : bleibt).push(v);
    if (variablen.length) {
        for (let i = 0; i < bleibt.length; i++) {
            if (i + 1 < bleibt.length) bleibt[i].next = { block: bleibt[i + 1] };
            else delete bleibt[i].next;
        }
        if (bleibt.length) kopf.inputs = { ...(kopf.inputs ?? {}), VARS: { block: bleibt[0] } };
        else if (kopf.inputs) delete kopf.inputs.VARS;
        const skripte = rest.filter((b) => blHat(b.type)).sort((a, b) => (a.y ?? 0) - (b.y ?? 0));
        let ziel = skripte.find((b) => b.type === B.blFlag) ?? skripte[0];
        if (!ziel) {
            ziel = flaggeAnderswo
                ? { type: B.blMsg, fields: { MSG: DEFAULT_MESSAGE }, x: 20, y: 20 }
                : { type: B.blFlag, x: 20, y: 20 };
            for (const b of rest) b.y = (b.y ?? 0) + 200;
            rest.unshift(ziel);
        }
        for (let i = 0; i < variablen.length - 1; i++) variablen[i].next = { block: variablen[i + 1] };
        const body = ziel.inputs?.BODY?.block;
        if (body) variablen[variablen.length - 1].next = { block: body };
        else delete variablen[variablen.length - 1].next;
        ziel.inputs = { ...(ziel.inputs ?? {}), BODY: { block: variablen[0] } };
    }
    state.blocks = { languageVersion: state.blocks?.languageVersion ?? 0, blocks: rest };
    return kopf;
}
