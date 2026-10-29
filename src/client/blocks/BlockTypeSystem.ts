import * as Blockly from "blockly/core";
import { FIGURE_BLOCK_TYPES, FIGURE_CREATIONS, FIGURE_OUTPUT_TYPES, figureInputType } from "./FigureSpec";
import { ADT_BLOCK_TYPES, ADT_CREATIONS, ADT_GET_TYPES } from "./AdtSpec";
import { B, COLLECTION_DECLARATIONS, COLLECTION_USES, isPartHat, PART_HATS, type Collections } from "./BlockTypes";
import { addMember, attributesOf, collectionOfType, collectionType, findConstructor, findMethod, isClassType, isScalar, isSubclass, methodsOf, typeInfo, type ClassInfo, type ClassMap } from "./ClassModel";

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

/** Datentyp als Text: int, double, String, boolean, char – und int[], ArrayList<Integer>, Hund … */
export type JType = string;
/** null = unbekannt bzw. beliebig */
export type TypeSet = JType[] | null;

/** Formen (Nummern wie im zelos-Renderer, 6–8 sind eigene) */
export const SHAPE = { HEXAGON: 1, ROUND: 2, SQUARE: 3, BEVEL: 6, WAVE: 7, OBJECT: 8 } as const;

const NUMERIC: JType[] = ["int", "double"];
const NUMERIC_OR_CHAR: JType[] = ["int", "double", "char"];

export const TYPE_NAMES: Record<string, string> = {
    int: "Ganzzahl", double: "Kommazahl", String: "Text", boolean: "Wahrheitswert", char: "Zeichen",
    Circle: "Kreis", Rectangle: "Rechteck", Text: "Textfigur", Sprite: "Sprite",
};
const PLURAL: Record<string, string> = {
    int: "Ganzzahlen", double: "Kommazahlen", String: "Texten", boolean: "Wahrheitswerten", char: "Zeichen",
    Circle: "Kreisen", Rectangle: "Rechtecken", Text: "Textfiguren", Sprite: "Sprites",
};

/** Beschriftung eines Datentyps (Auswahllisten, Hinweise) */
export function typeLabel(t: string): string {
    if (TYPE_NAMES[t]) return TYPE_NAMES[t];
    const info = typeInfo(t);
    const of = PLURAL[info.elem] ?? info.elem;
    switch (info.kind) {
        case "array": return `Reihung von ${of}`;
        case "array2d": return `zweidim. Reihung von ${of}`;
        case "list": return `Liste von ${of}`;
        case "dyn": return "dynamische Reihung";
    }
    const adt: Record<string, string> = { Stack: "Stapel", Queue: "Schlange", BinTree: "Binärbaum" };
    return adt[t] ?? t;
}

/** Was passt in eine Variable dieses Typs? (Ganzzahlen auch in Kommazahl-Variablen, Unterklassen in Oberklassen) */
export function acceptsForType(t: JType): JType[] | null {
    if (t === "double") return ["double", "int"];
    if (t === "Object") return null;
    if (isClassType(t) && activeClasses) {
        const subs = [...activeClasses.values()].filter((c) => isSubclass(activeClasses!, c.name, t)).map((c) => c.name);
        return [...new Set([t, ...subs])];
    }
    return [t];
}

export function shapeFor(types: TypeSet): number {
    if (!types || types.length === 0) return SHAPE.WAVE;
    if (types.every((t) => t === "boolean")) return SHAPE.HEXAGON;
    if (types.every((t) => t === "String")) return SHAPE.SQUARE;
    if (types.every((t) => t === "char")) return SHAPE.BEVEL;
    if (types.every((t) => t === "int" || t === "double" || t === "char")) return SHAPE.ROUND;
    if (types.every((t) => !isScalar(t))) return SHAPE.OBJECT;
    return SHAPE.WAVE;
}

export function compatible(a: TypeSet, b: TypeSet): boolean {
    if (!a || !b) return true;
    return a.some((t) => b.includes(t));
}

function describe(types: TypeSet): string {
    if (!types) return "ein beliebiger Wert";
    if (types.every((t) => t === "int" || t === "double")) return types.includes("double") ? "eine Zahl" : "eine Ganzzahl";
    return types.map((t) => typeLabel(t)).join(" oder ");
}

// ------------------------------------------------------------------ Klassen

/** Klassen aus anderen Dateien des Projekts (setzt die Blockansicht) */
let externalClasses: ClassInfo[] = [];
export function setExternalClasses(list: ClassInfo[]) {
    externalClasses = list;
}

/** während applyTypes: die Klassen nur einmal bestimmen */
let activeClasses: ClassMap | null = null;

/** Beschreibung einer Klasse aus ihrem Block */
export function classInfoFromBlock(c: Blockly.Block): ClassInfo {
    const info: ClassInfo = { name: String(c.getFieldValue("NAME") ?? ""), superName: String(c.getFieldValue("SUPER") ?? ""), attributes: [], constructors: [], methods: [] };
    for (let m = c.getInputTargetBlock("MEMBERS"); m; m = m.getNextBlock()) {
        const f: { [name: string]: string } = {};
        for (const name of ["VIS", "NAME", "TYPE", "RETURN"]) if (m.getField(name)) f[name] = String(m.getFieldValue(name) ?? "");
        addMember(info, m.type, f, methodParamsOf(m));
    }
    return info;
}

/** Alle bekannten Klassen: die dieser Datei (Blöcke) und die anderer Dateien */
export function classInfos(ws: Blockly.Workspace): ClassMap {
    if (activeClasses) return activeClasses;
    const result: ClassMap = new Map();
    for (const c of externalClasses) result.set(c.name, c);
    for (const b of mainWorkspace(ws).getTopBlocks(false)) {
        if (b.type !== B.class) continue;
        const info = classInfoFromBlock(b);
        if (info.name) result.set(info.name, info);
    }
    return result;
}

/** Klassenblock, in dem der Block steckt */
export function enclosingClass(b: Blockly.Block): Blockly.Block | null {
    const root = b.getRootBlock();
    return root.type === B.class ? root : null;
}

// ------------------------------------------------------------------ Variablen und Geltungsbereiche

/** Blöcke mit eigenen Variablen: Hauptprogramm, Operation, Konstruktor, Operation einer Klasse */
const SCOPE_ROOTS = new Set<string>([B.start, ...PART_HATS, B.method, B.ctor, B.classMethod]);

/** Ist der Block ein Hut (Hauptprogramm, Operation, Klasse)? */
export function isHat(b: Blockly.Block | null | undefined): boolean {
    return !!b && (b.type === B.start || isPartHat(b.type) || b.type === B.method || b.type === B.class);
}

/** Geltungsbereich eines Blocks (Operation, Konstruktor, Hauptprogramm; direkt in der Klasse: die Klasse) */
export function scopeRoot(b: Blockly.Block): Blockly.Block | null {
    for (let x: Blockly.Block | null = b; x; x = x.getParent()) if (SCOPE_ROOTS.has(x.type) || x.type === B.class) return x;
    return null;
}

/** der Block und alles in seinen Eingängen (ohne die folgenden Blöcke) */
export function innerBlocks(root: Blockly.Block): Blockly.Block[] {
    const result = [root];
    for (const input of root.inputList) {
        const t = input.connection?.targetBlock();
        if (t) result.push(...t.getDescendants(false));
    }
    return result;
}

/** Figur anlegen (Paket 8): Blocktyp -> Klasse der Figur */
const FIGURE_CLASS_OF: Record<string, string> = Object.fromEntries([...FIGURE_CREATIONS, ...ADT_CREATIONS].map((c) => [c.block, c.cls]));

/** Variablen mit Datentyp aus Blöcken; Namen mit verschiedenen Typen fallen heraus (Typ unklar) */
function variablesOf(blocks: Blockly.Block[]): Map<string, JType> {
    const result = new Map<string, JType>();
    const conflicts = new Set<string>();
    const add = (name: string, type: JType) => {
        if (!name) return;
        if (result.has(name) && result.get(name) !== type) conflicts.add(name);
        else result.set(name, type);
    };
    for (const b of blocks) {
        const kind = COLLECTION_DECLARATIONS[b.type];
        if (kind) add(String(b.getFieldValue("NAME") ?? ""), collectionType(kind, kind === "dyn" ? null : String(b.getFieldValue("TYPE") ?? "int")));
        else if (b.type === B.varDeclare || b.type === B.attribute) add(String(b.getFieldValue("NAME") ?? ""), String(b.getFieldValue("TYPE") ?? "int"));
        else if (FIGURE_CLASS_OF[b.type]) add(String(b.getFieldValue("NAME") ?? ""), FIGURE_CLASS_OF[b.type]);
        else if (b.type === B.for) add(String(b.getFieldValue("VAR") ?? ""), "int");
        else if (b.type === B.method || b.type === B.ctor || b.type === B.classMethod) for (const p of methodParamsOf(b)) add(p.name, p.type);
    }
    // für jedes Element: die Variable hat den Elementtyp (Zeilen zweidimensionaler Reihungen sind Reihungen)
    for (const b of blocks) {
        if (b.type !== B.forEach) continue;
        const c = collectionOfType(result.get(String(b.getFieldValue("LIST") ?? "")));
        const v = String(b.getFieldValue("VAR") ?? "");
        if (c?.kind === "array2d") add(v, `${c.elem}[]`);
        else if (c && c.kind !== "dyn" && c.elem) add(v, c.elem);
    }
    for (const c of conflicts) result.delete(c);
    return result;
}

/** Deklarierte Variablen der ganzen Arbeitsfläche mit Typ (für die Werkzeugleiste) */
export function collectVariables(ws: Blockly.Workspace): Map<string, JType> {
    return variablesOf(ws.getAllBlocks(true));
}

/** Variablen eines Geltungsbereichs; in Klassen samt Attributen (auch geerbten), lokale verdecken sie */
export function scopeVariables(root: Blockly.Block): Map<string, JType> {
    const cls = enclosingClass(root);
    const attributes = cls ? attributesOf(classInfos(root.workspace), String(cls.getFieldValue("NAME") ?? "")) : [];
    if (root.type === B.class) return new Map(attributes.map((a) => [a.name, a.type]));
    const own = variablesOf(innerBlocks(root));
    const result = new Map(attributes.map((a) => [a.name, a.type] as [string, string]));
    // Programmteile (wenn Taste …, wenn ich Nachricht … usw.): auch die Variablen des Hauptprogramms
    const start = isPartHat(root.type) ? root.workspace.getTopBlocks(false).find((b) => b.type === B.start) : undefined;
    if (start) for (const [k, v] of variablesOf(innerBlocks(start))) result.set(k, v);
    for (const [k, v] of own) result.set(k, v);
    return result;
}

/** Variablen, die für einen Block gelten (seines Geltungsbereichs; bei losen Blöcken alle) */
export function variablesFor(b: Blockly.Block): Map<string, JType> {
    const root = scopeRoot(b);
    return root ? scopeVariables(root) : collectVariables(mainWorkspace(b.workspace));
}

// ------------------------------------------------------------------ Reihungen und Listen

function onlyCollections(vars: Map<string, JType>): Collections {
    const result: Collections = new Map();
    for (const [name, type] of vars) {
        const c = collectionOfType(type);
        if (c) result.set(name, c);
    }
    return result;
}

/** Reihungen und Listen aus Blöcken: Name -> Art und Elementtyp */
export function collectionsOf(blocks: Blockly.Block[]): Collections {
    return onlyCollections(variablesOf(blocks));
}

/** Reihungen und Listen, die für einen Block gelten */
export function collectionsFor(b: Blockly.Block): Collections {
    return onlyCollections(variablesFor(b));
}

/** während applyTypes: Reihungen und Listen je Geltungsbereich nur einmal bestimmen */
let collectionCache: Map<Blockly.Block | null, Collections> | null = null;

function collectionNamed(b: Blockly.Block): { kind: string; elem: string | null } | undefined {
    const root = scopeRoot(b);
    let colls = collectionCache?.get(root);
    if (!colls) {
        colls = collectionsFor(b);
        collectionCache?.set(root, colls);
    }
    return colls.get(String(b.getFieldValue("NAME") ?? ""));
}

// ------------------------------------------------------------------ Operationen

export type Signature = { name: string; ret: string; params: { name: string; type: JType }[] };

/** Haupt-Arbeitsfläche (Blöcke der Werkzeugleiste gehören zur Arbeitsfläche daneben) */
export function mainWorkspace(ws: Blockly.Workspace): Blockly.Workspace {
    const svg = ws as Blockly.WorkspaceSvg;
    return svg.isFlyout && svg.targetWorkspace ? svg.targetWorkspace : ws;
}

/** Parameter eines Operation- bzw. Konstruktor-Blocks (Felder PNAME0/PTYPE0 …) */
export function methodParamsOf(b: Blockly.Block): { name: string; type: JType }[] {
    const result: { name: string; type: JType }[] = [];
    for (let i = 0; b.getField("PNAME" + i); i++) {
        result.push({ name: String(b.getFieldValue("PNAME" + i) ?? ""), type: String(b.getFieldValue("PTYPE" + i) ?? "int") });
    }
    return result;
}

/** Alle Operationen ohne Klasse (bei gleichem Namen zählt die erste) */
export function methodSignatures(ws: Blockly.Workspace): Map<string, Signature> {
    const result = new Map<string, Signature>();
    for (const b of mainWorkspace(ws).getTopBlocks(true)) {
        if (b.type !== B.method) continue;
        const name = String(b.getFieldValue("NAME") ?? "");
        if (name && !result.has(name)) result.set(name, { name, ret: String(b.getFieldValue("RETURN") ?? "void"), params: methodParamsOf(b) });
    }
    return result;
}

/**
 * Operationen, die ein Block ohne Objekt aufrufen kann: in einer Klasse die der Klasse (samt
 * geerbter), sonst die Operationen ohne Klasse.
 */
export function callSignatures(b: Blockly.Block): Map<string, Signature> {
    const cls = enclosingClass(b);
    if (!cls) return methodSignatures(b.workspace);
    const result = new Map<string, Signature>();
    for (const m of methodsOf(classInfos(b.workspace), String(cls.getFieldValue("NAME") ?? ""))) {
        if (!result.has(m.name)) result.set(m.name, { name: m.name, ret: m.ret, params: m.params });
    }
    return result;
}

/** Ergebnistyp der Operation, in der der Block steckt (undefined: Hauptprogramm oder lose) */
function enclosingReturnType(b: Blockly.Block): string | undefined {
    const root = scopeRoot(b);
    if (root?.type === B.method || root?.type === B.classMethod) return String(root.getFieldValue("RETURN") ?? "void");
    return root?.type === B.ctor || isPartHat(root?.type) ? "void" : undefined;
}

/** Klasse eines Objekt-Werts (Eingang OBJ) */
function objectClass(b: Blockly.Block, vars: Map<string, JType>, memo: Map<string, TypeSet>, input = "OBJ"): string | undefined {
    const o = b.getInputTargetBlock(input);
    const t = o ? outputType(o, vars, memo) : null;
    return t && t.length === 1 && isClassType(t[0]) ? t[0] : undefined;
}

/** Klasse des Objekts im Eingang OBJ (z. B. für Umbenennen) */
export function receiverClass(b: Blockly.Block): string | undefined {
    return objectClass(b, variablesFor(b), new Map());
}

/** Oberklasse der Klasse, in der der Block steckt */
function superOf(b: Blockly.Block): string | undefined {
    const cls = enclosingClass(b);
    const sup = cls ? String(cls.getFieldValue("SUPER") ?? "") : "";
    return sup || undefined;
}

/** Parameter, zu denen die Werte eines Aufrufs (ARG0 …) passen müssen */
export function callTarget(b: Blockly.Block, vars?: Map<string, JType>, memo = new Map<string, TypeSet>()): { params: { name: string; type: JType }[]; ret: string } | undefined {
    const classes = classInfos(b.workspace);
    const argc = (b as Blockly.Block & { state?: { args?: number } }).state?.args;
    const name = (f: string) => String(b.getFieldValue(f) ?? "");
    switch (b.type) {
        case B.call: case B.callExpr: return callSignatures(b).get(name("NAME"));
        case B.objNew: {
            const c = findConstructor(classes, name("CLASS"), argc);
            return c ? { params: c.params, ret: name("CLASS") } : undefined;
        }
        case B.objCall: case B.objCallExpr: return findMethod(classes, objectClass(b, vars ?? variablesFor(b), memo), name("METHOD"), argc);
        case B.superCall: {
            const c = findConstructor(classes, superOf(b), argc);
            return c ? { params: c.params, ret: "void" } : undefined;
        }
        case B.superMethodCall: case B.superMethodCallExpr: return findMethod(classes, superOf(b), name("METHOD"), argc);
    }
    return undefined;
}

// ------------------------------------------------------------------ Startwert beim Typwechsel

export type Literal = { type: string; fields: { [name: string]: string } };

/** Startwert für eine neue Variable dieses Typs */
export function defaultLiteral(t: JType): Literal {
    switch (t) {
        default: return { type: B.javaExpression, fields: { CODE: "null" } };   // Objekte, Reihungen, Listen
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
    if (!isScalar(t)) return fallback;
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
    if (!isScalar(t)) return;   // Reihungen, Listen, Objekte: Wert bleibt
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
        case B.callExpr: case B.objCallExpr: case B.superMethodCallExpr: {
            const target = callTarget(b, vars, memo);
            t = target && target.ret !== "void" ? [target.ret] : null;
            break;
        }
        case B.objNew: t = [String(b.getFieldValue("CLASS") ?? "Object")]; break;
        case B.thisValue: {
            const cls = enclosingClass(b);
            t = cls ? [String(cls.getFieldValue("NAME") ?? "")] : null;
            break;
        }
        case B.thisAttrGet: {
            const cls = enclosingClass(b);
            const a = cls ? attributesOf(classInfos(b.workspace), String(cls.getFieldValue("NAME") ?? "")).find((x) => x.name === b.getFieldValue("NAME")) : undefined;
            t = a ? [a.type] : null;
            break;
        }
        case B.objAttrGet: {
            const a = attributesOf(classInfos(b.workspace), objectClass(b, vars, memo)).find((x) => x.name === b.getFieldValue("ATTR"));
            t = a ? [a.type] : null;
            break;
        }
        case B.arrayGet: case B.array2dGet: case B.listGet: {
            const c = collectionNamed(b);
            t = c?.elem ? [c.elem as JType] : null;
            break;
        }
        case B.arrayLength: case B.array2dSize: case B.listSize: case B.dynLength: t = ["int"]; break;
        case B.listContains: case B.collIsEmpty: case B.dynIsEmpty: t = ["boolean"]; break;
        case B.dynGet: {
            const type = String(b.getFieldValue("TYPE") ?? "Object");
            t = type === "Object" ? null : [type as JType];
            break;
        }
        case B.javaExpression: t = null; break;
        case B.treeChild: t = ["BinTree"]; break;
        case B.treeTest: case B.adtIsEmpty: t = ["boolean"]; break;
        default:
            if (FIGURE_OUTPUT_TYPES[b.type]) t = [FIGURE_OUTPUT_TYPES[b.type] as JType];
            else if (ADT_GET_TYPES.has(b.type)) {
                const type = String(b.getFieldValue("TYPE") ?? "Object");
                t = type === "Object" ? null : [type as JType];
            }
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
            if (v === "int" || v === "double") return [...NUMERIC];
            if (v === "char") return ["int", "char"];
            return String(b.getFieldValue("OP")) === "-" ? [...NUMERIC] : null;   // Text: „erhöhe“ hängt beliebiges an
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
        case B.call: case B.callExpr: case B.objNew: case B.objCall: case B.objCallExpr:
        case B.superCall: case B.superMethodCall: case B.superMethodCallExpr: {
            const m = /^ARG(\d+)$/.exec(input);
            const p = m ? callTarget(b, vars, memo)?.params[Number(m[1])] : undefined;
            return p ? acceptsForType(p.type) : null;
        }
        case B.attribute: return acceptsForType(String(b.getFieldValue("TYPE") ?? "int"));
        case B.thisAttrSet: {
            const cls = enclosingClass(b);
            const a = cls ? attributesOf(classInfos(b.workspace), String(cls.getFieldValue("NAME") ?? "")).find((x) => x.name === b.getFieldValue("NAME")) : undefined;
            return a ? acceptsForType(a.type) : null;
        }
        case B.objAttrSet: {
            if (input !== "V") return null;
            const a = attributesOf(classInfos(b.workspace), objectClass(b, vars, memo)).find((x) => x.name === b.getFieldValue("ATTR"));
            return a ? acceptsForType(a.type) : null;
        }
        case B.return: {
            const ret = enclosingReturnType(b);
            return ret && ret !== "void" ? acceptsForType(ret as JType) : null;
        }
        case B.arrayNew: case B.array2dNew: return ["int"];
        case B.arrayValues: return acceptsForType(String(b.getFieldValue("TYPE") ?? "int") as JType);
    }
    if (FIGURE_BLOCK_TYPES.has(b.type)) return figureInputType(b.type, input) as TypeSet;
    if (ADT_BLOCK_TYPES.has(b.type)) return input === "T" ? ["BinTree"] : null;   // Inhalte: beliebige Werte (Object)
    if (COLLECTION_USES.includes(b.type)) {
        if (input !== "V") return ["int"];   // Position, Zeile, Spalte
        const c = collectionNamed(b);
        return c?.elem && c.kind !== "dyn" ? acceptsForType(c.elem as JType) : null;
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
export function applyTypes(ws: Blockly.Workspace, vars?: Map<string, JType>) {
    activeClasses = null;
    activeClasses = classInfos(ws);
    collectionCache = new Map();
    try {
        applyTypesNow(ws, vars ?? collectVariables(ws));
    } finally {
        collectionCache = null;
        activeClasses = null;
    }
}

function applyTypesNow(ws: Blockly.Workspace, vars: Map<string, JType>) {
    const memo = new Map<string, TypeSet>();
    const blocks = ws.getAllBlocks(false);
    const toRender = new Set<Blockly.Block>();
    // Variablen je Geltungsbereich (Hauptprogramm, Operation, Konstruktor; lose Blöcke: alle)
    const scopes = new Map<Blockly.Block, Map<string, JType>>();
    const varsFor = (b: Blockly.Block) => {
        const root = scopeRoot(b);
        if (!root) return vars;
        if (!scopes.has(root)) scopes.set(root, scopeVariables(root));
        return scopes.get(root)!;
    };

    // 1. gewünschte Typen bestimmen
    const outputs = new Map<Blockly.Block, TypeSet>();
    for (const b of blocks) if (b.outputConnection) outputs.set(b, outputType(b, varsFor(b), memo));
    const inputs: { block: Blockly.Block; input: Blockly.Input; wanted: TypeSet }[] = [];
    for (const b of blocks) {
        for (const input of b.inputList) {
            if (input.type !== Blockly.inputs.inputTypes.VALUE || !input.connection) continue;
            inputs.push({ block: b, input, wanted: inputType(b, input.name, varsFor(b), memo) });
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
    // gib zurück / beende passend zur Operation
    const note = (b: Blockly.Block, text: string) => {
        if (!mismatches.has(b)) mismatches.set(b, []);
        mismatches.get(b)!.push(text);
    };
    // Teile einer Klasse gehören direkt in eine Klasse, Anweisungen in eine Operation
    const MEMBERS = new Set<string>([B.attribute, B.ctor, B.classMethod]);
    for (const b of blocks) {
        const surround = b.getSurroundParent();
        const inClassBody = surround?.type === B.class;
        if (MEMBERS.has(b.type) && !inClassBody && !b.isInFlyout) note(b, "Gehört direkt in eine Klasse (Block „Klasse“).");
        else if (inClassBody && !MEMBERS.has(b.type) && b.previousConnection && ![B.comment, B.javaStatement, B.javaRaw].includes(b.type as never)) {
            note(b, "Anweisungen gehören in eine Operation oder einen Konstruktor der Klasse.");
        }
        if (b.type === B.superCall && scopeRoot(b)?.type !== B.ctor) note(b, "„super(…)“ steht am Anfang eines Konstruktors.");
    }
    // Programmteile: jede Taste nur einmal, Namen nicht doppelt
    const keyParts = blocks.filter((b) => b.type === B.keyStart && !b.isInFlyout);
    const parts = blocks.filter((b) => isPartHat(b.type) && !b.isInFlyout);
    const named = blocks.filter((b) => (isPartHat(b.type) || b.type === B.method) && !b.isInFlyout);
    for (const b of parts) {
        const key = String(b.getFieldValue("KEY") ?? "").toLowerCase(), name = String(b.getFieldValue("NAME") ?? "");
        const first = b.type === B.keyStart ? keyParts.find((o) => String(o.getFieldValue("KEY") ?? "").toLowerCase() === key) : undefined;
        if (first && first !== b) note(b, `Diese Taste startet schon „${first.getFieldValue("NAME")}“. Jede Taste darf nur einen Programmteil starten – bitte eine andere wählen.`);
        if (named.some((o) => o !== b && o.getFieldValue("NAME") === name)) note(b, `Den Namen „${name}“ gibt es schon (Programmteil oder Operation). Bitte einen anderen wählen.`);
    }
    for (const b of blocks) {
        if (b.type !== B.return && b.type !== B.returnVoid) continue;
        const root = scopeRoot(b) ?? b.getRootBlock();
        const ret = enclosingReturnType(b);
        if (b.type === B.return && root.type === B.start) note(b, "Das Hauptprogramm hat kein Ergebnis. Zum Beenden „beende die Operation“ nehmen.");
        else if (b.type === B.return && isPartHat(root.type)) note(b, "Ein Programmteil hat kein Ergebnis. Zum Beenden „beende die Operation“ nehmen.");
        else if (b.type === B.return && ret === "void") note(b, "Diese Operation liefert kein Ergebnis: oben einen Ergebnistyp wählen oder „beende die Operation“ nehmen.");
        else if (b.type === B.returnVoid && ret && ret !== "void") note(b, "Diese Operation muss ein Ergebnis liefern: „gib zurück“ nehmen.");
    }
    for (const b of blocks) {
        const text = mismatches.get(b);
        if ((b as Blockly.Block & { gsgTypeWarning?: string }).gsgTypeWarning !== (text?.join("\n") ?? undefined)) {
            (b as Blockly.Block & { gsgTypeWarning?: string }).gsgTypeWarning = text?.join("\n");
            if (b.rendered) b.setWarningText(text ? text.join("\n") : null, "typ");
        }
    }

    // Aufrufe: Parameternamen als Beschriftung (die Operation kann nach dem Aufruf geladen worden sein)
    for (const b of blocks) (b as Blockly.Block & { updateLabels?(): void }).updateLabels?.();

    for (const b of toRender) {
        const svg = b as Blockly.BlockSvg;
        if (svg.rendered && typeof svg.queueRender === "function") svg.queueRender();
    }
}

/** Gewünschte Form eines Lochs (für den Renderer; wird von applyTypes gesetzt) */
export function inputShape(input: Blockly.Input | null | undefined): number | undefined {
    return (input as (Blockly.Input & { gsgShape?: number }) | null | undefined)?.gsgShape;
}
