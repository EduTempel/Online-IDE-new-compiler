import { Lexer } from "../../compiler/java/lexer/Lexer";
import { TokenType } from "../../compiler/java/TokenType";
import { B, type BlockState } from "../blocks/BlockTypes";
import { JavaBlockParser } from "../blocks/JavaBlockParser";
import { methodParams, typeInfo, type ClassInfo } from "../blocks/ClassModel";

/**
 * Struktogramme (Nassi-Shneiderman) aus Java-Code – im Stil der Ergänzenden Hinweise für das
 * Abitur in Niedersachsen: Titel als Signatur mit deutschen Typnamen, Anweisungen sprachlich
 * ("x ← …", "gib … zurück", "erhöhe … um 1", "füge … zu … hinzu"), Bedingungen mit = ≠ UND ODER
 * nicht, Verzweigung mit wahr/falsch, mehrseitige Auswahl "… ist gleich" mit "sonst", Schleifen
 * kopf- und fußgesteuert, Kommentare mit "//".
 *
 * Grundlage ist der Parser des Blockmodus (Java -> Blöcke); was es dort nicht als Block gibt,
 * erscheint als (leicht übersetzter) Java-Text.
 */

export type SNode =
    | { kind: "stmt"; text: string; line?: number }
    | { kind: "if"; cond: string; yes: SNode[]; no: SNode[] }
    | { kind: "switch"; subject: string; cases: { label: string; body: SNode[] }[]; other?: SNode[] }
    | { kind: "loop"; head: string; body: SNode[] }
    | { kind: "footloop"; foot: string; body: SNode[] };

export type Diagram = { title: string; group?: string; body: SNode[] };

// ------------------------------------------------------------------ Datentypen

const TYPE_DE: Record<string, string> = {
    int: "Ganzzahl", double: "Fließkommazahl", String: "Zeichenkette", boolean: "Wahrheitswert", char: "Zeichen",
    Integer: "Ganzzahl", Double: "Fließkommazahl", Boolean: "Wahrheitswert", Character: "Zeichen", Object: "Objekt",
};

/** Datentyp in der Schreibweise der Hinweise: Ganzzahl, stat. Reihung vom Inhaltstyp Zeichenkette … */
export function typeDe(t: string): string {
    const info = typeInfo(t);
    const elem = TYPE_DE[info.elem] ?? info.elem;
    switch (info.kind) {
        case "array": return `stat. Reihung vom Inhaltstyp ${elem}`;
        case "array2d": return `zweidim. stat. Reihung vom Inhaltstyp ${elem}`;
        case "list": return `Liste vom Inhaltstyp ${elem}`;
        case "dyn": return "dynamische Reihung";
    }
    return TYPE_DE[t] ?? t;
}

/** Signatur: name(a, b: Ganzzahl, s: Zeichenkette): Wahrheitswert (gleiche Typen zusammengefasst) */
export function signature(name: string, params: { name: string; type: string }[], ret?: string): string {
    const groups: { names: string[]; type: string }[] = [];
    for (const p of params) {
        const last = groups[groups.length - 1];
        if (last && last.type === p.type) last.names.push(p.name);
        else groups.push({ names: [p.name], type: p.type });
    }
    const list = groups.map((g) => `${g.names.join(", ")}: ${typeDe(g.type)}`).join(", ");
    return `${name}(${list})${ret && ret !== "void" ? ": " + typeDe(ret) : ""}`;
}

// ------------------------------------------------------------------ Ausdrücke

/** Bindungsstärke (kleiner = bindet stärker) */
const enum P { ATOM = 0, UNARY = 1, MULT = 2, ADD = 3, REL = 4, EQ = 5, AND = 6, OR = 7, NONE = 99 }

const OPS: Record<string, [string, P]> = {
    "*": ["·", P.MULT], "/": ["/", P.MULT], "%": ["mod", P.MULT], "+": ["+", P.ADD], "-": ["-", P.ADD],
    "<": ["<", P.REL], ">": [">", P.REL], "<=": ["≤", P.REL], ">=": ["≥", P.REL], "==": ["=", P.EQ], "!=": ["≠", P.EQ],
    "&&": ["UND", P.AND], "||": ["ODER", P.OR],
};
const NEGATED: Record<string, string> = { "<": ">=", ">": "<=", "<=": ">", ">=": "<", "==": "!=", "!=": "==" };

const JAVA_WORDS: Partial<Record<TokenType, string>> = {
    [TokenType.equal]: "=", [TokenType.notEqual]: "≠", [TokenType.lowerOrEqual]: "≤", [TokenType.greaterOrEqual]: "≥",
    [TokenType.and]: "UND", [TokenType.or]: "ODER", [TokenType.modulo]: "mod", [TokenType.multiplication]: "·",
};

/** freier Java-Text: Operatoren und wahr/falsch in der Schreibweise der Struktogramme */
export function neutral(code: string): string {
    let out = "";
    let lastWasNot = false;
    for (const t of new Lexer().lex(code).tokens) {
        if (t.tt === TokenType.endofSourcecode) continue;
        const r = t.range;
        const text = r.startLineNumber === r.endLineNumber ? code.split("\n")[r.startLineNumber - 1]?.slice(r.startColumn - 1, r.endColumn - 1) ?? "" : String(t.value ?? "");
        let piece = JAVA_WORDS[t.tt] ?? text;
        if (t.tt === TokenType.booleanLiteral) piece = t.value ? "wahr" : "falsch";
        if (t.tt === TokenType.not) piece = "nicht ";
        if (t.tt === TokenType.multiplication || t.tt === TokenType.modulo) piece = ` ${piece} `.replace(/\s+/g, " ");
        if (lastWasNot && t.tt === TokenType.space) piece = "";
        out += piece;
        lastWasNot = t.tt === TokenType.not;
    }
    return out.replace(/\s{2,}/g, " ").replace(/;\s*$/, "").trim();
}

class Expr {
    /** Datentypen der Variablen (für "ASCII-Wert von …") */
    constructor(private types: Map<string, string>) { }

    text(b: BlockState | undefined): string {
        return b ? this.value(b, P.NONE) : "…";
    }

    private value(b: BlockState, outer: P, right = false): string {
        const [t, p] = this.expr(b);
        return p > outer || (right && p === outer && p !== P.ATOM) ? `(${t})` : t;
    }

    private input(b: BlockState, name: string, outer: P = P.NONE): string {
        const c = b.inputs?.[name]?.block;
        return c ? this.value(c, outer) : "…";
    }

    /** Objekt vor ".operation": zusammengesetzte Ausdrücke in Klammern */
    receiver(b: BlockState): string {
        return this.input(b, "OBJ", P.ATOM);
    }

    args(b: BlockState): string {
        const n = b.extraState?.args ?? 0;
        const list: string[] = [];
        for (let i = 0; i < n; i++) list.push(this.input(b, "ARG" + i));
        return `(${list.join(", ")})`;
    }

    /** Bedingung verneint (für "wiederhole bis …"): Vergleiche umdrehen, sonst "nicht (…)" */
    negated(b: BlockState | undefined): string {
        if (!b) return "…";
        if (b.type === B.compare && NEGATED[b.fields?.OP ?? ""]) {
            return this.text({ ...b, fields: { ...b.fields, OP: NEGATED[b.fields!.OP] } });
        }
        if (b.type === B.not) return this.input(b, "VALUE");
        if (b.type === B.bool) return b.fields?.VALUE === "true" ? "falsch" : "wahr";
        return `nicht ${this.value(b, P.UNARY)}`;
    }

    private expr(b: BlockState): [string, P] {
        const f = b.fields ?? {};
        const name = f.NAME ?? "";
        switch (b.type) {
            case B.number: return [f.NUM ?? "0", (f.NUM ?? "").startsWith("-") ? P.UNARY : P.ATOM];
            case B.text: return [`"${f.TEXT ?? ""}"`, P.ATOM];
            case B.char: return [`'${f.CHAR ?? ""}'`, P.ATOM];
            case B.bool: return [f.VALUE === "false" ? "falsch" : "wahr", P.ATOM];
            case B.varGet: return [name, P.ATOM];
            case B.arith: case B.compare: case B.logic: {
                const [op, p] = OPS[f.OP ?? "+"] ?? [f.OP ?? "?", P.NONE];
                return [`${this.input(b, "A", p)} ${op} ${this.value(b.inputs?.B?.block ?? { type: "" }, p, true)}`, p];
            }
            case B.concat: return [`${this.input(b, "A", P.ADD)} + ${this.value(b.inputs?.B?.block ?? { type: "" }, P.ADD, true)}`, P.ADD];
            case B.not: {
                const inner = b.inputs?.VALUE?.block;
                if (inner && (inner.type === B.collIsEmpty || inner.type === B.dynIsEmpty)) return [`${inner.fields?.NAME} nicht leer`, P.EQ];
                return [`nicht ${this.input(b, "VALUE", P.UNARY)}`, P.UNARY];
            }
            case B.input: {
                const kind = ({ readInt: "Ganzzahl", readDouble: "Fließkommazahl", readString: "Zeichenkette", readBoolean: "Wahrheitswert", readChar: "Zeichen" } as Record<string, string>)[f.METHOD ?? ""] ?? "Wert";
                return [`eingegebene ${kind} (${this.input(b, "PROMPT")})`, P.ATOM];
            }
            case B.random: return [`ganzzahlige Zufallszahl zwischen ${this.input(b, "FROM")} und ${this.input(b, "TO")}`, P.NONE];
            case B.randomDouble: return ["Zufallszahl zwischen 0 und 1", P.NONE];
            case B.math: {
                const v = this.input(b, "VALUE", P.ATOM);
                if (f.FUNC === "sqrt") return [`Wurzel aus ${v}`, P.NONE];
                if (f.FUNC === "abs") return [`|${this.input(b, "VALUE")}|`, P.ATOM];
                return [`${v} gerundet`, P.NONE];
            }
            case B.minMax: return [`${f.FUNC === "max" ? "Maximum" : "Minimum"} von ${this.input(b, "A")} und ${this.input(b, "B")}`, P.NONE];
            case B.cast: {
                const inner = b.inputs?.VALUE?.block;
                const isChar = inner?.type === B.char || inner?.type === B.strCharAt
                    || (inner?.type === B.varGet && this.types.get(inner.fields?.NAME ?? "") === "char");
                if (f.TYPE === "int" && isChar) return [`ASCII-Wert von ${this.input(b, "VALUE", P.ATOM)}`, P.NONE];
                if (f.TYPE === "char") return [`Zeichen mit ASCII-Wert ${this.input(b, "VALUE", P.ATOM)}`, P.NONE];
                if (f.TYPE === "int") return [`ganzzahliger Anteil von ${this.input(b, "VALUE", P.ATOM)}`, P.NONE];
                return [this.input(b, "VALUE", P.UNARY), P.UNARY];
            }
            case B.strLength: return [`Länge von ${this.input(b, "TEXT", P.ATOM)}`, P.NONE];
            case B.strCharAt: return [`Zeichen an Position ${this.input(b, "INDEX", P.ATOM)} von ${this.input(b, "TEXT", P.ATOM)}`, P.NONE];
            case B.strSubstring: return [`Teilzeichenkette von ${this.input(b, "TEXT", P.ATOM)} von Position ${this.input(b, "FROM", P.ATOM)} bis vor ${this.input(b, "TO", P.ATOM)}`, P.NONE];
            case B.strEquals: return [`${this.input(b, "A", P.EQ)} = ${this.input(b, "B", P.EQ)}`, P.EQ];
            case B.strContains: return [`${this.input(b, "A", P.ATOM)} enthält ${this.input(b, "B", P.ATOM)}`, P.EQ];
            case B.strCompare: return [`Vergleich von ${this.input(b, "A", P.ATOM)} mit ${this.input(b, "B", P.ATOM)}`, P.NONE];
            case B.strCase: return [`${this.input(b, "TEXT", P.ATOM)} in ${f.CASE === "lower" ? "Kleinbuchstaben" : "Großbuchstaben"}`, P.NONE];
            case B.callExpr: return [`${name}${this.args(b)}`, P.ATOM];
            case B.arrayGet: return [`${name}[${this.input(b, "I")}]`, P.ATOM];
            case B.array2dGet: return [`${name}[${this.input(b, "R")}][${this.input(b, "C")}]`, P.ATOM];
            case B.arrayLength: return [`Länge von ${name}`, P.NONE];
            case B.array2dSize: return [f.DIM === "cols" ? `Anzahl der Spalten von ${name}` : `Anzahl der Zeilen von ${name}`, P.NONE];
            case B.listGet: case B.dynGet: return [`Element an Position ${this.input(b, "I", P.ATOM)} von ${name}`, P.NONE];
            case B.listSize: return [`Anzahl der Elemente von ${name}`, P.NONE];
            case B.dynLength: return [`Länge von ${name}`, P.NONE];
            case B.listContains: return [`${name} enthält ${this.input(b, "V", P.ATOM)}`, P.EQ];
            case B.collIsEmpty: case B.dynIsEmpty: return [`${name} ist leer`, P.EQ];
            case B.thisValue: return ["this", P.ATOM];
            case B.thisAttrGet: return [`this.${name}`, P.ATOM];
            case B.objNew: return [`erzeuge ${f.CLASS}${this.args(b)}`, P.NONE];
            case B.objCallExpr: return [`${this.input(b, "OBJ", P.ATOM)}.${f.METHOD}${this.args(b)}`, P.ATOM];
            case B.objAttrGet: return [`${this.input(b, "OBJ", P.ATOM)}.${f.ATTR}`, P.ATOM];
            case B.superMethodCallExpr: return [`super.${f.METHOD}${this.args(b)}`, P.ATOM];
            case B.javaExpression: return [neutral(f.CODE ?? ""), P.NONE];
        }
        return ["…", P.ATOM];
    }
}

// ------------------------------------------------------------------ Anweisungen

class Converter {
    private types = new Map<string, string>();
    private e = new Expr(this.types);

    constructor(params: { name: string; type: string }[] = [], attributes: { name: string; type: string }[] = []) {
        for (const p of [...attributes, ...params]) this.types.set(p.name, p.type);
    }

    seq(first: BlockState | undefined): SNode[] {
        const out: SNode[] = [];
        for (let b = first; b; b = b.next?.block) {
            const n = this.node(b);
            if (n) out.push(n);
        }
        return out;
    }

    private stmt(text: string): SNode {
        return { kind: "stmt", text };
    }

    private node(b: BlockState): SNode | undefined {
        const f = b.fields ?? {};
        const e = this.e;
        const v = (name: string) => e.text(b.inputs?.[name]?.block);
        const name = f.NAME ?? "";
        switch (b.type) {
            case B.varDeclare: {
                this.types.set(name, f.TYPE ?? "int");
                const value = b.inputs?.VALUE?.block;
                return this.stmt(value ? `${name} ← ${e.text(value)}` : `${name}: ${typeDe(f.TYPE ?? "int")}`);
            }
            case B.varSet: return this.stmt(`${name} ← ${v("VALUE")}`);
            case B.varChange: return this.stmt(`erhöhe ${name} um ${v("VALUE")}`);
            case B.varSub: return this.stmt(`verringere ${name} um ${v("VALUE")}`);
            case B.varInc: return this.stmt(`erhöhe ${name} um 1`);
            case B.varDec: return this.stmt(`verringere ${name} um 1`);
            case B.print: {
                const n = Math.max(1, b.extraState?.items ?? 1);
                const values: string[] = [];
                for (let i = 0; i < n; i++) {
                    const c = b.inputs?.[i === 0 ? "VALUE" : "VALUE" + i]?.block;
                    if (c) values.push(e.text(c));
                }
                return this.stmt(values.length ? `gib ${values.join(", ")} aus` : "gib eine leere Zeile aus");
            }
            case B.if: {
                const elseIfs = b.extraState?.elseIfs ?? 0;
                const build = (i: number): SNode => ({
                    kind: "if",
                    cond: v(i === 0 ? "COND" : "COND" + i),
                    yes: this.seq(b.inputs?.[i === 0 ? "DO" : "DO" + i]?.block),
                    no: i < elseIfs ? [build(i + 1)] : b.extraState?.hasElse ? this.seq(b.inputs?.ELSE?.block) : [],
                });
                return build(0);
            }
            case B.while: return { kind: "loop", head: `solange ${v("COND")}`, body: this.seq(b.inputs?.DO?.block) };
            case B.forever: return { kind: "loop", head: "wiederhole endlos", body: this.seq(b.inputs?.DO?.block) };
            case B.repeat: return { kind: "loop", head: `wiederhole ${v("TIMES")}-mal`, body: this.seq(b.inputs?.DO?.block) };
            case B.for: {
                const to = b.inputs?.TO?.block;
                let toText = v("TO");
                if (f.CMP === "excl") {
                    if (to?.type === B.number && /^-?\d+$/.test(to.fields?.NUM ?? "")) toText = String(Number(to.fields!.NUM) + (f.DIR === "down" ? 1 : -1));
                    else toText = `${/[ ]/.test(toText) ? `(${toText})` : toText} ${f.DIR === "down" ? "+" : "-"} 1`;
                }
                const step = b.inputs?.STEP?.block;
                const stepText = step && !(step.type === B.number && step.fields?.NUM === "1") ? `, Schrittweite ${f.DIR === "down" ? "-" : ""}${e.text(step)}` : "";
                return { kind: "loop", head: `für ${f.VAR} von ${v("FROM")} bis ${toText}${stepText}`, body: this.seq(b.inputs?.DO?.block) };
            }
            case B.forEach: return { kind: "loop", head: `für alle Elemente ${f.VAR} aus ${f.LIST}`, body: this.seq(b.inputs?.DO?.block) };
            case B.doWhile: return { kind: "footloop", foot: `wiederhole bis ${e.negated(b.inputs?.COND?.block)}`, body: this.seq(b.inputs?.DO?.block) };
            case B.switch: {
                const labels = b.extraState?.labels ?? [];
                const cases: { label: string; body: SNode[] }[] = [];
                let other: SNode[] | undefined;
                labels.forEach((label, i) => {
                    const body = this.seq(b.inputs?.["CASE" + i]?.block);
                    if (label === "") other = body;
                    else cases.push({ label: neutral(label), body });
                });
                return { kind: "switch", subject: `${v("SUBJECT")} ist gleich`, cases, other };
            }
            case B.wait: return this.stmt(`warte ${v("MS")} Millisekunden`);
            case B.comment: return this.stmt(`// ${f.TEXT ?? ""}`.trimEnd());
            case B.return: return this.stmt(`gib ${v("VALUE")} zurück`);
            case B.returnVoid: return this.stmt("beende die Operation");
            case B.call: return this.stmt(`${name}${e.args(b)}`);
            // Reihungen, Listen, dynamische Reihungen
            case B.arrayNew:
                return this.stmt(`${name} ← stat. Reihung der Länge ${v("LEN")} vom Inhaltstyp ${typeDe(f.TYPE ?? "int")}`);
            case B.arrayValues: {
                const n = Math.max(1, b.extraState?.items ?? 1);
                const values: string[] = [];
                for (let i = 0; i < n; i++) values.push(v("V" + i));
                return this.stmt(`${name} ← stat. Reihung mit den Elementen ${values.join(", ")}`);
            }
            case B.array2dNew: return this.stmt(`${name} ← stat. Reihung mit ${v("R")} Zeilen und ${v("C")} Spalten vom Inhaltstyp ${typeDe(f.TYPE ?? "int")}`);
            case B.arraySet: return this.stmt(`${name}[${v("I")}] ← ${v("V")}`);
            case B.array2dSet: return this.stmt(`${name}[${v("R")}][${v("C")}] ← ${v("V")}`);
            case B.listNew: return this.stmt(`${name} ← leere Liste vom Inhaltstyp ${typeDe(f.TYPE ?? "int")}`);
            case B.dynNew: return this.stmt(`${name} ← leere dynamische Reihung`);
            case B.listAdd: case B.dynAppend: return this.stmt(`füge ${v("V")} zu ${name} hinzu`);
            case B.listInsert: case B.dynInsert: return this.stmt(`füge ${v("V")} an Position ${v("I")} in ${name} ein`);
            case B.listRemove: case B.dynDelete: return this.stmt(`lösche Element an Position ${v("I")} von ${name}`);
            case B.listSet: case B.dynSet: return this.stmt(`ersetze Element an Position ${v("I")} von ${name} durch ${v("V")}`);
            // Klassen und Objekte
            case B.attribute: case B.ctor: case B.classMethod: return undefined;
            case B.superCall: return this.stmt(`Konstruktor der Oberklasse${e.args(b)}`);
            case B.superMethodCall: return this.stmt(`super.${f.METHOD}${e.args(b)}`);
            case B.thisAttrSet: return this.stmt(`this.${name} ← ${v("V")}`);
            case B.objCall: return this.stmt(`${e.receiver(b)}.${f.METHOD}${e.args(b)}`);
            case B.objAttrSet: return this.stmt(`${e.receiver(b)}.${f.ATTR} ← ${v("V")}`);
            // Java-Text
            case B.javaStatement: return this.stmt(neutral(f.CODE ?? ""));
            case B.javaRaw: return this.stmt((b.extraState?.code ?? "").split("\n").map((l) => neutral(l)).join("\n"));
        }
        return undefined;
    }
}

/**
 * Alle Struktogramme einer Java-Datei: Hauptprogramm (falls es Anweisungen hat), Operationen,
 * Konstruktoren und Operationen von Klassen (mit Klassenname als Gruppe).
 */
export function diagramsFromJava(code: string, classes: ClassInfo[] = []): Diagram[] {
    const { state } = JavaBlockParser.parse(code, { classes, structogram: true });
    const result: Diagram[] = [];
    const top = state.blocks.blocks;
    const start = top.find((b) => b.type === B.start);
    const mainBody = new Converter().seq(start?.inputs?.BODY?.block);
    const others = top.filter((b) => b.type !== B.start).sort((a, b) => (a.y ?? 0) - (b.y ?? 0));
    if (mainBody.length || !others.length) result.push({ title: "Hauptprogramm", body: mainBody });
    for (const h of others) {
        if (h.type === B.method) {
            const params = methodParams(h);
            result.push({ title: signature(h.fields?.NAME ?? "", params, h.fields?.RETURN), body: new Converter(params).seq(h.inputs?.BODY?.block) });
        } else if (h.type === B.class) {
            const cls = h.fields?.NAME ?? "";
            const group = `Klasse ${cls}${h.fields?.SUPER ? " (erbt von " + h.fields.SUPER + ")" : ""}`;
            const attributes: { name: string; type: string }[] = [];
            for (let m = h.inputs?.MEMBERS?.block; m; m = m.next?.block) {
                if (m.type === B.attribute) attributes.push({ name: m.fields?.NAME ?? "", type: m.fields?.TYPE ?? "int" });
            }
            for (let m = h.inputs?.MEMBERS?.block; m; m = m.next?.block) {
                const params = methodParams(m);
                const body = () => new Converter(params, attributes).seq(m!.inputs?.BODY?.block);
                if (m.type === B.ctor) result.push({ group, title: "Konstruktor " + signature(cls, params), body: body() });
                if (m.type === B.classMethod) result.push({ group, title: signature(m.fields?.NAME ?? "", params, m.fields?.RETURN), body: body() });
            }
        }
    }
    return result;
}
