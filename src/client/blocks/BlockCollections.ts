import * as Blockly from "blockly/core";
import { B, VAR_TYPES, type CollKind } from "./BlockTypes";
import { FieldButton, hintLabel, mutate, type Mutable } from "./BlockMutators";
import { FieldType } from "./BlockFields";
import { collectionsFor, collectionsOf, defaultLiteral, TYPE_NAMES, type JType } from "./BlockTypeSystem";

/**
 * Paket 5 des Blockmodus, drei getrennte Kategorien (Positionen zählen immer ab 0):
 *  - Reihungen: Arrays, auch zweidimensional
 *  - Listen: ArrayList
 *  - ADT (abstrakte Datentypen der Abiturklassen Niedersachsen): dynamische Reihung (DynArray)
 * Reihungen, Listen und ADT werden über ihren Namen ausgewählt (wie Variablen).
 */

export const ARRAYS_COLOUR = "#b5523b";
export const LISTS_COLOUR = "#2f8a76";
export const ADT_COLOUR = "#6a5acd";
export const ARRAYS_CATEGORY = "GSG_ARRAYS";
export const LISTS_CATEGORY = "GSG_LISTS";
export const ADT_CATEGORY = "GSG_ADT";

const TYPE_OPTIONS: [string, string][] = VAR_TYPES.map((t) => [TYPE_NAMES[t], t]);
const DEFAULT_NAMES: Record<CollKind, string> = { array: "zahlen", array2d: "feld", list: "liste", dyn: "reihe" };

/** Auswahl einer Reihung bzw. Liste (bestimmter Arten) des eigenen Hauptprogramms bzw. der Operation */
export class FieldCollectionName extends Blockly.FieldDropdown {
    static override fromJson(options: Blockly.FieldDropdownFromJsonConfig) {
        const o = options as { text?: string; kinds?: CollKind[] };
        return new FieldCollectionName(String(o.text ?? "zahlen"), o.kinds ?? ["array"]);
    }

    constructor(value: string, private kinds: CollKind[]) {
        super(function (this: FieldCollectionName) { return this.collectionOptions(); } as unknown as Blockly.MenuGenerator);
        this.setValue(value);
    }

    private collectionOptions(): [string, string][] {
        const block = this.getSourceBlock();
        const names = new Set<string>();
        const kinds = this.kinds ?? ["array"];   // im Konstruktor von FieldDropdown noch nicht gesetzt
        if (block) for (const [name, c] of collectionsFor(block)) if (kinds.includes(c.kind)) names.add(name);
        const current = this.getValue();
        if (typeof current === "string" && current) names.add(current);
        if (names.size === 0) names.add(DEFAULT_NAMES[kinds[0]]);
        return [...names].sort((a, b) => a.localeCompare(b, "de")).map((n) => [n, n]);
    }

    protected override doClassValidation_(newValue?: unknown): string | null {
        return typeof newValue === "string" && /^[\p{L}_$][\p{L}\p{N}_$]*$/u.test(newValue) ? newValue : null;
    }

    /** zwischengespeicherte Auswahlliste erneuern, damit der gesetzte Name darin steht */
    protected override doValueUpdate_(newValue: string) {
        super.doValueUpdate_(newValue);
        this.getOptions(false);
        super.doValueUpdate_(newValue);
    }
}

const hint = (text: string) => ({ type: "field_label", text, class: "gsg-java-hint" });
const coll = (kinds: CollKind[]) => ({ type: "field_gsg_collection", name: "NAME", text: DEFAULT_NAMES[kinds[0]], kinds });
const value = (name: string) => ({ type: "input_value", name });
const statement = { previousStatement: null, nextStatement: null };
const ARRAY: CollKind[] = ["array"], ARRAY2D: CollKind[] = ["array2d"], LIST: CollKind[] = ["list"], DYN: CollKind[] = ["dyn"];

export function defineCollectionBlocks(defineJson: (json: object[]) => void) {
    Blockly.fieldRegistry.register("field_gsg_collection", FieldCollectionName as unknown as Blockly.fieldRegistry.RegistrableField);
    defineArrayValuesBlock();

    const a = { colour: ARRAYS_COLOUR, inputsInline: true };
    const l = { colour: LISTS_COLOUR, inputsInline: true };
    const d = { colour: ADT_COLOUR, inputsInline: true };
    const typeField = { type: "field_gsg_type", name: "TYPE", text: "int", mode: "element" };
    const nameField = { type: "field_input", name: "NAME", text: "zahlen" };
    defineJson([
        // ------------------------------------------------------------ Reihungen
        {
            type: B.arrayNew, message0: "erstelle neue Reihung %1 vom Datentyp %2 mit Länge %3 %4",
            args0: [nameField, typeField, value("LEN"), hint("new int[]")], ...statement, ...a, extensions: ["gsg_identifier"],
            tooltip: "Legt eine Reihung (Array) mit fester Länge an, z. B. int[] zahlen = new int[5]; Alle Elemente sind am Anfang 0 (bzw. leer). Positionen: 0 bis Länge - 1.",
        },
        {
            type: B.arrayGet, message0: "Element an Position %1 von %2 %3", args0: [value("I"), coll(ARRAY), hint("[ ]")],
            output: null, ...a, tooltip: "Das Element an einer Position. Die Zählung beginnt bei 0: Position 0 ist das erste Element.",
        },
        {
            type: B.arraySet, message0: "setze Element an Position %1 von %2 auf %3 %4", args0: [value("I"), coll(ARRAY), value("V"), hint("[ ] =")],
            ...statement, ...a, tooltip: "Ändert das Element an einer Position (Zählung ab 0).",
        },
        {
            type: B.arrayLength, message0: "Länge von %1 %2", args0: [coll(ARRAY), hint(".length")],
            output: null, ...a, tooltip: "Anzahl der Elemente. Die letzte Position ist Länge - 1.",
        },
        {
            type: B.array2dNew, message0: "erstelle neue zweidimensionale Reihung %1 vom Datentyp %2 mit %3 Zeilen und %4 Spalten %5",
            args0: [{ ...nameField, text: "feld" }, typeField, value("R"), value("C"), hint("new int[][]")], ...statement, ...a, extensions: ["gsg_identifier"],
            tooltip: "Legt eine Tabelle an, z. B. int[][] feld = new int[3][4]; (3 Zeilen, 4 Spalten). Zeilen und Spalten zählen ab 0.",
        },
        {
            type: B.array2dGet, message0: "Element in Zeile %1 Spalte %2 von %3 %4", args0: [value("R"), value("C"), coll(ARRAY2D), hint("[ ][ ]")],
            output: null, ...a, tooltip: "Das Element in einer Zeile und Spalte (beide ab 0 gezählt).",
        },
        {
            type: B.array2dSet, message0: "setze Element in Zeile %1 Spalte %2 von %3 auf %4 %5",
            args0: [value("R"), value("C"), coll(ARRAY2D), value("V"), hint("[ ][ ] =")], ...statement, ...a,
            tooltip: "Ändert das Element in einer Zeile und Spalte (beide ab 0 gezählt).",
        },
        {
            type: B.array2dSize, message0: "Anzahl der %1 von %2 %3",
            args0: [{ type: "field_dropdown", name: "DIM", options: [["Zeilen", "rows"], ["Spalten", "cols"]] }, coll(ARRAY2D), hint(".length")],
            output: null, ...a, tooltip: "Zeilen: feld.length, Spalten: feld[0].length",
        },
        {
            type: B.forEach, message0: "für jedes Element %1 aus %2 %3",
            args0: [{ type: "field_input", name: "VAR", text: "element" }, { ...coll(["array", "array2d", "list", "dyn"]), name: "LIST" }, hint("for ( : )")],
            message1: "%1", args1: [{ type: "input_statement", name: "DO" }],
            ...statement, colour: ARRAYS_COLOUR, extensions: ["gsg_identifier"],
            tooltip: "Geht alle Elemente der Reihung bzw. Liste der Reihe nach durch; die Variable enthält jeweils das aktuelle Element. "
                + "Bei einer zweidimensionalen Reihung ist jedes Element eine Zeile.",
        },

        // ------------------------------------------------------------ Liste (ArrayList)
        {
            type: B.listNew, message0: "erstelle neue Liste %1 vom Datentyp %2 %3", args0: [{ ...nameField, text: "liste" }, typeField, hint("new ArrayList")],
            ...statement, ...l, extensions: ["gsg_identifier"],
            tooltip: "Legt eine leere Liste an, z. B. ArrayList<Integer> liste = new ArrayList<Integer>(); Sie wächst beim Anhängen.",
        },
        {
            type: B.listAdd, message0: "hänge %1 an Liste %2 an %3", args0: [value("V"), coll(LIST), hint(".add")],
            ...statement, ...l, tooltip: "Fügt ein Element am Ende der Liste an.",
        },
        {
            type: B.listInsert, message0: "füge %1 an Position %2 in Liste %3 ein %4", args0: [value("V"), value("I"), coll(LIST), hint(".add(i, …)")],
            ...statement, ...l, tooltip: "Fügt ein Element an einer Position ein (ab 0 gezählt); die folgenden rücken nach hinten.",
        },
        {
            type: B.listRemove, message0: "entferne Element an Position %1 aus Liste %2 %3", args0: [value("I"), coll(LIST), hint(".remove")],
            ...statement, ...l, tooltip: "Entfernt das Element an einer Position (ab 0 gezählt); die folgenden rücken nach vorn.",
        },
        {
            type: B.listGet, message0: "Element an Position %1 von Liste %2 %3", args0: [value("I"), coll(LIST), hint(".get")],
            output: null, ...l, tooltip: "Das Element an einer Position (ab 0 gezählt).",
        },
        {
            type: B.listSet, message0: "setze Element an Position %1 von Liste %2 auf %3 %4", args0: [value("I"), coll(LIST), value("V"), hint(".set")],
            ...statement, ...l, tooltip: "Ersetzt das Element an einer Position (ab 0 gezählt).",
        },
        {
            type: B.listSize, message0: "Anzahl der Elemente von Liste %1 %2", args0: [coll(LIST), hint(".size()")],
            output: null, ...l, tooltip: "Wie viele Elemente die Liste hat.",
        },
        {
            type: B.listContains, message0: "Liste %1 enthält %2 %3", args0: [coll(LIST), value("V"), hint(".contains")],
            output: null, ...l, tooltip: "Wahr, wenn der Wert in der Liste vorkommt.",
        },
        {
            type: B.collIsEmpty, message0: "Liste %1 ist leer %2", args0: [coll(LIST), hint(".isEmpty()")],
            output: null, ...l, tooltip: "Wahr, wenn die Liste keine Elemente hat.",
        },

        // ------------------------------------------------------------ ADT: dynamische Reihung (DynArray, Abiturklassen Niedersachsen)
        {
            type: B.dynNew, message0: "erstelle neue dynamische Reihung %1 %2", args0: [{ ...nameField, text: "reihe" }, hint("new DynArray()")],
            ...statement, ...d, extensions: ["gsg_identifier"],
            tooltip: "Legt eine leere dynamische Reihung an (DynArray aus den Abiturklassen Niedersachsen). "
                + "Die Bibliothek „Abiturklassen Niedersachsen“ wird dafür im Projekt eingeschaltet.",
        },
        {
            type: B.dynAppend, message0: "hänge %1 an dynamische Reihung %2 an %3", args0: [value("V"), coll(DYN), hint(".append")],
            ...statement, ...d, tooltip: "Fügt ein Element am Ende an.",
        },
        {
            type: B.dynInsert, message0: "füge %1 an Position %2 in dynamische Reihung %3 ein %4", args0: [value("V"), value("I"), coll(DYN), hint(".insertAt")],
            ...statement, ...d, tooltip: "Fügt ein Element an einer Position ein (ab 0 gezählt).",
        },
        {
            type: B.dynSet, message0: "setze Element an Position %1 von dynamischer Reihung %2 auf %3 %4", args0: [value("I"), coll(DYN), value("V"), hint(".setItem")],
            ...statement, ...d, tooltip: "Ersetzt das Element an einer Position (ab 0 gezählt).",
        },
        {
            type: B.dynDelete, message0: "entferne Element an Position %1 aus dynamischer Reihung %2 %3", args0: [value("I"), coll(DYN), hint(".delete")],
            ...statement, ...d, tooltip: "Entfernt das Element an einer Position (ab 0 gezählt).",
        },
        {
            type: B.dynGet, message0: "Element an Position %1 von dynamischer Reihung %2 %3 %4",
            args0: [value("I"), coll(DYN), {
                type: "field_dropdown", name: "TYPE", options: [["als Ganzzahl (int)", "int"], ["als Kommazahl (double)", "double"],
                    ["als Text (String)", "String"], ["als Wahrheitswert (boolean)", "boolean"], ["als Zeichen (char)", "char"], ["(beliebiger Wert)", "Object"]],
            }, hint(".getItem")],
            output: null, ...d,
            tooltip: "Das Element an einer Position (ab 0 gezählt). Zum Rechnen „als Ganzzahl“ usw. wählen – in Java: (int) reihe.getItem(0)",
        },
        {
            type: B.dynLength, message0: "Länge von dynamischer Reihung %1 %2", args0: [coll(DYN), hint(".getLength()")],
            output: null, ...d, tooltip: "Anzahl der Elemente.",
        },
        {
            type: B.dynIsEmpty, message0: "dynamische Reihung %1 ist leer %2", args0: [coll(DYN), hint(".isEmpty()")],
            output: null, ...d, tooltip: "Wahr, wenn die dynamische Reihung keine Elemente hat.",
        },
    ]);
}

// ------------------------------------------------------------------ Reihung mit Werten (◂ ▸)

type ItemsState = { items: number };

function defineArrayValuesBlock() {
    Blockly.Blocks[B.arrayValues] = {
        state: { items: 3 } as ItemsState,

        init(this: Mutable<ItemsState>) {
            this.state = { items: 3 };
            this.setPreviousStatement(true);
            this.setNextStatement(true);
            this.setColour(ARRAYS_COLOUR);
            this.setInputsInline(true);
            this.setTooltip("Legt eine Reihung mit diesen Werten an, z. B. int[] zahlen = {3, 1, 4}; ▸ fügt einen Wert hinzu, ◂ entfernt den letzten.");
            this.build();
        },

        build(this: Mutable<ItemsState>) {
            const head = this.appendDummyInput("HEAD").appendField("erstelle neue Reihung")
                .appendField(new Blockly.FieldTextInput("zahlen", identifier), "NAME")
                .appendField("vom Datentyp").appendField(new FieldType("int", "element"), "TYPE");
            head.appendField("mit den Werten");
            for (let i = 0; i < this.state.items; i++) {
                const input = this.appendValueInput("V" + i);
                if (i > 0) input.appendField(",");
            }
            const tail = this.appendDummyInput("TAIL");
            if (this.state.items > 1) tail.appendField(new FieldButton("◂", (b) => setItems(b as Mutable<ItemsState>, -1), "Letzten Wert entfernen"));
            tail.appendField(new FieldButton("▸", (b) => setItems(b as Mutable<ItemsState>, +1), "Weiteren Wert hinzufügen"));
            tail.appendField(hintLabel("{ }"));
        },

        saveExtraState(this: Mutable<ItemsState>): ItemsState {
            return { items: this.state.items };
        },

        loadExtraState(this: Mutable<ItemsState>, state: Partial<ItemsState>) {
            mutate(this, { items: Math.max(1, Number(state?.items ?? 1)) }, (n) => n, false);
        },
    };

    function setItems(b: Mutable<ItemsState>, delta: number) {
        const items = Math.max(1, b.state.items + delta);
        mutate(b, { items }, (n) => {
            const m = /^V(\d+)$/.exec(n);
            return m && Number(m[1]) >= items ? null : n;
        }, true);
    }
}

function identifier(v: string): string | null {
    const cleaned = String(v).replace(/[^\p{L}\p{N}_$]/gu, "");
    return cleaned === "" || /^\p{N}/u.test(cleaned) ? null : cleaned;
}

// ------------------------------------------------------------------ Werkzeugleiste

/** erster vorhandener Name einer Art (sonst der Standardname) und sein Elementtyp */
function existing(ws: Blockly.WorkspaceSvg, kind: CollKind): { name: string; elem: JType } {
    const all = collectionsOf(ws.getAllBlocks(true));
    for (const [name, c] of [...all].sort((x, y) => x[0].localeCompare(y[0], "de"))) {
        if (c.kind === kind) return { name, elem: (c.elem ?? "int") as JType };
    }
    return { name: DEFAULT_NAMES[kind], elem: "int" };
}

const num = (n: string) => ({ block: { type: B.number, fields: { NUM: n } } });
const lit = (t: JType) => ({ block: defaultLiteral(t) });

export function arraysFlyout(ws: Blockly.WorkspaceSvg): Blockly.utils.toolbox.FlyoutItemInfoArray {
    const a = existing(ws, "array"), m = existing(ws, "array2d");
    const items: object[] = [
        { kind: "label", text: "Positionen werden ab 0 gezählt: Position 0 ist das erste Element." },
        { kind: "block", type: B.arrayNew, fields: { NAME: "zahlen", TYPE: "int" }, inputs: { LEN: num("5") } },
        {
            kind: "block", type: B.arrayValues, fields: { NAME: "namen", TYPE: "String" }, extraState: { items: 3 },
            inputs: { V0: { block: { type: B.text, fields: { TEXT: "Ada" } } }, V1: { block: { type: B.text, fields: { TEXT: "Bo" } } }, V2: { block: { type: B.text, fields: { TEXT: "Cem" } } } },
        },
        { kind: "block", type: B.arrayGet, fields: { NAME: a.name }, inputs: { I: num("0") } },
        { kind: "block", type: B.arraySet, fields: { NAME: a.name }, inputs: { I: num("0"), V: lit(a.elem) } },
        { kind: "block", type: B.arrayLength, fields: { NAME: a.name } },
        { kind: "block", type: B.forEach, fields: { VAR: "element", LIST: a.name } },
        { kind: "label", text: "Zweidimensionale Reihung: Zeile und Spalte, beide ab 0 gezählt" },
        { kind: "block", type: B.array2dNew, fields: { NAME: "feld", TYPE: "int" }, inputs: { R: num("3"), C: num("4") } },
        { kind: "block", type: B.array2dGet, fields: { NAME: m.name }, inputs: { R: num("0"), C: num("0") } },
        { kind: "block", type: B.array2dSet, fields: { NAME: m.name }, inputs: { R: num("0"), C: num("0"), V: lit(m.elem) } },
        { kind: "block", type: B.array2dSize, fields: { NAME: m.name, DIM: "rows" } },
        { kind: "block", type: B.array2dSize, fields: { NAME: m.name, DIM: "cols" } },
    ];
    return items as Blockly.utils.toolbox.FlyoutItemInfoArray;
}

export function listsFlyout(ws: Blockly.WorkspaceSvg): Blockly.utils.toolbox.FlyoutItemInfoArray {
    const l = existing(ws, "list");
    const items: object[] = [
        { kind: "label", text: "Liste (ArrayList): wächst beim Anhängen. Positionen ab 0." },
        { kind: "block", type: B.listNew, fields: { NAME: "liste", TYPE: "int" } },
        { kind: "block", type: B.listAdd, fields: { NAME: l.name }, inputs: { V: lit(l.elem) } },
        { kind: "block", type: B.listInsert, fields: { NAME: l.name }, inputs: { V: lit(l.elem), I: num("0") } },
        { kind: "block", type: B.listRemove, fields: { NAME: l.name }, inputs: { I: num("0") } },
        { kind: "block", type: B.listGet, fields: { NAME: l.name }, inputs: { I: num("0") } },
        { kind: "block", type: B.listSet, fields: { NAME: l.name }, inputs: { I: num("0"), V: lit(l.elem) } },
        { kind: "block", type: B.listSize, fields: { NAME: l.name } },
        { kind: "block", type: B.listContains, fields: { NAME: l.name }, inputs: { V: lit(l.elem) } },
        { kind: "block", type: B.collIsEmpty, fields: { NAME: l.name } },
        { kind: "block", type: B.forEach, fields: { VAR: "element", LIST: l.name } },
    ];
    return items as Blockly.utils.toolbox.FlyoutItemInfoArray;
}

/** ADT: abstrakte Datentypen der Abiturklassen Niedersachsen (bisher: dynamische Reihung) */
export function adtFlyout(ws: Blockly.WorkspaceSvg): Blockly.utils.toolbox.FlyoutItemInfoArray {
    const d = existing(ws, "dyn");
    const items: object[] = [
        { kind: "label", text: "Abstrakte Datentypen (Abiturklassen Niedersachsen) – die Bibliothek wird im Projekt eingeschaltet." },
        { kind: "label", text: "Dynamische Reihung (DynArray): Positionen ab 0." },
        { kind: "block", type: B.dynNew, fields: { NAME: "reihe" } },
        { kind: "block", type: B.dynAppend, fields: { NAME: d.name }, inputs: { V: num("1") } },
        { kind: "block", type: B.dynInsert, fields: { NAME: d.name }, inputs: { V: num("1"), I: num("0") } },
        { kind: "block", type: B.dynSet, fields: { NAME: d.name }, inputs: { I: num("0"), V: num("1") } },
        { kind: "block", type: B.dynDelete, fields: { NAME: d.name }, inputs: { I: num("0") } },
        { kind: "block", type: B.dynGet, fields: { NAME: d.name, TYPE: "int" }, inputs: { I: num("0") } },
        { kind: "block", type: B.dynLength, fields: { NAME: d.name } },
        { kind: "block", type: B.dynIsEmpty, fields: { NAME: d.name } },
        { kind: "block", type: B.forEach, fields: { VAR: "element", LIST: d.name } },
    ];
    return items as Blockly.utils.toolbox.FlyoutItemInfoArray;
}
