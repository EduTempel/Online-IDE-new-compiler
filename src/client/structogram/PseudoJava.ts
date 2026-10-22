import type { ENode, StructogramDoc } from "./StructogramDoc";

/**
 * Struktogramm -> Java (Paket 7b). Versteht die Formulierungen der Ergänzenden Hinweise bzw. der
 * Struktogramm-Ansicht ("x ← 0", "gib x zurück", "erhöhe x um 1", "füge p zu f hinzu",
 * "solange f nicht leer", "für i von 1 bis 10", "ganzzahlige Zufallszahl zwischen 1 und 6" …).
 * Was nicht erkannt wird, wird ein "// TODO: …" (Anweisung) bzw. "false /* TODO: … *\/"
 * (Bedingung) – zum Ausprogrammieren.
 */

const TYPE_JAVA: Record<string, string> = {
    Ganzzahl: "int", Fließkommazahl: "double", Kommazahl: "double", Zeichenkette: "String", Text: "String",
    Wahrheitswert: "boolean", Zeichen: "char", Objekt: "Object",
};
const WRAP: Record<string, string> = { int: "Integer", double: "Double", boolean: "Boolean", char: "Character" };

/** deutscher Datentyp -> Java (Ganzzahl -> int, stat. Reihung vom Inhaltstyp Zeichenkette -> String[] …) */
export function javaType(de: string): string {
    const s = de.trim().replace(/\s+/g, " ");
    let m = /^(?:zweidim\.|zweidimensionale) (?:stat\. |statische )?Reihung vom Inhaltstyp (.+)$/i.exec(s);
    if (m) return javaType(m[1]) + "[][]";
    m = /^(?:stat\. |statische )?Reihung vom Inhaltstyp (.+)$/i.exec(s);
    if (m) return javaType(m[1]) + "[]";
    m = /^Liste vom Inhaltstyp (.+)$/i.exec(s);
    if (m) {
        const e = javaType(m[1]);
        return `ArrayList<${WRAP[e] ?? e}>`;
    }
    if (/^dyn(?:\.|amische) Reihung\b/i.test(s)) return "DynArray";
    // abstrakte Datentypen der Abiturklassen Niedersachsen
    if (/^Stapel\b/i.test(s)) return "Stack";
    if (/^Schlange\b/i.test(s)) return "Queue";
    if (/^Binärbaum\b/i.test(s)) return "BinTree";
    return TYPE_JAVA[s] ?? s;
}

/** Inhaltstyp von dynamischer Reihung, Stapel, Schlange, Binärbaum (für Typumwandlungen beim Lesen) */
export function elemType(de: string): string | undefined {
    const m = /^(?:dyn(?:\.|amische) Reihung|Stapel|Schlange|Binärbaum) vom Inhaltstyp (.+)$/i.exec(de.trim().replace(/\s+/g, " "));
    return m ? javaType(m[1]) : undefined;
}

// ------------------------------------------------------------------ Zerlegen in Wörter

type Tok = { t: "num" | "str" | "chr" | "id" | "op"; v: string };

function tokenize(text: string): Tok[] | undefined {
    const out: Tok[] = [];
    let i = 0;
    const s = text;
    while (i < s.length) {
        const c = s[i];
        if (/\s/.test(c)) { i++; continue; }
        if (/[0-9]/.test(c)) {
            const m = /^\d+(\.\d+)?/.exec(s.slice(i))!;
            out.push({ t: "num", v: m[0] });
            i += m[0].length;
            continue;
        }
        if (c === "\"" || c === "„" || c === "“") {
            const close = c === "„" ? "“" : c === "“" ? "”" : "\"";
            let j = i + 1;
            while (j < s.length && s[j] !== close && !(close !== "\"" && s[j] === "\"")) j++;
            if (j >= s.length) return undefined;
            out.push({ t: "str", v: s.slice(i + 1, j) });
            i = j + 1;
            continue;
        }
        if (c === "'") {
            const m = /^'(\\.|[^'\\])'/.exec(s.slice(i));
            if (!m) return undefined;
            out.push({ t: "chr", v: m[1] });
            i += m[0].length;
            continue;
        }
        if (/[\p{L}_$]/u.test(c)) {
            const m = /^[\p{L}_$][\p{L}\p{N}_$-]*/u.exec(s.slice(i))!;
            // Bindestrich nur in Wörtern wie "ASCII-Wert", nicht "a-b"
            let w = m[0];
            if (w.includes("-") && !/^ASCII-Wert$/i.test(w)) w = w.slice(0, w.indexOf("-"));
            out.push({ t: "id", v: w });
            i += w.length;
            continue;
        }
        const two = s.slice(i, i + 2);
        if (["<=", ">=", "!=", "==", "&&", "||", "//"].includes(two)) {
            out.push({ t: "op", v: two });
            i += 2;
            continue;
        }
        if ("←=≠≤≥<>+-·*/%()[],.|:!".includes(c)) {
            out.push({ t: "op", v: c });
            i++;
            continue;
        }
        return undefined;   // unbekanntes Zeichen
    }
    return out;
}

// ------------------------------------------------------------------ Ausdrücke

/** Java-Ausdruck mit Bindungsstärke (kleiner = bindet stärker) und, soweit bekannt, Datentyp */
type JX = { code: string; prec: number; type?: string; elem?: string };
const P = { ATOM: 0, UNARY: 1, MULT: 2, ADD: 3, REL: 4, EQ: 5, AND: 6, OR: 7 } as const;

export type Vars = Map<string, string>;

class Fail extends Error { }

class ExprParser {
    pos = 0;
    constructor(private toks: Tok[], private vars: Vars) { }

    peek(k = 0): Tok | undefined { return this.toks[this.pos + k]; }
    isWord(w: string, k = 0): boolean { const t = this.peek(k); return t?.t === "id" && t.v.toLowerCase() === w.toLowerCase(); }
    isOp(o: string, k = 0): boolean { const t = this.peek(k); return t?.t === "op" && t.v === o; }
    words(...ws: string[]): boolean { return ws.every((w, k) => this.isWord(w, k)); }
    take(...ws: string[]): boolean {
        if (!this.words(...ws)) return false;
        this.pos += ws.length;
        return true;
    }
    expectWord(w: string) { if (!this.take(w)) throw new Fail(); }
    expectOp(o: string) { if (!this.isOp(o)) throw new Fail(); this.pos++; }
    atEnd(): boolean { return this.pos >= this.toks.length; }

    static wrap(x: JX, outer: number, right = false): string {
        return x.prec > outer || (right && x.prec === outer && x.prec !== P.ATOM) ? `(${x.code})` : x.code;
    }

    expr(): JX { return this.or(); }

    private or(): JX {
        let l = this.and();
        while (this.isWord("ODER") || this.isOp("||")) {
            this.pos++;
            const r = this.and();
            l = { code: `${ExprParser.wrap(l, P.OR)} || ${ExprParser.wrap(r, P.OR, true)}`, prec: P.OR, type: "boolean" };
        }
        return l;
    }

    private and(): JX {
        let l = this.not();
        while (this.isWord("UND") || this.isOp("&&")) {
            this.pos++;
            const r = this.not();
            l = { code: `${ExprParser.wrap(l, P.AND)} && ${ExprParser.wrap(r, P.AND, true)}`, prec: P.AND, type: "boolean" };
        }
        return l;
    }

    private not(): JX {
        if (this.isWord("nicht") || this.isOp("!")) {
            this.pos++;
            const e = this.not();
            return { code: "!" + ExprParser.wrap(e, P.UNARY), prec: P.UNARY, type: "boolean" };
        }
        return this.cmp();
    }

    private cmp(): JX {
        const l = this.sum();
        // nachgestellte Formulierungen: "f ist leer", "f nicht leer", "l enthält x"
        if (this.take("ist", "leer")) return { code: `${ExprParser.wrap(l, P.ATOM)}.isEmpty()`, prec: P.ATOM, type: "boolean" };
        if (this.take("ist", "ein", "Blatt")) return { code: `${ExprParser.wrap(l, P.ATOM)}.isLeaf()`, prec: P.ATOM, type: "boolean" };
        if (this.take("nicht", "leer")) return { code: `!${ExprParser.wrap(l, P.ATOM)}.isEmpty()`, prec: P.UNARY, type: "boolean" };
        if (this.take("enthält")) {
            const r = this.sum();
            return { code: `${ExprParser.wrap(l, P.ATOM)}.contains(${r.code})`, prec: P.ATOM, type: "boolean" };
        }
        const ops: Record<string, string> = { "=": "==", "==": "==", "≠": "!=", "!=": "!=", "≤": "<=", "<=": "<=", "≥": ">=", ">=": ">=", "<": "<", ">": ">" };
        const t = this.peek();
        if (t?.t === "op" && ops[t.v]) {
            this.pos++;
            const r = this.sum();
            const op = ops[t.v];
            const isEq = op === "==" || op === "!=";
            // Texte vergleicht man in Java mit equals
            if (isEq && (l.type === "String" || r.type === "String")) {
                const code = `${ExprParser.wrap(l, P.ATOM)}.equals(${r.code})`;
                return op === "==" ? { code, prec: P.ATOM, type: "boolean" } : { code: "!" + code, prec: P.UNARY, type: "boolean" };
            }
            const prec = isEq ? P.EQ : P.REL;
            return { code: `${ExprParser.wrap(l, prec)} ${op} ${ExprParser.wrap(r, prec, true)}`, prec, type: "boolean" };
        }
        return l;
    }

    sum(): JX {
        let l = this.term();
        while (this.isOp("+") || this.isOp("-")) {
            const op = this.peek()!.v;
            this.pos++;
            const r = this.term();
            const type = op === "+" && (l.type === "String" || r.type === "String") ? "String"
                : l.type === "double" || r.type === "double" ? "double" : l.type && r.type ? "int" : undefined;
            l = { code: `${ExprParser.wrap(l, P.ADD)} ${op} ${ExprParser.wrap(r, P.ADD, true)}`, prec: P.ADD, type };
        }
        return l;
    }

    private term(): JX {
        let l = this.unary();
        while (this.isOp("·") || this.isOp("*") || this.isOp("/") || this.isOp("%") || this.isWord("mod") || this.isWord("div")) {
            const t = this.peek()!.v;
            this.pos++;
            const op = t === "·" || t === "*" ? "*" : t === "mod" || t === "%" ? "%" : "/";
            const r = this.unary();
            l = { code: `${ExprParser.wrap(l, P.MULT)} ${op} ${ExprParser.wrap(r, P.MULT, true)}`, prec: P.MULT, type: l.type === "double" || r.type === "double" ? "double" : "int" };
        }
        return l;
    }

    private unary(): JX {
        if (this.isOp("-")) {
            this.pos++;
            const e = this.unary();
            return { code: "-" + ExprParser.wrap(e, P.UNARY), prec: P.UNARY, type: e.type };
        }
        return this.postfix(this.primary());
    }

    /** "x gerundet", "s in Großbuchstaben" */
    private postfix(x: JX): JX {
        if (this.take("gerundet")) return { code: `Math.round(${x.code})`, prec: P.ATOM, type: "int" };
        if (this.take("in", "Großbuchstaben")) return { code: `${ExprParser.wrap(x, P.ATOM)}.toUpperCase()`, prec: P.ATOM, type: "String" };
        if (this.take("in", "Kleinbuchstaben")) return { code: `${ExprParser.wrap(x, P.ATOM)}.toLowerCase()`, prec: P.ATOM, type: "String" };
        return x;
    }

    /** Typ einer Variablen bzw. eines Ausdrucks als Reihung/Liste */
    private kindOf(x: JX): "array" | "array2d" | "list" | "dyn" | "string" | undefined {
        const t = x.type ?? "";
        if (t.endsWith("[][]")) return "array2d";
        if (t.endsWith("[]")) return "array";
        if (t.startsWith("ArrayList")) return "list";
        if (t === "DynArray") return "dyn";
        if (t === "String") return "string";
        return undefined;
    }

    private elemOf(x: JX): string | undefined {
        const t = x.type ?? "";
        if (t.endsWith("[]")) return t.slice(0, -2);
        const m = /^ArrayList<(.+)>$/.exec(t);
        if (m) return ({ Integer: "int", Double: "double", Boolean: "boolean", Character: "char" } as Record<string, string>)[m[1]] ?? m[1];
        return undefined;
    }

    private args(): string[] {
        this.expectOp("(");
        const list: string[] = [];
        if (!this.isOp(")")) {
            do list.push(this.expr().code);
            while (this.isOp(",") && ++this.pos);
        }
        this.expectOp(")");
        return list;
    }

    /** Typname (für "erzeuge", "vom Inhaltstyp"): Wörter bis zum Ende bzw. bis "(" */
    private typeWords(): string {
        let text = "";
        while (this.peek()?.t === "id" || this.isOp(".")) {
            const t = this.peek()!;
            text += t.v === "." ? "." : (text ? " " : "") + t.v;
            this.pos++;
        }
        if (!text) throw new Fail();
        return javaType(text);
    }

    primary(): JX {
        const t = this.peek();
        if (!t) throw new Fail();
        if (t.t === "num") { this.pos++; return { code: t.v, prec: P.ATOM, type: t.v.includes(".") ? "double" : "int" }; }
        if (t.t === "str") { this.pos++; return { code: JSON.stringify(t.v), prec: P.ATOM, type: "String" }; }
        if (t.t === "chr") { this.pos++; return { code: `'${t.v}'`, prec: P.ATOM, type: "char" }; }
        if (this.isOp("(")) {
            this.pos++;
            const e = this.expr();
            this.expectOp(")");
            return { ...e, prec: P.ATOM, code: e.prec === P.ATOM ? e.code : `(${e.code})` };
        }
        if (this.isOp("|")) {
            this.pos++;
            const e = this.sum();
            this.expectOp("|");
            return { code: `Math.abs(${e.code})`, prec: P.ATOM, type: e.type };
        }
        if (t.t !== "id") throw new Fail();
        // Wahrheitswerte
        if (this.take("wahr") || this.take("true")) return { code: "true", prec: P.ATOM, type: "boolean" };
        if (this.take("falsch") || this.take("false")) return { code: "false", prec: P.ATOM, type: "boolean" };
        // Formulierungen der Hinweise
        if (this.take("ganzzahlige", "Zufallszahl", "zwischen")) {
            const a = this.sum(); this.expectWord("und"); const b = this.sum();
            return { code: `Random.randint(${a.code}, ${b.code})`, prec: P.ATOM, type: "int" };
        }
        if (this.take("Zufallszahl", "zwischen")) {
            this.sum(); this.expectWord("und"); this.sum();
            return { code: "Math.random()", prec: P.ATOM, type: "double" };
        }
        if (this.take("Länge", "von")) {
            const x = this.primary();
            const k = this.kindOf(x);
            const code = k === "array" || k === "array2d" ? `${x.code}.length` : k === "list" ? `${x.code}.size()` : k === "dyn" ? `${x.code}.getLength()` : `${ExprParser.wrap(x, P.ATOM)}.length()`;
            return { code, prec: P.ATOM, type: "int" };
        }
        if (this.take("Anzahl", "der", "Elemente", "von")) {
            const x = this.primary();
            return { code: this.kindOf(x) === "dyn" ? `${x.code}.getLength()` : this.kindOf(x) === "array" ? `${x.code}.length` : `${x.code}.size()`, prec: P.ATOM, type: "int" };
        }
        if (this.take("Anzahl", "der", "Zeilen", "von")) return { code: `${this.primary().code}.length`, prec: P.ATOM, type: "int" };
        if (this.take("Anzahl", "der", "Spalten", "von")) return { code: `${this.primary().code}[0].length`, prec: P.ATOM, type: "int" };
        if (this.take("Element", "an", "Position")) {
            const i = this.sum(); this.expectWord("von"); const x = this.primary();
            const k = this.kindOf(x);
            if (k === "array") return { code: `${x.code}[${i.code}]`, prec: P.ATOM, type: this.elemOf(x) };
            if (k === "dyn") return x.elem
                ? { code: `(${x.elem}) ${x.code}.getItem(${i.code})`, prec: P.UNARY, type: x.elem }
                : { code: `${x.code}.getItem(${i.code})`, prec: P.ATOM };
            return { code: `${ExprParser.wrap(x, P.ATOM)}.get(${i.code})`, prec: P.ATOM, type: this.elemOf(x) };
        }
        if (this.take("entnimm", "Element", "aus") || this.take("entnimm", "oberstes", "Element", "von") || this.take("entnimm", "erstes", "Element", "von")) {
            const x = this.primary();
            const call = `${x.code}.${x.type === "Queue" ? "dequeue" : "pop"}()`;
            return x.elem ? { code: `(${x.elem}) ${call}`, prec: P.UNARY, type: x.elem } : { code: call, prec: P.ATOM };
        }
        if (this.take("oberstes", "Element", "von") || this.take("erstes", "Element", "von")) {
            const x = this.primary();
            const call = `${x.code}.${x.type === "Queue" ? "head" : "top"}()`;
            return x.elem ? { code: `(${x.elem}) ${call}`, prec: P.UNARY, type: x.elem } : { code: call, prec: P.ATOM };
        }
        if (this.take("Zeichen", "an", "Position")) {
            const i = this.sum(); this.expectWord("von"); const x = this.primary();
            return { code: `${ExprParser.wrap(x, P.ATOM)}.charAt(${i.code})`, prec: P.ATOM, type: "char" };
        }
        if (this.take("Teilzeichenkette", "von")) {
            const x = this.primary(); this.expectWord("von"); this.expectWord("Position"); const a = this.sum();
            this.expectWord("bis"); this.expectWord("vor"); const b = this.sum();
            return { code: `${ExprParser.wrap(x, P.ATOM)}.substring(${a.code}, ${b.code})`, prec: P.ATOM, type: "String" };
        }
        if (this.take("Vergleich", "von")) {
            const a = this.primary(); this.expectWord("mit"); const b = this.primary();
            return { code: `${ExprParser.wrap(a, P.ATOM)}.compareTo(${b.code})`, prec: P.ATOM, type: "int" };
        }
        if (this.take("ASCII-Wert", "von")) return { code: `(int) ${ExprParser.wrap(this.primary(), P.UNARY)}`, prec: P.UNARY, type: "int" };
        if (this.take("Zeichen", "mit", "ASCII-Wert")) return { code: `(char) ${ExprParser.wrap(this.primary(), P.UNARY)}`, prec: P.UNARY, type: "char" };
        if (this.take("ganzzahliger", "Anteil", "von")) return { code: `(int) ${ExprParser.wrap(this.primary(), P.UNARY)}`, prec: P.UNARY, type: "int" };
        if (this.take("Wurzel", "aus")) return { code: `Math.sqrt(${this.primary().code})`, prec: P.ATOM, type: "double" };
        if (this.take("Betrag", "von")) {
            const x = this.primary();
            return { code: `Math.abs(${x.code})`, prec: P.ATOM, type: x.type };
        }
        for (const [w, f] of [["Minimum", "min"], ["Maximum", "max"]]) {
            if (this.take(w, "von")) {
                const a = this.sum(); this.expectWord("und"); const b = this.sum();
                return { code: `Math.${f}(${a.code}, ${b.code})`, prec: P.ATOM, type: a.type === "double" || b.type === "double" ? "double" : "int" };
            }
        }
        if (this.take("eingegebene")) {
            const kind = this.peek()?.v ?? "";
            this.pos++;
            const method = ({ Ganzzahl: "readInt", Fließkommazahl: "readDouble", Zeichenkette: "readString", Wahrheitswert: "readBoolean", Zeichen: "readChar" } as Record<string, string>)[kind];
            if (!method) throw new Fail();
            const prompt = this.isOp("(") ? this.args()[0] ?? "\"\"" : "\"\"";
            return { code: `Input.${method}(${prompt})`, prec: P.ATOM, type: javaType(kind) };
        }
        if (this.take("erzeuge")) {
            const cls = this.peek();
            if (cls?.t !== "id") throw new Fail();
            this.pos++;
            const args = this.isOp("(") ? this.args() : [];
            return { code: `new ${cls.v}(${args.join(", ")})`, prec: P.ATOM, type: cls.v };
        }
        if (this.take("leere", "Liste", "vom", "Inhaltstyp")) {
            const e = this.typeWords();
            const w = WRAP[e] ?? e;
            return { code: `new ArrayList<${w}>()`, prec: P.ATOM, type: `ArrayList<${w}>` };
        }
        // Binärbaum: neuer Binärbaum [mit Inhalt …], Inhalt von b, linker/rechter Teilbaum von b
        if (this.take("neuer", "Binärbaum")) {
            if (this.take("mit", "Inhalt")) {
                const v = this.sum();
                return { code: `new BinTree(${v.code})`, prec: P.ATOM, type: "BinTree" };
            }
            const elem = this.take("vom", "Inhaltstyp") ? this.typeWords() : undefined;
            return { code: "new BinTree()", prec: P.ATOM, type: "BinTree", elem };
        }
        if (this.take("Inhalt", "von")) {
            const x = this.primary();
            const call = `${x.code}.getItem()`;
            return x.elem ? { code: `(${x.elem}) ${call}`, prec: P.UNARY, type: x.elem } : { code: call, prec: P.ATOM };
        }
        if (this.take("linker", "Teilbaum", "von") || this.take("rechter", "Teilbaum", "von")) {
            const left = this.toks[this.pos - 3].v.toLowerCase() === "linker";
            const x = this.primary();
            return { code: `${x.code}.${left ? "getLeft" : "getRight"}()`, prec: P.ATOM, type: "BinTree", elem: x.elem };
        }
        if (this.take("leere", "dynamische", "Reihung") || this.take("leerer", "Stapel") || this.take("leere", "Schlange")) {
            const t = this.toks[this.pos - 1].v.toLowerCase();
            const type = t === "stapel" ? "Stack" : t === "schlange" ? "Queue" : "DynArray";
            const elem = this.take("vom", "Inhaltstyp") ? this.typeWords() : undefined;
            return { code: `new ${type}()`, prec: P.ATOM, type, elem };
        }
        if (this.take("stat") || this.take("statische")) {
            if (this.isOp(".")) this.pos++;
            this.expectWord("Reihung");
            if (this.take("der", "Länge")) {
                const n = this.sum(); this.expectWord("vom"); this.expectWord("Inhaltstyp");
                const e = this.typeWords();
                return { code: `new ${e}[${n.code}]`, prec: P.ATOM, type: e + "[]" };
            }
            if (this.take("mit")) {
                if (this.take("den", "Elementen") || this.take("den", "Werten")) {
                    const items: JX[] = [];
                    do items.push(this.sum());
                    while (this.isOp(",") && ++this.pos);
                    const e = items[0]?.type ?? "int";
                    return { code: `new ${e}[]{${items.map((x) => x.code).join(", ")}}`, prec: P.ATOM, type: e + "[]" };
                }
                const r = this.sum(); this.expectWord("Zeilen"); this.expectWord("und"); const c = this.sum(); this.expectWord("Spalten");
                this.expectWord("vom"); this.expectWord("Inhaltstyp");
                const e = this.typeWords();
                return { code: `new ${e}[${r.code}][${c.code}]`, prec: P.ATOM, type: e + "[][]" };
            }
            throw new Fail();
        }
        return this.chain();
    }

    /** name, name.attr, name.m(…), name[i], this.x, super.m(…) */
    private chain(): JX {
        const t = this.peek()!;
        this.pos++;
        let code = t.v, type = this.vars.get(t.v);
        const elem = this.vars.get(t.v + "#elem");
        if (this.isOp("(")) {
            code += `(${this.args().join(", ")})`;
            type = this.vars.get(t.v + "()");   // Ergebnistyp der eigenen Operation (z. B. rekursiver Aufruf)
        }
        while (this.isOp(".") || this.isOp("[")) {
            if (this.isOp("[")) {
                this.pos++;
                const i = this.expr();
                this.expectOp("]");
                code += `[${i.code}]`;
                type = type?.endsWith("[]") ? type.slice(0, -2) : undefined;
                continue;
            }
            this.pos++;
            const n = this.peek();
            if (n?.t !== "id") throw new Fail();
            this.pos++;
            code += "." + n.v;
            type = undefined;
            if (this.isOp("(")) code += `(${this.args().join(", ")})`;
        }
        return { code, prec: P.ATOM, type, elem: code === t.v ? elem : undefined };
    }
}

/** Ausdruck übersetzen (oder undefined, wenn er nicht vollständig erkannt wird) */
export function translateExpr(text: string, vars: Vars = new Map()): JX | undefined {
    const toks = tokenize(text);
    if (!toks || !toks.length) return undefined;
    try {
        const p = new ExprParser(toks, vars);
        const x = p.expr();
        return p.atEnd() ? x : undefined;
    } catch (e) {
        if (e instanceof Fail) return undefined;
        throw e;
    }
}

// ------------------------------------------------------------------ Anweisungen

const IND = "    ";

class Translator {
    lines: string[] = [];
    todos = 0;
    private repeatDepth = 0;

    constructor(private vars: Vars) { }

    private emit(indent: string, line: string) { this.lines.push(indent + line); }

    /** Kommentar an die zuletzt geschriebene Zeile anhängen */
    private addComment(comment: string | undefined) {
        if (comment) this.lines[this.lines.length - 1] += " // " + comment;
    }

    private todo(indent: string, text: string) {
        this.todos++;
        this.emit(indent, `// TODO: ${text}`);
    }

    private cond(text: string): string {
        const x = translateExpr(text, this.vars);
        if (x) return x.code;
        this.todos++;
        return `false /* TODO: ${text.replace(/\*\//g, "* /")} */`;
    }

    seq(nodes: ENode[], indent: string) {
        for (const n of nodes) this.node(n, indent);
    }

    node(n: ENode, indent: string) {
        switch (n.kind) {
            case "stmt": this.statement(n.text, indent); break;
            case "if": this.ifStatement(n, indent); break;
            case "switch": this.switchStatement(n, indent); break;
            case "loop": this.loop(n.head, n.body, indent); break;
            case "footloop": {
                this.emit(indent, "do {");
                this.seq(n.body, indent + IND);
                const [foot, comment] = splitComment(n.foot);
                let m: RegExpExecArray | null;
                if ((m = /^(?:wiederhole\s+)?bis\s+(.+)$/i.exec(foot))) {
                    const x = translateExpr(m[1], this.vars);
                    this.emit(indent, `} while (${x ? negate(x) : this.cond(m[1])});`);
                } else if ((m = /^(?:wiederhole\s+)?solange\s+(.+)$/i.exec(foot))) {
                    this.emit(indent, `} while (${this.cond(m[1])});`);
                } else {
                    this.emit(indent, `} while (${this.cond(foot)});`);
                }
                this.addComment(comment);
                break;
            }
        }
    }

    /** Verzweigung; eine Verzweigung allein im falsch-Zweig wird "else if" */
    private ifStatement(n: Extract<ENode, { kind: "if" }>, indent: string) {
        const [cond, comment] = splitComment(n.cond);
        this.emit(indent, `if (${this.cond(cond)}) {`);
        this.addComment(comment);
        let cur = n;
        for (;;) {
            this.seq(cur.yes, indent + IND);
            const next = cur.no.length === 1 && cur.no[0].kind === "if" ? cur.no[0] : undefined;
            if (next) {
                const [c2, com2] = splitComment(next.cond);
                this.emit(indent, `} else if (${this.cond(c2)}) {`);
                this.addComment(com2);
                cur = next;
                continue;
            }
            if (cur.no.length) {
                this.emit(indent, "} else {");
                this.seq(cur.no, indent + IND);
            }
            this.emit(indent, "}");
            return;
        }
    }

    private switchStatement(n: Extract<ENode, { kind: "switch" }>, indent: string) {
        const subject = n.subject.replace(/\s+ist\s+gleich\s*$/i, "").trim();
        this.emit(indent, `switch (${this.cond(subject)}) {`);
        for (const c of n.cases) {
            for (const label of c.label.split(",").map((l) => l.trim()).filter(Boolean)) {
                this.emit(indent + IND, `case ${translateExpr(label, this.vars)?.code ?? label}:`);
            }
            this.seq(c.body, indent + IND + IND);
            this.emit(indent + IND + IND, "break;");
        }
        if (n.other) {
            this.emit(indent + IND, "default:");
            this.seq(n.other, indent + IND + IND);
        }
        this.emit(indent, "}");
    }

    private loop(head: string, body: ENode[], indent: string) {
        const [h, comment] = splitComment(head);
        const done = this.lines.length;
        let m: RegExpExecArray | null;
        const inner = () => this.seq(body, indent + IND);
        if ((m = /^solange\s+(.+)$/i.exec(h))) {
            this.emit(indent, `while (${this.cond(m[1])}) {`);
        } else if (/^wiederhole\s+(endlos|fortlaufend|immer)$/i.test(h)) {
            this.emit(indent, "while (true) {");
        } else if ((m = /^wiederhole\s+(.+?)\s*-?\s*mal$/i.exec(h))) {
            const n = translateExpr(m[1], this.vars);
            this.repeatDepth++;
            const v = this.repeatDepth === 1 ? "durchlauf" : "durchlauf" + this.repeatDepth;
            this.emit(indent, `for (int ${v} = 1; ${v} <= ${n ? n.code : this.cond(m[1])}; ${v}++) {`);
            inner();
            this.emit(indent, "}");
            this.repeatDepth--;
            return;
        } else if ((m = /^für\s+([\p{L}_$][\p{L}\p{N}_$]*)\s+von\s+(.+?)\s+bis\s+(.+?)(?:\s*,\s*Schrittweite\s+(.+))?$/iu.exec(h))) {
            const [, v, fromT, toT, stepT] = m;
            const from = translateExpr(fromT, this.vars), step = stepT ? translateExpr(stepT, this.vars) : { code: "1", prec: 0 };
            let to = translateExpr(toT, this.vars);
            if (!from || !to || !step) {
                this.todo(indent, h);
                this.seq(body, indent);
                return;
            }
            const down = step.code.startsWith("-");
            const stepAbs = down ? step.code.slice(1) : step.code;
            // "bis n - 1" -> i < n (so schreibt man es in Java)
            let cmp = down ? ">=" : "<=";
            const minus1 = /^(.*) - 1$/.exec(to.code), plus1 = /^(.*) \+ 1$/.exec(to.code);
            if (!down && minus1) { cmp = "<"; to = { ...to, code: minus1[1] }; }
            if (down && plus1) { cmp = ">"; to = { ...to, code: plus1[1] }; }
            const update = stepAbs === "1" ? (down ? `${v}--` : `${v}++`) : `${v} ${down ? "-=" : "+="} ${stepAbs}`;
            this.vars.set(v, "int");
            this.emit(indent, `for (int ${v} = ${from.code}; ${v} ${cmp} ${to.code}; ${update}) {`);
        } else if ((m = /^für\s+(?:alle\s+Elemente|jedes\s+Element)\s+([\p{L}_$][\p{L}\p{N}_$]*)\s+(?:aus|in)\s+(.+)$/iu.exec(h))) {
            const [, v, listT] = m;
            const list = translateExpr(listT, this.vars);
            if (!list) {
                this.todo(indent, h);
                this.seq(body, indent);
                return;
            }
            const t = list.type ?? "";
            const elem = t.endsWith("[]") ? t.slice(0, -2) : /^ArrayList<(.+)>$/.exec(t)?.[1] ?? (t === "DynArray" ? "Object" : "var");
            this.vars.set(v, ({ Integer: "int", Double: "double", Boolean: "boolean", Character: "char" } as Record<string, string>)[elem] ?? elem);
            this.emit(indent, `for (${elem} ${v} : ${list.code}) {`);
        } else {
            this.todo(indent, h);
            this.seq(body, indent);
            return;
        }
        if (comment && this.lines.length > done) this.lines[done] += " // " + comment;
        inner();
        this.emit(indent, "}");
    }

    statement(text: string, indent: string) {
        const s = text.trim();
        if (!s) return;
        if (s.startsWith("//")) {
            this.emit(indent, "// " + s.slice(2).trim());
            return;
        }
        const [code, comment] = splitComment(s);
        const line = this.statementCode(code);
        if (line === undefined) this.todo(indent, s);
        else {
            this.emit(indent, line);
            this.addComment(comment);
        }
    }

    /** eine Anweisung als Java (oder undefined) */
    statementCode(s: string): string | undefined {
        const x = (t: string) => translateExpr(t, this.vars);
        let m: RegExpExecArray | null;
        // Zuweisung
        if ((m = /^(.+?)\s*←\s*(.+)$/.exec(s))) {
            const target = m[1].trim(), value = x(m[2]);
            if (!value) return undefined;
            if (/^[\p{L}_$][\p{L}\p{N}_$]*$/u.test(target) && !this.vars.has(target)) {
                // erste Zuweisung: Deklaration mit dem Typ des Werts
                const type = value.type ?? "var";
                this.vars.set(target, type);
                if (value.elem) this.vars.set(target + "#elem", value.elem);
                if (type.endsWith("[]") && value.code.startsWith("new ") && value.code.includes("{")) {
                    return `${type} ${target} = ${value.code.slice(value.code.indexOf("{"))};`;
                }
                return `${type} ${target} = ${value.code};`;
            }
            const t = x(target);
            if (!t) return undefined;
            return `${t.code} = ${value.code};`;
        }
        if ((m = /^gib\s+(.+)\s+aus$/i.exec(s))) {
            const parts = splitTop(m[1]).map((p) => x(p));
            if (parts.some((p) => !p)) return undefined;
            return `println(${parts.map((p) => (parts.length > 1 ? ExprParser.wrap(p!, P.ADD) : p!.code)).join(' + " " + ')});`;
        }
        if (/^gib\s+eine\s+leere\s+Zeile\s+aus$/i.test(s)) return "println(\"\");";
        if ((m = /^gib\s+(.+)\s+zurück$/i.exec(s))) {
            const v = x(m[1]);
            return v ? `return ${v.code};` : undefined;
        }
        if (/^(beende|verlasse)\s+die\s+Operation$/i.test(s) || /^gib\s+zurück$/i.test(s)) return "return;";
        if ((m = /^(erhöhe|verringere)\s+(.+?)\s+um\s+(.+)$/i.exec(s))) {
            const t = x(m[2]), v = x(m[3]);
            if (!t || !v) return undefined;
            const up = m[1].toLowerCase() === "erhöhe";
            return v.code === "1" ? `${t.code}${up ? "++" : "--"};` : `${t.code} ${up ? "+=" : "-="} ${v.code};`;
        }
        if ((m = /^füge\s+(.+?)\s+an\s+Position\s+(.+?)\s+in\s+(.+?)\s+ein$/i.exec(s))) {
            const v = x(m[1]), i = x(m[2]), l = x(m[3]);
            if (!v || !i || !l) return undefined;
            return l.type === "DynArray" ? `${l.code}.insertAt(${i.code}, ${v.code});` : `${l.code}.add(${i.code}, ${v.code});`;
        }
        if ((m = /^füge\s+(.+?)\s+(?:zu|an)\s+(.+?)\s+(?:hinzu|an)$/i.exec(s))) {
            const v = x(m[1]), l = x(m[2]);
            if (!v || !l) return undefined;
            const method = l.type === "DynArray" ? "append" : l.type === "Stack" ? "push" : l.type === "Queue" ? "enqueue" : "add";
            return `${l.code}.${method}(${v.code});`;
        }
        // Stapel, Schlange, Binärbaum
        if ((m = /^entnimm\s+(?:das\s+)?(?:oberstes\s+|erstes\s+)?Element\s+(?:von|aus)\s+(.+)$/i.exec(s))) {
            const l = x(m[1]);
            return l ? `${l.code}.${l.type === "Queue" ? "dequeue" : "pop"}();` : undefined;
        }
        if ((m = /^setze\s+Inhalt\s+von\s+(.+?)\s+auf\s+(.+)$/i.exec(s))) {
            const t = x(m[1]), v = x(m[2]);
            return t && v ? `${t.code}.setItem(${v.code});` : undefined;
        }
        if ((m = /^setze\s+(linken|rechten)\s+Teilbaum\s+von\s+(.+?)\s+auf\s+(.+)$/i.exec(s))) {
            const t = x(m[2]), v = x(m[3]);
            return t && v ? `${t.code}.${m[1].toLowerCase() === "linken" ? "setLeft" : "setRight"}(${v.code});` : undefined;
        }
        if ((m = /^mache\s+(.+?)\s+leer$/i.exec(s))) {
            const t = x(m[1]);
            return t ? `${t.code}.setEmpty();` : undefined;
        }
        if ((m = /^lege\s+(.+?)\s+auf\s+(.+)$/i.exec(s))) {
            const v = x(m[1]), l = x(m[2]);
            return v && l ? `${l.code}.push(${v.code});` : undefined;
        }
        if ((m = /^(?:lösche|entferne)\s+(?:das\s+)?Element\s+an\s+Position\s+(.+?)\s+(?:von|aus)\s+(.+)$/i.exec(s))) {
            const i = x(m[1]), l = x(m[2]);
            if (!i || !l) return undefined;
            return l.type === "DynArray" ? `${l.code}.delete(${i.code});` : `${l.code}.remove(${i.code});`;
        }
        if ((m = /^(?:ersetze|setze)\s+(?:das\s+)?Element\s+an\s+Position\s+(.+?)\s+von\s+(.+?)\s+(?:durch|auf)\s+(.+)$/i.exec(s))) {
            const i = x(m[1]), l = x(m[2]), v = x(m[3]);
            if (!i || !l || !v) return undefined;
            if (l.type?.endsWith("[]")) return `${l.code}[${i.code}] = ${v.code};`;
            return l.type === "DynArray" ? `${l.code}.setItem(${i.code}, ${v.code});` : `${l.code}.set(${i.code}, ${v.code});`;
        }
        // Tracetabelle (Paket 10): trage in die Tracetabelle ein [(„Bemerkung“)]
        if ((m = /^trage\s+(?:die\s+Werte\s+)?in\s+die\s+Tracetabelle\s+ein(?:\s*\(\s*[„"“](.*)[“"”]\s*\))?$/i.exec(s))) {
            const text = (m[1] ?? "").trim().replace(/\\/g, "\\\\").replace(/"/g, '\\"');
            return text ? `trace("${text}");` : "trace();";
        }
        if ((m = /^warte\s+(.+?)\s+Millisekunden$/i.exec(s))) {
            const v = x(m[1]);
            return v ? `Thread.sleep(${v.code});` : undefined;
        }
        if ((m = /^Konstruktor\s+der\s+Oberklasse\s*\((.*)\)$/i.exec(s))) {
            const v = m[1].trim() ? x(`f(${m[1]})`) : { code: "f()" };
            return v ? `super${v.code.slice(1)};` : undefined;
        }
        // Aufruf: name(…), obj.m(…), erzeuge …
        const call = x(s);
        if (call && /\)$/.test(call.code)) return call.code + ";";
        return undefined;
    }
}

/** Bedingung verneinen (für "wiederhole bis …"): Vergleiche umdrehen, sonst !(…) */
function negate(x: JX): string {
    const m = /^(.+?) (==|!=|<=|>=|<|>) (.+)$/.exec(x.code);
    if (m && x.prec >= P.REL && x.prec <= P.EQ && !/&&|\|\|/.test(x.code)) {
        const inv: Record<string, string> = { "==": "!=", "!=": "==", "<=": ">", ">=": "<", "<": ">=", ">": "<=" };
        return `${m[1]} ${inv[m[2]]} ${m[3]}`;
    }
    if (x.code.startsWith("!") && x.prec === P.UNARY) return x.code.slice(1);
    return x.prec === P.ATOM ? `!${x.code}` : `!(${x.code})`;
}

/** "w = 32  // v ist ein Leerzeichen" -> ["w = 32", "v ist ein Leerzeichen"] (// außerhalb von Texten) */
export function splitComment(s: string): [string, string | undefined] {
    let quote = "";
    for (let i = 0; i < s.length - 1; i++) {
        const c = s[i];
        if (quote) {
            if (c === quote) quote = "";
        } else if (c === "\"" || c === "'") quote = c;
        else if (c === "/" && s[i + 1] === "/") return [s.slice(0, i).trim(), s.slice(i + 2).trim()];
    }
    return [s.trim(), undefined];
}

/** "a, b, c" an Kommas außerhalb von Klammern/Texten trennen */
function splitTop(s: string): string[] {
    const out: string[] = [];
    let depth = 0, quote = "", cur = "";
    for (const c of s) {
        if (quote) {
            if (c === quote) quote = "";
        } else if (c === "\"" || c === "'") quote = c;
        else if (c === "(" || c === "[") depth++;
        else if (c === ")" || c === "]") depth--;
        else if (c === "," && depth === 0) {
            out.push(cur.trim());
            cur = "";
            continue;
        }
        cur += c;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
}

// ------------------------------------------------------------------ Signatur und ganzes Struktogramm

export type Signature = { kind: "main" } | { kind: "method" | "ctor"; name: string; params: { name: string; type: string; elem?: string }[]; ret: string };

/** Titel lesen: "name(a, b: Ganzzahl): Wahrheitswert", "Konstruktor Hund(…)" oder Hauptprogramm */
export function parseSignature(title: string): Signature {
    const m = /^\s*(Konstruktor\s+)?([\p{L}_$][\p{L}\p{N}_$]*)\s*\((.*)\)\s*(?::\s*(.+?))?\s*$/u.exec(title);
    if (!m) return { kind: "main" };
    const params: { name: string; type: string; elem?: string }[] = [];
    let pending: string[] = [];
    for (const part of m[3].split(",").map((p) => p.trim()).filter(Boolean)) {
        const colon = part.indexOf(":");
        if (colon < 0) {
            pending.push(part);
            continue;
        }
        const type = javaType(part.slice(colon + 1));
        const elem = elemType(part.slice(colon + 1));
        for (const n of [...pending, part.slice(0, colon).trim()]) params.push({ name: n, type, ...(elem ? { elem } : {}) });
        pending = [];
    }
    for (const n of pending) params.push({ name: n, type: "int" });
    return { kind: m[1] ? "ctor" : "method", name: m[2], params, ret: m[4] ? javaType(m[4]) : "void" };
}

export type JavaOutput = { code: string; todos: number; signature: Signature };

/** ganzes Struktogramm als Java (Hauptprogramm-Anweisungen bzw. eine Operation) */
export function docToJava(doc: StructogramDoc): JavaOutput {
    const sig = parseSignature(doc.title);
    const vars: Vars = new Map(sig.kind === "main" ? [] : sig.params.map((p) => [p.name, p.type] as [string, string]));
    if (sig.kind === "method" && sig.ret !== "void") vars.set(sig.name + "()", sig.ret);
    if (sig.kind !== "main") for (const p of sig.params) if (p.elem) vars.set(p.name + "#elem", p.elem);
    const t = new Translator(vars);
    if (sig.kind === "main") {
        t.seq(doc.body, "");
    } else {
        const params = sig.params.map((p) => `${p.type} ${p.name}`).join(", ");
        t.lines.push(sig.kind === "ctor" ? `public ${sig.name}(${params}) {` : `${sig.ret} ${sig.name}(${params}) {`);
        t.seq(doc.body, IND);
        t.lines.push("}");
    }
    return { code: t.lines.join("\n") + "\n", todos: t.todos, signature: sig };
}

/** Wird der Text eines Elements erkannt (sonst wird er in Java ein TODO)? */
export function isRecognized(kind: ENode["kind"], text: string, vars: Vars = new Map()): boolean {
    const s = text.trim();
    if (!s) return true;
    const t = new Translator(new Map(vars));
    switch (kind) {
        case "stmt": return s.startsWith("//") || t.statementCode(splitComment(s)[0]) !== undefined;
        case "if": return !!translateExpr(splitComment(s)[0], vars);
        case "switch": return !!translateExpr(splitComment(s)[0].replace(/\s+ist\s+gleich\s*$/i, ""), vars);
        case "loop": case "footloop": {
            const n: ENode = kind === "loop" ? { id: "x", kind, head: s, body: [] } : { id: "x", kind, foot: s, body: [] };
            t.node(n, "");
            return t.todos === 0;
        }
    }
}
