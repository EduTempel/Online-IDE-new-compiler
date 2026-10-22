import * as Blockly from "blockly/core";
import { B } from "./BlockTypes";
import { collectVariables, variablesFor } from "./BlockTypeSystem";
import {
    ADT_CLASSES, ADT_GETS, ADT_NAMES_DE, DEFAULT_ADT_NAME, isAdtClass, READ_TYPES, TREE_SIDES,
    type AdtClass,
} from "./AdtSpec";

/**
 * Blockmodus, Kategorie "ADT": Stapel, Schlange und Binärbaum der Abiturklassen Niedersachsen
 * (die dynamische Reihung steht in BlockCollections). Auswahl über den Namen wie bei Reihungen.
 */

/** Auswahl eines Stapels, einer Schlange bzw. eines Binärbaums */
export class FieldAdtName extends Blockly.FieldDropdown {
    static override fromJson(options: Blockly.FieldDropdownFromJsonConfig) {
        const o = options as { text?: string; kinds?: AdtClass[] };
        return new FieldAdtName(String(o.text ?? "stapel"), o.kinds ?? [...ADT_CLASSES]);
    }

    constructor(value: string, private kinds: AdtClass[]) {
        super(function (this: FieldAdtName) { return this.adtOptions(); } as unknown as Blockly.MenuGenerator);
        this.setValue(value);
    }

    private adtOptions(): [string, string][] {
        const kinds = this.kinds ?? [...ADT_CLASSES];
        const block = this.getSourceBlock();
        const names = new Set<string>();
        if (block) for (const [name, type] of variablesFor(block)) if (isAdtClass(type) && kinds.includes(type)) names.add(name);
        const current = this.getValue();
        if (typeof current === "string" && current) names.add(current);
        if (names.size === 0) names.add(DEFAULT_ADT_NAME[kinds[0]]);
        return [...names].sort((a, b) => a.localeCompare(b, "de")).map((n) => [n, n]);
    }

    protected override doClassValidation_(newValue?: unknown): string | null {
        return typeof newValue === "string" && /^[\p{L}_$][\p{L}\p{N}_$]*$/u.test(newValue) ? newValue : null;
    }

    protected override doValueUpdate_(newValue: string) {
        super.doValueUpdate_(newValue);
        this.getOptions(false);
        super.doValueUpdate_(newValue);
    }
}

const hint = (text: string) => ({ type: "field_label", text, class: "gsg-java-hint" });
const value = (name: string) => ({ type: "input_value", name });
const statement = { previousStatement: null, nextStatement: null };
const adt = (kinds: AdtClass[], name = "NAME") => ({ type: "field_gsg_adt", name, text: DEFAULT_ADT_NAME[kinds[0]], kinds });
const readType = { type: "field_dropdown", name: "TYPE", options: READ_TYPES };
const STACK: AdtClass[] = ["Stack"], QUEUE: AdtClass[] = ["Queue"], TREE: AdtClass[] = ["BinTree"];

export function defineAdtBlocks(defineJson: (json: object[]) => void, colour: string) {
    Blockly.fieldRegistry.register("field_gsg_adt", FieldAdtName as unknown as Blockly.fieldRegistry.RegistrableField);
    const c = { colour, inputsInline: true };
    const nameField = (cls: AdtClass) => ({ type: "field_input", name: "NAME", text: DEFAULT_ADT_NAME[cls] });
    const ops = (cls: AdtClass) => ADT_GETS.find((g) => g.cls === cls)!.ops;
    const readTip = " Zum Rechnen „als Ganzzahl“ usw. wählen – in Java z. B. (int) stapel.top()";
    defineJson([
        // ------------------------------------------------------------ Stapel
        {
            type: B.stackNew, message0: "erstelle neuen Stapel %1 %2", args0: [nameField("Stack"), hint("new Stack()")],
            ...statement, ...c, extensions: ["gsg_identifier"],
            tooltip: "Legt einen leeren Stapel an (Stack der Abiturklassen Niedersachsen): wer zuletzt kommt, kommt zuerst dran.",
        },
        {
            type: B.stackPush, message0: "lege %1 auf Stapel %2 %3", args0: [value("V"), adt(STACK), hint(".push")],
            ...statement, ...c, tooltip: "Legt ein Element oben auf den Stapel.",
        },
        {
            type: B.stackPop, message0: "entferne oberstes Element von Stapel %1 %2", args0: [adt(STACK), hint(".pop()")],
            ...statement, ...c, tooltip: "Nimmt das oberste Element weg (ohne es zu benutzen).",
        },
        {
            type: B.stackGet, message0: "%1 Stapel %2 %3 %4",
            args0: [{ type: "field_dropdown", name: "OP", options: ops("Stack") }, adt(STACK), readType, hint(".top()")],
            output: null, ...c,
            tooltip: "„oberstes Element“: nur ansehen. „entnimm“: ansehen und vom Stapel nehmen." + readTip,
        },
        // ------------------------------------------------------------ Schlange
        {
            type: B.queueNew, message0: "erstelle neue Schlange %1 %2", args0: [nameField("Queue"), hint("new Queue()")],
            ...statement, ...c, extensions: ["gsg_identifier"],
            tooltip: "Legt eine leere Schlange an (Queue der Abiturklassen Niedersachsen): wer zuerst kommt, kommt zuerst dran.",
        },
        {
            type: B.queueEnqueue, message0: "hänge %1 an Schlange %2 an %3", args0: [value("V"), adt(QUEUE), hint(".enqueue")],
            ...statement, ...c, tooltip: "Stellt ein Element hinten an die Schlange.",
        },
        {
            type: B.queueDequeue, message0: "entferne erstes Element aus Schlange %1 %2", args0: [adt(QUEUE), hint(".dequeue()")],
            ...statement, ...c, tooltip: "Nimmt das vorderste Element weg (ohne es zu benutzen).",
        },
        {
            type: B.queueGet, message0: "%1 Schlange %2 %3 %4",
            args0: [{ type: "field_dropdown", name: "OP", options: ops("Queue") }, adt(QUEUE), readType, hint(".head()")],
            output: null, ...c,
            tooltip: "„erstes Element“: nur ansehen. „entnimm“: ansehen und aus der Schlange nehmen." + readTip,
        },
        // ------------------------------------------------------------ Binärbaum
        {
            type: B.treeNew, message0: "erstelle neuen Binärbaum %1 mit Inhalt %2 %3", args0: [nameField("BinTree"), value("V"), hint("new BinTree")],
            ...statement, ...c, extensions: ["gsg_identifier"],
            tooltip: "Legt einen Binärbaum an (BinTree der Abiturklassen Niedersachsen). Ohne Inhalt: ein leerer Baum.",
        },
        {
            type: B.treeSetItem, message0: "setze Inhalt von Binärbaum %1 auf %2 %3", args0: [adt(TREE), value("V"), hint(".setItem")],
            ...statement, ...c, tooltip: "Ändert den Inhalt der Wurzel.",
        },
        {
            type: B.treeItem, message0: "%1 Binärbaum %2 %3 %4",
            args0: [{ type: "field_dropdown", name: "OP", options: ops("BinTree") }, adt(TREE), readType, hint(".getItem()")],
            output: null, ...c, tooltip: "Der Inhalt der Wurzel." + readTip.replace("stapel.top()", "baum.getItem()"),
        },
        {
            type: B.treeSetChild, message0: "setze %1 Teilbaum von %2 auf %3 %4",
            args0: [{ type: "field_dropdown", name: "SIDE", options: TREE_SIDES.map(([l, v]) => [l, v]) }, adt(TREE), value("T"), hint(".setLeft")],
            ...statement, ...c, tooltip: "Hängt einen anderen Binärbaum links bzw. rechts an. Entfernen: einen leeren Binärbaum anhängen.",
        },
        {
            type: B.treeChild, message0: "%1 Teilbaum von %2 %3",
            args0: [{ type: "field_dropdown", name: "SIDE", options: [["linker", "left"], ["rechter", "right"]] }, adt(TREE), hint(".getLeft()")],
            output: null, ...c, tooltip: "Der linke bzw. rechte Teilbaum (selbst wieder ein Binärbaum) – z. B. für Rekursion.",
        },
        {
            type: B.treeDelete, message0: "mache Binärbaum %1 leer %2",
            args0: [adt(TREE), hint(".setEmpty()")],
            ...statement, ...c, tooltip: "Macht den Baum leer (ohne Inhalt und Teilbäume).",
        },
        {
            type: B.treeTest, message0: "Binärbaum %1 ist ein Blatt %2",
            args0: [adt(TREE), hint(".isLeaf()")],
            output: null, ...c, tooltip: "Ein Blatt hat einen Inhalt, aber keine (nicht leeren) Teilbäume.",
        },
        {
            type: B.adtIsEmpty, message0: "%1 ist leer %2", args0: [adt([...ADT_CLASSES]), hint(".isEmpty()")],
            output: null, ...c, tooltip: "Wahr, wenn der Stapel, die Schlange bzw. der Binärbaum leer ist.",
        },
    ]);
}

// ------------------------------------------------------------------ Werkzeugleiste

const num = (n: string) => ({ block: { type: B.number, fields: { NUM: n } } });

function firstOf(ws: Blockly.WorkspaceSvg, cls: AdtClass): string {
    const names = [...collectVariables(ws)].filter(([, t]) => t === cls).map(([n]) => n).sort((a, b) => a.localeCompare(b, "de"));
    return names[0] ?? DEFAULT_ADT_NAME[cls];
}

/** Einträge für Stapel, Schlange und Binärbaum in der Kategorie "ADT" */
export function adtExtraItems(ws: Blockly.WorkspaceSvg): object[] {
    const s = firstOf(ws, "Stack"), q = firstOf(ws, "Queue"), b = firstOf(ws, "BinTree");
    return [
        { kind: "label", text: `${ADT_NAMES_DE.Stack} (Stack): das zuletzt Hineingelegte kommt zuerst wieder heraus.` },
        { kind: "block", type: B.stackNew, fields: { NAME: "stapel" } },
        { kind: "block", type: B.stackPush, fields: { NAME: s }, inputs: { V: num("1") } },
        { kind: "block", type: B.stackGet, fields: { OP: "top", NAME: s, TYPE: "int" } },
        { kind: "block", type: B.stackGet, fields: { OP: "pop", NAME: s, TYPE: "int" } },
        { kind: "block", type: B.stackPop, fields: { NAME: s } },
        { kind: "block", type: B.adtIsEmpty, fields: { NAME: s } },
        { kind: "label", text: `${ADT_NAMES_DE.Queue} (Queue): das zuerst Angehängte kommt zuerst wieder heraus.` },
        { kind: "block", type: B.queueNew, fields: { NAME: "schlange" } },
        { kind: "block", type: B.queueEnqueue, fields: { NAME: q }, inputs: { V: num("1") } },
        { kind: "block", type: B.queueGet, fields: { OP: "head", NAME: q, TYPE: "int" } },
        { kind: "block", type: B.queueGet, fields: { OP: "dequeue", NAME: q, TYPE: "int" } },
        { kind: "block", type: B.queueDequeue, fields: { NAME: q } },
        { kind: "block", type: B.adtIsEmpty, fields: { NAME: q } },
        { kind: "label", text: `${ADT_NAMES_DE.BinTree} (BinTree): Inhalt an der Wurzel, links und rechts je ein Teilbaum.` },
        { kind: "block", type: B.treeNew, fields: { NAME: "baum" }, inputs: { V: num("5") } },
        { kind: "block", type: B.treeItem, fields: { OP: "getItem", NAME: b, TYPE: "int" } },
        { kind: "block", type: B.treeSetItem, fields: { NAME: b }, inputs: { V: num("7") } },
        { kind: "block", type: B.treeChild, fields: { SIDE: "left", NAME: b } },
        { kind: "block", type: B.treeSetChild, fields: { SIDE: "left", NAME: b }, inputs: { T: { block: { type: B.objNew, fields: { CLASS: "BinTree" }, extraState: { args: 1 }, inputs: { ARG0: num("3") } } } } },
        { kind: "block", type: B.treeTest, fields: { NAME: b } },
        { kind: "block", type: B.adtIsEmpty, fields: { NAME: b } },
        { kind: "block", type: B.treeDelete, fields: { NAME: b } },
    ];
}
