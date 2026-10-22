/**
 * Objektdiagramm (GSG, Paket 9): Momentaufnahme der Variablen und aller von ihnen erreichbaren Objekte.
 * Objekte behalten ihre Identität: zeigen zwei Variablen auf dasselbe Objekt, gibt es nur einen Kasten
 * mit zwei Pfeilen. Texte und eingepackte Zahlen (Integer, Double …) erscheinen als Werte, nicht als Objekte.
 */

export type HeapValue =
    | { kind: "prim"; text: string }
    | { kind: "ref"; id: number }
    | { kind: "null" };

export type HeapSlot = { name: string; value: HeapValue };

export type HeapNode = {
    id: number;
    /** object: Attribute; array/list: Elemente (Name "0", "1" …) */
    kind: "object" | "array" | "list";
    cls: string;
    slots: HeapSlot[];
    /** weitere Elemente, die nicht gezeigt werden */
    more: number;
};

export type HeapVariable = { name: string; value: HeapValue };

export type HeapSnapshot = { vars: HeapVariable[]; nodes: HeapNode[]; truncated: boolean };

/** Eingabe: Variable mit Laufzeitwert und (wenn bekannt) Java-Typ */
export type RootVariable = { name: string; value: unknown; type?: string };

const BOXED = new Set(["String", "Integer", "Double", "Float", "Long", "Short", "Byte", "Character", "Boolean"]);
const MAX_NODES = 30;
const MAX_ITEMS = 12;

type RuntimeField = { identifier: string; internalName?: string; hiddenWhenDebugging?: boolean; getInternalName?: () => string; type?: { identifier?: string } };

function typeName(t: unknown): string | undefined {
    const o = t as { identifier?: string; toString?: () => string } | undefined;
    return o?.identifier ?? undefined;
}

function isFloatType(t?: string) { return !!t && /^(double|float|Double|Float)(\[\])*$/.test(t); }
function isCharType(t?: string) { return !!t && /^(char|Character)(\[\])*$/.test(t); }

/** einfacher Wert als Text (Typ hilft bei 3.0 und 'c') */
export function primitiveText(v: unknown, type?: string): string | undefined {
    switch (typeof v) {
        case "number":
            if (isFloatType(type) && Number.isFinite(v) && Number.isInteger(v)) return v.toFixed(1);
            if (isCharType(type)) return `'${String.fromCharCode(v)}'`;
            return String(v);
        case "boolean": return String(v);
        case "bigint": return String(v);
        case "string":
            if (isCharType(type)) return `'${v}'`;
            return JSON.stringify(v);
    }
    return undefined;
}

function classOf(o: any): string {
    try {
        return o?.getType?.()?.identifier ?? o?.constructor?.name ?? "Object";
    } catch {
        return "Object";
    }
}

/** Texte und eingepackte Werte als einfacher Wert */
function unboxed(o: any): { value: unknown } | undefined {
    if (o === null || typeof o !== "object" || Array.isArray(o)) return undefined;
    if (o.constructor?.name === "StringClass") return { value: o.value };
    const cls = classOf(o);
    if (BOXED.has(cls) && ["string", "number", "boolean"].includes(typeof o.value)) return { value: o.value };
    return undefined;
}

function elementType(t?: string): string | undefined {
    if (!t) return undefined;
    if (t.endsWith("[]")) return t.slice(0, -2);
    const m = /^\w+<\s*(\w+)\s*>$/.exec(t);
    return m?.[1];
}

export function buildSnapshot(roots: RootVariable[]): HeapSnapshot {
    const ids = new Map<object, number>();
    const nodes: HeapNode[] = [];
    let truncated = false;
    const queue: { obj: any; node: HeapNode; type?: string }[] = [];

    const valueOf = (v: unknown, type?: string): HeapValue => {
        if (v === null || v === undefined) return { kind: "null" };
        const prim = primitiveText(v, type);
        if (prim !== undefined) return { kind: "prim", text: prim };
        if (typeof v !== "object") return { kind: "prim", text: String(v) };
        const boxed = unboxed(v);
        if (boxed) return valueOf(boxed.value, type === "String" || classOf(v) === "StringClass" ? "String" : type);
        const known = ids.get(v as object);
        if (known !== undefined) return { kind: "ref", id: known };
        if (nodes.length >= MAX_NODES) {
            truncated = true;
            return { kind: "prim", text: "…" };
        }
        const id = nodes.length + 1;
        ids.set(v as object, id);
        const node: HeapNode = { id, kind: "object", cls: "Object", slots: [], more: 0 };
        nodes.push(node);
        queue.push({ obj: v, node, type });
        return { kind: "ref", id };
    };

    const fill = (obj: any, node: HeapNode, type?: string) => {
        if (Array.isArray(obj)) {
            node.kind = "array";
            const elem = elementType(type);
            node.cls = `${elem ?? guessElement(obj)}[]`;
            node.slots = obj.slice(0, MAX_ITEMS).map((e: unknown, i: number) => ({ name: String(i), value: valueOf(e, elem) }));
            node.more = Math.max(0, obj.length - MAX_ITEMS);
            return;
        }
        node.cls = classOf(obj);
        let elements: unknown[] | undefined;
        try {
            if (typeof obj.getElements === "function") elements = obj.getElements();
            else if (Array.isArray(obj.elements)) elements = obj.elements;
        } catch { /* egal */ }
        if (elements) {
            node.kind = "list";
            const elem = elementType(type);
            node.slots = elements.slice(0, MAX_ITEMS).map((e, i) => ({ name: String(i), value: valueOf(e, elem) }));
            node.more = Math.max(0, elements.length - MAX_ITEMS);
            return;
        }
        if (node.cls === "BinTree" && "inhalt" in obj) {
            node.slots = [
                { name: "inhalt", value: valueOf(obj.inhalt) },
                { name: "links", value: valueOf(obj.left) },
                { name: "rechts", value: valueOf(obj.right) },
            ];
            return;
        }
        let fields: RuntimeField[] = [];
        try { fields = obj.getType?.()?.getOwnAndInheritedFields?.() ?? []; } catch { /* egal */ }
        for (const f of fields) {
            if (f.hiddenWhenDebugging) continue;
            const internal = f.internalName ?? f.getInternalName?.();
            if (!internal) continue;
            node.slots.push({ name: f.identifier, value: valueOf(obj[internal], typeName(f.type)) });
        }
    };

    const vars = roots.map((r) => ({ name: r.name, value: valueOf(r.value, r.type) }));
    // Breitensuche: erst die direkt erreichbaren Objekte, dann deren Attribute …
    for (let i = 0; i < queue.length; i++) fill(queue[i].obj, queue[i].node, queue[i].type);
    return { vars, nodes, truncated };
}

function guessElement(a: unknown[]): string {
    const first = a.find((e) => e !== null && e !== undefined);
    if (typeof first === "number") return a.every((e) => Number.isInteger(e)) ? "int" : "double";
    if (typeof first === "boolean") return "boolean";
    if (typeof first === "string") return "String";
    if (Array.isArray(first)) return `${guessElement(first)}[]`;
    if (first && typeof first === "object") return classOf(first);
    return "Object";
}

/** Abstand eines Objekts von den Variablen (für die Spalten im Diagramm) */
export function levels(s: HeapSnapshot): Map<number, number> {
    const level = new Map<number, number>();
    let frontier: number[] = [];
    for (const v of s.vars) if (v.value.kind === "ref" && !level.has(v.value.id)) { level.set(v.value.id, 1); frontier.push(v.value.id); }
    const byId = new Map(s.nodes.map((n) => [n.id, n]));
    for (let d = 2; frontier.length; d++) {
        const next: number[] = [];
        for (const id of frontier) {
            for (const slot of byId.get(id)?.slots ?? []) {
                if (slot.value.kind === "ref" && !level.has(slot.value.id)) {
                    level.set(slot.value.id, d);
                    next.push(slot.value.id);
                }
            }
        }
        frontier = next;
    }
    return level;
}

/** UML-Name eines Objekts: Name der ersten Variable, die direkt darauf zeigt (sonst leer) */
export function objectNames(s: HeapSnapshot): Map<number, string> {
    const names = new Map<number, string>();
    for (const v of s.vars) if (v.value.kind === "ref" && v.name !== "this" && !names.has(v.value.id)) names.set(v.value.id, v.name);
    for (const v of s.vars) if (v.value.kind === "ref" && v.name === "this" && !names.has(v.value.id)) names.set(v.value.id, "this");
    return names;
}
