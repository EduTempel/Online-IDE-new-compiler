import { describe, expect, test } from "vitest";
import { addCase, emptyDoc, findNode, insertNode, moveNode, newNode, parseDoc, removeCase, removeNode, serializeDoc, setCaseLabel, setText, setTitle, textOf, toggleOther, withNewIds, type ENode } from "./StructogramDoc";

const texts = (nodes: ENode[]): string[] => nodes.map((n) => textOf(n));

describe("Struktogramm-Datei: Bearbeitungsschritte", () => {

    test("einfügen (nach Element, in leere Folge), verschieben, löschen, Text ändern", () => {
        let d = emptyDoc("summe(n: Ganzzahl): Ganzzahl");
        const a = newNode("stmt"), loop = newNode("while"), ret = newNode("return");
        d = insertNode(d, { slot: { owner: "root", part: "body" } }, a);
        d = insertNode(d, { after: a.id }, loop);
        d = insertNode(d, { after: loop.id }, ret);
        const inner = newNode("stmt");
        d = insertNode(d, { slot: { owner: loop.id, part: "body" } }, inner);
        d = setText(d, inner.id, "erhöhe s um i");
        d = setText(d, loop.id, "solange i ≤ n");
        expect(texts(d.body)).toEqual(["x ← 0", "solange i ≤ n", "gib ergebnis zurück"]);
        expect(textOf((findNode(d, loop.id)!.node as Extract<ENode, { kind: "loop" }>).body[0])).toBe("erhöhe s um i");
        d = moveNode(d, ret.id, -1);
        expect(texts(d.body)).toEqual(["x ← 0", "gib ergebnis zurück", "solange i ≤ n"]);
        d = moveNode(d, a.id, -1);   // schon oben: nichts passiert
        expect(texts(d.body)[0]).toBe("x ← 0");
        d = removeNode(d, loop.id);
        expect(findNode(d, inner.id)).toBeUndefined();   // mit dem Inhalt
        d = setTitle(d, "f()");
        expect(d.title).toBe("f()");
    });

    test("Schritte ändern das alte Dokument nicht (für Rückgängig)", () => {
        const d0 = insertNode(emptyDoc(), { slot: { owner: "root", part: "body" } }, newNode("stmt"));
        const d1 = setText(d0, d0.body[0].id, "y ← 1");
        expect(textOf(d0.body[0])).toBe("x ← 0");
        expect(textOf(d1.body[0])).toBe("y ← 1");
    });

    test("mehrseitige Auswahl: Fälle, Beschriftung, sonst", () => {
        const sw = newNode("switch");
        let d = insertNode(emptyDoc(), { slot: { owner: "root", part: "body" } }, sw);
        d = addCase(d, sw.id);
        d = setCaseLabel(d, sw.id, 2, "3, 4");
        d = insertNode(d, { slot: { owner: sw.id, part: "case2" } }, newNode("stmt"));
        let n = findNode(d, sw.id)!.node as Extract<ENode, { kind: "switch" }>;
        expect(n.cases.map((c) => c.label)).toEqual(["1", "2", "3, 4"]);
        expect(n.cases[2].body).toHaveLength(1);
        d = toggleOther(d, sw.id);
        d = removeCase(d, sw.id);
        n = findNode(d, sw.id)!.node as Extract<ENode, { kind: "switch" }>;
        expect(n.other).toBeUndefined();
        expect(n.cases).toHaveLength(2);
    });

    test("speichern und lesen; leere oder fremde Dateien", () => {
        const sw = newNode("if");
        const d = insertNode(emptyDoc("t()"), { slot: { owner: "root", part: "body" } }, sw);
        const back = parseDoc(serializeDoc(d));
        expect(back).toEqual(d);
        expect(parseDoc("").body).toEqual([]);
        expect(parseDoc("int x = 5;").title).toBe("Hauptprogramm");
        const copy = withNewIds(sw);
        expect(copy.id).not.toBe(sw.id);
    });
});
