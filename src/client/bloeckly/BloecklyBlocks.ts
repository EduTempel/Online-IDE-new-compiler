import * as Blockly from "blockly/core";
import { Kostueme } from "../../compiler/java/runtime/graphics/GsgBuehnenLogik";
import { GSG_BUEHNENBILDER } from "../../compiler/java/runtime/graphics/GsgFigurenLibrary";
import { B } from "../blocks/BlockTypes";
import { defineLabelled } from "../blocks/BlockLabels";
import { operationsFlyout } from "../blocks/BlockOperations";
import { DEFAULT_MESSAGE } from "../blocks/BlockParts";
import { collectVariables, mainWorkspace } from "../blocks/BlockTypeSystem";
import { KEYS, keyLabel } from "../blocks/FigureSpec";
import { namensFehler } from "./BloecklyProjekt";
import {
    availableFor, BL_BLOCKS, BL_CATEGORIES, BL_HATS, categoryColour, type BlArg, type BlBlock, type BlCategory, type BlOption,
    type BlSource, type HeaderState,
} from "./BloecklySpec";

/**
 * Blöckly (Paket 18e): Blöcke und Werkzeugleiste in der Oberfläche. Die Tabelle steht in BloecklySpec; hier wird
 * daraus Blockly. Was die Blöcke über das Projekt wissen müssen (andere Figuren, Kostüme, Variablen für alle),
 * setzt die Blockansicht vor dem Laden (setBloecklyUi).
 */

export type BloecklyUi = {
    /** die Datei ist die Bühne */
    stage: boolean;
    /** Klasse dieser Figur bzw. der Bühne */
    klasse: string;
    /** Aussehen (Bibliotheksfigur) für die Kostüme */
    aussehen: string;
    /** Klassen aller Figuren des Projekts */
    figuren: string[];
    /** Variablen für alle Figuren (in der Bühne) */
    globals: Record<string, string>;
    /** neue Variable für alle Figuren anlegen (schreibt die Bühne) */
    addGlobal?: (name: string, typ: string) => void;
    /** Variable für alle Figuren umbenennen bzw. löschen (Rechtsklick in der Kategorie Variablen) */
    globaleUmbenennen?: (alt: string, neu: string) => void;
    /** liefert die Figuren, die sie noch benutzen (dann bleibt sie) */
    globaleLoeschen?: (name: string) => string[];
    /** „Wenn 🚩 angeklickt“ gibt es schon bei dieser Figur (bzw. „der Bühne“) – nur einmal im ganzen Projekt */
    flagge?: string;
};

let ui: BloecklyUi = { stage: false, klasse: "", aussehen: "", figuren: [], globals: {} };

export function setBloecklyUi(u: BloecklyUi) {
    ui = u;
}

export function bloecklyUi(): BloecklyUi {
    return ui;
}

// ------------------------------------------------------------------ Auswahlfeld

/** Einträge einer Auswahl, die vom Projekt abhängen */
function sourceOptions(source: BlSource | undefined): [string, string][] {
    switch (source) {
        case "figuren": return ui.figuren.filter((f) => f !== ui.klasse).map((f) => [f, f]);
        case "kostueme": return (Kostueme.fuer(ui.aussehen)?.alleTitel() ?? ["stehen", "laufen 1", "laufen 2", "laufen 3", "laufen 4", "winken"]).map((t) => [t, t]);
        case "buehnenbilder": return GSG_BUEHNENBILDER.map((b) => [b.titel, b.titel]);
        case "tasten": return KEYS.map(([label, v]) => [label, v]);
    }
    return [];
}

/**
 * Auswahl eines Blöckly-Blocks: feste Einträge (z. B. „Mauszeiger“) und Einträge aus dem Projekt (andere
 * Figuren, Kostüme …). Ein Wert aus dem Java-Code, den es nicht (mehr) gibt, bleibt in der Liste.
 */
class FieldBlChoice extends Blockly.FieldDropdown {
    static override fromJson(options: Blockly.FieldDropdownFromJsonConfig) {
        const o = options as { value?: string; fixed?: BlOption[]; source?: BlSource };
        return new FieldBlChoice(o.fixed ?? [], o.source, String(o.value ?? ""));
    }

    constructor(private fixed: BlOption[], private source: BlSource | undefined, value: string) {
        super(function (this: FieldBlChoice) { return this.choiceOptions(); } as unknown as Blockly.MenuGenerator);
        this.setValue(value || this.choiceOptions()[0]?.[1] || "");
    }

    private choiceOptions(): [string, string][] {
        if (this.fixed === undefined) return [["-", "-"]];   // im Konstruktor von FieldDropdown noch nicht gesetzt
        const options: [string, string][] = [
            ...this.fixed.filter((o) => !(ui.stage && o[2] === "figur")).map(([l, v]): [string, string] => [l, v]),
            ...sourceOptions(this.source),
        ];
        const current = this.getValue();
        if (typeof current === "string" && current && !options.some(([, v]) => v === current)) {
            options.push([this.source === "tasten" ? keyLabel(current) : current, current]);
        }
        return options.length ? options : [["(keine andere Figur)", ""]];
    }

    protected override doClassValidation_(newValue?: unknown): string | null {
        return typeof newValue === "string" ? newValue : null;
    }

    protected override doValueUpdate_(newValue: string) {
        super.doValueUpdate_(newValue);
        this.getOptions(false);
        super.doValueUpdate_(newValue);
    }
}

// ------------------------------------------------------------------ Blockdefinitionen

/** „gehe {N} Schritte“ -> message „gehe %1 Schritte“ und die Argumente */
function messageAndArgs(spec: BlBlock): { message0: string; args0: object[] } {
    const args0: object[] = [];
    const message0 = spec.text.replace(/\{(\w+)\}/g, (_, name: string) => {
        const a = spec.args.find((x) => x.name === name) as BlArg;
        if (a.kind === "choice") args0.push({ type: "field_gsg_bl_choice", name, fixed: a.options ?? [], source: a.source, value: a.def ?? "" });
        else args0.push({ type: "input_value", name });
        return `%${args0.length}`;
    });
    return { message0, args0 };
}

/** Name der Methode eines Skripts (unsichtbar; nur gespeichert, wenn jemand im Java-Code einen eigenen vergeben hat) */
type HatBlock = Blockly.Block & { blName?: string };
type HeaderBlock = Blockly.Block & { blHeader?: HeaderState };

let defined = false;

export function defineBloecklyBlocks() {
    if (defined) return;
    defined = true;
    Blockly.fieldRegistry.register("field_gsg_bl_choice", FieldBlChoice as unknown as Blockly.fieldRegistry.RegistrableField);
    Blockly.Extensions.registerMutator("bl_hat_name", {
        saveExtraState(this: HatBlock) { return this.blName ? { name: this.blName } : null; },
        loadExtraState(this: HatBlock, state: { name?: string } | null) { this.blName = state?.name || undefined; },
    });
    Blockly.Extensions.registerMutator("bl_header", {
        saveExtraState(this: HeaderBlock) { return this.blHeader ?? null; },
        loadExtraState(this: HeaderBlock, state: HeaderState | null) {
            this.blHeader = state ?? undefined;
            const stage = state?.oberklasse === "Buehne";
            this.setFieldValue(stage ? "🎭 Bühne" : `🐾 ${state?.klasse ?? "Figur"}`, "TITLE");
            this.setFieldValue(stage ? "Variablen für alle Figuren:" : "Variablen nur für diese Figur:", "VARS_LABEL");
            this.setColour(categoryColour("variablen"));
        },
    });
    // „Wenn diese Figur angeklickt“ bzw. „Wenn die Bühne angeklickt“
    Blockly.Extensions.register("bl_click_label", function (this: Blockly.Block) {
        this.setFieldValue(ui.stage ? "die Bühne" : "diese Figur", "WHO");
    });

    const statement = { previousStatement: null, nextStatement: null };
    const defs: object[] = BL_BLOCKS.map((spec) => ({
        type: spec.type, ...messageAndArgs(spec), inputsInline: true, colour: categoryColour(spec.cat), tooltip: spec.tooltip,
        ...(spec.output ? { output: null } : statement),
    }));
    const events = categoryColour("ereignisse");
    const hat = (type: string, message: string, args: object[], tooltip: string, extensions: string[] = []) => ({
        type, message0: message, args0: args, message1: "%1", args1: [{ type: "input_statement", name: "BODY" }],
        colour: events, hat: "cap", mutator: "bl_hat_name", extensions, tooltip,
    });
    const tail = " Mehrere Skripte laufen gleichzeitig.";
    defs.push(
        hat(B.blFlag, "Wenn 🚩 angeklickt", [], "Startet, wenn jemand auf 🚩 Start klickt." + tail),
        hat(B.blKey, "Wenn Taste %1 gedrückt", [{ type: "field_gsg_bl_choice", name: "KEY", source: "tasten", fixed: [], value: " " }],
            "Startet bei jedem Druck auf diese Taste (läuft das Skript noch, zählt der Druck nicht). Je Taste ein Skript pro Figur." + tail),
        hat(B.blClick, "Wenn %1 angeklickt", [{ type: "field_label", name: "WHO", text: "diese Figur" }],
            "Startet bei jedem Mausklick auf die Figur (bzw. auf die Bühne, wo keine Figur ist). Versteckte Figuren lassen sich nicht anklicken." + tail, ["bl_click_label"]),
        hat(B.blMsg, "Wenn ich %1 empfange", [{ type: "field_gsg_message", name: "MSG", value: DEFAULT_MESSAGE }],
            "Startet, wenn irgendeine Figur oder die Bühne diese Nachricht sendet (Ereignisse: „sende Nachricht …“)." + tail),
        hat(B.blClone, "Wenn ich als Klon entstehe", [], "Startet in jedem neuen Klon dieser Figur (Steuerung: „erzeuge Klon von …“)." + tail),
        {
            type: B.blFigure, message0: "%1", args0: [{ type: "field_label", name: "TITLE", text: "Figur", class: "gsg-bl-titel" }],
            message1: "%1", args1: [{ type: "field_label", name: "VARS_LABEL", text: "Variablen:" }],
            message2: "%1", args2: [{ type: "input_statement", name: "VARS" }],
            colour: categoryColour("variablen"), mutator: "bl_header",
            tooltip: "Die Variablen dieser Figur. Neue Variablen legst du unter „Variablen“ an. Aussehen und Startposition stehen im Reiter „Figuren“.",
        },
        {
            type: B.blVar, message0: "%1 %2 Startwert %3",
            args0: [{ type: "field_gsg_type", name: "TYPE", text: "double", mode: "simple" }, { type: "field_input", name: "NAME", text: "punkte" }, { type: "input_value", name: "VALUE" }],
            ...statement, inputsInline: true, colour: categoryColour("variablen"), extensions: ["gsg_identifier"],
            tooltip: "Eine Variable mit Datentyp, Name und Startwert. Sie gilt in allen Skripten (einer Figur bzw. aller Figuren).",
        },
    );
    defineLabelled(defs as never);
}

// ------------------------------------------------------------------ Werkzeugleiste

const CATEGORY_KEY = (id: BlCategory) => "BL_" + id.toUpperCase();
export const NEW_VARIABLE_BUTTON = "BL_NEW_VARIABLE";

type Item = Record<string, unknown>;
const num = (n: string) => ({ block: { type: B.number, fields: { NUM: n } } });
const txt = (t: string) => ({ block: { type: B.text, fields: { TEXT: t } } });

/** Block einer Kategorie mit Startwerten in den Eingängen */
function specItem(spec: BlBlock): Item {
    const inputs: Record<string, object> = {};
    for (const a of spec.args) {
        if (a.kind === "num") inputs[a.name] = num(a.def ?? "0");
        else if (a.kind === "any" || a.kind === "text") inputs[a.name] = txt(a.def ?? "");
    }
    return { kind: "block", type: spec.type, ...(Object.keys(inputs).length ? { inputs } : {}) };
}

const blk = (type: string, extra: object = {}): Item => ({ kind: "block", type, ...extra });
const label = (text: string): Item => ({ kind: "label", text });

function categoryItems(id: BlCategory, ws: Blockly.WorkspaceSvg): Item[] {
    const specs = BL_BLOCKS.filter((b) => b.cat === id && availableFor(b, ui.stage)).map(specItem);
    switch (id) {
        case "bewegung":
            return ui.stage ? [label("Die Bühne bewegt sich nicht. Wähle im Reiter „Figuren“ eine Figur, um sie zu bewegen.")] : specs;
        case "ereignisse": {
            // „Wenn 🚩 angeklickt“ nur einmal im ganzen Projekt
            const hier = mainWorkspace(ws).getTopBlocks(false).some((b) => b.type === B.blFlag);
            const flagge = ui.flagge ?? (hier ? "dieser Figur" : undefined);
            return [
                ...(flagge ? [label(`„Wenn 🚩 angeklickt“ gibt es nur einmal im ganzen Projekt – es steht schon bei ${ui.stage && hier ? "der Bühne" : flagge}.`)] : []),
                ...BL_HATS.filter((h) => availableFor(h, ui.stage) && h.type !== B.blClone && !(flagge && h.type === B.blFlag)).map((h) => blk(h.type)),
                label("Nachrichten starten „Wenn ich … empfange“ – bei allen Figuren und der Bühne:"),
                blk(B.msgSend), blk(B.msgSendWait),
            ];
        }
        case "steuerung":
            return [
                ...specs.filter((s) => s.type === "bl_warte"),
                blk(B.repeat, { inputs: { TIMES: num("10") } }),
                blk(B.forever),
                blk(B.if, { extraState: { elseIfs: 0, hasElse: false, fixed: true } }),
                blk(B.if, { extraState: { elseIfs: 0, hasElse: true, fixed: true } }),
                blk(B.while, { fields: { MODE: "until" } }),
                ...specs.filter((s) => s.type === "bl_stoppe_alles" || s.type === "bl_stoppe_andere"),
                label("Klone"),
                ...(ui.stage ? [] : [blk(B.blClone)]),
                ...specs.filter((s) => s.type === "bl_klon" || s.type === "bl_loesche_klon"),
            ];
        case "operatoren":
            return [
                blk(B.arith, { fields: { OP: "+" }, inputs: { A: num("1"), B: num("1") } }),
                blk(B.arith, { fields: { OP: "-" }, inputs: { A: num("1"), B: num("1") } }),
                blk(B.arith, { fields: { OP: "*" }, inputs: { A: num("1"), B: num("1") } }),
                blk(B.arith, { fields: { OP: "/" }, inputs: { A: num("1"), B: num("1") } }),
                blk(B.random, { inputs: { FROM: num("1"), TO: num("10") } }),
                blk(B.compare, { fields: { OP: ">" }, inputs: { B: num("50") } }),
                blk(B.compare, { fields: { OP: "<" }, inputs: { B: num("50") } }),
                blk(B.compare, { fields: { OP: "==" }, inputs: { B: num("50") } }),
                blk(B.logic, { fields: { OP: "&&" } }),
                blk(B.logic, { fields: { OP: "||" } }),
                blk(B.not),
                blk(B.concat, { inputs: { A: txt("Apfel "), B: txt("Banane") } }),
                blk(B.strCharAt, { inputs: { INDEX: num("0"), TEXT: txt("Apfel") } }),
                blk(B.strLength, { inputs: { TEXT: txt("Apfel") } }),
                blk(B.strContains, { inputs: { A: txt("Apfel"), B: txt("a") } }),
                blk(B.arith, { fields: { OP: "%" }, inputs: { A: num("7"), B: num("2") } }),
                blk(B.math, { fields: { FUNC: "round" }, inputs: { VALUE: num("2.5") } }),
                blk(B.math, { fields: { FUNC: "abs" }, inputs: { VALUE: num("-3") } }),
                blk(B.math, { fields: { FUNC: "sqrt" }, inputs: { VALUE: num("9") } }),
                label("Werte"),
                blk(B.number), blk(B.text), blk(B.bool),
            ];
        case "variablen":
            return variableItems(ws);
        case "meine":
            return [
                label("Eigene Blöcke fassen Blöcke zusammen, die du öfter brauchst. Sie gehören zu dieser Figur."),
                ...(operationsFlyout(ws) as unknown as Item[]).filter((i) => i.kind !== "label" || !String(i.text).startsWith("Neue Operation")),
            ];
    }
    return specs;
}

/**
 * Variablen wie in Blöckva: „erstelle neue Variable …“ im Skript (gilt nur dort); dazu der Knopf für Variablen,
 * die alle Figuren und Skripte gemeinsam haben (z. B. Punkte). Darunter die Blöcke aller bekannten Variablen.
 */
function variableItems(ws: Blockly.WorkspaceSvg): Item[] {
    const items: Item[] = [
        label("Neue Variable im Skript (gilt nur in diesem Skript):"),
        blk(B.varDeclare, { fields: { NAME: "zahl", TYPE: "int" }, inputs: { VALUE: num("0") } }),
        label("Gemeinsam für alle Figuren und Skripte (z. B. Punkte):"),
        { kind: "button", text: "Neue Variable für alle Figuren", callbackKey: NEW_VARIABLE_BUTTON },
    ];
    const vars = [...collectVariables(mainWorkspace(ws)).entries()].sort((a, b) => a[0].localeCompare(b[0], "de"));
    if (vars.length === 0) return [...items, label("Lege eine Variable an – dann erscheinen hier ihre Blöcke.")];
    items.push(label("Deine Variablen"));
    for (const [name] of vars) items.push(blk(B.varGet, { fields: { NAME: name } }));
    const first = vars[0][0];
    items.push(blk(B.varSet, { fields: { NAME: first }, inputs: { VALUE: num("0") } }));
    const numeric = vars.find(([, t]) => t === "int" || t === "double");
    if (numeric) items.push(blk(B.varChange, { fields: { OP: "+", NAME: numeric[0] }, inputs: { VALUE: num("1") } }));
    return items;
}

/** Werkzeugleiste von Blöckly: acht Kategorien, ihr Inhalt richtet sich nach Figur bzw. Bühne */
/** hidden: Kategorien, die die Lerngruppe ausgeblendet hat; mindestens eine bleibt immer sichtbar */
export function bloecklyToolbox(hidden: string[] = []): Blockly.utils.toolbox.ToolboxDefinition {
    const shown = BL_CATEGORIES.filter((c) => !hidden.includes(c.id));
    return {
        kind: "categoryToolbox",
        contents: (shown.length ? shown : BL_CATEGORIES).map((c) => ({ kind: "category", toolboxitemid: "bl-" + c.id, name: c.name, colour: c.colour, custom: CATEGORY_KEY(c.id) })),
    } as Blockly.utils.toolbox.ToolboxDefinition;
}

/** Inhalte der Kategorien und den Knopf „Neue Variable“ anmelden */
export function registerBloecklyToolbox(ws: Blockly.WorkspaceSvg) {
    for (const c of BL_CATEGORIES) {
        ws.registerToolboxCategoryCallback(CATEGORY_KEY(c.id), (w) => categoryItems(c.id, w) as unknown as Blockly.utils.toolbox.FlyoutItemInfoArray);
    }
    ws.registerButtonCallback(NEW_VARIABLE_BUTTON, () => void newVariable(ws));
    registerGlobalVariableMenu();
}

const VAR_BLOCKS: string[] = [B.varGet, B.varSet, B.varChange];

/** Name der Variablen für alle Figuren an diesem Block (sonst undefined) */
function globalAt(block: Blockly.BlockSvg | undefined): string | undefined {
    if (!block || !VAR_BLOCKS.includes(block.type)) return undefined;
    const name = String(block.getFieldValue("NAME") ?? "");
    return name && Object.prototype.hasOwnProperty.call(ui.globals, name) ? name : undefined;
}

/**
 * Rechtsklick auf eine Variable für alle Figuren (in der Kategorie Variablen oder im Skript): umbenennen oder
 * löschen – wie in Scratch. Sie steht in der Bühne; Figuren benutzen sie als Spiel.name.
 */
function registerGlobalVariableMenu() {
    const registry = Blockly.ContextMenuRegistry.registry;
    if (registry.getItem("gsg_bl_global_rename")) return;
    const sichtbar = (scope: Blockly.ContextMenuRegistry.Scope, f: unknown) =>
        f && globalAt(scope.block as Blockly.BlockSvg | undefined) ? "enabled" : "hidden";
    registry.register({
        id: "gsg_bl_global_rename",
        scopeType: Blockly.ContextMenuRegistry.ScopeType.BLOCK,
        displayText: (scope) => `Variable „${globalAt(scope.block as Blockly.BlockSvg)}“ umbenennen …`,
        weight: 150,
        preconditionFn: (scope) => sichtbar(scope, ui.globaleUmbenennen),
        callback: (scope) => void renameGlobal(globalAt(scope.block as Blockly.BlockSvg)),
    });
    registry.register({
        id: "gsg_bl_global_delete",
        scopeType: Blockly.ContextMenuRegistry.ScopeType.BLOCK,
        displayText: (scope) => `Variable „${globalAt(scope.block as Blockly.BlockSvg)}“ löschen`,
        weight: 151,
        preconditionFn: (scope) => sichtbar(scope, ui.globaleLoeschen),
        callback: (scope) => void deleteGlobal(globalAt(scope.block as Blockly.BlockSvg)),
    });
}

async function renameGlobal(alt: string | undefined) {
    if (!alt || !ui.globaleUmbenennen) return;
    const ws = Blockly.getMainWorkspace() as Blockly.WorkspaceSvg | null;
    const { nameFragen } = await import("./BloecklyDialog");
    const taken = [...(ws ? collectVariables(ws).keys() : []), ...Object.keys(ui.globals), ...ui.figuren].filter((t) => t !== alt);
    const neu = await nameFragen(`Variable „${alt}“ umbenennen`, alt, (name) => {
        const f = namensFehler(name, []);
        if (f) return f.replace("Figur", "Variable");
        if (taken.some((t) => t.toLowerCase() === name.toLowerCase())) return `„${name}“ gibt es schon.`;
        return undefined;
    });
    if (!neu) return;
    ui.globaleUmbenennen(alt, neu);
    setTimeout(() => (ws?.getToolbox() as Blockly.Toolbox | null)?.refreshSelection(), 50);
}

async function deleteGlobal(name: string | undefined) {
    if (!name || !ui.globaleLoeschen) return;
    const ws = Blockly.getMainWorkspace() as Blockly.WorkspaceSvg | null;
    const benutzt = ui.globaleLoeschen(name);
    if (benutzt.length) {
        const { hinweisZeigen } = await import("./BloecklyDialog");
        const wo = benutzt.map((b) => b === "Bühne" ? "der Bühne" : b).join(", ");
        await hinweisZeigen("Variable wird noch benutzt",
            `„${name}“ kommt noch in Blöcken von ${wo} vor. Entferne zuerst diese Blöcke – dann lässt sich die Variable löschen.`);
        return;
    }
    setTimeout(() => (ws?.getToolbox() as Blockly.Toolbox | null)?.refreshSelection(), 50);
}

/** „Neue Variable für alle Figuren“: steht (unsichtbar) in der Bühne */
async function newVariable(ws: Blockly.WorkspaceSvg) {
    const { neueVariableFragen } = await import("./BloecklyDialog");
    const taken = [...collectVariables(mainWorkspace(ws)).keys(), ...Object.keys(ui.globals), ...ui.figuren];
    const answer = await neueVariableFragen(false, (name) => {
        if (name === "") return "Bitte gib einen Namen ein.";
        const f = namensFehler(name, []);
        if (f) return f.replace("Figur", "Variable");
        if (taken.some((t) => t.toLowerCase() === name.toLowerCase())) return `„${name}“ gibt es schon.`;
        return undefined;
    });
    if (!answer) return;
    ui.addGlobal?.(answer.name, answer.typ);
    setTimeout(() => (ws.getToolbox() as Blockly.Toolbox | null)?.refreshSelection(), 50);
}
