import { Lexer } from "../../compiler/java/lexer/Lexer";
import { TokenType } from "../../compiler/java/TokenType";
import { B, COLLECTION_CALLS, elementJavaType, INPUT_METHODS, MATH_FUNCTIONS, VAR_TYPES, type BlockState, type CollKind, type Param, type WorkspaceState } from "./BlockTypes";
import { attributesOf, collectionOfType, collectionType, findMethod, isClassType, methodsOf, typeInfo, unwrap, type ClassInfo, type ClassMap } from "./ClassModel";
import { FIGURE_ACTIONS, FIGURE_CALLS, FIGURE_CREATIONS, FIGURE_PROPS, FILLED, isFigureClass, MOUSE_TARGET, type FigureClass } from "./FigureSpec";
import { ADT_CALLS, ADT_CREATIONS, ADT_GET_TYPES, getOp, isAdtClass, TREE_DELETES, TREE_SIDES, TREE_TESTS, type AdtClass } from "./AdtSpec";

/**
 * Java -> Blöcke. Eigener kleiner Parser für den Teil von Java, den es als Blöcke gibt
 * (Grundlage: die Tokens des Lexers der Online-IDE, deren Positionen genau stimmen).
 *
 * Was nicht als Block darstellbar ist, wird nicht verworfen, sondern als Java-Block mit dem
 * unveränderten Quelltext übernommen (Anweisung: j_java_stmt/j_java_raw, Ausdruck: j_java_expr).
 * Jeder erzeugte Block bekommt eine Kennung und die Zeilen, aus denen er stammt (für Fehler-
 * meldungen und die Anzeige der aktuellen Programmzeile am Block).
 */

type Tok = { tt: TokenType; value: unknown; start: number; end: number; line: number; endLine: number };

export type LineRange = { id: string; startLine: number; endLine: number };

export type ParseResult = { state: WorkspaceState; ranges: LineRange[] };

/** Abbruch eines Erkennungsversuchs: der Teil wird dann als Java-Text übernommen */
class Fail extends Error { }

const SKIP = new Set([TokenType.space, TokenType.tab, TokenType.newline, TokenType.linefeed, TokenType.endofSourcecode]);
const NUMBER = new Set([TokenType.integerLiteral, TokenType.longConstant, TokenType.floatLiteral, TokenType.doubleConstant, TokenType.shortConstant]);

/** Binäre Operatoren der Blöcke, nach Bindungsstärke (höher bindet stärker) */
const BINARY: Map<TokenType, { level: number; type: string; op: string }> = new Map([
    [TokenType.or, { level: 1, type: B.logic, op: "||" }],
    [TokenType.and, { level: 2, type: B.logic, op: "&&" }],
    [TokenType.equal, { level: 3, type: B.compare, op: "==" }],
    [TokenType.notEqual, { level: 3, type: B.compare, op: "!=" }],
    [TokenType.lower, { level: 4, type: B.compare, op: "<" }],
    [TokenType.greater, { level: 4, type: B.compare, op: ">" }],
    [TokenType.lowerOrEqual, { level: 4, type: B.compare, op: "<=" }],
    [TokenType.greaterOrEqual, { level: 4, type: B.compare, op: ">=" }],
    [TokenType.plus, { level: 5, type: B.arith, op: "+" }],
    [TokenType.minus, { level: 5, type: B.arith, op: "-" }],
    [TokenType.multiplication, { level: 6, type: B.arith, op: "*" }],
    [TokenType.division, { level: 6, type: B.arith, op: "/" }],
    [TokenType.modulo, { level: 6, type: B.arith, op: "%" }],
]);

export class JavaBlockParser {

    private toks: Tok[] = [];
    private pos = 0;
    private idCounter = 0;
    private ranges: LineRange[] = [];
    /** bekannte Variablen mit Datentyp (je Hauptprogramm, Operation, Konstruktor; in Klassen samt Attributen) */
    private vars = new Map<string, string>();
    /** Klassen dieser Datei (vorab ermittelt) und anderer Dateien des Projekts */
    private classes: ClassMap = new Map();
    /** Ergebnistypen der Operationen dieser Datei (ohne Klasse) */
    private topMethods = new Map<string, string>();
    /** Klasse, deren Inhalt gerade gelesen wird */
    private currentClass: string | undefined;
    /** für Struktogramme: auch switch und do-while erkennen (dafür gibt es keine Blöcke) */
    /** Struktogramm: zusätzliche Formen (switch, do-while, Umwandlung in Klassen beim Lesen aus Abiturklassen) */
    extended = false;

    constructor(private src: string) {
        const lineStarts = [0];
        for (let i = 0; i < src.length; i++) if (src[i] === "\n") lineStarts.push(i + 1);
        const offset = (line: number, column: number) => (lineStarts[line - 1] ?? src.length) + column - 1;

        for (const t of new Lexer().lex(src).tokens) {
            if (SKIP.has(t.tt)) continue;
            const r = t.range;
            this.toks.push({
                tt: t.tt, value: t.value,
                start: offset(r.startLineNumber, r.startColumn), end: offset(r.endLineNumber, r.endColumn),
                line: r.startLineNumber, endLine: r.endLineNumber,
            });
        }
    }

    /** classes: Klassen aus anderen Dateien des Projekts (für Typen von Objekten) */
    static parse(src: string, options: { classes?: ClassInfo[]; structogram?: boolean } = {}): ParseResult {
        const parser = new JavaBlockParser(src);
        parser.extended = !!options.structogram;
        for (const c of options.classes ?? []) parser.classes.set(c.name, c);
        return parser.parseProgram();
    }

    /**
     * Oberste Ebene: Anweisungen des Hauptprogramms und Operationen (Methoden ohne Klasse,
     * z. B. "int quadrat(int x) { … }"). Jede Operation wird ein eigener Hut-Block; ihre
     * Reihenfolge steht in der y-Position (die Blockansicht ordnet sie neben dem Hauptprogramm
     * untereinander an). Der Generator schreibt erst das Hauptprogramm, dann die Operationen.
     */
    parseProgram(): ParseResult {
        this.scanSignatures();
        const main: BlockState[] = [];
        const hats: BlockState[] = [];   // Operationen und Klassen in der Reihenfolge des Codes
        while (this.pos < this.toks.length) {
            const hat = this.tryClass() ?? this.tryMethod();
            if (hat) {
                hat.x = 400;
                hat.y = 20 + hats.length * 200;
                hats.push(hat);
                continue;
            }
            const b = this.statement(true);
            if (b) main.push(b);
        }
        for (let i = main.length - 2; i >= 0; i--) main[i].next = { block: main[i + 1] };
        const start: BlockState = { type: B.start, id: "start", x: 20, y: 20, deletable: false };
        if (main[0]) start.inputs = { BODY: { block: main[0] } };
        return { state: { blocks: { languageVersion: 0, blocks: [start, ...hats] } }, ranges: this.ranges };
    }

    // ------------------------------------------------------------------ Datentypen und Klassen

    /**
     * Datentyp ab Token i: int, String, Hund, int[], Hund[][], ArrayList<Integer>, DynArray …
     * Liefert den Typ als Text und die Position dahinter (oder undefined).
     */
    typeAt(i: number): { type: string; next: number } | undefined {
        const t = this.toks[i];
        if (t?.tt !== TokenType.identifier) return undefined;
        let type = String(t.value), k = i + 1;
        if (type === "ArrayList") {
            const w = this.toks[k + 1];
            if (this.toks[k]?.tt !== TokenType.lower || w?.tt !== TokenType.identifier || this.toks[k + 2]?.tt !== TokenType.greater) return undefined;
            type = `ArrayList<${String(w.value)}>`;
            k += 3;
        }
        let dims = 0;
        for (let n; (n = this.emptyBrackets(k)) > 0; dims++) k += n;
        if (dims > 2 || (dims > 0 && type.startsWith("ArrayList"))) return undefined;
        return { type: type + "[]".repeat(dims), next: k };
    }

    /** Parameter "( Typ name, … )" zwischen den Klammern open und close */
    private parseParams(open: number, close: number): Param[] {
        const params: Param[] = [];
        let i = open + 1;
        while (i < close) {
            const ty = this.typeAt(i);
            const n = ty ? this.toks[ty.next] : undefined;
            if (!ty || n?.tt !== TokenType.identifier) throw new Fail();
            params.push({ name: String(n.value), type: ty.type });
            i = ty.next + 1;
            if (i < close) {
                if (this.toks[i].tt !== TokenType.comma) throw new Fail();
                i++;
            }
        }
        return params;
    }

    private static readonly MODIFIERS = new Set([TokenType.keywordPublic, TokenType.keywordPrivate, TokenType.keywordProtected,
        TokenType.keywordStatic, TokenType.keywordFinal, TokenType.keywordAbstract]);

    /**
     * Vorab: Klassen (Attribute, Konstruktoren, Operationen) und Operationen ohne Klasse dieser
     * Datei, damit Typen von Objekten schon bekannt sind, bevor die Klasse im Code kommt.
     */
    private scanSignatures() {
        const toks = this.toks;
        const skipBody = (i: number) => (toks[i]?.tt === TokenType.leftCurlyBracket ? this.matching(i) + 1 : i);
        let i = 0;
        while (i < toks.length) {
            try {
                let k = i;
                if (toks[k]?.tt === TokenType.keywordPublic) k++;
                if (toks[k]?.tt === TokenType.keywordClass && toks[k + 1]?.tt === TokenType.identifier) {
                    const info: ClassInfo = { name: String(toks[k + 1].value), superName: "", attributes: [], constructors: [], methods: [] };
                    k += 2;
                    if (toks[k]?.tt === TokenType.keywordExtends && toks[k + 1]?.tt === TokenType.identifier) {
                        info.superName = String(toks[k + 1].value);
                        k += 2;
                    }
                    while (toks[k] && toks[k].tt !== TokenType.leftCurlyBracket) k++;
                    if (!toks[k]) break;
                    const end = this.matching(k);
                    this.scanMembers(info, k + 1, end, skipBody);
                    if (!this.classes.has(info.name)) this.classes.set(info.name, info);
                    i = end + 1;
                    continue;
                }
                // Operation ohne Klasse: Typ name ( … ) {
                const ret = toks[i]?.tt === TokenType.keywordVoid ? { type: "void", next: i + 1 } : this.typeAt(i);
                if (ret && toks[ret.next]?.tt === TokenType.identifier && toks[ret.next + 1]?.tt === TokenType.leftBracket) {
                    const close = this.matching(ret.next + 1);
                    if (toks[close + 1]?.tt === TokenType.leftCurlyBracket) {
                        this.topMethods.set(String(toks[ret.next].value), ret.type);
                        i = skipBody(close + 1);
                        continue;
                    }
                }
            } catch (e) {
                if (!(e instanceof Fail)) throw e;
            }
            i++;
        }
    }

    private scanMembers(info: ClassInfo, from: number, to: number, skipBody: (i: number) => number) {
        const toks = this.toks;
        let i = from;
        while (i < to) {
            try {
                let vis = "package";
                if (toks[i].tt === TokenType.at) i += 2;   // @Override
                while (JavaBlockParser.MODIFIERS.has(toks[i]?.tt)) {
                    if ([TokenType.keywordPublic, TokenType.keywordPrivate, TokenType.keywordProtected].includes(toks[i].tt)) vis = String(toks[i].value);
                    i++;
                }
                if (toks[i]?.tt === TokenType.identifier && toks[i].value === info.name && toks[i + 1]?.tt === TokenType.leftBracket) {
                    const close = this.matching(i + 1);
                    info.constructors.push({ params: this.parseParams(i + 1, close), vis });
                    i = skipBody(close + 1);
                    continue;
                }
                const ret = toks[i]?.tt === TokenType.keywordVoid ? { type: "void", next: i + 1 } : this.typeAt(i);
                if (ret && toks[ret.next]?.tt === TokenType.identifier) {
                    const name = String(toks[ret.next].value);
                    if (toks[ret.next + 1]?.tt === TokenType.leftBracket) {
                        const close = this.matching(ret.next + 1);
                        info.methods.push({ name, ret: ret.type, params: this.parseParams(ret.next + 1, close), vis });
                        i = skipBody(close + 1);
                        continue;
                    }
                    info.attributes.push({ name, type: ret.type, vis });
                    i = this.findAtDepth0(TokenType.semicolon, ret.next) + 1;
                    continue;
                }
            } catch (e) {
                if (!(e instanceof Fail)) throw e;
            }
            i++;
        }
    }

    /** Klasse: [public] class Name [extends Ober] { Attribute, Konstruktoren, Operationen } */
    private tryClass(): BlockState | undefined {
        const begin = this.pos;
        const k = this.is(TokenType.keywordPublic) ? 1 : 0;
        if (!this.is(TokenType.keywordClass, k) || !this.is(TokenType.identifier, k + 1)) return undefined;
        const name = String(this.peek(k + 1)!.value);
        let i = k + 2, superName = "";
        if (this.is(TokenType.keywordExtends, i)) {
            if (!this.is(TokenType.identifier, i + 1)) return undefined;
            superName = String(this.peek(i + 1)!.value);
            i += 2;
        }
        if (!this.is(TokenType.leftCurlyBracket, i)) return undefined;   // implements, Typparameter …: Java-Text
        const rangeCount = this.ranges.length;
        const outerVars = this.vars, outerClass = this.currentClass;
        try {
            this.pos = begin + i + 1;
            this.currentClass = name;
            this.vars = new Map(attributesOf(this.classes, name).map((a) => [a.name, a.type]));
            const members: BlockState[] = [];
            while (this.pos < this.toks.length && !this.is(TokenType.rightCurlyBracket)) {
                const m = this.member(name);
                if (m) members.push(m);
            }
            this.expect(TokenType.rightCurlyBracket);
            for (let m = members.length - 2; m >= 0; m--) members[m].next = { block: members[m + 1] };
            const b = this.block(B.class, begin, this.pos, { fields: { NAME: name, SUPER: superName } });
            if (k) b.extraState = { isPublic: true };
            if (members[0]) b.inputs = { MEMBERS: { block: members[0] } };
            return b;
        } catch (e) {
            if (!(e instanceof Fail)) throw e;
            this.pos = begin;
            this.ranges.length = rangeCount;
            return undefined;
        } finally {
            this.vars = outerVars;
            this.currentClass = outerClass;
        }
    }

    /** ein Teil einer Klasse; was nicht passt, bleibt Java-Text in der Klasse */
    private member(cls: string): BlockState | undefined {
        const begin = this.pos;
        const t = this.peek()!;
        if (t.tt === TokenType.comment) {
            this.pos++;
            return this.commentBlock(begin);
        }
        if (t.tt === TokenType.semicolon) {
            this.pos++;
            return undefined;
        }
        const rangeCount = this.ranges.length;
        const varsBefore = this.vars;
        try {
            const m = this.memberStructured(cls);
            if (m) return m;
        } catch (e) {
            if (!(e instanceof Fail)) throw e;
        }
        this.pos = begin;
        this.ranges.length = rangeCount;
        this.vars = varsBefore;
        return this.rawStatement();
    }

    private memberStructured(cls: string): BlockState | undefined {
        const begin = this.pos;
        let override = false;
        if (this.is(TokenType.at) && this.peek(1)?.value === "Override") {
            override = true;
            this.pos += 2;
        }
        let vis = "";
        if (this.is(TokenType.keywordPublic) || this.is(TokenType.keywordPrivate) || this.is(TokenType.keywordProtected)) {
            vis = String(this.peek()!.value);
            this.pos++;
        }
        if (JavaBlockParser.MODIFIERS.has(this.peek()?.tt as TokenType)) throw new Fail();   // static, final, abstract: Java-Text
        const paramFields = (params: Param[]) => {
            const f: { [name: string]: string } = {};
            params.forEach((p, k) => { f["PNAME" + k] = p.name; f["PTYPE" + k] = p.type; });
            return f;
        };
        // Konstruktor
        if (this.is(TokenType.identifier) && this.peek()!.value === cls && this.is(TokenType.leftBracket, 1)) {
            if (override) throw new Fail();
            const open = this.pos + 1, close = this.matching(open);
            const params = this.parseParams(open, close);
            this.pos = close + 1;
            const body = this.methodBody(params);
            const b = this.block(B.ctor, begin, this.pos, { fields: { VIS: vis || "package", ...paramFields(params) } });
            if (params.length) b.extraState = { params };
            if (body) b.inputs = { BODY: { block: body } };
            return b;
        }
        let ret: string;
        if (this.is(TokenType.keywordVoid)) {
            ret = "void";
            this.pos++;
        } else {
            const ty = this.typeAt(this.pos);
            if (!ty) throw new Fail();
            ret = ty.type;
            this.pos = ty.next;
        }
        const name = String(this.expect(TokenType.identifier).value);
        // Operation
        if (this.is(TokenType.leftBracket)) {
            const open = this.pos, close = this.matching(open);
            const params = this.parseParams(open, close);
            this.pos = close + 1;
            const body = this.methodBody(params);
            const b = this.block(B.classMethod, begin, this.pos, { fields: { VIS: vis || "package", NAME: name, RETURN: ret, ...paramFields(params) } });
            if (params.length || override) b.extraState = { ...(params.length ? { params } : {}), ...(override ? { override } : {}) };
            if (body) b.inputs = { BODY: { block: body } };
            return b;
        }
        // Attribut
        if (override || ret === "void") throw new Fail();
        const fields = { VIS: vis || "package", NAME: name, TYPE: ret };
        this.vars.set(name, ret);
        if (this.is(TokenType.semicolon)) {
            this.pos++;
            return this.block(B.attribute, begin, this.pos, { fields });
        }
        this.expect(TokenType.assignment);
        const valueStart = this.pos;
        const end = this.findAtDepth0(TokenType.semicolon, valueStart);
        if (end === valueStart) throw new Fail();
        this.pos = end + 1;
        const b = this.block(B.attribute, begin, this.pos, { fields });
        b.inputs = { VALUE: { block: this.expression(valueStart, end) } };
        return b;
    }

    /** Rumpf einer Operation bzw. eines Konstruktors mit den Parametern als Variablen */
    private methodBody(params: Param[]): BlockState | undefined {
        const outer = this.vars;
        this.vars = new Map(outer);
        for (const p of params) this.vars.set(p.name, p.type);
        try {
            this.expect(TokenType.leftCurlyBracket);
            const body = this.statementList(true);
            this.expect(TokenType.rightCurlyBracket);
            return body;
        } finally {
            this.vars = outer;
        }
    }

    // für ExpressionParser: Datentyp eines Ausdrucks (soweit bekannt; Objekte, Reihungen, Listen)
    staticType(b: BlockState): string | undefined {
        const f = b.fields ?? {};
        const ofObject = (input: string) => {
            const o = b.inputs?.[input]?.block;
            return o ? this.staticType(o) : undefined;
        };
        switch (b.type) {
            case B.varGet: return this.vars.get(f.NAME ?? "");
            case B.objNew: return f.CLASS;
            case B.thisValue: return this.currentClass;
            case B.thisAttrGet: return attributesOf(this.classes, this.currentClass).find((a) => a.name === f.NAME)?.type;
            case B.objAttrGet: return attributesOf(this.classes, ofObject("OBJ")).find((a) => a.name === f.ATTR)?.type;
            case B.objCallExpr: return findMethod(this.classes, ofObject("OBJ"), f.METHOD ?? "", b.extraState?.args ?? 0)?.ret;
            case B.superMethodCallExpr: {
                const sup = this.currentClass ? this.classes.get(this.currentClass)?.superName : undefined;
                return findMethod(this.classes, sup, f.METHOD ?? "", b.extraState?.args ?? 0)?.ret;
            }
            case B.callExpr:
                return methodsOf(this.classes, this.currentClass).find((m) => m.name === f.NAME)?.ret ?? this.topMethods.get(f.NAME ?? "");
            case B.arrayGet: case B.listGet: return this.collection(f.NAME ?? "")?.elem ?? undefined;
            case B.array2dGet: return this.collection(f.NAME ?? "")?.elem ?? undefined;
            case B.dynGet: return f.TYPE && f.TYPE !== "Object" ? f.TYPE : undefined;
            case B.text: case B.concat: case B.strSubstring: case B.strCase: return "String";
        }
        return undefined;
    }


    /**
     * Operation: Typ (oder void) Name ( Typ Name, … ) { … } – Typen nur die der Blöcke.
     * Passt etwas nicht, bleibt die Position unverändert (dann wird es Java-Text im Hauptprogramm).
     */
    private tryMethod(): BlockState | undefined {
        const begin = this.pos;
        const ret = this.is(TokenType.keywordVoid) ? { type: "void", next: begin + 1 } : this.typeAt(begin);
        const n = ret ? this.toks[ret.next] : undefined;
        if (!ret || n?.tt !== TokenType.identifier || this.toks[ret.next + 1]?.tt !== TokenType.leftBracket) return undefined;
        // Typ name(...) ohne "{" danach ist ein Aufruf bzw. eine Deklaration, keine Operation
        const rangeCount = this.ranges.length;
        const outer = this.vars;
        this.vars = new Map();
        try {
            const close = this.matching(ret.next + 1);
            const params = this.parseParams(ret.next + 1, close);
            for (const p of params) this.vars.set(p.name, p.type);
            this.pos = close + 1;
            if (!this.is(TokenType.leftCurlyBracket)) throw new Fail();
            this.pos++;
            const body = this.statementList(true);
            this.expect(TokenType.rightCurlyBracket);
            const fields: { [name: string]: string } = { NAME: String(n.value), RETURN: ret.type };
            params.forEach((p, k) => { fields["PNAME" + k] = p.name; fields["PTYPE" + k] = p.type; });
            const b = this.block(B.method, begin, this.pos, { fields });
            if (params.length) b.extraState = { params };
            if (body) b.inputs = { BODY: { block: body } };
            return b;
        } catch (e) {
            if (!(e instanceof Fail)) throw e;
            this.pos = begin;
            this.ranges.length = rangeCount;
            return undefined;
        } finally {
            this.vars = outer;
        }
    }

    // ------------------------------------------------------------------ Hilfen

    private peek(k = 0): Tok | undefined { return this.toks[this.pos + k]; }

    private is(tt: TokenType, k = 0): boolean { return this.peek(k)?.tt === tt; }

    private expect(tt: TokenType): Tok {
        const t = this.peek();
        if (!t || t.tt !== tt) throw new Fail();
        this.pos++;
        return t;
    }

    private text(from: number, toExclusive: number): string {
        return this.src.slice(this.toks[from].start, this.toks[toExclusive - 1].end);
    }

    private newId(): string { return "b" + (++this.idCounter); }

    /** Block mit Kennung und Herkunftszeilen anlegen */
    private block(type: string, fromTok: number, toTokExclusive: number, extra: Partial<BlockState> = {}): BlockState {
        const id = this.newId();
        this.ranges.push({ id, startLine: this.toks[fromTok].line, endLine: this.toks[toTokExclusive - 1].endLine });
        return { type, id, ...extra };
    }

    private valueBlock(type: string, extra: Partial<BlockState> = {}): BlockState {
        return { type, id: this.newId(), ...extra };
    }

    /** Folge von Anweisungen bis "}" (im Block) bzw. bis zum Ende; verkettet über next */
    private statementList(inBlock: boolean): BlockState | undefined {
        const list: BlockState[] = [];
        while (this.pos < this.toks.length) {
            if (inBlock && this.is(TokenType.rightCurlyBracket)) break;
            const b = this.statement(!inBlock);
            if (b) list.push(b);
        }
        for (let i = list.length - 2; i >= 0; i--) list[i].next = { block: list[i + 1] };
        return list[0];
    }

    // ------------------------------------------------------------------ Anweisungen

    private statement(topLevel: boolean): BlockState | undefined {
        const begin = this.pos;
        const t = this.peek()!;

        if (t.tt === TokenType.comment) {
            this.pos++;
            return this.commentBlock(begin);
        }
        if (t.tt === TokenType.semicolon) {   // leere Anweisung
            this.pos++;
            return undefined;
        }
        if (t.tt === TokenType.rightCurlyBracket && topLevel) {   // überzählige Klammer: als Text behalten
            this.pos++;
            return this.rawBlock(begin, this.pos);
        }

        const rangeCount = this.ranges.length;
        try {
            const b = this.structured();
            if (b) return b;
        } catch (e) {
            if (!(e instanceof Fail)) throw e;
        }
        this.pos = begin;
        this.ranges.length = rangeCount;   // Zeilen halb erkannter Blöcke verwerfen
        return this.rawStatement();
    }

    private commentBlock(i: number): BlockState {
        const code = this.text(i, i + 1);
        if (code.startsWith("//")) {
            const text = code.slice(2).replace(/^ /, "");
            return this.block(B.comment, i, i + 1, { fields: { TEXT: text } });
        }
        return this.rawBlock(i, i + 1);
    }

    /** Unveränderter Quelltext als Java-Block: einzeilig bearbeitbar, mehrzeilig nur anzeigen */
    private rawBlock(from: number, toExclusive: number): BlockState {
        const code = this.text(from, toExclusive);
        return code.includes("\n")
            ? this.block(B.javaRaw, from, toExclusive, { extraState: { code } })
            : this.block(B.javaStatement, from, toExclusive, { fields: { CODE: code } });
    }

    /**
     * Ausdehnung einer nicht erkannten Anweisung: bis ";" außerhalb von Klammern oder bis zur
     * schließenden "}" eines Blocks (Klassen, Methoden, switch, try …), samt else/catch/finally
     * und dem while von do-while.
     */
    private rawStatement(): BlockState {
        const begin = this.pos;
        let paren = 0, curly = 0;
        const continues = () => [TokenType.keywordElse, TokenType.keywordCatch, TokenType.keywordFinally, TokenType.keywordWhile,
            TokenType.semicolon].includes(this.peek()?.tt as TokenType);
        while (this.pos < this.toks.length) {
            const t = this.peek()!;
            if (t.tt === TokenType.leftBracket || t.tt === TokenType.leftSquareBracket) paren++;
            else if (t.tt === TokenType.rightBracket || t.tt === TokenType.rightSquareBracket) paren--;
            else if (t.tt === TokenType.leftCurlyBracket) curly++;
            else if (t.tt === TokenType.rightCurlyBracket) {
                if (curly === 0) break;          // gehört zum umgebenden Block
                curly--;
                this.pos++;
                if (curly === 0 && paren <= 0 && !continues()) break;
                continue;
            } else if (t.tt === TokenType.semicolon && paren <= 0 && curly === 0) {
                this.pos++;
                if (!this.is(TokenType.keywordElse)) break;
                continue;
            }
            this.pos++;
        }
        if (this.pos === begin) this.pos++;   // nie stehen bleiben
        return this.rawBlock(begin, this.pos);
    }

    private structured(): BlockState | undefined {
        const begin = this.pos;
        const t = this.peek()!;

        if (t.tt === TokenType.keywordNew) {
            const w = this.worldStatement();
            if (w) return w;
        }

        switch (t.tt) {
            case TokenType.keywordPrint:
            case TokenType.keywordPrintln: {
                this.pos++;
                const open = this.pos;
                this.expect(TokenType.leftBracket);
                const close = this.matching(open);
                this.pos = close + 1;
                this.expect(TokenType.semicolon);
                const b = this.block(B.print, begin, this.pos, { fields: { MODE: t.tt === TokenType.keywordPrintln ? "println" : "print" } });
                if (close > open + 1) {
                    if (this.topLevelCommas(open + 1, close).length > 0) throw new Fail();   // println(text, farbe)
                    const values = splitPrintValues(this.expression(open + 1, close));
                    b.inputs = {};
                    values.forEach((v, i) => { b.inputs![i === 0 ? "VALUE" : "VALUE" + i] = { block: v }; });
                    if (values.length > 1) b.extraState = { items: values.length };
                }
                return b;
            }
            case TokenType.keywordIf: {
                this.pos++;
                const conds = [this.condition()];
                const bodies = [this.body()];
                let hasElse = false;
                let elseBody: BlockState | undefined;
                while (this.is(TokenType.keywordElse)) {
                    this.pos++;
                    if (this.is(TokenType.keywordIf)) {          // else if: weiterer Zweig im selben Block
                        this.pos++;
                        conds.push(this.condition());
                        bodies.push(this.body());
                    } else {
                        hasElse = true;
                        elseBody = this.body();
                        break;
                    }
                }
                const b = this.block(B.if, begin, this.pos);
                b.inputs = {};
                conds.forEach((c, i) => {
                    b.inputs![i === 0 ? "COND" : "COND" + i] = { block: c };
                    if (bodies[i]) b.inputs![i === 0 ? "DO" : "DO" + i] = { block: bodies[i]! };
                });
                if (elseBody) b.inputs.ELSE = { block: elseBody };
                // if und if-else: feste Form (wie in der Werkzeugleiste); mit else if: umbaubar
                b.extraState = conds.length > 1 ? { elseIfs: conds.length - 1, hasElse } : { elseIfs: 0, hasElse, fixed: true };
                return b;
            }
            case TokenType.keywordWhile: {
                this.pos++;
                const forever = this.is(TokenType.leftBracket) && this.peek(1)?.tt === TokenType.booleanLiteral
                    && this.peek(1)?.value === true && this.peek(2)?.tt === TokenType.rightBracket;
                if (forever) {
                    this.pos += 3;
                    const body = this.body();
                    const b = this.block(B.forever, begin, this.pos);
                    if (body) b.inputs = { DO: { block: body } };
                    return b;
                }
                const cond = this.condition();
                const body = this.body();
                // while (!(…)) ist „wiederhole bis …“
                const until = cond?.type === B.not && !!cond.inputs?.VALUE?.block;
                const b = this.block(B.while, begin, this.pos, { fields: { MODE: until ? "until" : "while" } });
                b.inputs = { COND: { block: until ? cond!.inputs!.VALUE!.block : cond } };
                if (body) b.inputs.DO = { block: body };
                return b;
            }
            case TokenType.keywordFor:
                return this.forLoop();
            case TokenType.keywordDo: {
                if (!this.extended) return undefined;
                this.pos++;
                const body = this.body();
                this.expect(TokenType.keywordWhile);
                const cond = this.condition();
                this.expect(TokenType.semicolon);
                const b = this.block(B.doWhile, begin, this.pos);
                b.inputs = { COND: { block: cond } };
                if (body) b.inputs.DO = { block: body };
                return b;
            }
            case TokenType.keywordSwitch:
                return this.extended ? this.switchStatement() : undefined;
            case TokenType.keywordReturn: {
                this.pos++;
                if (this.is(TokenType.semicolon)) {
                    this.pos++;
                    return this.block(B.returnVoid, begin, this.pos);
                }
                const valueStart = this.pos;
                const end = this.findAtDepth0(TokenType.semicolon, valueStart);
                this.pos = end + 1;
                const b = this.block(B.return, begin, this.pos);
                b.inputs = { VALUE: { block: this.expression(valueStart, end) } };
                return b;
            }
            case TokenType.identifier:
                return this.identifierStatement();
            case TokenType.keywordSuper:
                if (this.is(TokenType.leftBracket, 1)) {   // super(…);  Konstruktor der Oberklasse
                    const open = this.pos + 1, close = this.matching(open);
                    this.pos = close + 1;
                    this.expect(TokenType.semicolon);
                    const b = this.block(B.superCall, begin, this.pos);
                    this.addArguments(b, open, close);
                    return b;
                }
                return this.expressionStatement();
            case TokenType.keywordThis:
                return this.expressionStatement();
        }
        return undefined;
    }

    /**
     * Anweisungen mit Objekten: obj.m(…);  liste.get(0).m(…);  this.name = …;  obj.attr = …;
     * super.m(…);  – sonst Fail (dann Java-Text).
     */
    private expressionStatement(): BlockState {
        const begin = this.pos;
        const end = this.findAtDepth0(TokenType.semicolon, begin);
        let assign = -1;
        for (let i = begin, depth = 0; i < end; i++) {
            const tt = this.toks[i].tt;
            if (tt === TokenType.leftBracket || tt === TokenType.leftSquareBracket || tt === TokenType.leftCurlyBracket) depth++;
            else if (tt === TokenType.rightBracket || tt === TokenType.rightSquareBracket || tt === TokenType.rightCurlyBracket) depth--;
            else if (depth === 0 && tt === TokenType.assignment) {
                assign = i;
                break;
            }
        }
        if (assign >= 0) {
            if (assign === begin || assign + 1 === end) throw new Fail();
            const target = this.expression(begin, assign);
            this.pos = end + 1;
            if (target.type === B.objAttrGet) {
                const b = this.block(B.objAttrSet, begin, this.pos, { fields: { ATTR: target.fields!.ATTR } });
                b.inputs = { OBJ: target.inputs!.OBJ, V: { block: this.expression(assign + 1, end) } };
                return b;
            }
            if (target.type === B.thisAttrGet) {
                const b = this.block(B.thisAttrSet, begin, this.pos, { fields: { NAME: target.fields!.NAME } });
                b.inputs = { V: { block: this.expression(assign + 1, end) } };
                return b;
            }
            throw new Fail();
        }
        const e = this.expression(begin, end);
        this.pos = end + 1;
        const asStatement = e.type === B.objCallExpr ? B.objCall : e.type === B.superMethodCallExpr ? B.superMethodCall : undefined;
        if (!asStatement) throw new Fail();
        const b = this.block(asStatement, begin, this.pos, { fields: e.fields });
        if (e.inputs) b.inputs = e.inputs;
        if (e.extraState) b.extraState = e.extraState;
        return b;
    }

    /**
     * switch (x) { case 1: … break; case 2: case 3: … break; default: … } – ohne Durchfallen
     * (jeder Fall endet mit break oder return; sonst Java-Text). Nur für Struktogramme.
     */
    private switchStatement(): BlockState {
        const begin = this.pos;
        this.pos++;
        const subject = this.condition();
        this.expect(TokenType.leftCurlyBracket);
        const cases: { label: string; body?: BlockState }[] = [];
        let other: { label: string; body?: BlockState } | undefined;
        while (!this.is(TokenType.rightCurlyBracket)) {
            const labels: string[] = [];
            let isDefault = false;
            while (this.is(TokenType.keywordCase) || this.is(TokenType.keywordDefault)) {
                if (this.is(TokenType.keywordDefault)) {
                    this.pos++;
                    this.expect(TokenType.colon);
                    isDefault = true;
                } else {
                    this.pos++;
                    const s = this.pos;
                    const c = this.findAtDepth0(TokenType.colon, s);
                    if (c === s) throw new Fail();
                    labels.push(this.text(s, c));
                    this.pos = c + 1;
                }
            }
            if (!labels.length && !isDefault) throw new Fail();
            const list: BlockState[] = [];
            let ended = false;
            while (this.pos < this.toks.length && !this.is(TokenType.keywordCase) && !this.is(TokenType.keywordDefault) && !this.is(TokenType.rightCurlyBracket)) {
                if (this.is(TokenType.keywordBreak)) {
                    this.pos++;
                    this.expect(TokenType.semicolon);
                    ended = true;
                    break;
                }
                const st = this.statement(false);
                if (st) list.push(st);
            }
            const last = list[list.length - 1];
            const returns = !!last && (last.type === B.return || last.type === B.returnVoid);
            if (ended && !(this.is(TokenType.keywordCase) || this.is(TokenType.keywordDefault) || this.is(TokenType.rightCurlyBracket))) throw new Fail();
            if (!ended && !returns && !this.is(TokenType.rightCurlyBracket)) throw new Fail();   // Durchfallen
            for (let i = list.length - 2; i >= 0; i--) list[i].next = { block: list[i + 1] };
            const entry = { label: labels.join(", "), body: list[0] };
            if (isDefault) {
                if (labels.length) cases.push(entry);
                other = { label: "", body: list[0] };
            } else {
                cases.push(entry);
            }
        }
        this.expect(TokenType.rightCurlyBracket);
        const all = other ? [...cases, other] : cases;
        const b = this.block(B.switch, begin, this.pos);
        b.inputs = { SUBJECT: { block: subject } };
        all.forEach((c, i) => { if (c.body) b.inputs!["CASE" + i] = { block: c.body }; });
        b.extraState = { labels: all.map((c) => c.label) };
        return b;
    }

    /** "( Bedingung )" */
    private condition(): BlockState {
        const open = this.pos;
        this.expect(TokenType.leftBracket);
        const close = this.matching(open);
        if (close === open + 1) throw new Fail();
        this.pos = close + 1;
        return this.expression(open + 1, close);
    }

    /** Rumpf: { … } oder eine einzelne Anweisung */
    private body(): BlockState | undefined {
        if (this.is(TokenType.leftCurlyBracket)) {
            this.pos++;
            const block = this.statementList(true);
            this.expect(TokenType.rightCurlyBracket);
            return block;
        }
        if (this.is(TokenType.comment) || this.is(TokenType.semicolon) || this.pos >= this.toks.length) throw new Fail();
        return this.statement(false);
    }

    /**
     * for-Schleifen:
     *   for (int durchlauf = 1; durchlauf <= n; durchlauf++)   -> wiederhole n-mal
     *   for (int i = a; i <= b; i++)  / i < b / i += s          -> zähle aufsteigend
     *   for (int i = a; i >= b; i--)  / i > b / i -= s          -> zähle absteigend
     */
    private forLoop(): BlockState {
        const begin = this.pos;
        const each = this.forEachLoop(begin);
        if (each) return each;
        this.pos++;
        this.expect(TokenType.leftBracket);
        const type = this.expect(TokenType.identifier);
        if (type.value !== "int") throw new Fail();
        const v = this.expect(TokenType.identifier);
        const name = String(v.value);
        this.vars.set(name, "int");
        this.expect(TokenType.assignment);
        const fromStart = this.pos;
        const fromEnd = this.findAtDepth0(TokenType.semicolon, fromStart);
        this.pos = fromEnd + 1;
        if (this.expect(TokenType.identifier).value !== name) throw new Fail();
        const cmp = this.peek();
        if (!cmp || ![TokenType.lower, TokenType.lowerOrEqual, TokenType.greater, TokenType.greaterOrEqual].includes(cmp.tt)) throw new Fail();
        this.pos++;
        const toStart = this.pos;
        const toEnd = this.findAtDepth0(TokenType.semicolon, toStart);
        this.pos = toEnd + 1;
        if (this.expect(TokenType.identifier).value !== name) throw new Fail();
        const update = this.peek();
        if (!update) throw new Fail();
        this.pos++;
        let stepStart = -1, stepEnd = -1;
        if (update.tt === TokenType.plusAssignment || update.tt === TokenType.minusAssignment) {
            stepStart = this.pos;
            stepEnd = this.findAtDepth0(TokenType.rightBracket, stepStart);
            this.pos = stepEnd;
        } else if (update.tt !== TokenType.plusPlus && update.tt !== TokenType.minusMinus) {
            throw new Fail();
        }
        this.expect(TokenType.rightBracket);
        if (fromEnd === fromStart || toEnd === toStart || stepStart === stepEnd && stepStart >= 0) throw new Fail();

        const up = update.tt === TokenType.plusPlus || update.tt === TokenType.plusAssignment;
        const upCmp = cmp.tt === TokenType.lower || cmp.tt === TokenType.lowerOrEqual;
        if (up !== upCmp) throw new Fail();   // z. B. i <= 10; i--  -> als Java-Text übernehmen
        const inclusive = cmp.tt === TokenType.lowerOrEqual || cmp.tt === TokenType.greaterOrEqual;

        // wiederhole n-mal
        const fromText = this.text(fromStart, fromEnd).trim();
        if (/^durchlauf\d*$/.test(name) && fromText === "1" && cmp.tt === TokenType.lowerOrEqual && update.tt === TokenType.plusPlus) {
            const body = this.body();
            const b = this.block(B.repeat, begin, this.pos);
            b.inputs = { TIMES: { block: this.expression(toStart, toEnd) } };
            if (body) b.inputs.DO = { block: body };
            return b;
        }

        const body = this.body();
        const b = this.block(B.for, begin, this.pos, {
            fields: { VAR: name, DIR: up ? "up" : "down", CMP: inclusive ? "incl" : "excl" },
        });
        b.inputs = {
            FROM: { block: this.expression(fromStart, fromEnd) },
            TO: { block: this.expression(toStart, toEnd) },
            STEP: { block: stepStart >= 0 ? this.expression(stepStart, stepEnd) : this.valueBlock(B.number, { fields: { NUM: "1" } }) },
        };
        if (body) b.inputs.DO = { block: body };
        return b;
    }

    /** int x = …;  x = …;  x += …;  x++;  x--; */
    private identifierStatement(): BlockState | undefined {
        const begin = this.pos;
        const first = this.peek()!;
        const second = this.peek(1);
        if (!second) return undefined;

        // Deklaration: Typ name [= Wert];  (auch Reihungen, Listen, Objekte)
        const decl = this.typeAt(begin);
        const declName = decl ? this.toks[decl.next] : undefined;
        const afterName = decl ? this.toks[decl.next + 1] : undefined;
        if (decl && declName?.tt === TokenType.identifier && (afterName?.tt === TokenType.assignment || afterName?.tt === TokenType.semicolon)) {
            const info = typeInfo(decl.type);
            const valueTok = this.toks[decl.next + 2];
            const isNew = afterName.tt === TokenType.assignment && valueTok?.tt === TokenType.keywordNew;
            if ((info.kind === "array" || info.kind === "array2d") && (isNew || valueTok?.tt === TokenType.leftCurlyBracket)) return this.arrayDeclaration();
            if (info.kind === "list" && isNew && this.toks[decl.next + 3]?.value === "ArrayList") return this.listDeclaration();
            if (info.kind === "dyn" && isNew && this.toks[decl.next + 3]?.value === "DynArray") return this.dynDeclaration();
            if (isFigureClass(decl.type) && isNew) {
                const f = this.figureDeclaration(decl.type, String(declName.value), decl.next + 2);
                if (f) return f;
            }
            if (isAdtClass(decl.type) && isNew) {
                const a = this.adtDeclaration(decl.type, String(declName.value), decl.next + 2);
                if (a) return a;
            }
            this.pos = decl.next + 1;
            const fields = { TYPE: decl.type, NAME: String(declName.value) };
            this.vars.set(fields.NAME, decl.type);
            if (this.is(TokenType.semicolon)) {
                this.pos++;
                return this.block(B.varDeclare, begin, this.pos, { fields });
            }
            this.expect(TokenType.assignment);
            const valueStart = this.pos;
            const end = this.findAtDepth0(TokenType.semicolon, valueStart);
            if (end === valueStart || this.topLevelCommas(valueStart, end).length > 0) throw new Fail();
            this.pos = end + 1;
            const b = this.block(B.varDeclare, begin, this.pos, { fields });
            b.inputs = { VALUE: { block: this.expression(valueStart, end) } };
            return b;
        }

        const name = String(first.value);
        const figureType = this.vars.get(name);
        if (isFigureClass(figureType) && second.tt === TokenType.dot) {
            const f = this.figureStatement(name, figureType);
            if (f) return f;
        }
        if (isAdtClass(figureType) && second.tt === TokenType.dot) {
            const a = this.adtStatement(name, figureType);
            if (a) return a;
        }
        const coll = this.collection(name);
        if (coll) {
            const b = this.collectionStatement(name, coll.kind);
            if (b) return b;
        }
        if (second.tt === TokenType.plusPlus || second.tt === TokenType.minusMinus) {
            this.pos += 2;
            this.expect(TokenType.semicolon);
            const b = this.block(B.varChange, begin, this.pos, { fields: { OP: second.tt === TokenType.plusPlus ? "+" : "-", NAME: name } });
            b.inputs = { VALUE: { block: this.valueBlock(B.number, { fields: { NUM: "1" } }) } };
            return b;
        }
        if (second.tt === TokenType.assignment || second.tt === TokenType.plusAssignment || second.tt === TokenType.minusAssignment) {
            this.pos += 2;
            const valueStart = this.pos;
            const end = this.findAtDepth0(TokenType.semicolon, valueStart);
            if (end === valueStart) throw new Fail();
            this.pos = end + 1;
            const type = second.tt === TokenType.assignment ? B.varSet : B.varChange;
            const fields: Record<string, string> = { NAME: name };
            if (type === B.varChange) fields.OP = second.tt === TokenType.minusAssignment ? "-" : "+";
            const b = this.block(type, begin, this.pos, { fields });
            b.inputs = { VALUE: { block: this.expression(valueStart, end) } };
            return b;
        }
        // Tracetabelle: trace(); bzw. trace("Bemerkung"); – sofern es keine eigene Operation trace gibt
        if (name === "trace" && second.tt === TokenType.leftBracket && !this.topMethods.has("trace")
            && !this.classes.get(this.currentClass ?? "")?.methods.some((m) => m.name === "trace")) {
            const open = this.pos + 1;
            const close = this.matching(open);
            const arg = this.toks[open + 1];
            const literal = close === open + 2 && arg?.tt === TokenType.stringLiteral && !this.sourceText(open + 1, open + 2).startsWith('"""');
            if (close === open + 1 || literal) {
                this.pos = close + 1;
                this.expect(TokenType.semicolon);
                return this.block(B.trace, begin, this.pos, { fields: { TEXT: literal ? String(arg.value) : "" } });
            }
        }
        // Aufruf einer Operation: name(…);
        if (second.tt === TokenType.leftBracket) {
            const close = this.matching(this.pos + 1);
            this.pos = close + 1;
            this.expect(TokenType.semicolon);
            const b = this.block(B.call, begin, this.pos, { fields: { NAME: name } });
            this.addArguments(b, begin + 1, close);
            return b;
        }
        // Thread.sleep(…);
        if (name === "Thread" && second.tt === TokenType.dot && this.peek(2)?.value === "sleep" && this.peek(3)?.tt === TokenType.leftBracket) {
            const open = this.pos + 3;
            const close = this.matching(open);
            if (close === open + 1 || this.topLevelCommas(open + 1, close).length > 0) throw new Fail();
            this.pos = close + 1;
            this.expect(TokenType.semicolon);
            const b = this.block(B.wait, begin, this.pos);
            b.inputs = { MS: { block: this.expression(open + 1, close) } };
            return b;
        }
        // Operation eines Objekts usw.: obj.m(…);  obj.attr = …;
        if (second.tt === TokenType.dot || second.tt === TokenType.leftSquareBracket) return this.expressionStatement();
        return undefined;
    }

    // ------------------------------------------------------------------ Figuren (Paket 8)

    /** Argumente zwischen den Klammern open und close als [von, bis) – undefined bei leerem Argument */
    private argBounds(open: number, close: number): [number, number][] | undefined {
        if (close === open + 1) return [];
        const bounds = [open, ...this.topLevelCommas(open + 1, close), close];
        const result: [number, number][] = [];
        for (let i = 0; i < bounds.length - 1; i++) {
            if (bounds[i + 1] === bounds[i] + 1) return undefined;
            result.push([bounds[i] + 1, bounds[i + 1]]);
        }
        return result;
    }

    /** Farbe als Argument: "red" oder Color.randomColor() */
    private colourArg(from: number, to: number): string | undefined {
        const t = this.toks[from];
        if (to === from + 1 && t?.tt === TokenType.stringLiteral) return String(t.value);
        if (this.text(from, to).replace(/\s/g, "") === "Color.randomColor()") return "random";
        return undefined;
    }

    /** Circle ball = new Circle(x, y, r);  …  Sprite figur = new Sprite(x, y, SpriteLibrary.Bild, nr); */
    private figureDeclaration(cls: FigureClass, name: string, newIndex: number): BlockState | undefined {
        const begin = this.pos;
        const creation = FIGURE_CREATIONS.find((c) => c.cls === cls)!;
        const open = newIndex + 2;
        if (this.toks[newIndex + 1]?.value !== cls || this.toks[open]?.tt !== TokenType.leftBracket) return undefined;
        const close = this.matching(open);
        if (this.toks[close + 1]?.tt !== TokenType.semicolon) return undefined;
        const args = this.argBounds(open, close);
        if (!args || args.length !== creation.inputs.length) return undefined;
        const fields: Record<string, string> = { NAME: name };
        for (let i = 0; i < args.length; i++) {
            if (creation.inputs[i] !== "IMG") continue;
            const [from, to] = args[i];
            if (to !== from + 3 || this.toks[from].value !== "SpriteLibrary" || this.toks[from + 1].tt !== TokenType.dot
                || this.toks[from + 2].tt !== TokenType.identifier) return undefined;
            fields.IMG = String(this.toks[from + 2].value);
        }
        const inputs: Record<string, { block: BlockState }> = {};
        creation.inputs.forEach((input, i) => {
            if (input !== "IMG") inputs[input] = { block: this.expression(args[i][0], args[i][1]) };
        });
        this.pos = close + 2;
        this.vars.set(name, cls);
        const b = this.block(creation.block, begin, this.pos, { fields });
        b.inputs = inputs;
        return b;
    }

    /** ball.move(5, 0);  ball.setFillColor("red");  ball.destroy();  … */
    private figureStatement(name: string, cls: FigureClass): BlockState | undefined {
        const begin = this.pos;
        const m = this.toks[begin + 2], open = begin + 3;
        if (m?.tt !== TokenType.identifier || this.toks[open]?.tt !== TokenType.leftBracket) return undefined;
        const close = this.matching(open);
        if (this.toks[close + 1]?.tt !== TokenType.semicolon) return undefined;
        const args = this.argBounds(open, close);
        if (!args) return undefined;
        const method = String(m.value);
        const done = (type: string, fields: Record<string, string>, inputs?: Record<string, { block: BlockState }>) => {
            this.pos = close + 2;
            const b = this.block(type, begin, this.pos, { fields: { ...fields, NAME: name } });
            if (inputs) b.inputs = inputs;
            return b;
        };
        const call = FIGURE_CALLS.find((c) => c.method === method && c.inputs.length === args.length && (!c.kinds || c.kinds.includes(cls)));
        if (call) {
            const inputs: Record<string, { block: BlockState }> = {};
            call.inputs.forEach((input, i) => { inputs[input] = { block: this.expression(args[i][0], args[i][1]) }; });
            return done(call.block, {}, inputs);
        }
        if (method === "setFillColor" && args.length === 1 && FILLED.includes(cls)) {
            const colour = this.colourArg(args[0][0], args[0][1]);
            return colour === undefined ? undefined : done(B.figColor, { COLOR: colour });
        }
        if (method === "turnTowards") {
            const target = figureTarget(this.text(open + 1, close));
            return target === undefined ? undefined : done(B.figTurnTo, { OTHER: target });
        }
        const callText = `${method}(${this.text(open + 1, close).trim()})`;
        const action = FIGURE_ACTIONS.find(([, , java]) => java === callText);
        if (action) return done(B.figAction, { ACTION: action[1] });
        return undefined;
    }

    /** Stack s = new Stack();  Queue q = new Queue();  BinTree b = new BinTree();  BinTree b = new BinTree(5); */
    private adtDeclaration(cls: AdtClass, name: string, newIndex: number): BlockState | undefined {
        const begin = this.pos;
        const open = newIndex + 2;
        if (this.toks[newIndex + 1]?.value !== cls || this.toks[open]?.tt !== TokenType.leftBracket) return undefined;
        const close = this.matching(open);
        if (this.toks[close + 1]?.tt !== TokenType.semicolon) return undefined;
        const args = this.argBounds(open, close);
        if (!args || args.length > (cls === "BinTree" ? 1 : 0)) return undefined;
        const inputs = args.length ? { V: { block: this.expression(args[0][0], args[0][1]) } } : undefined;
        this.pos = close + 2;
        this.vars.set(name, cls);
        const b = this.block(ADT_CREATIONS.find((c) => c.cls === cls)!.block, begin, this.pos, { fields: { NAME: name } });
        if (inputs) b.inputs = inputs;
        return b;
    }

    /** s.push(v);  s.pop();  q.enqueue(v);  b.setItem(v);  b.setLeft(t);  b.deleteRight(); … */
    private adtStatement(name: string, cls: AdtClass): BlockState | undefined {
        const begin = this.pos;
        const m = this.toks[begin + 2], open = begin + 3;
        if (m?.tt !== TokenType.identifier || this.toks[open]?.tt !== TokenType.leftBracket) return undefined;
        const close = this.matching(open);
        if (this.toks[close + 1]?.tt !== TokenType.semicolon) return undefined;
        const args = this.argBounds(open, close);
        if (!args) return undefined;
        const method = String(m.value);
        const done = (type: string, fields: Record<string, string>, inputs?: Record<string, { block: BlockState }>) => {
            this.pos = close + 2;
            const b = this.block(type, begin, this.pos, { fields: { ...fields, NAME: name } });
            if (inputs) b.inputs = inputs;
            return b;
        };
        const call = ADT_CALLS.find((c) => c.cls === cls && c.method === method && c.inputs.length === args.length);
        if (call) {
            const inputs: Record<string, { block: BlockState }> = {};
            call.inputs.forEach((input, i) => { inputs[input] = { block: this.expression(args[i][0], args[i][1]) }; });
            return done(call.block, {}, inputs);
        }
        if (cls !== "BinTree") return undefined;
        const side = TREE_SIDES.find(([, , set]) => set === method);
        if (side && args.length === 1) return done(B.treeSetChild, { SIDE: side[1] }, { T: { block: this.expression(args[0][0], args[0][1]) } });
        if (args.length === 0 && TREE_DELETES.some(([, v]) => v === method)) return done(B.treeDelete, {});
        return undefined;
    }

    /** new World(800, 600).setBackgroundColor("black"); */
    private worldStatement(): BlockState | undefined {
        const begin = this.pos;
        if (this.toks[begin + 1]?.value !== "World" || this.toks[begin + 2]?.tt !== TokenType.leftBracket) return undefined;
        const close = this.matching(begin + 2);
        const size = this.argBounds(begin + 2, close);
        if (!size || size.length !== 2) return undefined;
        if (this.toks[close + 1]?.tt !== TokenType.dot || this.toks[close + 2]?.value !== "setBackgroundColor"
            || this.toks[close + 3]?.tt !== TokenType.leftBracket) return undefined;
        const close2 = this.matching(close + 3);
        if (this.toks[close2 + 1]?.tt !== TokenType.semicolon) return undefined;
        const colourArgs = this.argBounds(close + 3, close2);
        const colour = colourArgs?.length === 1 ? this.colourArg(colourArgs[0][0], colourArgs[0][1]) : undefined;
        if (colour === undefined) return undefined;
        const inputs = { W: { block: this.expression(size[0][0], size[0][1]) }, H: { block: this.expression(size[1][0], size[1][1]) } };
        this.pos = close2 + 2;
        const b = this.block(B.worldNew, begin, this.pos, { fields: { COLOR: colour } });
        b.inputs = inputs;
        return b;
    }

    // ------------------------------------------------------------------ Reihungen und Listen

    collection(name: string) { return collectionOfType(this.vars.get(name)); }

    private remember(name: string, kind: CollKind, elem: string | null) {
        this.vars.set(name, collectionType(kind, elem));
    }

    /** "[]" (ein Token beim Lexer) oder "[" "]" an Position i: Anzahl der Tokens, sonst 0 */
    private emptyBrackets(i: number): number {
        if (this.toks[i]?.tt === TokenType.leftRightSquareBracket) return 1;
        return this.toks[i]?.tt === TokenType.leftSquareBracket && this.toks[i + 1]?.tt === TokenType.rightSquareBracket ? 2 : 0;
    }

    /** int[] a = new int[n];  int[] a = {1, 2};  int[] a = new int[]{1, 2};  int[][] m = new int[r][c]; */
    private arrayDeclaration(): BlockState {
        const begin = this.pos;
        const type = String(this.toks[this.pos].value);
        this.pos++;
        let dims = 0;
        for (let n; (n = this.emptyBrackets(this.pos)) > 0; dims++) this.pos += n;
        if (dims < 1 || dims > 2) throw new Fail();
        const name = String(this.expect(TokenType.identifier).value);
        this.expect(TokenType.assignment);
        const fields = { NAME: name, TYPE: type };
        if (this.is(TokenType.keywordNew)) {
            this.pos++;
            if (this.expect(TokenType.identifier).value !== type) throw new Fail();
            const sizes: [number, number][] = [];
            while (this.is(TokenType.leftSquareBracket) || this.is(TokenType.leftRightSquareBracket)) {
                if (this.is(TokenType.leftRightSquareBracket)) {
                    sizes.push([this.pos, this.pos]);   // new int[]{…}
                    this.pos++;
                    continue;
                }
                const open = this.pos, close = this.matching(open);
                sizes.push([open + 1, close]);
                this.pos = close + 1;
            }
            if (sizes.length !== dims) throw new Fail();
            if (sizes.every(([f, t]) => t > f)) {
                this.expect(TokenType.semicolon);
                const b = this.block(dims === 1 ? B.arrayNew : B.array2dNew, begin, this.pos, { fields });
                b.inputs = dims === 1
                    ? { LEN: { block: this.expression(...sizes[0]) } }
                    : { R: { block: this.expression(...sizes[0]) }, C: { block: this.expression(...sizes[1]) } };
                this.remember(name, dims === 1 ? "array" : "array2d", type);
                return b;
            }
            if (dims !== 1 || sizes[0][1] !== sizes[0][0]) throw new Fail();   // new int[]{…}
        }
        if (dims !== 1 || !this.is(TokenType.leftCurlyBracket)) throw new Fail();
        const open = this.pos, close = this.matching(open);
        if (close === open + 1) throw new Fail();
        this.pos = close + 1;
        this.expect(TokenType.semicolon);
        const b = this.block(B.arrayValues, begin, this.pos, { fields });
        const bounds = [open, ...this.topLevelCommas(open + 1, close), close];
        b.inputs = {};
        for (let i = 0; i < bounds.length - 1; i++) {
            if (bounds[i + 1] === bounds[i] + 1) throw new Fail();
            b.inputs["V" + i] = { block: this.expression(bounds[i] + 1, bounds[i + 1]) };
        }
        b.extraState = { items: bounds.length - 1 };
        this.remember(name, "array", type);
        return b;
    }

    /** ArrayList<Integer> l = new ArrayList<Integer>();  (auch new ArrayList<>()) */
    private listDeclaration(): BlockState {
        const begin = this.pos;
        this.pos++;
        this.expect(TokenType.lower);
        const wrapper = String(this.expect(TokenType.identifier).value);
        this.expect(TokenType.greater);
        const elem = unwrap(wrapper);
        const name = String(this.expect(TokenType.identifier).value);
        this.expect(TokenType.assignment);
        this.expect(TokenType.keywordNew);
        if (this.expect(TokenType.identifier).value !== "ArrayList") throw new Fail();
        this.expect(TokenType.lower);
        if (this.is(TokenType.identifier)) {
            if (this.peek()!.value !== wrapper) throw new Fail();
            this.pos++;
        }
        this.expect(TokenType.greater);
        this.expect(TokenType.leftBracket);
        this.expect(TokenType.rightBracket);
        this.expect(TokenType.semicolon);
        this.remember(name, "list", elem);
        return this.block(B.listNew, begin, this.pos, { fields: { NAME: name, TYPE: elem } });
    }

    /** DynArray d = new DynArray(); */
    private dynDeclaration(): BlockState {
        const begin = this.pos;
        this.pos++;
        const name = String(this.expect(TokenType.identifier).value);
        this.expect(TokenType.assignment);
        this.expect(TokenType.keywordNew);
        if (this.expect(TokenType.identifier).value !== "DynArray") throw new Fail();
        this.expect(TokenType.leftBracket);
        this.expect(TokenType.rightBracket);
        this.expect(TokenType.semicolon);
        this.remember(name, "dyn", null);
        return this.block(B.dynNew, begin, this.pos, { fields: { NAME: name } });
    }

    /** a[i] = v;  m[r][c] = v;  liste.add(v);  d.insertAt(i, v); … */
    private collectionStatement(name: string, kind: CollKind): BlockState | undefined {
        const begin = this.pos;
        if ((kind === "array" || kind === "array2d") && this.is(TokenType.leftSquareBracket, 1)) {
            this.pos++;
            const idx: [number, number][] = [];
            while (this.is(TokenType.leftSquareBracket)) {
                const open = this.pos, close = this.matching(open);
                if (close === open + 1) throw new Fail();
                idx.push([open + 1, close]);
                this.pos = close + 1;
            }
            if (idx.length !== (kind === "array" ? 1 : 2)) throw new Fail();
            this.expect(TokenType.assignment);
            const valueStart = this.pos;
            const end = this.findAtDepth0(TokenType.semicolon, valueStart);
            if (end === valueStart) throw new Fail();
            this.pos = end + 1;
            const b = this.block(kind === "array" ? B.arraySet : B.array2dSet, begin, this.pos, { fields: { NAME: name } });
            b.inputs = kind === "array"
                ? { I: { block: this.expression(...idx[0]) }, V: { block: this.expression(valueStart, end) } }
                : { R: { block: this.expression(...idx[0]) }, C: { block: this.expression(...idx[1]) }, V: { block: this.expression(valueStart, end) } };
            return b;
        }
        if ((kind === "list" || kind === "dyn") && this.is(TokenType.dot, 1) && this.is(TokenType.identifier, 2) && this.is(TokenType.leftBracket, 3)) {
            const method = String(this.peek(2)!.value);
            const open = this.pos + 3, close = this.matching(open);
            const argc = close === open + 1 ? 0 : this.topLevelCommas(open + 1, close).length + 1;
            const spec = COLLECTION_CALLS.find((c) => c.kind === kind && c.method === method && c.args.length === argc && c.stmt);
            if (!spec) return undefined;
            this.pos = close + 1;
            this.expect(TokenType.semicolon);
            const b = this.block(spec.type, begin, this.pos, { fields: { NAME: name } });
            this.callInputs(b, spec.args, open, close);
            return b;
        }
        return undefined;
    }

    /** Argumente eines Methodenaufrufs als benannte Eingänge (I, V …) */
    callInputs(b: BlockState, names: string[], open: number, close: number) {
        if (names.length === 0) return;
        const bounds = [open, ...this.topLevelCommas(open + 1, close), close];
        b.inputs = b.inputs ?? {};
        names.forEach((n, i) => {
            if (bounds[i + 1] === bounds[i] + 1) throw new Fail();
            b.inputs![n] = { block: this.expression(bounds[i] + 1, bounds[i + 1]) };
        });
    }

    /** für jedes Element: for (int x : zahlen)  (Typ passend zur Reihung bzw. Liste) */
    private forEachLoop(begin: number): BlockState | undefined {
        const t = (k: number) => this.toks[begin + k];
        if (t(1)?.tt !== TokenType.leftBracket || t(2)?.tt !== TokenType.identifier) return undefined;
        const ty = this.typeAt(begin + 2);
        if (!ty) return undefined;
        const type = ty.type, k = ty.next - begin;
        if (t(k)?.tt !== TokenType.identifier || t(k + 1)?.tt !== TokenType.colon || t(k + 2)?.tt !== TokenType.identifier
            || t(k + 3)?.tt !== TokenType.rightBracket) return undefined;
        const item = String(t(k).value), list = String(t(k + 2).value);
        const coll = this.collection(list);
        if (!coll || elementJavaType(coll) !== type) throw new Fail();
        this.vars.set(item, unwrap(type));   // bei zweidimensionalen Reihungen: eine Zeile (Reihung)
        this.pos = begin + k + 4;
        const body = this.body();
        const b = this.block(B.forEach, begin, this.pos, { fields: { VAR: item, LIST: list } });
        if (body) b.inputs = { DO: { block: body } };
        return b;
    }

    /** Argumente eines Aufrufs (Klammern an open und close) als Eingänge ARG0 … */
    addArguments(b: BlockState, open: number, close: number) {
        if (close === open + 1) return;
        const bounds = [open, ...this.topLevelCommas(open + 1, close), close];
        b.inputs = b.inputs ?? {};
        for (let i = 0; i < bounds.length - 1; i++) {
            if (bounds[i + 1] === bounds[i] + 1) throw new Fail();
            b.inputs["ARG" + i] = { block: this.expression(bounds[i] + 1, bounds[i + 1]) };
        }
        b.extraState = { ...(b.extraState ?? {}), args: bounds.length - 1 };
    }

    /** Index der passenden schließenden Klammer zu ( [ { an Position open */
    private matching(open: number): number {
        let depth = 0;
        for (let i = open; i < this.toks.length; i++) {
            const tt = this.toks[i].tt;
            if (tt === TokenType.leftBracket || tt === TokenType.leftSquareBracket || tt === TokenType.leftCurlyBracket) depth++;
            else if (tt === TokenType.rightBracket || tt === TokenType.rightSquareBracket || tt === TokenType.rightCurlyBracket) {
                depth--;
                if (depth === 0) return i;
            }
        }
        throw new Fail();
    }

    /** Erstes Token des Typs außerhalb von Klammern ab from (bei ";" endet die Suche spätestens) */
    private findAtDepth0(tt: TokenType, from: number): number {
        let depth = 0;
        for (let i = from; i < this.toks.length; i++) {
            const t = this.toks[i].tt;
            if (depth === 0 && t === tt) return i;
            if (t === TokenType.leftBracket || t === TokenType.leftSquareBracket || t === TokenType.leftCurlyBracket) depth++;
            else if (t === TokenType.rightBracket || t === TokenType.rightSquareBracket || t === TokenType.rightCurlyBracket) {
                depth--;
                if (depth < 0) break;
            } else if (depth === 0 && t === TokenType.semicolon) break;
        }
        throw new Fail();
    }

    private topLevelCommas(from: number, to: number): number[] {
        const result: number[] = [];
        let depth = 0;
        for (let i = from; i < to; i++) {
            const t = this.toks[i].tt;
            if (t === TokenType.leftBracket || t === TokenType.leftSquareBracket || t === TokenType.leftCurlyBracket) depth++;
            else if (t === TokenType.rightBracket || t === TokenType.rightSquareBracket || t === TokenType.rightCurlyBracket) depth--;
            else if (depth === 0 && t === TokenType.comma) result.push(i);
        }
        return result;
    }

    // ------------------------------------------------------------------ Ausdrücke

    /**
     * Ausdruck aus den Tokens [from, to). Gelingt die Zerlegung nicht vollständig, wird der
     * ganze Ausdruck ein Java-Ausdruck-Block mit dem Originaltext. Kommentare im Ausdruck
     * führen dazu, dass die ganze Anweisung als Text übernommen wird.
     */
    private expression(from: number, to: number): BlockState {
        for (let i = from; i < to; i++) if (this.toks[i].tt === TokenType.comment) throw new Fail();
        const sub = new ExpressionParser(this, from, to);
        try {
            const b = sub.parse(0);
            if (sub.pos === to) return b;
        } catch (e) {
            if (!(e instanceof Fail)) throw e;
        }
        return this.rawExpression(from, to);
    }

    rawExpression(from: number, to: number): BlockState {
        const code = this.text(from, to);
        if (code.includes('"""')) throw new Fail();   // Textblock: ganze Anweisung als Text
        return this.valueBlock(B.javaExpression, { fields: { CODE: code.replace(/\s*\n\s*/g, " ") } });
    }

    // für ExpressionParser
    tok(i: number): Tok | undefined { return this.toks[i]; }
    sourceText(from: number, to: number): string { return this.text(from, to); }
    value(type: string, extra: Partial<BlockState> = {}): BlockState { return this.valueBlock(type, extra); }
    matchingBracket(open: number): number { return this.matching(open); }
    commas(from: number, to: number): number[] { return this.topLevelCommas(from, to); }
    subExpression(from: number, to: number): BlockState { return this.expression(from, to); }
}

/** Ausdrücke mit Vorrangregeln (Präzedenz-Klettern) */
class ExpressionParser {

    constructor(private p: JavaBlockParser, public pos: number, private to: number) { }

    private peek(): Tok | undefined { return this.pos < this.to ? this.p.tok(this.pos) : undefined; }

    parse(minLevel: number): BlockState {
        let left = this.unary();
        while (true) {
            const t = this.peek();
            const op = t ? BINARY.get(t.tt) : undefined;
            if (!op || op.level <= minLevel) break;
            this.pos++;
            const right = this.parse(op.level);
            if (op.op === "+" && (isTextLike(left) || isTextLike(right))) {
                // Verbinden von Texten ("Ada" + zahl)
                left = this.p.value(B.concat, { inputs: { A: { block: left }, B: { block: right } } });
            } else {
                left = this.p.value(op.type, { fields: { OP: op.op }, inputs: { A: { block: left }, B: { block: right } } });
            }
        }
        return left;
    }

    private unary(): BlockState {
        const t = this.peek();
        if (!t) throw new Fail();
        if (t.tt === TokenType.not) {
            this.pos++;
            return this.p.value(B.not, { inputs: { VALUE: { block: this.unary() } } });
        }
        if (t.tt === TokenType.minus) {
            const start = this.pos;
            this.pos++;
            const next = this.peek();
            if (next && NUMBER.has(next.tt)) {
                this.pos++;
                return this.p.value(B.number, { fields: { NUM: "-" + this.p.sourceText(start + 1, this.pos) } });
            }
            this.primary();   // z. B. -x: als Java-Ausdruck übernehmen
            return this.p.value(B.javaExpression, { fields: { CODE: this.p.sourceText(start, this.pos) } });
        }
        return this.primary();
    }

    private primary(): BlockState {
        const start = this.pos;
        const t = this.peek();
        if (!t) throw new Fail();

        if (NUMBER.has(t.tt)) {
            this.pos++;
            return this.p.value(B.number, { fields: { NUM: this.p.sourceText(start, this.pos) } });
        }
        if (t.tt === TokenType.stringLiteral) {
            if (this.p.sourceText(start, start + 1).startsWith('"""')) throw new Fail();
            this.pos++;
            return this.postfix(this.p.value(B.text, { fields: { TEXT: String(t.value) } }), start);
        }
        if (t.tt === TokenType.charLiteral && typeof t.value === "string" && [...t.value].length === 1) {
            this.pos++;
            return this.p.value(B.char, { fields: { CHAR: t.value } });
        }
        if (t.tt === TokenType.booleanLiteral) {
            this.pos++;
            return this.p.value(B.bool, { fields: { VALUE: t.value ? "true" : "false" } });
        }
        if (t.tt === TokenType.leftBracket) {
            // Typumwandlung: (int) x, (double) x, (char) x
            const castType = this.p.tok(start + 1), castClose = this.p.tok(start + 2);
            const ct = String(castType?.value);
            const dynGetFollows = this.isDynGetAt(start + 3);
            if (castType?.tt === TokenType.identifier && castClose?.tt === TokenType.rightBracket && start + 3 < this.to
                && (["int", "double", "char"].includes(ct) || (dynGetFollows && ((VAR_TYPES as readonly string[]).includes(ct) || this.p.extended)))) {
                this.pos = start + 3;
                const inner = this.unary();
                // (int) d.getItem(i), (int) s.top() …: Element als Ganzzahl
                if ((inner.type === B.dynGet || ADT_GET_TYPES.has(inner.type)) && inner.fields?.TYPE === "Object") {
                    inner.fields.TYPE = ct;
                    return inner;
                }
                if (!["int", "double", "char"].includes(ct)) throw new Fail();
                return this.p.value(B.cast, { fields: { TYPE: ct }, inputs: { VALUE: { block: inner } } });
            }
            const close = this.p.matchingBracket(start);
            if (close >= this.to) throw new Fail();
            const inner = new ExpressionParser(this.p, start + 1, close);
            const b = inner.parse(0);
            if (inner.pos !== close) throw new Fail();
            this.pos = close + 1;
            return this.postfix(b, start);
        }
        if (t.tt === TokenType.identifier) {
            const special = this.knownCall();
            if (special) return special;
            const coll = this.p.collection(String(t.value));
            if (coll) {
                const c = this.collectionValue(String(t.value), coll.kind);
                if (c) return this.postfix(c, start);
            }
            const call = this.operationCall();
            if (call) return this.postfix(call, start);
            this.pos++;
            const next = this.peek();
            if (!this.isChainContinuation()) return this.p.value(B.varGet, { fields: { NAME: String(t.value) } });
            if (next?.tt === TokenType.dot) return this.postfix(this.p.value(B.varGet, { fields: { NAME: String(t.value) } }), start);
            this.chain();
            return this.p.value(B.javaExpression, { fields: { CODE: this.p.sourceText(start, this.pos) } });
        }
        // new Klasse(…): neues Objekt
        if (t.tt === TokenType.keywordNew && this.p.tok(start + 1)?.tt === TokenType.identifier && this.p.tok(start + 2)?.tt === TokenType.leftBracket) {
            const open = start + 2, close = this.p.matchingBracket(open);
            if (close >= this.to) throw new Fail();
            const b = this.p.value(B.objNew, { fields: { CLASS: String(this.p.tok(start + 1)!.value) } });
            this.p.addArguments(b, open, close);
            this.pos = close + 1;
            return this.postfix(b, start);
        }
        // this, this.attribut
        if (t.tt === TokenType.keywordThis) {
            const dot = this.p.tok(start + 1), name = this.p.tok(start + 2), after = this.p.tok(start + 3);
            if (start + 2 < this.to && dot?.tt === TokenType.dot && name?.tt === TokenType.identifier && !(start + 3 < this.to && after?.tt === TokenType.leftBracket)) {
                this.pos = start + 3;
                return this.postfix(this.p.value(B.thisAttrGet, { fields: { NAME: String(name.value) } }), start);
            }
            this.pos = start + 1;
            return this.postfix(this.p.value(B.thisValue), start);
        }
        // super.operation(…)
        if (t.tt === TokenType.keywordSuper && this.p.tok(start + 1)?.tt === TokenType.dot && this.p.tok(start + 2)?.tt === TokenType.identifier
            && this.p.tok(start + 3)?.tt === TokenType.leftBracket) {
            const open = start + 3, close = this.p.matchingBracket(open);
            if (close >= this.to) throw new Fail();
            const b = this.p.value(B.superMethodCallExpr, { fields: { METHOD: String(this.p.tok(start + 2)!.value) } });
            this.p.addArguments(b, open, close);
            this.pos = close + 1;
            return this.postfix(b, start);
        }
        if (t.tt === TokenType.charLiteral || t.tt === TokenType.keywordNull
            || t.tt === TokenType.keywordNew) {
            this.pos++;
            if (t.tt === TokenType.keywordNew) {
                if (this.peek()?.tt !== TokenType.identifier) throw new Fail();
                this.pos++;
            }
            this.chain();
            return this.p.value(B.javaExpression, { fields: { CODE: this.p.sourceText(start, this.pos) } });
        }
        throw new Fail();
    }

    /**
     * Textoperationen hinter einem Wert: s.length(), s.charAt(i), s.substring(a, b), a.equals(b),
     * a.contains(b), a.compareTo(b), s.toUpperCase(), s.toLowerCase(). Alles andere (Attribute,
     * andere Methoden) wird mit dem ganzen Ausdruck zum Java-Ausdruck-Block.
     */
    private postfix(base: BlockState, start: number): BlockState {
        let b = base;
        while (this.peek()?.tt === TokenType.dot) {
            // Stapel, Schlange, Binärbaum: s.top(), q.isEmpty(), b.getLeft(), b.isLeaf() …
            const adtType = b.type === B.varGet ? this.p.staticType(b) : undefined;
            if (isAdtClass(adtType)) {
                const adt = this.adtValue(String(b.fields?.NAME ?? ""), adtType);
                if (adt) {
                    b = adt;
                    continue;
                }
            }
            // Figur: ball.getCenterX(), ball.collidesWith(wand), ball.isOutsideView()
            if (b.type === B.varGet && isFigureClass(this.p.staticType(b))) {
                const fig = this.figureValue(String(b.fields?.NAME ?? ""));
                if (fig) {
                    b = fig;
                    continue;
                }
            }
            // Objekt: obj.operation(…) bzw. obj.attribut
            if (isClassType(this.p.staticType(b))) {
                const nameTok = this.p.tok(this.pos + 1);
                if (this.pos + 1 >= this.to || nameTok?.tt !== TokenType.identifier) throw new Fail();
                const name = String(nameTok.value);
                if (this.pos + 2 < this.to && this.p.tok(this.pos + 2)?.tt === TokenType.leftBracket) {
                    const open = this.pos + 2, close = this.p.matchingBracket(open);
                    if (close >= this.to) throw new Fail();
                    const call = this.p.value(B.objCallExpr, { fields: { METHOD: name }, inputs: { OBJ: { block: b } } });
                    this.p.addArguments(call, open, close);
                    b = call;
                    this.pos = close + 1;
                } else {
                    b = this.p.value(B.objAttrGet, { fields: { ATTR: name }, inputs: { OBJ: { block: b } } });
                    this.pos += 2;
                }
                continue;
            }
            const nameTok = this.p.tok(this.pos + 1), open = this.p.tok(this.pos + 2);
            const known = nameTok?.tt === TokenType.identifier && open?.tt === TokenType.leftBracket && this.pos + 2 < this.to;
            const openIndex = this.pos + 2;
            const close = known ? this.p.matchingBracket(openIndex) : -1;
            const method = String(nameTok?.value ?? "");
            const commas = known && close < this.to ? this.p.commas(openIndex + 1, close) : [];
            const argCount = !known || close >= this.to ? -1 : close === openIndex + 1 ? 0 : commas.length + 1;
            const arg = (i: number) => {
                const bounds = [openIndex, ...commas, close];
                return this.p.subExpression(bounds[i] + 1, bounds[i + 1]);
            };
            const two = (type: string) => this.p.value(type, { inputs: { A: { block: b }, B: { block: arg(0) } } });
            let next: BlockState | undefined;
            if (method === "length" && argCount === 0) next = this.p.value(B.strLength, { inputs: { TEXT: { block: b } } });
            else if (method === "charAt" && argCount === 1) next = this.p.value(B.strCharAt, { inputs: { TEXT: { block: b }, INDEX: { block: arg(0) } } });
            else if (method === "substring" && argCount === 2) next = this.p.value(B.strSubstring, { inputs: { TEXT: { block: b }, FROM: { block: arg(0) }, TO: { block: arg(1) } } });
            else if (method === "equals" && argCount === 1) next = two(B.strEquals);
            else if (method === "contains" && argCount === 1) next = two(B.strContains);
            else if (method === "compareTo" && argCount === 1) next = two(B.strCompare);
            else if ((method === "toUpperCase" || method === "toLowerCase") && argCount === 0) {
                next = this.p.value(B.strCase, { fields: { CASE: method === "toUpperCase" ? "upper" : "lower" }, inputs: { TEXT: { block: b } } });
            }
            if (!next) {
                this.pos = start;
                this.skipPrimaryTokens();
                this.chain();
                return this.p.value(B.javaExpression, { fields: { CODE: this.p.sourceText(start, this.pos) } });
            }
            b = next;
            this.pos = close + 1;
        }
        if (this.peek()?.tt === TokenType.leftSquareBracket) {
            this.pos = start;
            this.skipPrimaryTokens();
            this.chain();
            return this.p.value(B.javaExpression, { fields: { CODE: this.p.sourceText(start, this.pos) } });
        }
        return b;
    }

    /** überspringt den Anfang eines Ausdrucks (Name, Literal oder Klammer) */
    private skipPrimaryTokens() {
        const t = this.peek();
        if (!t) throw new Fail();
        if (t.tt === TokenType.leftBracket) {
            const close = this.p.matchingBracket(this.pos);
            if (close >= this.to) throw new Fail();
            this.pos = close + 1;
        } else {
            this.pos++;
        }
    }

    private isChainContinuation(): boolean {
        const t = this.peek();
        return !!t && (t.tt === TokenType.dot || t.tt === TokenType.leftBracket || t.tt === TokenType.leftSquareBracket);
    }

    /** Methodenaufrufe, Attribute, Indizes: Klasse.methode(…).x[3] (auch new Typ(…)) */
    private chain() {
        while (this.isChainContinuation()) {
            const t = this.peek()!;
            if (t.tt === TokenType.leftBracket || t.tt === TokenType.leftSquareBracket) {
                const close = this.p.matchingBracket(this.pos);
                if (close >= this.to) throw new Fail();
                this.pos = close + 1;
            } else {
                this.pos++;   // Punkt, danach muss ein Name kommen
                if (this.peek()?.tt !== TokenType.identifier) throw new Fail();
                this.pos++;
            }
        }
    }

    /** d.getItem( bzw. s.top(, q.head(, b.getItem( … an Position i? (dahinter darf eine Typumwandlung stehen) */
    private isDynGetAt(i: number): boolean {
        const a = this.p.tok(i), dot = this.p.tok(i + 1), m = this.p.tok(i + 2);
        if (a?.tt !== TokenType.identifier || dot?.tt !== TokenType.dot) return false;
        if (this.p.collection(String(a.value))?.kind === "dyn" && m?.value === "getItem") return true;
        const t = this.p.staticType({ type: B.varGet, fields: { NAME: String(a.value) } } as BlockState);
        return isAdtClass(t) && !!getOp(t, String(m?.value ?? ""));
    }

    /** a[i], m[r][c], a.length, m[0].length, liste.get(i), liste.size(), d.getItem(i) … */
    private collectionValue(name: string, kind: CollKind): BlockState | undefined {
        const tok = (k: number) => (this.pos + k < this.to ? this.p.tok(this.pos + k) : undefined);
        const fields = { NAME: name };
        if (kind === "array" || kind === "array2d") {
            if (tok(1)?.tt === TokenType.dot && tok(2)?.value === "length" && tok(3)?.tt !== TokenType.leftBracket) {
                this.pos += 3;
                return kind === "array" ? this.p.value(B.arrayLength, { fields }) : this.p.value(B.array2dSize, { fields: { ...fields, DIM: "rows" } });
            }
            if (kind === "array2d" && tok(1)?.tt === TokenType.leftSquareBracket && tok(2)?.tt === TokenType.integerLiteral && tok(2)?.value === 0
                && tok(3)?.tt === TokenType.rightSquareBracket && tok(4)?.tt === TokenType.dot && tok(5)?.value === "length"
                && tok(6)?.tt !== TokenType.leftBracket) {
                this.pos += 6;
                return this.p.value(B.array2dSize, { fields: { ...fields, DIM: "cols" } });
            }
            if (tok(1)?.tt !== TokenType.leftSquareBracket) return undefined;
            const idx: [number, number][] = [];
            let p = this.pos + 1;
            while (p < this.to && this.p.tok(p)?.tt === TokenType.leftSquareBracket) {
                const close = this.p.matchingBracket(p);
                if (close >= this.to || close === p + 1) return undefined;
                idx.push([p + 1, close]);
                p = close + 1;
            }
            if (idx.length !== (kind === "array" ? 1 : 2)) return undefined;
            this.pos = p;
            return kind === "array"
                ? this.p.value(B.arrayGet, { fields, inputs: { I: { block: this.p.subExpression(...idx[0]) } } })
                : this.p.value(B.array2dGet, { fields, inputs: { R: { block: this.p.subExpression(...idx[0]) }, C: { block: this.p.subExpression(...idx[1]) } } });
        }
        if (tok(1)?.tt !== TokenType.dot || tok(2)?.tt !== TokenType.identifier || tok(3)?.tt !== TokenType.leftBracket) return undefined;
        const open = this.pos + 3, close = this.p.matchingBracket(open);
        if (close >= this.to) return undefined;
        const argc = close === open + 1 ? 0 : this.p.commas(open + 1, close).length + 1;
        const method = String(tok(2)!.value);
        const spec = COLLECTION_CALLS.find((c) => c.kind === kind && c.method === method && c.args.length === argc && !c.stmt);
        if (!spec) return undefined;
        const b = this.p.value(spec.type, { fields: spec.type === B.dynGet ? { ...fields, TYPE: "Object" } : fields });
        this.p.callInputs(b, spec.args, open, close);
        this.pos = close + 1;
        return b;
    }

    /** Ergebnis einer Operation: name(…) ohne Punkt davor und danach */
    private operationCall(): BlockState | undefined {
        const name = this.p.tok(this.pos), open = this.p.tok(this.pos + 1);
        if (!name || open?.tt !== TokenType.leftBracket || this.pos + 1 >= this.to) return undefined;
        const close = this.p.matchingBracket(this.pos + 1);
        if (close >= this.to) return undefined;
        const after = close + 1 < this.to ? this.p.tok(close + 1) : undefined;
        if (after && (after.tt === TokenType.dot || after.tt === TokenType.leftSquareBracket)) return undefined;
        const b = this.p.value(B.callExpr, { fields: { NAME: String(name.value) } });
        this.p.addArguments(b, this.pos + 1, close);
        this.pos = close + 1;
        return b;
    }

    /** Input.readInt("…"), Random.randint(a, b), Math.sqrt(x) */
    /** Wert von Stapel, Schlange, Binärbaum hinter dem Punkt (this.pos zeigt auf den Punkt) */
    private adtValue(name: string, cls: AdtClass): BlockState | undefined {
        const m = this.p.tok(this.pos + 1), openIndex = this.pos + 2;
        if (m?.tt !== TokenType.identifier || openIndex >= this.to || this.p.tok(openIndex)?.tt !== TokenType.leftBracket) return undefined;
        const close = this.p.matchingBracket(openIndex);
        if (close !== openIndex + 1 || close >= this.to) return undefined;   // alle ohne Argumente
        const method = String(m.value);
        let result: BlockState | undefined;
        const get = getOp(cls, method);
        if (get) result = this.p.value(get.block, { fields: { OP: method, NAME: name, TYPE: "Object" } });
        else if (method === "isEmpty") result = this.p.value(B.adtIsEmpty, { fields: { NAME: name } });
        else if (cls === "BinTree") {
            const side = TREE_SIDES.find(([, , , read]) => read === method);
            if (side) result = this.p.value(B.treeChild, { fields: { SIDE: side[1], NAME: name } });
            else if (TREE_TESTS.some(([, v]) => v === method)) result = this.p.value(B.treeTest, { fields: { NAME: name } });
        }
        if (result) this.pos = close + 1;
        return result;
    }

    /** Wert einer Figur hinter dem Punkt (this.pos zeigt auf den Punkt) */
    private figureValue(name: string): BlockState | undefined {
        const m = this.p.tok(this.pos + 1), openIndex = this.pos + 2;
        if (m?.tt !== TokenType.identifier || openIndex >= this.to || this.p.tok(openIndex)?.tt !== TokenType.leftBracket) return undefined;
        const close = this.p.matchingBracket(openIndex);
        if (close >= this.to) return undefined;
        const method = String(m.value);
        let result: BlockState | undefined;
        const prop = FIGURE_PROPS.find(([, , java]) => java === method);
        if (prop && close === openIndex + 1) result = this.p.value(B.figProp, { fields: { PROP: prop[1], NAME: name } });
        else if (method === "isOutsideView" && close === openIndex + 1) result = this.p.value(B.figOutside, { fields: { NAME: name } });
        else if (method === "collidesWith" && close === openIndex + 2 && this.p.tok(openIndex + 1)?.tt === TokenType.identifier) {
            result = this.p.value(B.figTouches, { fields: { NAME: name, OTHER: String(this.p.tok(openIndex + 1)!.value) } });
        }
        else if (method === "distanceTo") {
            const target = figureTarget(this.p.sourceText(openIndex + 1, close));
            if (target !== undefined) result = this.p.value(B.figDistance, { fields: { NAME: name, OTHER: target } });
        }
        if (result) this.pos = close + 1;
        return result;
    }

    private knownCall(): BlockState | undefined {
        const a = this.p.tok(this.pos), dot = this.p.tok(this.pos + 1), m = this.p.tok(this.pos + 2), open = this.p.tok(this.pos + 3);
        if (!a || !dot || !m || !open || dot.tt !== TokenType.dot || m.tt !== TokenType.identifier || open.tt !== TokenType.leftBracket) return undefined;
        const cls = String(a.value), method = String(m.value);
        const openIndex = this.pos + 3;
        const close = this.p.matchingBracket(openIndex);
        if (close >= this.to) return undefined;
        const after = close + 1 < this.to ? this.p.tok(close + 1) : undefined;
        if (after && (after.tt === TokenType.dot || after.tt === TokenType.leftSquareBracket)) return undefined;
        const commas = this.p.commas(openIndex + 1, close);
        const args = (): [number, number][] => {
            const bounds = [openIndex, ...commas, close];
            return bounds.slice(1).map((end, i) => [bounds[i] + 1, end]);
        };

        let result: BlockState | undefined;
        if (cls === "Input" && (INPUT_METHODS as readonly string[]).includes(method) && commas.length === 0 && close > openIndex + 1) {
            result = this.p.value(B.input, { fields: { METHOD: method }, inputs: { PROMPT: { block: this.p.subExpression(openIndex + 1, close) } } });
        } else if (cls === "Random" && method === "randint" && commas.length === 1) {
            const [[f1, t1], [f2, t2]] = args();
            if (f1 === t1 || f2 === t2) return undefined;
            result = this.p.value(B.random, { inputs: { FROM: { block: this.p.subExpression(f1, t1) }, TO: { block: this.p.subExpression(f2, t2) } } });
        } else if (cls === "Math" && (method === "min" || method === "max") && commas.length === 1) {
            const [[f1, t1], [f2, t2]] = args();
            if (f1 === t1 || f2 === t2) return undefined;
            result = this.p.value(B.minMax, { fields: { FUNC: method }, inputs: { A: { block: this.p.subExpression(f1, t1) }, B: { block: this.p.subExpression(f2, t2) } } });
        } else if (cls === "Input" && method === "isKeyDown" && close === openIndex + 2 && this.p.tok(openIndex + 1)?.tt === TokenType.stringLiteral) {
            result = this.p.value(B.keyDown, { fields: { KEY: String(this.p.tok(openIndex + 1)!.value) } });
        } else if (cls === "Mouse" && (method === "isDown" || method === "wasClicked") && close === openIndex + 1) {
            result = this.p.value(B.mouseDown, { fields: { WHAT: method === "isDown" ? "down" : "clicked" } });
        } else if (cls === "Mouse" && (method === "getX" || method === "getY") && close === openIndex + 1) {
            result = this.p.value(B.mouseXY, { fields: { AXIS: method === "getX" ? "x" : "y" } });
        } else if (cls === "Mouse" && (method === "isOver" || method === "wasClicked") && close === openIndex + 2 && this.p.tok(openIndex + 1)?.tt === TokenType.identifier) {
            result = this.p.value(B.mouseOver, { fields: { WHAT: method === "isOver" ? "over" : "clicked", NAME: String(this.p.tok(openIndex + 1)!.value) } });
        } else if (cls === "Math" && method === "random" && close === openIndex + 1) {
            result = this.p.value(B.randomDouble);
        } else if (cls === "Math" && (MATH_FUNCTIONS as readonly string[]).includes(method) && commas.length === 0 && close > openIndex + 1) {
            result = this.p.value(B.math, { fields: { FUNC: method }, inputs: { VALUE: { block: this.p.subExpression(openIndex + 1, close) } } });
        }
        if (result) this.pos = close + 1;
        return result;
    }
}

/** Text-Wert, bei dem "+" ein Verbinden ist */
function isTextLike(b: BlockState): boolean {
    return b.type === B.text || b.type === B.concat || b.type === B.strSubstring || b.type === B.strCase;
}

/**
 * println(a + " " + b + " " + c) -> mehrere Werte (a, b, c) im Block "gib aus".
 * Nur eine links verkettete Folge, bei der zwischen allen Werten genau " " steht.
 */
function splitPrintValues(value: BlockState): BlockState[] {
    const terms: BlockState[] = [];
    const collect = (b: BlockState) => {
        if (b.type === B.concat) {
            collect(b.inputs!.A.block);
            terms.push(b.inputs!.B.block);
        } else {
            terms.push(b);
        }
    };
    collect(value);
    const isSpace = (b: BlockState) => b.type === B.text && b.fields?.TEXT === " ";
    if (terms.length < 3 || terms.length % 2 === 0) return [value];
    for (let i = 0; i < terms.length; i++) {
        if (i % 2 === 1 ? !isSpace(terms[i]) : isSpace(terms[i])) return [value];
    }
    return terms.filter((_, i) => i % 2 === 0);
}

/** Ziel von turnTowards/distanceTo: eine Figur (Name) oder die Position des Mauszeigers */
function figureTarget(argText: string): string | undefined {
    const t = argText.replace(/\s+/g, "");
    if (t === "Mouse.getX(),Mouse.getY()") return MOUSE_TARGET;
    return /^[\p{L}_$][\p{L}\p{N}_$]*$/u.test(t) ? t : undefined;
}
