/**
 * Blockmodus: weitere abstrakte Datentypen der Abiturklassen Niedersachsen – Stapel (Stack), Schlange (Queue)
 * und Binärbaum (BinTree). Gemeinsame Beschreibung für Blöcke, Parser, Generator, Typsystem und Struktogramm.
 * Ohne Abhängigkeit von Blockly. (Die dynamische Reihung steht als Sammlung in BlockCollections.)
 */
import { B } from "./BlockTypes";

export const ADT_CLASSES = ["Stack", "Queue", "BinTree"] as const;
export type AdtClass = typeof ADT_CLASSES[number];

export function isAdtClass(t: string | null | undefined): t is AdtClass {
    return !!t && (ADT_CLASSES as readonly string[]).includes(t);
}

/**
 * Inhaltstyp (22.11.2026, wie in den Ergänzenden Hinweisen): Stapel, Schlange, Binärbaum und dynamische
 * Reihung haben einen Inhaltstyp – Stack<Integer>, DynArray<String>. Datentypen als Text: "Stack<Integer>".
 */
const ADT_TYPE = /^(Stack|Queue|BinTree|DynArray)\s*(?:<\s*([\p{L}_$][\p{L}\p{N}_$]*)\s*>)?$/u;
const WRAP: Record<string, string> = { int: "Integer", double: "Double", boolean: "Boolean", char: "Character" };
const UNWRAP: Record<string, string> = Object.fromEntries(Object.entries(WRAP).map(([k, v]) => [v, k]));

/** Stack<Integer> -> { cls: "Stack", elem: "int" }; ohne Inhaltstyp: elem null */
export function adtTypeOf(t: string | null | undefined): { cls: AdtClass | "DynArray"; elem: string | null } | undefined {
    const m = t ? ADT_TYPE.exec(t.trim()) : null;
    return m ? { cls: m[1] as AdtClass | "DynArray", elem: m[2] ? UNWRAP[m[2]] ?? m[2] : null } : undefined;
}

/** Stapel, Schlange bzw. Binärbaum eines Datentyps (Stack<Integer> -> Stack) */
export function adtClassOf(t: string | null | undefined): AdtClass | undefined {
    const a = adtTypeOf(t);
    return a && a.cls !== "DynArray" ? a.cls : undefined;
}

/** Datentyp mit Inhaltstyp: ("Stack", "int") -> "Stack<Integer>" */
export function adtTypeName(cls: AdtClass | "DynArray", elem: string | null | undefined): string {
    const e = elem || "int";
    return `${cls}<${WRAP[e] ?? e}>`;
}

export const ADT_NAMES_DE: Record<AdtClass, string> = { Stack: "Stapel", Queue: "Schlange", BinTree: "Binärbaum" };
export const DEFAULT_ADT_NAME: Record<AdtClass, string> = { Stack: "stapel", Queue: "schlange", BinTree: "baum" };

/** Anlegen: Block -> Klasse */
export const ADT_CREATIONS: { block: string; cls: AdtClass }[] = [
    { block: B.stackNew, cls: "Stack" },
    { block: B.queueNew, cls: "Queue" },
    { block: B.treeNew, cls: "BinTree" },   // Eingang V (Inhalt) freiwillig
];

/** Anweisungen x.methode(eingänge…); */
export const ADT_CALLS: { block: string; cls: AdtClass; method: string; inputs: string[] }[] = [
    { block: B.stackPush, cls: "Stack", method: "push", inputs: ["V"] },
    { block: B.stackPop, cls: "Stack", method: "pop", inputs: [] },
    { block: B.queueEnqueue, cls: "Queue", method: "enqueue", inputs: ["V"] },
    { block: B.queueDequeue, cls: "Queue", method: "dequeue", inputs: [] },
    { block: B.treeSetItem, cls: "BinTree", method: "setItem", inputs: ["V"] },
];

/** Element lesen (Datentyp: der Inhaltstyp): Block, Feld OP -> Methode */
export const ADT_GETS: { block: string; cls: AdtClass; ops: [string, string][] }[] = [
    { block: B.stackGet, cls: "Stack", ops: [["oberstes Element von", "top"], ["entnimm oberstes Element von", "pop"]] },
    { block: B.queueGet, cls: "Queue", ops: [["erstes Element von", "head"], ["entnimm erstes Element von", "dequeue"]] },
    { block: B.treeItem, cls: "BinTree", ops: [["Inhalt von", "getItem"]] },
];

/** Binärbaum: Teilbaum setzen (Feld SIDE) */
export const TREE_SIDES: [string, string, string, string][] = [
    // [Anzeige, Wert, setzen, lesen]
    ["linken", "left", "setLeft", "getLeft"],
    ["rechten", "right", "setRight", "getRight"],
];

/**
 * Binärbaum: löschen (Feld WHAT). Die Abiturklasse kennt nur setEmpty (deleteLeft usw. gibt es dort nicht;
 * einen Teilbaum entfernt man mit setLeft(new BinTree())).
 */
export const TREE_DELETES: [string, string][] = [
    ["mache leer", "setEmpty"],
];

/** Binärbaum: Bedingungen (Feld TEST) – wie in der Abiturklasse (hasItem, hasLeft … gibt es dort nicht) */
export const TREE_TESTS: [string, string][] = [
    ["ist ein Blatt", "isLeaf"],
];

export const ADT_GET_TYPES = new Set<string>(ADT_GETS.map((g) => g.block));

export const ADT_BLOCK_TYPES = new Set<string>([
    ...ADT_CREATIONS.map((c) => c.block), ...ADT_CALLS.map((c) => c.block), ...ADT_GETS.map((g) => g.block),
    B.treeSetChild, B.treeDelete, B.treeChild, B.treeTest, B.adtIsEmpty,
]);

/** Lese-Methoden aller ADT (für den Parser) */
export function getOp(cls: AdtClass, method: string): { block: string } | undefined {
    const g = ADT_GETS.find((x) => x.cls === cls && x.ops.some(([, m]) => m === method));
    return g ? { block: g.block } : undefined;
}
