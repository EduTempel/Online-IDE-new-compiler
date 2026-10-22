import * as Blockly from "blockly/core";
import { B } from "./BlockTypes";

/**
 * Datentypen der Blöcke: Jeder Werte-Block hat einen Typ, jedes Loch nimmt nur passende Typen
 * an. Die Form zeigt den Typ:
 *
 *   Zahl (int, double)       rund
 *   Text (String)            eckig
 *   Wahrheitswert (boolean)  Sechseck
 *   Zeichen (char)           abgeschrägte Ecken
 *   offen / mehrere möglich  Wellenform – passt sich an, sobald ein Block darin steckt
 *
 * Die Typen werden nach jeder Änderung für die ganze Arbeitsfläche neu bestimmt (Variablen
 * bekommen den Typ ihrer Deklaration, "+" wird bei Text zu Text usw.). Passt ein bereits
 * eingesteckter Block nicht (z. B. aus dem Java-Code übernommen), wird er nicht herausgeworfen;
 * das Loch bleibt offen und der Block bekommt einen Hinweis.
 */

export type JType = "int" | "double" | "String" | "boolean" | "char";
/** null = unbekannt bzw. beliebig */
export type TypeSet = JType[] | null;

/** Formen (Nummern wie im zelos-Renderer, 6 und 7 sind eigene) */
export const SHAPE = { HEXAGON: 1, ROUND: 2, SQUARE: 3, BEVEL: 6, WAVE: 7 } as const;

const NUMERIC: JType[] = ["int", "double"];
const NUMERIC_OR_CHAR: JType[] = ["int", "double", "char"];

export const TYPE_NAMES: Record<JType, string> = {
    int: "Ganzzahl (int)", double: "Kommazahl (double)", String: "Text (String)", boolean: "Wahrheitswert (boolean)", char: "Zeichen (char)",
};

/** Was passt in eine Variable dieses Typs? (Ganzzahlen auch in Kommazahl-Variablen) */
export function acceptsForType(t: JType): JType[] {
    return t === "double" ? ["double", "int"] : [t];
}

export function shapeFor(types: TypeSet): number {
    if (!types || types.length === 0) return SHAPE.WAVE;
    if (types.every((t) => t === "boolean")) return SHAPE.HEXAGON;
    if (types.every((t) => t === "String")) return SHAPE.SQUARE;
    if (types.every((t) => t === "char")) return SHAPE.BEVEL;
    if (types.every((t) => t === "int" || t === "double" || t === "char")) return SHAPE.ROUND;
    return SHAPE.WAVE;
}

export function compatible(a: TypeSet, b: TypeSet): boolean {
    if (!a || !b) return true;
    return a.some((t) => b.includes(t));
}

function describe(types: TypeSet): string {
    if (!types) return "ein beliebiger Wert";
    if (types.every((t) => t === "int" || t === "double")) return types.includes("double") ? "eine Zahl" : "eine Ganzzahl (int)";
    return types.map((t) => TYPE_NAMES[t]).join(" oder ");
}

// ------------------------------------------------------------------ Variablen

/** Deklarierte Variablen der Arbeitsfläche mit Typ (Variablen-Blöcke und Zählschleifen) */
export function collectVariables(ws: Blockly.Workspace): Map<string, JType> {
    const result = new Map<string, JType>();
    const conflicts = new Set<string>();
    const add = (name: string, type: JType) => {
        if (!name) return;
        if (result.has(name) && result.get(name) !== type) conflicts.add(name);
        else result.set(name, type);
    };
    for (const b of ws.getAllBlocks(true)) {
        if (b.type === B.varDeclare) add(String(b.getFieldValue("NAME") ?? ""), b.getFieldValue("TYPE") as JType);
        else if (b.type === B.for) add(String(b.getFieldValue("VAR") ?? ""), "int");
    }
    for (const c of conflicts) result.delete(c);
    return result;
}

// ------------------------------------------------------------------ Startwert beim Typwechsel

export type Literal = { type: string; fields: { [name: string]: string } };

/** Startwert für eine neue Variable dieses Typs */
export function defaultLiteral(t: JType): Literal {
    switch (t) {
        case "int": return { type: B.number, fields: { NUM: "0" } };
        case "double": return { type: B.number, fields: { NUM: "0.0" } };
        case "String": return { type: B.text, fields: { TEXT: "" } };
        case "boolean": return { type: B.bool, fields: { VALUE: "false" } };
        case "char": return { type: B.char, fields: { CHAR: "a" } };
    }
}

/** Einfacher Wert als Text: 5, "Ada", true, 'x' -> "5", "Ada", "true", "x"; sonst null */
function literalText(b: Blockly.Block): string | null {
    switch (b.type) {
        case B.number: return String(b.getFieldValue("NUM"));
        case B.text: return String(b.getFieldValue("TEXT"));
        case B.bool: return String(b.getFieldValue("VALUE"));
        case B.char: return String(b.getFieldValue("CHAR"));
    }
    return null;
}

/**
 * Wert zum neuen Typ umwandeln, soweit sinnvoll (5 -> 5.0 -> "5.0"; "12" -> 12; "Ada" -> 'A'),
 * sonst der Startwert des Typs.
 */
export function convertLiteral(oldText: string | null, t: JType): Literal {
    const fallback = defaultLiteral(t);
    if (oldText === null) return fallback;
    const s = oldText.trim();
    const num = /^-?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?[dDfFlL]?$/.test(s) ? Number(s.replace(/[dDfFlL]$/, "")) : NaN;
    switch (t) {
        case "int": return Number.isFinite(num) ? { type: B.number, fields: { NUM: String(Math.trunc(num)) } } : fallback;
        case "double": {
            if (!Number.isFinite(num)) return fallback;
            const text = s.replace(/[dDfFlL]$/, "");
            return { type: B.number, fields: { NUM: /[.eE]/.test(text) ? text : text + ".0" } };
        }
        case "String": return { type: B.text, fields: { TEXT: oldText } };
        case "boolean": return s === "true" || s === "false" ? { type: B.bool, fields: { VALUE: s } } : fallback;
        case "char": return oldText.length > 0 ? { type: B.char, fields: { CHAR: [...oldText][0] } } : fallback;
    }
}

/**
 * Datentyp im Block "erstelle neue Variable" gewechselt: steckt ein einfacher Wert (Zahl, Text,
 * wahr/falsch, Zeichen) oder nichts im Wert-Loch, wird er durch einen passenden ersetzt.
 * Ausdrücke (Rechnungen, Eingaben, Variablen) bleiben unverändert.
 */
export function adaptDeclarationValue(declaration: Blockly.Block, t: JType) {
    const input = declaration.getInput("VALUE");
    if (!input?.connection) return;
    const child = declaration.getInputTargetBlock("VALUE");
    const old = child ? literalText(child) : null;
    if (child && old === null) return;
    const literal = convertLiteral(old, t);
    if (child && child.type === literal.type && Object.entries(literal.fields).every(([k, v]) => child.getFieldValue(k) === v)) return;
    child?.dispose(false);
    const ws = declaration.workspace;
    const block = ws.newBlock(literal.type);
    for (const [k, v] of Object.entries(literal.fields)) block.setFieldValue(v, k);
    const svg = block as Blockly.BlockSvg;
    if (ws.rendered && typeof svg.initSvg === "function") {
        svg.initSvg();
        svg.render();
    }
    // Typen erst setzen, damit Blockly den neuen Wert nicht wegen alter Prüfungen ablehnt
    applyTypes(ws);
    input.connection.connect(block.outputConnection!);
}

// ------------------------------------------------------------------ Typen bestimmen

function numberLiteralType(text: string): JType {
    const s = text.trim();
    return /[.eE]|[dDfF]$/.test(s) ? "double" : "int";
}

/** Typ, den ein Werte-Block liefert */
export function outputType(b: Blockly.Block, vars: Map<string, JType>, memo = new Map<string, TypeSet>()): TypeSet {
    if (memo.has(b.id)) return memo.get(b.id)!;
    memo.set(b.id, null);   // Schutz vor Zyklen
    const child = (name: string) => {
        const c = b.getInputTargetBlock(name);
        return c ? outputType(c, vars, memo) : null;
    };
    let t: TypeSet = null;
    switch (b.type) {
        case B.number: t = [numberLiteralType(String(b.getFieldValue("NUM") ?? "0"))]; break;
        case B.text: t = ["String"]; break;
        case B.char: t = ["char"]; break;
        case B.bool: case B.compare: case B.logic: case B.not: t = ["boolean"]; break;
        case B.varGet: {
            const v = vars.get(String(b.getFieldValue("NAME") ?? ""));
            t = v ? [v] : null;
            break;
        }
        case B.input: {
            const m = String(b.getFieldValue("METHOD"));
            t = [({ readInt: "int", readDouble: "double", readString: "String", readBoolean: "boolean", readChar: "char" } as Record<string, JType>)[m] ?? "int"];
            break;
        }
        case B.random: t = ["int"]; break;
        case B.randomDouble: t = ["double"]; break;
        case B.minMax: {
            const a = child("A"), c = child("B");
            t = a?.includes("double") || c?.includes("double") ? ["double"] : a && c ? ["int"] : [...NUMERIC];
            break;
        }
        case B.cast: t = [String(b.getFieldValue("TYPE")) as JType]; break;
        case B.concat: case B.strSubstring: case B.strCase: t = ["String"]; break;
        case B.strLength: case B.strCompare: t = ["int"]; break;
        case B.strCharAt: t = ["char"]; break;
        case B.strEquals: case B.strContains: t = ["boolean"]; break;
        case B.math: {
            const f = String(b.getFieldValue("FUNC"));
            if (f === "sqrt") t = ["double"];
            else if (f === "round") t = ["int"];
            else {
                const v = child("VALUE");
                t = v && v.length === 1 && (v[0] === "int" || v[0] === "double") ? v : [...NUMERIC];
            }
            break;
        }
        case B.arith: {
            const op = String(b.getFieldValue("OP"));
            const a = child("A"), c = child("B");
            const isText = (x: TypeSet) => !!x && x.length === 1 && x[0] === "String";
            if (op === "+" && (isText(a) || isText(c))) t = ["String"];
            else if (op === "+" && (!a || !c) && (b.getInputTargetBlock("A") || b.getInputTargetBlock("B"))) {
                // ein Teil unbekannt (z. B. freier Java-Ausdruck): kann Zahl oder Text sein
                t = a?.includes("double") || c?.includes("double") ? ["double", "String"] : null;
            } else if (a?.includes("double") || c?.includes("double")) t = ["double"];
            else if (a && c && a.every((x) => x === "int" || x === "char") && c.every((x) => x === "int" || x === "char")) t = ["int"];
            else t = [...NUMERIC];
            break;
        }
        case B.javaExpression: t = null; break;
    }
    memo.set(b.id, t);
    return t;
}

/** Was in das Loch `input` des Blocks passt */
export function inputType(b: Blockly.Block, input: string, vars: Map<string, JType>, memo: Map<string, TypeSet>): TypeSet {
    const varType = (field: string) => vars.get(String(b.getFieldValue(field) ?? ""));
    switch (b.type) {
        case B.varDeclare: return acceptsForType(b.getFieldValue("TYPE") as JType);
        case B.varSet: {
            const v = varType("NAME");
            return v ? acceptsForType(v) : null;
        }
        case B.varSub: {
            const v = varType("NAME");
            return v === "int" || v === "double" ? [...NUMERIC] : v === "char" ? ["int", "char"] : null;
        }
        case B.varChange: {
            const v = varType("NAME");
            return v === "int" || v === "double" ? [...NUMERIC] : v === "char" ? ["int", "char"] : null;   // Text += beliebig
        }
        case B.print: return null;
        case B.if: case B.while: return ["boolean"];
        case B.repeat: return ["int"];
        case B.for: return input === "TO" ? [...NUMERIC_OR_CHAR] : ["int"];
        case B.wait: return ["int"];
        case B.minMax: return [...NUMERIC];
        case B.cast: {
            const target = String(b.getFieldValue("TYPE"));
            return target === "char" ? ["int", "char"] : [...NUMERIC_OR_CHAR];
        }
        case B.concat: return null;
        case B.strLength: case B.strCase: return ["String"];
        case B.strCharAt: return input === "INDEX" ? ["int"] : ["String"];
        case B.strSubstring: return input === "TEXT" ? ["String"] : ["int"];
        case B.strEquals: case B.strContains: case B.strCompare: return ["String"];
        case B.logic: case B.not: return ["boolean"];
        case B.compare: {
            const op = String(b.getFieldValue("OP"));
            if (op !== "==" && op !== "!=") return [...NUMERIC_OR_CHAR];
            // gleich/ungleich: die andere Seite gibt die Art vor (Zahl mit Zahl, Text mit Text …)
            const other = b.getInputTargetBlock(input === "A" ? "B" : "A");
            const o = other ? outputType(other, vars, memo) : null;
            if (!o) return null;
            if (o.every((t) => t === "int" || t === "double" || t === "char")) return [...NUMERIC_OR_CHAR];
            if (o.every((t) => t === "boolean")) return ["boolean"];
            if (o.every((t) => t === "String")) return ["String"];
            return null;
        }
        case B.arith: return String(b.getFieldValue("OP")) === "+" ? null : [...NUMERIC_OR_CHAR];
        case B.input: return ["String"];
        case B.random: return ["int"];
        case B.math: return [...NUMERIC];
    }
    return null;
}

// ------------------------------------------------------------------ Anwenden

const sameTypes = (a: TypeSet | undefined, b: TypeSet | undefined) =>
    (a ?? null) === (b ?? null) || (!!a && !!b && a.length === b.length && a.every((t, i) => t === b[i]));

/**
 * Typen, Lochformen und Blockformen auf der Arbeitsfläche setzen. `vars` kommt bei der
 * Werkzeugleiste (Flyout) von der Haupt-Arbeitsfläche.
 */
export function applyTypes(ws: Blockly.Workspace, vars: Map<string, JType> = collectVariables(ws)) {
    const memo = new Map<string, TypeSet>();
    const blocks = ws.getAllBlocks(false);
    const toRender = new Set<Blockly.Block>();

    // 1. gewünschte Typen bestimmen
    const outputs = new Map<Blockly.Block, TypeSet>();
    for (const b of blocks) if (b.outputConnection) outputs.set(b, outputType(b, vars, memo));
    const inputs: { block: Blockly.Block; input: Blockly.Input; wanted: TypeSet }[] = [];
    for (const b of blocks) {
        for (const input of b.inputList) {
            if (input.type !== Blockly.inputs.inputTypes.VALUE || !input.connection) continue;
            inputs.push({ block: b, input, wanted: inputType(b, input.name, vars, memo) });
        }
    }

    // 2. Löcher erst öffnen (sonst wirft Blockly beim Ändern der Ausgaben Blöcke heraus) …
    for (const { input } of inputs) if (input.connection!.getCheck() !== null) input.connection!.setCheck(null);
    // … dann die Ausgaben setzen …
    for (const [b, t] of outputs) {
        if (!sameTypes(b.outputConnection!.getCheck() as TypeSet, t)) b.outputConnection!.setCheck(t);
        const shape = shapeFor(t);
        if (b.getOutputShape() !== shape) {
            b.setOutputShape(shape);
            toRender.add(b);
            const parent = b.getParent();
            if (parent) toRender.add(parent);
        }
    }
    // … und zuletzt die Löcher wieder schließen, soweit der eingesteckte Block passt
    const mismatches = new Map<Blockly.Block, string[]>();
    for (const { block, input, wanted } of inputs) {
        const child = input.connection!.targetBlock();
        const childType = child ? outputs.get(child) ?? null : null;
        if (child && !compatible(wanted, childType)) {
            if (!mismatches.has(block)) mismatches.set(block, []);
            mismatches.get(block)!.push(`Hier passt ${describe(wanted)} hinein, nicht ${describe(childType)}.`);
            continue;   // offen lassen, nichts herauswerfen
        }
        const before = (input as Blockly.Input & { gsgShape?: number }).gsgShape;
        input.connection!.setCheck(wanted);
        const shape = shapeFor(wanted);
        if (before !== shape) {
            (input as Blockly.Input & { gsgShape?: number }).gsgShape = shape;
            toRender.add(block);
        }
    }
    // Texte mit == vergleichen ist in Java ein häufiger Fehler
    for (const b of blocks) {
        if (b.type !== B.compare || !["==", "!="].includes(String(b.getFieldValue("OP")))) continue;
        const a = b.getInputTargetBlock("A"), c = b.getInputTargetBlock("B");
        const isText = (x: Blockly.Block | null) => !!x && sameTypes(outputs.get(x), ["String"]);
        if (isText(a) && isText(c)) {
            if (!mismatches.has(b)) mismatches.set(b, []);
            mismatches.get(b)!.push("Texte bitte mit dem Block „ist gleich“ vergleichen (.equals) – == prüft nur, ob es dasselbe Objekt ist.");
        }
    }
    for (const b of blocks) {
        const text = mismatches.get(b);
        if ((b as Blockly.Block & { gsgTypeWarning?: string }).gsgTypeWarning !== (text?.join("\n") ?? undefined)) {
            (b as Blockly.Block & { gsgTypeWarning?: string }).gsgTypeWarning = text?.join("\n");
            if (b.rendered) b.setWarningText(text ? text.join("\n") : null, "typ");
        }
    }

    for (const b of toRender) {
        const svg = b as Blockly.BlockSvg;
        if (svg.rendered && typeof svg.queueRender === "function") svg.queueRender();
    }
}

/** Gewünschte Form eines Lochs (für den Renderer; wird von applyTypes gesetzt) */
export function inputShape(input: Blockly.Input | null | undefined): number | undefined {
    return (input as (Blockly.Input & { gsgShape?: number }) | null | undefined)?.gsgShape;
}
