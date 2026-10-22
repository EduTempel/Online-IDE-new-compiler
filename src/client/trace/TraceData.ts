/**
 * Tracetabelle (GSG, Paket 10): Momentaufnahmen von Laufzeitwerten und kleine Ausdrücke darauf.
 *
 * trace() übergibt die aktuellen Werte aller sichtbaren Variablen. Davon wird sofort eine Kopie
 * gemacht (Reihungen und Listen ändern sich ja später weiter). Spalten der Tabelle sind Variablen
 * oder kurze Ausdrücke wie zahlen[i], liste.size(), liste.get(0), p.name oder i + 1.
 */

export type TraceValue =
    | undefined | null | number | boolean | string
    | { k: "arr"; items: TraceValue[] }
    | { k: "list"; cls: string; items: TraceValue[] }
    | { k: "obj"; cls: string; fields: Record<string, TraceValue> };

export type TraceRow = {
    line: number;
    comment?: string;
    vars: Record<string, TraceValue>;
    /** Attribute von this (in Methoden), damit "x" auch this.x findet */
    self?: TraceValue;
    /** Kommazahlen-Variablen (für 3.0 statt 3) */
    floats?: string[];
};

const MAX_DEPTH = 4;
const BOXED = new Set(["String", "Integer", "Double", "Float", "Long", "Short", "Byte", "Character", "Boolean"]);
const MAX_ITEMS = 60;

type RuntimeField = { identifier: string; internalName?: string; hiddenWhenDebugging?: boolean; getInternalName?: () => string };

/** Laufzeitwert in eine unveränderliche Kopie umwandeln */
export function snapshot(v: any, depth = 0): TraceValue {
    if (v === undefined) return undefined;
    if (v === null) return null;
    switch (typeof v) {
        case "number": case "boolean": case "string": return v;
        case "bigint": return Number(v);
        case "object": break;
        default: return String(v);
    }
    if (Array.isArray(v)) {
        if (depth >= MAX_DEPTH) return { k: "arr", items: [] };
        return { k: "arr", items: v.slice(0, MAX_ITEMS).map((e) => snapshot(e, depth + 1)) };
    }
    let cls = "Object";
    try { cls = v.getType?.()?.identifier ?? v.constructor?.name ?? "Object"; } catch { /* egal */ }
    // String-Objekte und eingepackte Werte (Integer, Double, ...)
    if (v.constructor?.name === "StringClass" || (BOXED.has(cls) && ["string", "number", "boolean"].includes(typeof v.value))) {
        return v.value;
    }
    if (depth >= MAX_DEPTH) return { k: "obj", cls, fields: {} };

    // Listen, Schlangen, Stapel, dynamische Reihungen
    let elements: any[] | undefined;
    try {
        if (typeof v.getElements === "function") elements = v.getElements();
        else if (Array.isArray(v.elements)) elements = v.elements;
    } catch { /* egal */ }
    if (elements) return { k: "list", cls, items: elements.slice(0, MAX_ITEMS).map((e) => snapshot(e, depth + 1)) };

    // Binärbaum der Niedersachsen-Bibliothek
    if (cls === "BinTree" && "inhalt" in v) {
        return { k: "obj", cls, fields: { inhalt: snapshot(v.inhalt, depth + 1), left: snapshot(v.left, depth + 1), right: snapshot(v.right, depth + 1) } };
    }

    const fields: Record<string, TraceValue> = {};
    try {
        const list: RuntimeField[] = v.getType?.()?.getOwnAndInheritedFields?.() ?? [];
        for (const f of list) {
            if (f.hiddenWhenDebugging) continue;
            const internal = f.internalName ?? f.getInternalName?.();
            if (internal) fields[f.identifier] = snapshot(v[internal], depth + 1);
        }
    } catch { /* egal */ }
    return { k: "obj", cls, fields };
}

export function makeRow(line: number, comment: string | undefined, names: string[], values: any[], thisObject: any, floats?: string[]): TraceRow {
    const vars: Record<string, TraceValue> = {};
    names.forEach((n, i) => (vars[n] = snapshot(values[i])));
    const row: TraceRow = { line, vars };
    if (comment !== undefined && comment !== null && comment !== "") row.comment = String(comment);
    if (thisObject) row.self = snapshot(thisObject);
    if (floats?.length) row.floats = floats;
    return row;
}

/** Anzeige eines Werts; float: Zahlen als Kommazahl (3.0) */
export function render(v: TraceValue, float = false): string {
    if (v === undefined) return "";
    if (v === null) return "null";
    switch (typeof v) {
        case "number":
            if (float && Number.isFinite(v) && Number.isInteger(v)) return v.toFixed(1);
            return String(v);
        case "boolean": return String(v);
        case "string": return v.length === 1 ? `'${v}'` : `"${v}"`;
    }
    if (v.k === "arr" || v.k === "list") return "[" + v.items.map((e) => render(e, float)).join(", ") + "]";
    const entries = Object.entries(v.fields);
    if (!entries.length) return v.cls;
    return `${v.cls}(${entries.map(([n, f]) => `${n}=${render(f, float)}`).join(", ")})`;
}

// ---------------------------------------------------------------- Ausdrücke

class ExprError extends Error { }

type Tok = { t: "id" | "num" | "str" | "op"; v: string };

function tokenize(s: string): Tok[] {
    const out: Tok[] = [];
    let i = 0;
    while (i < s.length) {
        const c = s[i];
        if (/\s/.test(c)) { i++; continue; }
        if (/[A-Za-z_äöüÄÖÜß$]/.test(c)) {
            let j = i + 1;
            while (j < s.length && /[\wäöüÄÖÜß$]/.test(s[j])) j++;
            out.push({ t: "id", v: s.slice(i, j) });
            i = j;
        } else if (/\d/.test(c)) {
            let j = i + 1;
            while (j < s.length && /[\d.]/.test(s[j])) j++;
            out.push({ t: "num", v: s.slice(i, j) });
            i = j;
        } else if (c === '"') {
            const j = s.indexOf('"', i + 1);
            if (j < 0) throw new ExprError("Anführungszeichen fehlt");
            out.push({ t: "str", v: s.slice(i + 1, j) });
            i = j + 1;
        } else if (".[]()+-*/%,".includes(c)) {
            out.push({ t: "op", v: c });
            i++;
        } else throw new ExprError(`Unbekanntes Zeichen ${c}`);
    }
    return out;
}

/** Wert eines Spaltenausdrucks in einer Zeile (wirft bei Fehlern) */
export function evaluate(expr: string, row: TraceRow): TraceValue {
    const toks = tokenize(expr);
    let p = 0;
    const peek = () => toks[p];
    const take = (v?: string) => {
        const t = toks[p];
        if (!t || (v !== undefined && t.v !== v)) throw new ExprError(v ? `${v} erwartet` : "Ausdruck unvollständig");
        p++;
        return t;
    };
    const num = (v: TraceValue): number => {
        if (typeof v === "number") return v;
        if (typeof v === "string" && v.length === 1) return v.charCodeAt(0);
        throw new ExprError("Zahl erwartet");
    };

    const lookup = (name: string): TraceValue => {
        if (name in row.vars) return row.vars[name];
        const self = row.self;
        if (self && typeof self === "object" && self.k === "obj" && name in self.fields) return self.fields[name];
        if (name === "this" && self !== undefined) return self;
        if (name === "true") return true;
        if (name === "false") return false;
        if (name === "null") return null;
        throw new ExprError(`${name} ist hier nicht bekannt`);
    };

    const items = (v: TraceValue): TraceValue[] => {
        if (v && typeof v === "object" && (v.k === "arr" || v.k === "list")) return v.items;
        throw new ExprError("Reihung oder Liste erwartet");
    };

    const call = (target: TraceValue, name: string, args: TraceValue[]): TraceValue => {
        if (typeof target === "string") {
            if (name === "length") return target.length;
            if (name === "charAt") return target.charAt(num(args[0]));
            if (name === "substring") return target.substring(num(args[0]), args.length > 1 ? num(args[1]) : undefined);
            if (name === "isEmpty") return target.length === 0;
            throw new ExprError(`${name}() geht hier nicht`);
        }
        const list = items(target);
        switch (name) {
            case "size": case "getLength": return list.length;
            case "isEmpty": return list.length === 0;
            case "get": case "getItem": {
                const i = num(args[0]);
                if (i < 0 || i >= list.length) throw new ExprError("Index außerhalb");
                return list[i];
            }
            case "top": case "peek": case "head": case "front":
                if (!list.length) throw new ExprError("leer");
                return list[0];
            case "contains": return list.some((e) => render(e) === render(args[0]));
        }
        throw new ExprError(`${name}() geht hier nicht`);
    };

    const postfix = (v: TraceValue): TraceValue => {
        for (; ;) {
            const t = peek();
            if (t?.v === "[") {
                take("[");
                const i = num(sum());
                take("]");
                const list = items(v);
                if (i < 0 || i >= list.length) throw new ExprError("Index außerhalb");
                v = list[i];
            } else if (t?.v === ".") {
                take(".");
                const name = take().v;
                if (peek()?.v === "(") {
                    take("(");
                    const args: TraceValue[] = [];
                    while (peek()?.v !== ")") {
                        args.push(sum());
                        if (peek()?.v === ",") take(",");
                    }
                    take(")");
                    v = call(v, name, args);
                } else if (name === "length" && v && typeof v === "object" && v.k === "arr") {
                    v = v.items.length;
                } else if (v && typeof v === "object" && v.k === "obj" && name in v.fields) {
                    v = v.fields[name];
                } else if (v === null) {
                    throw new ExprError("null");
                } else throw new ExprError(`.${name} gibt es hier nicht`);
            } else return v;
        }
    };

    const primary = (): TraceValue => {
        const t = take();
        if (t.t === "num") return Number(t.v);
        if (t.t === "str") return t.v;
        if (t.v === "(") {
            const v = sum();
            take(")");
            return postfix(v);
        }
        if (t.v === "-") return -num(primary());
        if (t.t === "id") return postfix(lookup(t.v));
        throw new ExprError("Ausdruck erwartet");
    };
    const product = (): TraceValue => {
        let v = primary();
        while (peek() && "*/%".includes(peek().v) && peek().t === "op") {
            const op = take().v;
            const r = num(primary());
            const l = num(v);
            if ((op === "/" || op === "%") && r === 0) throw new ExprError("Division durch 0");
            v = op === "*" ? l * r : op === "/" ? (Number.isInteger(l) && Number.isInteger(r) ? Math.trunc(l / r) : l / r) : l % r;
        }
        return v;
    };
    function sum(): TraceValue {
        let v = product();
        while (peek() && "+-".includes(peek().v) && peek().t === "op") {
            const op = take().v;
            const r = product();
            if (op === "+" && (typeof v === "string" || typeof r === "string") && !(typeof v === "string" && v.length === 1 && typeof r === "number")) {
                v = (typeof v === "string" ? v : render(v)) + (typeof r === "string" ? r : render(r));
            } else v = op === "+" ? num(v) + num(r) : num(v) - num(r);
        }
        return v;
    }

    const v = sum();
    if (p < toks.length) throw new ExprError(`Unerwartet: ${toks[p].v}`);
    return v;
}

/** Spaltenwert als Text; Fehler werden zu "?" mit Hinweis */
export function cell(expr: string, row: TraceRow): { text: string; error?: string } {
    try {
        const float = !!row.floats?.some((f) => new RegExp(`(^|[^\\w])${f}([^\\w]|$)`).test(expr));
        return { text: render(evaluate(expr, row), float) };
    } catch (e) {
        return { text: "", error: e instanceof ExprError ? e.message : String(e) };
    }
}

/** Variablennamen aller Zeilen in der Reihenfolge ihres ersten Auftretens */
export function variableNames(rows: TraceRow[]): string[] {
    const names: string[] = [];
    for (const r of rows) for (const n of Object.keys(r.vars)) if (!names.includes(n)) names.push(n);
    return names;
}

/** Tabelle als Text mit Tabulatoren (zum Einfügen in Tabellenkalkulation oder Textverarbeitung) bzw. CSV */
export function toTable(rows: TraceRow[], columns: string[], sep: "\t" | ";"): string {
    const withComment = rows.some((r) => r.comment);
    const head = ["Nr.", "Zeile", ...(withComment ? ["Bemerkung"] : []), ...columns];
    const q = (s: string) => sep === ";" && /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s.replace(/[\t\n]/g, " ");
    const lines = [head.map(q).join(sep)];
    rows.forEach((r, i) => {
        lines.push([String(i + 1), String(r.line), ...(withComment ? [r.comment ?? ""] : []), ...columns.map((c) => cell(c, r).text)].map(q).join(sep));
    });
    return lines.join("\n");
}
