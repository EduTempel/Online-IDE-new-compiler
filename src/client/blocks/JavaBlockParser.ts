import { Lexer } from "../../compiler/java/lexer/Lexer";
import { TokenType } from "../../compiler/java/TokenType";
import { B, INPUT_METHODS, MATH_FUNCTIONS, VAR_TYPES, type BlockState, type Param, type WorkspaceState } from "./BlockTypes";

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

    static parse(src: string): ParseResult {
        return new JavaBlockParser(src).parseProgram();
    }

    /**
     * Oberste Ebene: Anweisungen des Hauptprogramms und Operationen (Methoden ohne Klasse,
     * z. B. "int quadrat(int x) { … }"). Jede Operation wird ein eigener Hut-Block; ihre
     * Reihenfolge steht in der y-Position (die Blockansicht ordnet sie neben dem Hauptprogramm
     * untereinander an). Der Generator schreibt erst das Hauptprogramm, dann die Operationen.
     */
    parseProgram(): ParseResult {
        const main: BlockState[] = [];
        const methods: BlockState[] = [];
        while (this.pos < this.toks.length) {
            const method = this.tryMethod();
            if (method) {
                method.x = 400;
                method.y = 20 + methods.length * 200;
                methods.push(method);
                continue;
            }
            const b = this.statement(true);
            if (b) main.push(b);
        }
        for (let i = main.length - 2; i >= 0; i--) main[i].next = { block: main[i + 1] };
        const start: BlockState = { type: B.start, id: "start", x: 20, y: 20, deletable: false };
        if (main[0]) start.inputs = { BODY: { block: main[0] } };
        return { state: { blocks: { languageVersion: 0, blocks: [start, ...methods] } }, ranges: this.ranges };
    }

    /**
     * Operation: Typ (oder void) Name ( Typ Name, … ) { … } – Typen nur die der Blöcke.
     * Passt etwas nicht, bleibt die Position unverändert (dann wird es Java-Text im Hauptprogramm).
     */
    private tryMethod(): BlockState | undefined {
        const begin = this.pos;
        const t = this.peek(), n = this.peek(1), open = this.peek(2);
        const isType = !!t && (t.tt === TokenType.keywordVoid || (t.tt === TokenType.identifier && (VAR_TYPES as readonly string[]).includes(String(t.value))));
        if (!isType || n?.tt !== TokenType.identifier || open?.tt !== TokenType.leftBracket) return undefined;
        const rangeCount = this.ranges.length;
        try {
            const close = this.matching(begin + 2);
            const params: Param[] = [];
            let i = begin + 3;
            while (i < close) {
                const pt = this.toks[i], pn = this.toks[i + 1];
                if (pt.tt !== TokenType.identifier || !(VAR_TYPES as readonly string[]).includes(String(pt.value)) || pn?.tt !== TokenType.identifier) throw new Fail();
                params.push({ name: String(pn.value), type: String(pt.value) });
                i += 2;
                if (i < close) {
                    if (this.toks[i].tt !== TokenType.comma) throw new Fail();
                    i++;
                }
            }
            this.pos = close + 1;
            if (!this.is(TokenType.leftCurlyBracket)) throw new Fail();
            this.pos++;
            const body = this.statementList(true);
            this.expect(TokenType.rightCurlyBracket);
            const fields: { [name: string]: string } = { NAME: String(n.value), RETURN: t.tt === TokenType.keywordVoid ? "void" : String(t.value) };
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
                if (conds.length > 1 || hasElse) b.extraState = { elseIfs: conds.length - 1, hasElse };
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
                const b = this.block(B.while, begin, this.pos);
                b.inputs = { COND: { block: cond } };
                if (body) b.inputs.DO = { block: body };
                return b;
            }
            case TokenType.keywordFor:
                return this.forLoop();
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
        }
        return undefined;
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
        this.pos++;
        this.expect(TokenType.leftBracket);
        const type = this.expect(TokenType.identifier);
        if (type.value !== "int") throw new Fail();
        const v = this.expect(TokenType.identifier);
        const name = String(v.value);
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

        // Deklaration
        if ((VAR_TYPES as readonly string[]).includes(String(first.value)) && second.tt === TokenType.identifier) {
            this.pos += 2;
            const fields = { TYPE: String(first.value), NAME: String(second.value) };
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
        if (second.tt === TokenType.plusPlus || second.tt === TokenType.minusMinus) {
            this.pos += 2;
            this.expect(TokenType.semicolon);
            return this.block(second.tt === TokenType.plusPlus ? B.varInc : B.varDec, begin, this.pos, { fields: { NAME: name } });
        }
        if (second.tt === TokenType.assignment || second.tt === TokenType.plusAssignment || second.tt === TokenType.minusAssignment) {
            this.pos += 2;
            const valueStart = this.pos;
            const end = this.findAtDepth0(TokenType.semicolon, valueStart);
            if (end === valueStart) throw new Fail();
            this.pos = end + 1;
            const type = second.tt === TokenType.assignment ? B.varSet : second.tt === TokenType.plusAssignment ? B.varChange : B.varSub;
            const b = this.block(type, begin, this.pos, { fields: { NAME: name } });
            b.inputs = { VALUE: { block: this.expression(valueStart, end) } };
            return b;
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
        return undefined;
    }

    /** Argumente eines Aufrufs (Klammern an open und close) als Eingänge ARG0 … */
    addArguments(b: BlockState, open: number, close: number) {
        if (close === open + 1) return;
        const bounds = [open, ...this.topLevelCommas(open + 1, close), close];
        b.inputs = {};
        for (let i = 0; i < bounds.length - 1; i++) {
            if (bounds[i + 1] === bounds[i] + 1) throw new Fail();
            b.inputs["ARG" + i] = { block: this.expression(bounds[i] + 1, bounds[i + 1]) };
        }
        b.extraState = { args: bounds.length - 1 };
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
            if (castType?.tt === TokenType.identifier && ["int", "double", "char"].includes(String(castType.value))
                && castClose?.tt === TokenType.rightBracket && start + 3 < this.to) {
                this.pos = start + 3;
                return this.p.value(B.cast, { fields: { TYPE: String(castType.value) }, inputs: { VALUE: { block: this.unary() } } });
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
            const call = this.operationCall();
            if (call) return call;
            this.pos++;
            const next = this.peek();
            if (!this.isChainContinuation()) return this.p.value(B.varGet, { fields: { NAME: String(t.value) } });
            if (next?.tt === TokenType.dot) return this.postfix(this.p.value(B.varGet, { fields: { NAME: String(t.value) } }), start);
            this.chain();
            return this.p.value(B.javaExpression, { fields: { CODE: this.p.sourceText(start, this.pos) } });
        }
        if (t.tt === TokenType.charLiteral || t.tt === TokenType.keywordNull || t.tt === TokenType.keywordThis
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
