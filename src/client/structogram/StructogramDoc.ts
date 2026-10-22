import type { Diagram, SNode } from "./StructogramModel";

/**
 * Struktogramm-Datei (Paket 7b): ein Struktogramm mit Titel (Signatur bzw. "Hauptprogramm") und
 * Inhalt, gespeichert als JSON im Text der Datei. Jedes Element hat eine Kennung, damit es sich
 * auswählen und bearbeiten lässt. Alle Bearbeitungsschritte liefern ein neues Dokument (das alte
 * bleibt unverändert) – so lässt sich das Ergebnis einfach als neuer Dateitext speichern.
 */

export type ENode =
    | { id: string; kind: "stmt"; text: string }
    | { id: string; kind: "if"; cond: string; yes: ENode[]; no: ENode[] }
    | { id: string; kind: "switch"; subject: string; cases: { label: string; body: ENode[] }[]; other?: ENode[] }
    | { id: string; kind: "loop"; head: string; body: ENode[] }
    | { id: string; kind: "footloop"; foot: string; body: ENode[] };

export type StructogramDoc = { format: "gsg-struktogramm"; version: 1; title: string; body: ENode[] };

/** Stelle, an der eingefügt wird: nach einem Element oder an den Anfang einer (leeren) Folge */
export type Place = { after: string } | { slot: Slot };
/** Folge in einem Element: Zweige, Schleifenrumpf, Fälle; "root" = oberste Folge */
export type Slot = { owner: string; part: "yes" | "no" | "body" | "other" | `case${number}` } | { owner: "root"; part: "body" };

export const FORMAT = "gsg-struktogramm";

let counter = 0;
export function newId(): string {
    return "n" + Date.now().toString(36) + (++counter).toString(36);
}

export function emptyDoc(title = "Hauptprogramm"): StructogramDoc {
    return { format: FORMAT, version: 1, title, body: [] };
}

/** Dateitext lesen (leer oder fehlerhaft: leeres Struktogramm) */
export function parseDoc(text: string): StructogramDoc {
    try {
        const data = JSON.parse(text);
        if (data && data.format === FORMAT && Array.isArray(data.body)) {
            return { format: FORMAT, version: 1, title: String(data.title ?? "Hauptprogramm"), body: data.body.map(clean) };
        }
    } catch {
        // leer oder kein JSON
    }
    return emptyDoc();
}

export function serializeDoc(doc: StructogramDoc): string {
    return JSON.stringify(doc, null, 1) + "\n";
}

/** gelesenes Element absichern (fehlende Felder ergänzen) */
function clean(n: Partial<ENode> & { kind?: string }): ENode {
    const id = typeof n.id === "string" && n.id ? n.id : newId();
    const seq = (s: unknown) => (Array.isArray(s) ? s.map(clean) : []);
    const a = n as Record<string, unknown>;
    switch (n.kind) {
        case "if": return { id, kind: "if", cond: String(a.cond ?? ""), yes: seq(a.yes), no: seq(a.no) };
        case "switch": {
            const cases = Array.isArray(a.cases) ? (a.cases as { label?: string; body?: unknown }[]).map((c) => ({ label: String(c?.label ?? ""), body: seq(c?.body) })) : [];
            return { id, kind: "switch", subject: String(a.subject ?? ""), cases, ...(Array.isArray(a.other) ? { other: seq(a.other) } : {}) };
        }
        case "loop": return { id, kind: "loop", head: String(a.head ?? ""), body: seq(a.body) };
        case "footloop": return { id, kind: "footloop", foot: String(a.foot ?? ""), body: seq(a.body) };
        default: return { id, kind: "stmt", text: String(a.text ?? "") };
    }
}

/** Struktogramm aus der Ansicht (Java -> Struktogramm) als bearbeitbares Dokument */
export function docFromDiagram(d: Diagram): StructogramDoc {
    const conv = (n: SNode): ENode => {
        const id = newId();
        switch (n.kind) {
            case "stmt": return { id, kind: "stmt", text: n.text };
            case "if": return { id, kind: "if", cond: n.cond, yes: n.yes.map(conv), no: n.no.map(conv) };
            case "switch": return { id, kind: "switch", subject: n.subject, cases: n.cases.map((c) => ({ label: c.label, body: c.body.map(conv) })), ...(n.other ? { other: n.other.map(conv) } : {}) };
            case "loop": return { id, kind: "loop", head: n.head, body: n.body.map(conv) };
            case "footloop": return { id, kind: "footloop", foot: n.foot, body: n.body.map(conv) };
        }
    };
    return { format: FORMAT, version: 1, title: d.title, body: d.body.map(conv) };
}

/** Dokument als Diagramm (zum Zeichnen) */
export function diagramOfDoc(doc: StructogramDoc): Diagram {
    return { title: doc.title, body: doc.body as SNode[] };
}

// ------------------------------------------------------------------ Neue Elemente

export type NewKind = "stmt" | "if" | "switch" | "while" | "for" | "foreach" | "repeat" | "footloop" | "return" | "comment";

/** neues Element mit Platzhaltertext (so formuliert, wie es in Java umgewandelt werden kann) */
export function newNode(kind: NewKind): ENode {
    const id = newId();
    switch (kind) {
        case "if": return { id, kind: "if", cond: "Bedingung", yes: [], no: [] };
        case "switch": return { id, kind: "switch", subject: "x ist gleich", cases: [{ label: "1", body: [] }, { label: "2", body: [] }], other: [] };
        case "while": return { id, kind: "loop", head: "solange Bedingung", body: [] };
        case "for": return { id, kind: "loop", head: "für i von 1 bis 10", body: [] };
        case "foreach": return { id, kind: "loop", head: "für alle Elemente e aus liste", body: [] };
        case "repeat": return { id, kind: "loop", head: "wiederhole 10-mal", body: [] };
        case "footloop": return { id, kind: "footloop", foot: "wiederhole bis Bedingung", body: [] };
        case "return": return { id, kind: "stmt", text: "gib ergebnis zurück" };
        case "comment": return { id, kind: "stmt", text: "// Kommentar" };
        default: return { id, kind: "stmt", text: "x ← 0" };
    }
}

// ------------------------------------------------------------------ Suchen

/** alle Folgen eines Elements mit ihrem Namen */
export function partsOf(n: ENode): [Slot["part"], ENode[]][] {
    switch (n.kind) {
        case "if": return [["yes", n.yes], ["no", n.no]];
        case "switch": return [...n.cases.map((c, i) => [`case${i}`, c.body] as [Slot["part"], ENode[]]), ...(n.other ? [["other", n.other] as [Slot["part"], ENode[]]] : [])];
        case "loop": case "footloop": return [["body", n.body]];
    }
    return [];
}

/** Element mit Kennung finden: das Element, die Folge, in der es steht, und seine Position */
export function findNode(doc: StructogramDoc, id: string): { node: ENode; seq: ENode[]; index: number } | undefined {
    const search = (seq: ENode[]): { node: ENode; seq: ENode[]; index: number } | undefined => {
        for (let i = 0; i < seq.length; i++) {
            if (seq[i].id === id) return { node: seq[i], seq, index: i };
            for (const [, part] of partsOf(seq[i])) {
                const r = search(part);
                if (r) return r;
            }
        }
        return undefined;
    };
    return search(doc.body);
}

/** Folge zu einer Einfügestelle (Slot) */
function slotSeq(doc: StructogramDoc, slot: Slot): ENode[] | undefined {
    if (slot.owner === "root") return doc.body;
    const owner = findNode(doc, slot.owner)?.node;
    return owner ? partsOf(owner).find(([p]) => p === slot.part)?.[1] : undefined;
}

// ------------------------------------------------------------------ Bearbeiten (immer auf einer Kopie)

const copy = (doc: StructogramDoc): StructogramDoc => JSON.parse(JSON.stringify(doc));

/** neue Kennungen für eine eingefügte Kopie (z. B. nach Ausschneiden/Einfügen mehrfach) */
export function withNewIds(n: ENode): ENode {
    const c: ENode = JSON.parse(JSON.stringify(n));
    const visit = (x: ENode) => {
        x.id = newId();
        for (const [, part] of partsOf(x)) part.forEach(visit);
    };
    visit(c);
    return c;
}

export function insertNode(doc: StructogramDoc, place: Place, node: ENode): StructogramDoc {
    const d = copy(doc);
    if ("after" in place) {
        const found = findNode(d, place.after);
        if (found) found.seq.splice(found.index + 1, 0, node);
        else d.body.push(node);
    } else {
        const seq = slotSeq(d, place.slot);
        (seq ?? d.body).unshift(node);
    }
    return d;
}

export function removeNode(doc: StructogramDoc, id: string): StructogramDoc {
    const d = copy(doc);
    const found = findNode(d, id);
    if (found) found.seq.splice(found.index, 1);
    return d;
}

/** innerhalb der eigenen Folge nach oben (-1) bzw. unten (+1) verschieben */
export function moveNode(doc: StructogramDoc, id: string, delta: -1 | 1): StructogramDoc {
    const d = copy(doc);
    const found = findNode(d, id);
    if (!found) return d;
    const to = found.index + delta;
    if (to < 0 || to >= found.seq.length) return d;
    const [n] = found.seq.splice(found.index, 1);
    found.seq.splice(to, 0, n);
    return d;
}

/** Text eines Elements: Anweisung, Bedingung, Schleifenkopf/-fuß, "… ist gleich" */
export function textOf(n: ENode): string {
    switch (n.kind) {
        case "stmt": return n.text;
        case "if": return n.cond;
        case "switch": return n.subject;
        case "loop": return n.head;
        case "footloop": return n.foot;
    }
}

export function setText(doc: StructogramDoc, id: string, text: string): StructogramDoc {
    const d = copy(doc);
    const n = findNode(d, id)?.node;
    if (!n) return d;
    switch (n.kind) {
        case "stmt": n.text = text; break;
        case "if": n.cond = text; break;
        case "switch": n.subject = text; break;
        case "loop": n.head = text; break;
        case "footloop": n.foot = text; break;
    }
    return d;
}

export function setTitle(doc: StructogramDoc, title: string): StructogramDoc {
    return { ...copy(doc), title };
}

// mehrseitige Auswahl
export function setCaseLabel(doc: StructogramDoc, id: string, index: number, label: string): StructogramDoc {
    const d = copy(doc);
    const n = findNode(d, id)?.node;
    if (n?.kind === "switch" && n.cases[index]) n.cases[index].label = label;
    return d;
}

export function addCase(doc: StructogramDoc, id: string): StructogramDoc {
    const d = copy(doc);
    const n = findNode(d, id)?.node;
    if (n?.kind === "switch") n.cases.push({ label: String(n.cases.length + 1), body: [] });
    return d;
}

export function removeCase(doc: StructogramDoc, id: string): StructogramDoc {
    const d = copy(doc);
    const n = findNode(d, id)?.node;
    if (n?.kind === "switch" && n.cases.length > 1) n.cases.pop();
    return d;
}

export function toggleOther(doc: StructogramDoc, id: string): StructogramDoc {
    const d = copy(doc);
    const n = findNode(d, id)?.node;
    if (n?.kind === "switch") {
        if (n.other) delete n.other;
        else n.other = [];
    }
    return d;
}
