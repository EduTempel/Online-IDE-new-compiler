import { Lexer } from "../../compiler/java/lexer/Lexer";
import { TokenType } from "../../compiler/java/TokenType";
import { B, type BlockState, type WorkspaceState } from "./BlockTypes";
import type { LineRange } from "./JavaBlockParser";

/**
 * Blöcke -> Java. Arbeitet auf dem Speicherformat von Blockly (JSON), damit es auch ohne
 * Oberfläche getestet werden kann. Erzeugt wird nur, was am Programmstart hängt; lose Blöcke
 * gehören nicht zum Programm. Zu jedem Anweisungsblock werden die erzeugten Zeilen gemerkt.
 */

export const INDENT = "    ";

/** Bindungsstärke (kleiner = bindet stärker), wie in Java */
const enum Order { ATOMIC = 0, UNARY = 1, MULT = 2, ADD = 3, REL = 4, EQ = 5, AND = 6, OR = 7, NONE = 99 }

const BINARY_ORDER: { [op: string]: Order } = {
    "*": Order.MULT, "/": Order.MULT, "%": Order.MULT, "+": Order.ADD, "-": Order.ADD,
    "<": Order.REL, ">": Order.REL, "<=": Order.REL, ">=": Order.REL, "==": Order.EQ, "!=": Order.EQ,
    "&&": Order.AND, "||": Order.OR,
};

export type GeneratorResult = { code: string; ranges: LineRange[] };

export function escapeJavaString(s: string): string {
    return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
}

/** Bindungsstärke eines frei eingegebenen Java-Ausdrucks (Operatoren außerhalb von Klammern?) */
function rawOrder(code: string): Order {
    const trimmed = code.trim();
    if (trimmed === "") return Order.ATOMIC;
    let depth = 0;
    const tokens = new Lexer().lex(trimmed).tokens.filter((t) =>
        ![TokenType.space, TokenType.tab, TokenType.newline, TokenType.linefeed, TokenType.endofSourcecode, TokenType.comment].includes(t.tt));
    const operators = new Set([...[TokenType.or, TokenType.and, TokenType.OR, TokenType.XOR, TokenType.ampersand, TokenType.equal,
        TokenType.notEqual, TokenType.lower, TokenType.greater, TokenType.lowerOrEqual, TokenType.greaterOrEqual,
        TokenType.keywordInstanceof, TokenType.shiftLeft, TokenType.shiftRight, TokenType.shiftRightUnsigned,
        TokenType.plus, TokenType.minus, TokenType.multiplication, TokenType.division, TokenType.modulo,
        TokenType.ternaryOperator, TokenType.colon, TokenType.lambdaOperator, TokenType.assignment, TokenType.plusAssignment,
        TokenType.minusAssignment, TokenType.multiplicationAssignment, TokenType.divisionAssignment, TokenType.moduloAssignment]]);
    for (let i = 0; i < tokens.length; i++) {
        const tt = tokens[i].tt;
        if (tt === TokenType.leftBracket || tt === TokenType.leftSquareBracket || tt === TokenType.leftCurlyBracket) depth++;
        else if (tt === TokenType.rightBracket || tt === TokenType.rightSquareBracket || tt === TokenType.rightCurlyBracket) depth--;
        else if (depth === 0 && operators.has(tt) && i > 0) return Order.NONE;
    }
    return tokens[0]?.tt === TokenType.minus || tokens[0]?.tt === TokenType.not ? Order.UNARY : Order.ATOMIC;
}

export class JavaBlockGenerator {

    private lines: string[] = [];
    private repeatDepth = 0;
    private ranges: LineRange[] = [];

    static generate(state: WorkspaceState): GeneratorResult {
        return new JavaBlockGenerator().run(state);
    }

    run(state: WorkspaceState): GeneratorResult {
        const start = state.blocks?.blocks?.find((b) => b.type === B.start);
        this.statements(start?.inputs?.BODY?.block, "");
        return { code: this.lines.length ? this.lines.join("\n") + "\n" : "", ranges: this.ranges };
    }

    // ------------------------------------------------------------------ Anweisungen

    private statements(first: BlockState | undefined, indent: string) {
        for (let b = first; b; b = b.next?.block) this.statement(b, indent);
    }

    private emit(line: string) { this.lines.push(line); }

    private statement(b: BlockState, indent: string) {
        const startLine = this.lines.length + 1;
        const f = b.fields ?? {};
        switch (b.type) {
            case B.varDeclare: {
                const value = b.inputs?.VALUE?.block;
                this.emit(`${indent}${f.TYPE} ${f.NAME}${value ? " = " + this.value(value, Order.NONE) : ""};`);
                break;
            }
            case B.varSet:
                this.emit(`${indent}${f.NAME} = ${this.input(b, "VALUE", Order.NONE)};`);
                break;
            case B.varChange:
                this.emit(`${indent}${f.NAME} += ${this.input(b, "VALUE", Order.NONE)};`);
                break;
            case B.varSub:
                this.emit(`${indent}${f.NAME} -= ${this.input(b, "VALUE", Order.NONE)};`);
                break;
            case B.varInc:
                this.emit(`${indent}${f.NAME}++;`);
                break;
            case B.varDec:
                this.emit(`${indent}${f.NAME}--;`);
                break;
            case B.print: {
                // mehrere Werte: durch Leerzeichen getrennt (a + " " + b)
                const items = Math.max(1, b.extraState?.items ?? 1);
                const parts: string[] = [];
                for (let i = 0; i < items; i++) {
                    const v = b.inputs?.[i === 0 ? "VALUE" : "VALUE" + i]?.block;
                    if (items === 1) parts.push(v ? this.value(v, Order.NONE) : "");
                    else parts.push(v ? this.value(v, Order.ADD, i > 0) : '""');
                }
                this.emit(`${indent}${f.MODE === "print" ? "print" : "println"}(${parts.join(' + " " + ')});`);
                break;
            }
            case B.if:
                this.ifStatement(b, indent);
                break;
            case B.forever:
                this.emit(`${indent}while (true) {`);
                this.statements(b.inputs?.DO?.block, indent + INDENT);
                this.emit(`${indent}}`);
                break;
            case B.repeat: {
                // geschachtelte Wiederholungen brauchen verschiedene Zählvariablen
                this.repeatDepth++;
                const v = this.repeatDepth === 1 ? "durchlauf" : "durchlauf" + this.repeatDepth;
                this.emit(`${indent}for (int ${v} = 1; ${v} <= ${this.input(b, "TIMES", Order.NONE)}; ${v}++) {`);
                this.statements(b.inputs?.DO?.block, indent + INDENT);
                this.emit(`${indent}}`);
                this.repeatDepth--;
                break;
            }
            case B.wait:
                this.emit(`${indent}Thread.sleep(${this.input(b, "MS", Order.NONE)});`);
                break;
            case B.while:
                this.emit(`${indent}while (${this.input(b, "COND", Order.NONE)}) {`);
                this.statements(b.inputs?.DO?.block, indent + INDENT);
                this.emit(`${indent}}`);
                break;
            case B.for: {
                const v = f.VAR;
                const up = f.DIR !== "down";
                const incl = f.CMP !== "excl";
                const cmp = up ? (incl ? "<=" : "<") : (incl ? ">=" : ">");
                const stepBlock = b.inputs?.STEP?.block;
                const step = stepBlock ? this.value(stepBlock, Order.NONE) : "1";
                const update = step === "1" ? (up ? `${v}++` : `${v}--`) : `${v} ${up ? "+=" : "-="} ${step}`;
                this.emit(`${indent}for (int ${v} = ${this.input(b, "FROM", Order.NONE)}; ${v} ${cmp} ${this.input(b, "TO", Order.NONE)}; ${update}) {`);
                this.statements(b.inputs?.DO?.block, indent + INDENT);
                this.emit(`${indent}}`);
                break;
            }
            case B.comment:
                this.emit(`${indent}//${f.TEXT ? " " + f.TEXT : ""}`);
                break;
            case B.javaStatement:
                this.emit(`${indent}${f.CODE ?? ""}`);
                break;
            case B.javaRaw: {
                // erste Zeile einrücken, die weiteren behalten ihre ursprüngliche Einrückung
                const codeLines = (b.extraState?.code ?? "").split("\n");
                codeLines.forEach((l, i) => this.emit(i === 0 ? indent + l : l));
                break;
            }
            default:
                return;   // unbekannter Block: nichts erzeugen
        }
        if (b.id) this.ranges.push({ id: b.id, startLine, endLine: this.lines.length });
    }

    /** falls … sonst falls … sonst */
    private ifStatement(b: BlockState, indent: string) {
        const elseIfs = b.extraState?.elseIfs ?? 0;
        for (let i = 0; i <= elseIfs; i++) {
            const cond = i === 0 ? "COND" : "COND" + i;
            const body = i === 0 ? "DO" : "DO" + i;
            this.emit(`${indent}${i === 0 ? "if" : "} else if"} (${this.input(b, cond, Order.NONE)}) {`);
            this.statements(b.inputs?.[body]?.block, indent + INDENT);
        }
        if (b.extraState?.hasElse) {
            this.emit(`${indent}} else {`);
            this.statements(b.inputs?.ELSE?.block, indent + INDENT);
        }
        this.emit(`${indent}}`);
    }

    // ------------------------------------------------------------------ Ausdrücke

    private input(b: BlockState, name: string, outer: Order): string {
        const target = b.inputs?.[name]?.block;
        return target ? this.value(target, outer) : "";
    }

    /** Wert vor einem Methodenaufruf (s.length()): nur Einfaches ohne Klammern */
    private receiver(b: BlockState, name: string): string {
        const target = b.inputs?.[name]?.block;
        return target ? this.value(target, Order.ATOMIC, true) : '""';
    }

    /** Code eines Werte-Blocks, bei Bedarf in Klammern */
    private value(b: BlockState, outer: Order, rightOperand = false): string {
        const [code, order] = this.expression(b);
        const needsParens = order > outer || (rightOperand && order === outer && order !== Order.ATOMIC);
        return needsParens ? `(${code})` : code;
    }

    private expression(b: BlockState): [string, Order] {
        const f = b.fields ?? {};
        switch (b.type) {
            case B.number: {
                const n = (f.NUM ?? "0").trim() || "0";
                return [n, n.startsWith("-") ? Order.UNARY : Order.ATOMIC];
            }
            case B.text:
                return [`"${escapeJavaString(f.TEXT ?? "")}"`, Order.ATOMIC];
            case B.char: {
                const c = f.CHAR ?? " ";
                const escaped = ({ "'": "\\'", "\\": "\\\\", "\n": "\\n", "\t": "\\t", "\r": "\\r" } as Record<string, string>)[c] ?? c;
                return [`'${escaped}'`, Order.ATOMIC];
            }
            case B.bool:
                return [f.VALUE === "false" ? "false" : "true", Order.ATOMIC];
            case B.varGet:
                return [f.NAME ?? "", Order.ATOMIC];
            case B.arith:
            case B.compare:
            case B.logic: {
                const op = f.OP ?? "+";
                const order = BINARY_ORDER[op] ?? Order.NONE;
                const a = b.inputs?.A?.block, c = b.inputs?.B?.block;
                return [`${a ? this.value(a, order) : ""} ${op} ${c ? this.value(c, order, true) : ""}`, order];
            }
            case B.concat: {
                const a = b.inputs?.A?.block, c = b.inputs?.B?.block;
                return [`${a ? this.value(a, Order.ADD) : '""'} + ${c ? this.value(c, Order.ADD, true) : '""'}`, Order.ADD];
            }
            case B.not:
                return ["!" + this.input(b, "VALUE", Order.UNARY), Order.UNARY];
            case B.cast:
                return [`(${f.TYPE === "double" ? "double" : f.TYPE === "char" ? "char" : "int"}) ${this.input(b, "VALUE", Order.UNARY)}`, Order.UNARY];
            case B.minMax:
                return [`Math.${f.FUNC === "max" ? "max" : "min"}(${this.input(b, "A", Order.NONE)}, ${this.input(b, "B", Order.NONE)})`, Order.ATOMIC];
            case B.randomDouble:
                return ["Math.random()", Order.ATOMIC];
            case B.strLength:
                return [`${this.receiver(b, "TEXT")}.length()`, Order.ATOMIC];
            case B.strCharAt:
                return [`${this.receiver(b, "TEXT")}.charAt(${this.input(b, "INDEX", Order.NONE)})`, Order.ATOMIC];
            case B.strSubstring:
                return [`${this.receiver(b, "TEXT")}.substring(${this.input(b, "FROM", Order.NONE)}, ${this.input(b, "TO", Order.NONE)})`, Order.ATOMIC];
            case B.strEquals:
                return [`${this.receiver(b, "A")}.equals(${this.input(b, "B", Order.NONE)})`, Order.ATOMIC];
            case B.strContains:
                return [`${this.receiver(b, "A")}.contains(${this.input(b, "B", Order.NONE)})`, Order.ATOMIC];
            case B.strCompare:
                return [`${this.receiver(b, "A")}.compareTo(${this.input(b, "B", Order.NONE)})`, Order.ATOMIC];
            case B.strCase:
                return [`${this.receiver(b, "TEXT")}.${f.CASE === "lower" ? "toLowerCase" : "toUpperCase"}()`, Order.ATOMIC];
            case B.input:
                return [`Input.${f.METHOD ?? "readInt"}(${this.input(b, "PROMPT", Order.NONE)})`, Order.ATOMIC];
            case B.random:
                return [`Random.randint(${this.input(b, "FROM", Order.NONE)}, ${this.input(b, "TO", Order.NONE)})`, Order.ATOMIC];
            case B.math:
                return [`Math.${f.FUNC ?? "sqrt"}(${this.input(b, "VALUE", Order.NONE)})`, Order.ATOMIC];
            case B.javaExpression: {
                const code = f.CODE ?? "";
                return [code, rawOrder(code)];
            }
        }
        return ["", Order.ATOMIC];
    }
}
