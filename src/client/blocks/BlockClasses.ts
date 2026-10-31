import * as Blockly from "blockly/core";
import { B } from "./BlockTypes";
import { FieldButton, hintLabel, mutate, type Mutable } from "./BlockMutators";
import { defineArgsBlock, defineMethodBlock, resizeCall } from "./BlockOperations";
import { FieldType, identifier, visibilityOptions } from "./BlockFields";
import { L, labelMode } from "./BlockLabels";
import { classInfos, collectVariables, defaultLiteral, enclosingClass, receiverClass, type JType } from "./BlockTypeSystem";
import { attributesOf, methodsOf } from "./ClassModel";

/**
 * Klassen und Objekte (Paket 6 des Blockmodus):
 *  - Kategorie "Klassen": Klasse (erbt von …), Attribut (+ get/set), Konstruktor, Operation,
 *    super(…), Operation der Oberklasse, Attribut von this, dieses Objekt
 *  - Kategorie "Objekte": neues Objekt, Operation eines Objekts ausführen / Ergebnis, Attribut
 *    eines Objekts lesen / setzen
 */

export const CLASSES_COLOUR = "#1f6f8b";
export const OBJECTS_COLOUR = "#3d7bd9";
export const CLASSES_CATEGORY = "GSG_CLASSES";
export const OBJECTS_CATEGORY = "GSG_OBJECTS";

// ------------------------------------------------------------------ Auswahllisten

/** Auswahl eines Namens aus einer dynamischen Liste; nimmt auch unbekannte Namen an */
class FieldNameChoice extends Blockly.FieldDropdown {
    constructor(value: string, private choices: (block: Blockly.Block) => string[], private fallback: string, private allowEmpty = false) {
        super(function (this: FieldNameChoice) { return this.nameOptions(); } as unknown as Blockly.MenuGenerator);
        this.setValue(value);
    }

    private nameOptions(): Blockly.MenuOption[] {
        if (this.choices === undefined) return [["-", "-"]];   // im Konstruktor von FieldDropdown: noch nicht eingerichtet
        const block = this.getSourceBlock();
        const names = new Set<string>(block && this.choices ? this.choices(block) : []);
        const current = this.getValue();
        if (typeof current === "string" && current && current !== "-") names.add(current);
        if (names.size === 0 && !this.allowEmpty) names.add(this.fallback);
        const options: Blockly.MenuOption[] = [...names].sort((a, b) => a.localeCompare(b, "de")).map((n) => [n, n]);
        return this.allowEmpty ? [["(keine)", "-"], ...options] : options;
    }

    protected override doClassValidation_(newValue?: unknown): string | null {
        if (this.allowEmpty && (newValue === "-" || newValue === "")) return "-";
        return typeof newValue === "string" && /^[\p{L}_$][\p{L}\p{N}_$]*$/u.test(newValue) ? newValue : null;
    }

    protected override doValueUpdate_(newValue: string) {
        super.doValueUpdate_(newValue);
        this.getOptions(false);
        super.doValueUpdate_(newValue);
        (this.getSourceBlock() as (Blockly.Block & { updateLabels?(): void }) | null)?.updateLabels?.();
    }

    /** "-" (keine) als leerer Wert im Speicherformat */
    override getValue(): string | null {
        const v = super.getValue();
        return this.allowEmpty && v === "-" ? "" : v;
    }
}

/**
 * Auswahl des Konstruktors bei „neues Objekt der Klasse …“ (nur sichtbar, wenn die Klasse mehrere hat).
 * Wert = Anzahl der Werte; wird nicht gespeichert, sondern aus dem Block abgeleitet (Java bestimmt den Konstruktor).
 */
class FieldConstructorChoice extends Blockly.FieldDropdown {
    override SERIALIZABLE = false;
    syncing = false;

    constructor() {
        super(function (this: FieldConstructorChoice) { return this.ctorOptions(); } as unknown as Blockly.MenuGenerator);
    }

    static labels(block: Blockly.Block): Map<number, string> {
        const cls = String(block.getFieldValue("CLASS") ?? "");
        const result = new Map<number, string>();
        for (const c of classInfos(block.workspace).get(cls)?.constructors ?? []) {
            if (!result.has(c.params.length)) result.set(c.params.length, c.params.length === 0 ? "ohne Werte" : "mit " + c.params.map((p) => p.name).join(", "));
        }
        return result;
    }

    private ctorOptions(): Blockly.MenuOption[] {
        const block = this.getSourceBlock();
        const labels = block ? FieldConstructorChoice.labels(block) : new Map<number, string>();
        const current = Number(this.getValue?.() ?? 0);
        if (!labels.has(current)) labels.set(current, current === 0 ? "ohne Werte" : `mit ${current} Werten`);
        return [...labels.entries()].sort((a, b) => a[0] - b[0]).map(([n, label]) => [label, String(n)]);
    }

    protected override doClassValidation_(newValue?: unknown): string | null {
        return /^\d+$/.test(String(newValue)) ? String(newValue) : null;
    }

    protected override doValueUpdate_(newValue: string) {
        super.doValueUpdate_(newValue);
        const block = this.getSourceBlock();
        if (this.syncing || !block || !block.workspace || block.isInFlyout) return;
        // gewählter Konstruktor: Werte anpassen (Typen der Parameter für die Startwerte)
        const n = Number(newValue);
        const ctor = (classInfos(block.workspace).get(String(block.getFieldValue("CLASS") ?? ""))?.constructors ?? []).find((c) => c.params.length === n);
        if (ctor) resizeCall(block, ctor.params.map((p) => p.type));
    }
}

/** Auswahl des Konstruktors an den Block anpassen: Wert = Anzahl der Werte, sichtbar ab zwei Konstruktoren */
function syncConstructorChoice(block: Blockly.Block & { state?: { args?: number } }) {
    const field = block.getField("CTOR") as FieldConstructorChoice | null;
    if (!field || !block.workspace) return;
    const visible = FieldConstructorChoice.labels(block).size > 1;
    Blockly.Events.disable();
    try {
        field.syncing = true;
        const want = String(block.state?.args ?? 0);
        if (field.getValue() !== want) field.setValue(want);
    } finally {
        field.syncing = false;
        Blockly.Events.enable();
    }
    if (field.isVisible() !== visible) {
        field.setVisible(visible);
        const svg = block as Blockly.BlockSvg;
        if (svg.rendered && typeof svg.queueRender === "function") svg.queueRender();
    }
}

const classNames = (b: Blockly.Block) => [...classInfos(b.workspace).keys()];
/** Paket 18g: Oberklassen aus der Bibliothek – Figuren aus Blöckly erben von Figur, die Bühne von Buehne */
const LIBRARY_SUPERCLASSES = ["Figur", "Buehne"];
const ownClass = (b: Blockly.Block) => String(enclosingClass(b)?.getFieldValue("NAME") ?? "");
const superClass = (b: Blockly.Block) => String(enclosingClass(b)?.getFieldValue("SUPER") ?? "");
const ownAttributes = (b: Blockly.Block) => attributesOf(classInfos(b.workspace), ownClass(b)).map((a) => a.name);
const receiverMethods = (b: Blockly.Block) => methodsOf(classInfos(b.workspace), receiverClass(b)).map((m) => m.name);
const receiverAttributes = (b: Blockly.Block) => attributesOf(classInfos(b.workspace), receiverClass(b)).map((a) => a.name);
const superMethods = (b: Blockly.Block) => methodsOf(classInfos(b.workspace), superClass(b)).map((m) => m.name);

// ------------------------------------------------------------------ Klasse

function defineClassBlock() {
    type ClassBlock = Mutable<{ isPublic: boolean }>;
    Blockly.Blocks[B.class] = {
        state: { isPublic: false },

        init(this: ClassBlock) {
            this.state = { isPublic: false };
            this.hat = "cap";
            this.setColour(CLASSES_COLOUR);
            this.setTooltip("Eine Klasse beschreibt Objekte: ihre Attribute (Eigenschaften), Konstruktoren und Operationen. "
                + "„erbt von“: die Klasse übernimmt alles von der Oberklasse (extends).");
            this.build();
        },

        build(this: ClassBlock) {
            this.appendDummyInput("HEAD").appendField(this.state.isPublic ? L("öffentliche Klasse", "public class") : L("Klasse", "class"))
                .appendField(new Blockly.FieldTextInput("MeineKlasse", identifier), "NAME")
                .appendField(L("erbt von", "extends"))
                .appendField(new FieldNameChoice("-", (b) => [...classNames(b), ...LIBRARY_SUPERCLASSES].filter((n) => n !== b.getFieldValue("NAME")), "", true), "SUPER")
                .appendField(hintLabel("class … extends"));
            this.appendStatementInput("MEMBERS");
        },

        saveExtraState(this: ClassBlock) {
            return this.state.isPublic ? { isPublic: true } : null;
        },

        loadExtraState(this: ClassBlock, state: { isPublic?: boolean }) {
            mutate(this, { isPublic: !!state?.isPublic }, (n) => n, false);
        },
    };
}

// ------------------------------------------------------------------ Attribut (+ get/set)

function defineAttributeBlock() {
    Blockly.Blocks[B.attribute] = {
        init(this: Blockly.Block) {
            this.setPreviousStatement(true);
            this.setNextStatement(true);
            this.setColour(CLASSES_COLOUR);
            this.setInputsInline(true);
            this.setTooltip("Eine Eigenschaft der Objekte dieser Klasse, z. B. private String name; "
                + "„+ get/set“ fügt Operationen zum Lesen und Ändern hinzu (getName, setName).");
            const value = this.appendValueInput("VALUE");
            if (labelMode() === "java") {
                // Paket 17d: private String name =
                value.appendField(new Blockly.FieldDropdown(visibilityOptions()), "VIS")
                    .appendField(new FieldType("String", "full"), "TYPE")
                    .appendField(new Blockly.FieldTextInput("name", identifier), "NAME")
                    .appendField("=");
            } else {
                value.appendField("Attribut")
                    .appendField(new Blockly.FieldDropdown(visibilityOptions()), "VIS")
                    .appendField(new Blockly.FieldTextInput("name", identifier), "NAME")
                    .appendField("vom Datentyp")
                    .appendField(new FieldType("String", "full"), "TYPE")
                    .appendField("Startwert");
            }
            this.appendDummyInput("TAIL")
                .appendField(new FieldButton("+ get/set", (b) => addAccessors(b), "Operationen zum Lesen (get) und Ändern (set) des Attributs hinzufügen"));
            this.setFieldValue("private", "VIS");
        },
    };
}

/** getName()/setName(…) als Operationen am Ende der Klasse einfügen (falls noch nicht vorhanden) */
function addAccessors(attribute: Blockly.Block) {
    const cls = enclosingClass(attribute);
    if (!cls) return;
    const name = String(attribute.getFieldValue("NAME") ?? "");
    const type = String(attribute.getFieldValue("TYPE") ?? "int");
    const cap = name.charAt(0).toUpperCase() + name.slice(1);
    const existing = new Set(methodsOf(classInfos(cls.workspace), String(cls.getFieldValue("NAME") ?? "")).map((m) => m.name));
    const getter = (type === "boolean" ? "is" : "get") + cap, setter = "set" + cap;
    const states: object[] = [];
    if (!existing.has(getter)) {
        states.push({
            type: B.classMethod, fields: { VIS: "public", NAME: getter, RETURN: type },
            inputs: { BODY: { block: { type: B.return, inputs: { VALUE: { block: { type: B.varGet, fields: { NAME: name } } } } } } },
        });
    }
    if (!existing.has(setter)) {
        states.push({
            type: B.classMethod, fields: { VIS: "public", NAME: setter, RETURN: "void", PNAME0: name, PTYPE0: type },
            extraState: { params: [{ name, type }] },
            inputs: { BODY: { block: { type: B.thisAttrSet, fields: { NAME: name }, inputs: { V: { block: { type: B.varGet, fields: { NAME: name } } } } } } },
        });
    }
    if (!states.length) return;
    const group = Blockly.Events.getGroup();
    if (!group) Blockly.Events.setGroup(true);
    try {
        let last: Blockly.Block | null = cls.getInputTargetBlock("MEMBERS");
        while (last?.getNextBlock()) last = last.getNextBlock();
        for (const state of states) {
            const block = Blockly.serialization.blocks.append(state as Blockly.serialization.blocks.State, cls.workspace);
            const target = last?.nextConnection ?? cls.getInput("MEMBERS")!.connection!;
            target.connect(block.previousConnection!);
            last = block;
        }
    } finally {
        if (!group) Blockly.Events.setGroup(false);
    }
}

// ------------------------------------------------------------------ Definitionen

export function defineClassBlocks(defineJson: (json: object[]) => void) {
    defineClassBlock();
    defineAttributeBlock();
    defineMethodBlock(B.classMethod, "classMethod", CLASSES_COLOUR);
    defineMethodBlock(B.ctor, "ctor", CLASSES_COLOUR);

    defineArgsBlock(B.superCall, {
        asValue: false, colour: CLASSES_COLOUR, tail: "super(…)",
        tooltip: "Ruft den Konstruktor der Oberklasse auf – als erster Block im Konstruktor.",
        head: (b) => { b.appendDummyInput("HEAD").appendField("rufe Konstruktor der Oberklasse auf"); },
    });
    const superHead = (asValue: boolean) => (b: Blockly.Block) => {
        b.appendDummyInput("HEAD").appendField(asValue ? "Ergebnis der Operation der Oberklasse" : "führe Operation der Oberklasse aus")
            .appendField(new FieldNameChoice("meineOperation", superMethods, "meineOperation"), "METHOD");
    };
    defineArgsBlock(B.superMethodCall, {
        asValue: false, colour: CLASSES_COLOUR, head: superHead(false), tail: "super.…(…)",
        tooltip: "Führt die Operation so aus, wie die Oberklasse sie festlegt (auch wenn diese Klasse sie überschreibt).",
    });
    defineArgsBlock(B.superMethodCallExpr, {
        asValue: true, colour: CLASSES_COLOUR, head: superHead(true), tail: "super.…(…)",
        tooltip: "Das Ergebnis der Operation, wie die Oberklasse sie festlegt.",
    });

    // Objekte: neues Objekt, Operation ausführen, Ergebnis
    defineArgsBlock(B.objNew, {
        asValue: true, colour: OBJECTS_COLOUR, tail: "new …(…)",
        tooltip: "Erzeugt ein neues Objekt der Klasse; die Werte gehen an den Konstruktor.",
        head: (b) => {
            b.appendDummyInput("HEAD").appendField("neues Objekt der Klasse")
                .appendField(new FieldNameChoice("MeineKlasse", classNames, "MeineKlasse"), "CLASS");
            const choice = new FieldConstructorChoice();
            b.appendDummyInput("CTOR_ROW").appendField(choice, "CTOR");
            choice.setVisible(false);
        },
    });
    // Konstruktor-Auswahl mit den Beschriftungen aktualisieren (Klasse gewechselt, Konstruktor hinzugekommen …)
    const objNew = Blockly.Blocks[B.objNew] as { updateLabels(this: Blockly.Block): void };
    const updateLabels = objNew.updateLabels;
    objNew.updateLabels = function (this: Blockly.Block) {
        updateLabels.call(this);
        syncConstructorChoice(this);
    };
    const objHead = (asValue: boolean) => (b: Blockly.Block) => {
        b.appendValueInput("OBJ").appendField(asValue ? "Ergebnis von" : "führe aus");
        b.appendDummyInput("HEAD").appendField(".").appendField(new FieldNameChoice("operation", receiverMethods, "operation"), "METHOD");
    };
    defineArgsBlock(B.objCall, {
        asValue: false, colour: OBJECTS_COLOUR, head: objHead(false), tail: "obj.…(…)",
        tooltip: "Führt eine Operation des Objekts aus, z. B. bello.bellen();",
    });
    defineArgsBlock(B.objCallExpr, {
        asValue: true, colour: OBJECTS_COLOUR, head: objHead(true), tail: "obj.…(…)",
        tooltip: "Führt eine Operation des Objekts aus und liefert ihr Ergebnis, z. B. bello.getName()",
    });

    Blockly.Blocks[B.thisAttrGet] = {
        init(this: Blockly.Block) {
            this.setOutput(true);
            this.setColour(CLASSES_COLOUR);
            this.appendDummyInput().appendField(L("Attribut", "this."))
                .appendField(new FieldNameChoice("name", ownAttributes, "name"), "NAME")
                .appendField(hintLabel("this."));
            this.setTooltip("Der Wert eines Attributs dieses Objekts (this.name).");
        },
    };
    Blockly.Blocks[B.thisAttrSet] = {
        init(this: Blockly.Block) {
            this.setPreviousStatement(true);
            this.setNextStatement(true);
            this.setColour(CLASSES_COLOUR);
            this.setInputsInline(true);
            this.appendValueInput("V").appendField(L("setze Attribut", "this."))
                .appendField(new FieldNameChoice("name", ownAttributes, "name"), "NAME")
                .appendField(L("auf", "="));
            this.appendDummyInput().appendField(hintLabel("this.… =")).appendField(L("", ";"));
            this.setTooltip("Gibt einem Attribut dieses Objekts einen neuen Wert, z. B. this.name = name;");
        },
    };
    Blockly.Blocks[B.objAttrGet] = {
        init(this: Blockly.Block) {
            this.setOutput(true);
            this.setColour(OBJECTS_COLOUR);
            this.setInputsInline(true);
            this.appendDummyInput().appendField("Attribut")
                .appendField(new FieldNameChoice("name", receiverAttributes, "name"), "ATTR").appendField("von");
            this.appendValueInput("OBJ");
            this.appendDummyInput().appendField(hintLabel("obj.…"));
            this.setTooltip("Der Wert eines Attributs eines Objekts. Nur möglich, wenn das Attribut nicht privat ist.");
        },
    };
    Blockly.Blocks[B.objAttrSet] = {
        init(this: Blockly.Block) {
            this.setPreviousStatement(true);
            this.setNextStatement(true);
            this.setColour(OBJECTS_COLOUR);
            this.setInputsInline(true);
            this.appendDummyInput().appendField("setze Attribut")
                .appendField(new FieldNameChoice("name", receiverAttributes, "name"), "ATTR").appendField("von");
            this.appendValueInput("OBJ");
            this.appendValueInput("V").appendField("auf");
            this.appendDummyInput().appendField(hintLabel("obj.… ="));
            this.setTooltip("Ändert ein Attribut eines Objekts. Nur möglich, wenn das Attribut nicht privat ist.");
        },
    };

    defineJson([
        {
            type: B.thisValue, message0: "dieses Objekt %1", args0: [{ type: "field_label", text: "this", class: "gsg-java-hint" }],
            output: null, colour: CLASSES_COLOUR, tooltip: "Das Objekt selbst, dessen Operation gerade läuft (this).",
        },
    ]);
}

// ------------------------------------------------------------------ Werkzeugleiste

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const lit = (t: string) => ({ block: defaultLiteral(t as JType) });

/** Kategorie "Klassen": Bausteine einer Klasse */
export function classesFlyout(ws: Blockly.WorkspaceSvg): Blockly.utils.toolbox.FlyoutItemInfoArray {
    const v = (name: string) => ({ block: { type: B.varGet, fields: { NAME: name } } });
    const items: object[] = [
        { kind: "label", text: "Klasse anlegen – Attribute, Konstruktoren und Operationen kommen hinein." },
        {
            kind: "block", type: B.class, fields: { NAME: "Tier", SUPER: "" },
            inputs: {
                MEMBERS: {
                    block: {
                        type: B.attribute, fields: { VIS: "private", NAME: "name", TYPE: "String" },
                        next: {
                            block: {
                                type: B.ctor, fields: { VIS: "public", PNAME0: "name", PTYPE0: "String" }, extraState: { params: [{ name: "name", type: "String" }] },
                                inputs: { BODY: { block: { type: B.thisAttrSet, fields: { NAME: "name" }, inputs: { V: v("name") } } } },
                            },
                        },
                    },
                },
            },
        },
        { kind: "block", type: B.class, fields: { NAME: "MeineKlasse", SUPER: "" } },
        { kind: "label", text: "In eine Klasse" },
        { kind: "block", type: B.attribute, fields: { VIS: "private", NAME: "alter", TYPE: "int" } },
        { kind: "block", type: B.ctor, fields: { VIS: "public" } },
        { kind: "block", type: B.classMethod, fields: { VIS: "public", NAME: "meineOperation", RETURN: "void" } },
        {
            kind: "block", type: B.classMethod, fields: { VIS: "public", NAME: "getAlter", RETURN: "int" },
            inputs: { BODY: { block: { type: B.return, inputs: { VALUE: v("alter") } } } },
        },
        { kind: "label", text: "In Konstruktoren und Operationen" },
        { kind: "block", type: B.thisAttrSet, fields: { NAME: "name" }, inputs: { V: v("name") } },
        { kind: "block", type: B.thisAttrGet, fields: { NAME: "name" } },
        { kind: "block", type: B.thisValue },
        { kind: "label", text: "Vererbung (Klasse „erbt von“ einer Oberklasse)" },
        { kind: "block", type: B.superCall },
        { kind: "block", type: B.superMethodCall, fields: { METHOD: "meineOperation" } },
        { kind: "block", type: B.superMethodCallExpr, fields: { METHOD: "meineOperation" } },
    ];
    return items as Blockly.utils.toolbox.FlyoutItemInfoArray;
}

/** Kategorie "Objekte": Objekte der vorhandenen Klassen erzeugen und benutzen */
export function objectsFlyout(ws: Blockly.WorkspaceSvg): Blockly.utils.toolbox.FlyoutItemInfoArray {
    const classes = classInfos(ws);
    const vars = collectVariables(ws);
    const items: object[] = [];
    if (classes.size === 0) {
        items.push({ kind: "label", text: "Lege zuerst eine Klasse an (Kategorie „Klassen“) – dann erscheinen hier ihre Objekte." });
        return items as Blockly.utils.toolbox.FlyoutItemInfoArray;
    }
    for (const cls of [...classes.values()].sort((a, b) => a.name.localeCompare(b.name, "de"))) {
        items.push({ kind: "label", text: `Klasse ${cls.name}` });
        const ctors = cls.constructors.length ? cls.constructors : [{ params: [], vis: "public" }];
        for (const c of ctors) {
            const inputs: { [name: string]: object } = {};
            c.params.forEach((p, i) => { inputs["ARG" + i] = lit(p.type); });
            items.push({
                kind: "block", type: B.varDeclare, fields: { NAME: lower(cls.name), TYPE: cls.name },
                inputs: { VALUE: { block: { type: B.objNew, fields: { CLASS: cls.name }, ...(c.params.length ? { extraState: { args: c.params.length }, inputs } : {}) } } },
            });
        }
        // Operationen und Attribute an einer Variablen dieser Klasse (sonst am Standardnamen)
        const objName = [...vars.entries()].find(([, t]) => t === cls.name)?.[0] ?? lower(cls.name);
        const obj = { OBJ: { block: { type: B.varGet, fields: { NAME: objName } } } };
        const seen = new Set<string>();   // überschriebene Operationen nur einmal (die eigene zuerst)
        for (const m of methodsOf(classes, cls.name)) {
            const key = m.name + "/" + m.params.length;
            if (m.vis === "private" || seen.has(key)) continue;
            seen.add(key);
            const inputs: { [name: string]: object } = { ...obj };
            m.params.forEach((p, i) => { inputs["ARG" + i] = lit(p.type); });
            items.push({
                kind: "block", type: m.ret === "void" ? B.objCall : B.objCallExpr, fields: { METHOD: m.name }, inputs,
                ...(m.params.length ? { extraState: { args: m.params.length } } : {}),
            });
        }
        for (const a of attributesOf(classes, cls.name)) {
            if (a.vis === "private") continue;
            items.push({ kind: "block", type: B.objAttrGet, fields: { ATTR: a.name }, inputs: obj });
            items.push({ kind: "block", type: B.objAttrSet, fields: { ATTR: a.name }, inputs: { ...obj, V: lit(a.type) } });
        }
    }
    return items as Blockly.utils.toolbox.FlyoutItemInfoArray;
}

