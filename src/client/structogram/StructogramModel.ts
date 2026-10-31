import { Lexer } from "../../compiler/java/lexer/Lexer";
import { TokenType } from "../../compiler/java/TokenType";
import { B, isPartHat, type BlockState } from "../blocks/BlockTypes";
import { JavaBlockParser } from "../blocks/JavaBlockParser";
import { methodParams, typeInfo, type ClassInfo } from "../blocks/ClassModel";
import { colourLabel, FIGURE_ACTIONS, FIGURE_PROPS, keyLabel, targetLabel, touchesLabel } from "../blocks/FigureSpec";
import { ADT_GETS } from "../blocks/AdtSpec";

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

/** id: Kennung (nur im Editor für Struktogramm-Dateien) */
export type SNode =
    | { kind: "stmt"; text: string; id?: string }
    | { kind: "if"; cond: string; yes: SNode[]; no: SNode[]; id?: string }
    | { kind: "switch"; subject: string; cases: { label: string; body: SNode[] }[]; other?: SNode[]; id?: string }
    | { kind: "loop"; head: string; body: SNode[]; id?: string }
    | { kind: "footloop"; foot: string; body: SNode[]; id?: string };

export type Diagram = { title: string; group?: string; body: SNode[] };

// ------------------------------------------------------------------ Datentypen

// Typnamen der Ergänzenden Hinweise (Abschnitte 4–6): Ganzzahl, Fließkommazahl, Zeichenkette, Wahrheitswert …
const TYPE_DE: Record<string, string> = {
    int: "Ganzzahl", long: "Ganzzahl", short: "Ganzzahl", byte: "Ganzzahl",
    double: "Fließkommazahl", float: "Fließkommazahl",
    String: "Zeichenkette", boolean: "Wahrheitswert", char: "Zeichen",
    Integer: "Ganzzahl", Long: "Ganzzahl", Short: "Ganzzahl", Byte: "Ganzzahl",
    Double: "Fließkommazahl", Float: "Fließkommazahl", Boolean: "Wahrheitswert", Character: "Zeichen", Object: "Objekt",
};

/** Abiturklassen Niedersachsen: dynamische Reihung, Stapel, Schlange, Binärbaum */
const ADT_DE: Record<string, string> = { DynArray: "dynamische Reihung", Stack: "Stapel", Queue: "Schlange", BinTree: "Binärbaum" };

/** Anlegen einer leeren dynamischen Reihung, eines Stapels, einer Schlange (ohne Inhaltstyp) */
const ADT_NEW: Record<string, string> = { DynArray: "leere dynamische Reihung", Stack: "leerer Stapel", Queue: "leere Schlange" };

/**
 * Datentyp in der Schreibweise der Hinweise: Ganzzahl, statische Reihung vom Inhaltstyp Zeichenkette,
 * dynamische Reihung vom Inhaltstyp Ganzzahl … Inhaltstypen können einfache Typen oder Klassen sein.
 * content: Inhaltstyp bei dynamischer Reihung, Stapel, Schlange, Binärbaum – in Java ohne Typangabe,
 * daher aus der Verwendung abgeleitet; unbekannt = Objekt.
 */
export function typeDe(t: string, content?: string): string {
    const info = typeInfo(t);
    const elem = TYPE_DE[info.elem] ?? info.elem;
    switch (info.kind) {
        case "array": return `statische Reihung vom Inhaltstyp ${elem}`;
        case "array2d": return `statische zweidimensionale Reihung vom Inhaltstyp ${elem}`;
        case "list": return `Liste vom Inhaltstyp ${elem}`;
    }
    const adt = ADT_DE[t.trim()];
    if (adt) return `${adt} vom Inhaltstyp ${typeDe(content ?? "Object")}`;
    return TYPE_DE[t] ?? t;
}

/**
 * Signatur: name(a, b: Ganzzahl, s: Zeichenkette): Wahrheitswert (gleiche Typen zusammengefasst).
 * contents: Inhaltstypen von dynamischen Reihungen, Stapeln … je Name; "" = Rückgabe.
 */
export function signature(name: string, params: { name: string; type: string }[], ret?: string, contents?: Map<string, string>): string {
    const groups: { names: string[]; type: string }[] = [];
    for (const p of params) {
        const type = typeDe(p.type, contents?.get(p.name));
        const last = groups[groups.length - 1];
        if (last && last.type === type) last.names.push(p.name);
        else groups.push({ names: [p.name], type });
    }
    const list = groups.map((g) => `${g.names.join(", ")}: ${g.type}`).join(", ");
    return `${name}(${list})${ret && ret !== "void" ? ": " + typeDe(ret, contents?.get("")) : ""}`;
}

const ADT_READS = new Set<string>([B.dynGet, B.stackGet, B.queueGet, B.treeItem]);
const ADT_WRITES = new Set<string>([B.dynAppend, B.dynInsert, B.dynSet, B.stackPush, B.queueEnqueue, B.treeSetItem, B.treeNew]);

/**
 * Inhaltstypen von dynamischen Reihungen, Stapeln, Schlangen und Binärbäumen (in Java ohne Typangabe)
 * aus ihrer Verwendung: Typumwandlung beim Lesen ((int) d.getItem(0)), sonst die Werte beim Einfügen.
 * Nur eindeutige Ergebnisse. Schlüssel "" = Inhaltstyp der Rückgabe (gib d zurück; outer: z. B. Attribute).
 */
export function contentTypes(roots: (BlockState | undefined)[], declared: { name: string; type: string }[] = [],
                             outer?: Map<string, string>): Map<string, string> {
    const types = new Map<string, string>(declared.map((d) => [d.name, d.type]));
    const reads = new Map<string, Set<string>>(), writes = new Map<string, Set<string>>();
    const returned = new Set<string>();
    const note = (m: Map<string, Set<string>>, name: string | undefined, t: string | undefined) => {
        if (!name || !t || t === "Object") return;
        if (!m.has(name)) m.set(name, new Set());
        m.get(name)!.add(t);
    };
    const each = (b: BlockState | undefined, f: (b: BlockState) => void) => {
        for (; b; b = b.next?.block) {
            f(b);
            for (const i of Object.values(b.inputs ?? {})) each(i?.block, f);
        }
    };
    // Variablen mit Typ (für Werte wie d.append(x))
    for (const r of roots) each(r, (b) => {
        if (b.type === B.varDeclare && b.fields?.NAME) types.set(b.fields.NAME, b.fields.TYPE ?? "int");
        if (b.type === B.for && b.fields?.VAR) types.set(b.fields.VAR, "int");
    });
    const valueType = (v: BlockState | undefined): string | undefined => {
        if (!v) return undefined;
        const f = v.fields ?? {};
        switch (v.type) {
            case B.number: return /[.eE]/.test(f.NUM ?? "") ? "double" : "int";
            case B.text: return "String";
            case B.char: return "char";
            case B.bool: return "boolean";
            case B.varGet: return types.get(f.NAME ?? "");
            case B.objNew: return f.CLASS;
        }
        return ADT_READS.has(v.type) ? f.TYPE : undefined;
    };
    for (const r of roots) each(r, (b) => {
        const name = b.fields?.NAME;
        if (ADT_READS.has(b.type)) note(reads, name, b.fields?.TYPE);
        if (ADT_WRITES.has(b.type)) note(writes, name, valueType(b.inputs?.V?.block));
        if (b.type === B.return && b.inputs?.VALUE?.block?.type === B.varGet) returned.add(b.inputs.VALUE.block.fields?.NAME ?? "");
    });
    const result = new Map<string, string>();
    for (const name of new Set([...reads.keys(), ...writes.keys()])) {
        const r = reads.get(name), w = writes.get(name);
        const t = r?.size === 1 ? [...r][0] : !r && w?.size === 1 ? [...w][0] : undefined;
        if (t) result.set(name, t);
    }
    const ret = new Set([...returned].map((n) => result.get(n) ?? outer?.get(n)).filter((t): t is string => !!t));
    if (ret.size === 1) result.set("", [...ret][0]);
    return result;
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
            case B.collIsEmpty: case B.dynIsEmpty: case B.adtIsEmpty: return [`${name} ist leer`, P.EQ];
            // Stapel, Schlange, Binärbaum (Wendungen wie in den Ergänzenden Hinweisen)
            case B.stackGet: case B.queueGet: case B.treeItem: {
                const op = ADT_GETS.find((g) => g.block === b.type)?.ops.find(([, m]) => m === f.OP)?.[0] ?? "Inhalt von";
                return [`${op} ${name}`, P.NONE];
            }
            case B.treeChild: return [`${f.SIDE === "right" ? "rechter" : "linker"} Teilbaum von ${name}`, P.NONE];
            case B.treeTest: return [`${name} ist ein Blatt`, P.EQ];
            case B.thisValue: return ["this", P.ATOM];
            case B.thisAttrGet: return [`this.${name}`, P.ATOM];
            case B.objNew: {
                // Abiturklassen mit den Wendungen der Hinweise (auch bei Zuweisungen an Attribute)
                const n = b.extraState?.args ?? 0;
                const adt = ({ DynArray: "leere dynamische Reihung", Stack: "leerer Stapel", Queue: "leere Schlange", BinTree: "neuer Binärbaum" } as Record<string, string>)[f.CLASS ?? ""];
                if (adt && n === 0) return [adt, P.NONE];
                if (f.CLASS === "BinTree" && n === 1) return [`neuer Binärbaum mit Inhalt ${this.input(b, "ARG0", P.ATOM)}`, P.NONE];
                return [`erzeuge ${f.CLASS}${this.args(b)}`, P.NONE];
            }
            case B.objCallExpr: return [`${this.input(b, "OBJ", P.ATOM)}.${f.METHOD}${this.args(b)}`, P.ATOM];
            case B.objAttrGet: return [`${this.input(b, "OBJ", P.ATOM)}.${f.ATTR}`, P.ATOM];
            case B.superMethodCallExpr: return [`super.${f.METHOD}${this.args(b)}`, P.ATOM];
            case B.javaExpression: return [neutral(f.CODE ?? ""), P.NONE];
            // Figuren, Tasten, Maus (Paket 8)
            case B.figProp: return [`${FIGURE_PROPS.find(([, v]) => v === f.PROP)?.[0] ?? "x-Position"} von ${name}`, P.NONE];
            case B.figTouches: return [`${name} berührt ${touchesLabel(f.OTHER)}`, P.EQ];
            case B.figTouchesColor: return [`${name} berührt Farbe ${colourLabel(f.COLOR ?? "red")}`, P.EQ];
            case B.figTouchesList: return [`${name} berührt eine Figur aus ${f.LIST ?? ""}`, P.EQ];
            case B.figOutside: return [`${name} ist außerhalb des Fensters`, P.EQ];
            case B.figDistance: return [`Abstand von ${name} zu ${targetLabel(f.OTHER)}`, P.NONE];
            case B.keyDown: return [`Taste „${keyLabel(f.KEY ?? "")}“ gedrückt`, P.EQ];
            case B.mouseDown: return [f.WHAT === "clicked" ? "Maus wurde geklickt" : "Maustaste gedrückt", P.EQ];
            case B.mouseOver: return [f.WHAT === "clicked" ? `Mausklick auf ${name}` : `Maus ist über ${name}`, P.EQ];
            case B.mouseXY: return [f.AXIS === "y" ? "y-Position der Maus" : "x-Position der Maus", P.NONE];
        }
        return ["…", P.ATOM];
    }
}

// ------------------------------------------------------------------ Anweisungen

class Converter {
    private types = new Map<string, string>();
    private e = new Expr(this.types);

    constructor(params: { name: string; type: string }[] = [], attributes: { name: string; type: string }[] = [],
                private contents = new Map<string, string>()) {
        for (const p of [...attributes, ...params]) this.types.set(p.name, p.type);
    }

    /** " vom Inhaltstyp …" für dynamische Reihung, Stapel, Schlange (unbekannt: Objekt) */
    private content(name: string): string {
        return ` vom Inhaltstyp ${typeDe(this.contents.get(name) ?? "Object")}`;
    }

    /** Wert einer Zuweisung; new DynArray() usw. als „leere dynamische Reihung vom Inhaltstyp …“ */
    private assigned(name: string, value: BlockState | undefined): string {
        const cls = value?.type === B.objNew && !value.extraState?.args ? value.fields?.CLASS ?? "" : "";
        return ADT_NEW[cls] ? ADT_NEW[cls] + this.content(name) : this.e.text(value);
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
                return this.stmt(value ? `${name} ← ${this.assigned(name, value)}` : `${name}: ${typeDe(f.TYPE ?? "int", this.contents.get(name))}`);
            }
            case B.varSet: return this.stmt(`${name} ← ${this.assigned(name, b.inputs?.VALUE?.block)}`);
            case B.varChange: return this.stmt(`${f.OP === "-" ? "verringere" : "erhöhe"} ${name} um ${v("VALUE")}`);
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
            case B.msgSend: return this.stmt(`sende Nachricht „${f.MSG ?? ""}“`);
            case B.msgSendWait: return this.stmt(`sende Nachricht „${f.MSG ?? ""}“ und warte`);
            case B.trace: return this.stmt(f.TEXT ? `trage in die Tracetabelle ein („${f.TEXT}“)` : "trage in die Tracetabelle ein");
            case B.comment: return this.stmt(`// ${f.TEXT ?? ""}`.trimEnd());
            case B.return: return this.stmt(`gib ${v("VALUE")} zurück`);
            case B.returnVoid: return this.stmt("beende die Operation");
            case B.call: return this.stmt(`${name}${e.args(b)}`);
            // Reihungen, Listen, dynamische Reihungen
            case B.arrayNew:
                return this.stmt(`${name} ← statische Reihung der Länge ${v("LEN")} vom Inhaltstyp ${typeDe(f.TYPE ?? "int")}`);
            case B.arrayValues: {
                const n = Math.max(1, b.extraState?.items ?? 1);
                const values: string[] = [];
                for (let i = 0; i < n; i++) values.push(v("V" + i));
                return this.stmt(`${name} ← statische Reihung mit den Elementen ${values.join(", ")}`);
            }
            case B.array2dNew: return this.stmt(`${name} ← statische zweidimensionale Reihung mit ${v("R")} Zeilen und ${v("C")} Spalten vom Inhaltstyp ${typeDe(f.TYPE ?? "int")}`);
            case B.arraySet: return this.stmt(`${name}[${v("I")}] ← ${v("V")}`);
            case B.array2dSet: return this.stmt(`${name}[${v("R")}][${v("C")}] ← ${v("V")}`);
            case B.listNew: return this.stmt(`${name} ← leere Liste vom Inhaltstyp ${typeDe(f.TYPE ?? "int")}`);
            case B.dynNew: return this.stmt(`${name} ← leere dynamische Reihung${this.content(name)}`);
            case B.listAdd: case B.dynAppend: return this.stmt(`füge ${v("V")} zu ${name} hinzu`);
            case B.listInsert: case B.dynInsert: return this.stmt(`füge ${v("V")} an Position ${v("I")} in ${name} ein`);
            case B.listRemove: case B.dynDelete: return this.stmt(`lösche Element an Position ${v("I")} von ${name}`);
            case B.listClear: return this.stmt(`entferne alle Elemente aus ${name}`);
            case B.listSet: case B.dynSet: return this.stmt(`ersetze Element an Position ${v("I")} von ${name} durch ${v("V")}`);
            // Klassen und Objekte
            case B.attribute: case B.ctor: case B.classMethod: return undefined;
            case B.superCall: return this.stmt(`Konstruktor der Oberklasse${e.args(b)}`);
            case B.superMethodCall: return this.stmt(`super.${f.METHOD}${e.args(b)}`);
            case B.thisAttrSet: return this.stmt(`this.${name} ← ${this.assigned(name, b.inputs?.V?.block)}`);
            case B.objCall: return this.stmt(`${e.receiver(b)}.${f.METHOD}${e.args(b)}`);
            case B.objAttrSet: return this.stmt(`${e.receiver(b)}.${f.ATTR} ← ${v("V")}`);
            // Stapel, Schlange, Binärbaum
            case B.stackNew: return this.stmt(`${name} ← leerer Stapel${this.content(name)}`);
            case B.queueNew: return this.stmt(`${name} ← leere Schlange${this.content(name)}`);
            case B.treeNew: return this.stmt(b.inputs?.V?.block ? `${name} ← neuer Binärbaum mit Inhalt ${v("V")}` : `${name} ← neuer Binärbaum`);
            case B.stackPush: return this.stmt(`lege ${v("V")} auf ${name}`);
            case B.queueEnqueue: return this.stmt(`füge ${v("V")} zu ${name} hinzu`);
            case B.stackPop: return this.stmt(`entnimm oberstes Element von ${name}`);
            case B.queueDequeue: return this.stmt(`entnimm erstes Element von ${name}`);
            case B.treeSetItem: return this.stmt(`setze Inhalt von ${name} auf ${v("V")}`);
            case B.treeSetChild: return this.stmt(`setze ${f.SIDE === "right" ? "rechten" : "linken"} Teilbaum von ${name} auf ${v("T")}`);
            case B.treeDelete: return this.stmt(`mache ${name} leer`);
            // Figuren (Paket 8)
            case B.worldNew: return this.stmt(`Grafikfenster ${v("W")} × ${v("H")}, Hintergrund ${colourLabel(f.COLOR ?? "white")}`);
            case B.figCircle: return this.stmt(`${name} ← neuer Kreis, Mittelpunkt (${v("X")} | ${v("Y")}), Radius ${v("R")}`);
            case B.figRect: return this.stmt(`${name} ← neues Rechteck, links oben (${v("X")} | ${v("Y")}), Breite ${v("W")}, Höhe ${v("H")}`);
            case B.figText: return this.stmt(`${name} ← neuer Text ${v("TEXT")} bei (${v("X")} | ${v("Y")}), Größe ${v("SIZE")}`);
            case B.figSprite: return this.stmt(`${name} ← neues Sprite bei (${v("X")} | ${v("Y")}), Bild ${f.IMG ?? "…"} Nr. ${v("INDEX")}`);
            case B.figMove: return this.stmt(`bewege ${name} um (${v("DX")} | ${v("DY")})`);
            case B.figMoveTo: return this.stmt(`setze ${name} auf Position (${v("X")} | ${v("Y")})`);
            case B.figRotate: return this.stmt(`drehe ${name} um ${v("A")} Grad`);
            case B.figForward: return this.stmt(`gehe mit ${name} ${v("D")} Schritte in Blickrichtung`);
            case B.figTurnTo: return this.stmt(`drehe ${name} in Richtung ${targetLabel(f.OTHER)}`);
            case B.figScale: return this.stmt(`vergrößere ${name} um Faktor ${v("F")}`);
            case B.figBounce: return this.stmt(`pralle mit ${name} vom Rand ab`);
            case B.figSay: return this.stmt(`${name} sagt ${v("TEXT")}`);
            case B.figSayFor: return this.stmt(`${name} sagt ${v("TEXT")} für ${v("SECS")} Sekunden`);
            case B.figColor: return this.stmt(`färbe ${name} ${colourLabel(f.COLOR ?? "red")}`);
            case B.figSetText: return this.stmt(`setze Inhalt von ${name} auf ${v("TEXT")}`);
            case B.figSetImage: return this.stmt(`setze Bildnummer von ${name} auf ${v("I")}`);
            case B.figAction: {
                const label = FIGURE_ACTIONS.find(([, value]) => value === f.ACTION)?.[0] ?? "zeige";
                const [verb, ...rest] = label.split(" ");
                return this.stmt([verb, name, ...rest].join(" "));
            }
            // Java-Text
            case B.javaStatement: return this.stmt(neutral(f.CODE ?? ""));
            case B.javaRaw: return this.stmt((b.extraState?.code ?? "").split("\n").map((l) => neutral(l)).join("\n"));
        }
        return undefined;
    }
}

/** Überschrift eines Programmteils (ohne Namen) */
export function partTitle(h: BlockState): string {
    const f = h.fields ?? {};
    switch (h.type) {
        case B.msgStart: return `wenn ich Nachricht „${f.MSG ?? ""}“ empfange`;
        case B.clickStart: return `wenn ${f.FIG ?? ""} angeklickt wird`;
        case B.progStart: return "wenn das Programm startet";
        default: return `wenn Taste „${keyLabel(f.KEY ?? "")}“ gedrückt`;
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
    const mainBody = new Converter([], [], contentTypes([start?.inputs?.BODY?.block])).seq(start?.inputs?.BODY?.block);
    const others = top.filter((b) => b.type !== B.start).sort((a, b) => (a.y ?? 0) - (b.y ?? 0));
    // Hauptprogramm nur, wenn es mehr als Kommentare enthält (oder es sonst nichts gibt)
    const onlyComments = mainBody.every((n) => n.kind === "stmt" && n.text.startsWith("//"));
    const name = String(start?.fields?.NAME ?? "").trim();
    if ((mainBody.length && !onlyComments) || !others.length) result.push({ title: name ? `Hauptprogramm „${name}“` : "Hauptprogramm", body: mainBody });
    for (const h of others) {
        if (isPartHat(h.type)) {
            // Programmteil (wenn Taste …, wenn ich Nachricht … usw.): Variablen wie im Hauptprogramm
            const contents = contentTypes([start?.inputs?.BODY?.block, h.inputs?.BODY?.block]);
            result.push({ title: `${partTitle(h)}: ${h.fields?.NAME ?? ""}`, body: new Converter([], [], contents).seq(h.inputs?.BODY?.block) });
        } else if (h.type === B.method) {
            const params = methodParams(h);
            const contents = contentTypes([h.inputs?.BODY?.block], params);
            result.push({ title: signature(h.fields?.NAME ?? "", params, h.fields?.RETURN, contents), body: new Converter(params, [], contents).seq(h.inputs?.BODY?.block) });
        } else if (h.type === B.class) {
            const cls = h.fields?.NAME ?? "";
            const group = `Klasse ${cls}${h.fields?.SUPER ? " (erbt von " + h.fields.SUPER + ")" : ""}`;
            const attributes: { name: string; type: string }[] = [];
            for (let m = h.inputs?.MEMBERS?.block; m; m = m.next?.block) {
                if (m.type === B.attribute) attributes.push({ name: m.fields?.NAME ?? "", type: m.fields?.TYPE ?? "int" });
            }
            // Inhaltstypen der Attribute aus allen Operationen der Klasse
            const bodies: (BlockState | undefined)[] = [];
            const declared = [...attributes];
            for (let m = h.inputs?.MEMBERS?.block; m; m = m.next?.block) {
                bodies.push(m.inputs?.BODY?.block);
                declared.push(...methodParams(m));
            }
            const classContents = contentTypes(bodies, declared);
            classContents.delete("");
            for (let m = h.inputs?.MEMBERS?.block; m; m = m.next?.block) {
                const params = methodParams(m);
                const contents = new Map(classContents);
                for (const [k, t] of contentTypes([m.inputs?.BODY?.block], [...attributes, ...params], classContents)) contents.set(k, t);
                const body = () => new Converter(params, attributes, contents).seq(m!.inputs?.BODY?.block);
                if (m.type === B.ctor) result.push({ group, title: "Konstruktor " + signature(cls, params, undefined, contents), body: body() });
                if (m.type === B.classMethod) result.push({ group, title: signature(m.fields?.NAME ?? "", params, m.fields?.RETURN, contents), body: body() });
            }
        }
    }
    return result;
}
