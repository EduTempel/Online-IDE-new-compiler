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
import { knopfGehoertZu } from "../blocks/BlockMikrowelt";
import {
    availableFor, BL_BLOCKS, BL_CATEGORIES, BL_HATS, BL_STAGE, categoryColour, istBlListe, VON_ATTRIBUTE, vonOptionen, WERT_TYPES, type BlArg, type BlBlock, type BlCategory, type BlOption,
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

/** f einmal wie für eine Figur und einmal wie für die Bühne ausführen (Paket 19k: Katalog aller Blöcke) */
export function fuerFigurUndBuehne<T>(f: () => T): [T, T] {
    const vorher = ui;
    try {
        ui = { ...vorher, stage: false };
        const figur = f();
        ui = { ...vorher, stage: true };
        return [figur, f()];
    } finally {
        ui = vorher;
    }
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

/** Paket 19b: Auswahl „x-Position, …, eigene Variablen“ – hängt von der Figur im selben Block ab (FIGUR) */
class FieldVonAttr extends Blockly.FieldDropdown {
    static override fromJson(options: Blockly.FieldDropdownFromJsonConfig) {
        return new FieldVonAttr(String((options as { value?: string }).value ?? "xPosition"));
    }

    constructor(value: string) {
        super(function (this: FieldVonAttr) { return this.attrOptions(); } as unknown as Blockly.MenuGenerator);
        this.setValue(value);
    }

    private attrOptions(): [string, string][] {
        const options = vonOptionen(String(this.getSourceBlock()?.getFieldValue("FIGUR") ?? ""));
        const current = this.getValue();
        if (typeof current === "string" && current && !options.some(([, v]) => v === current)) {
            // beim Laden steht FIGUR kurz noch auf „Bühne“: dann trotzdem „x-Position“ statt „xPosition“ zeigen
            const label = VON_ATTRIBUTE.find(([, m]) => m === current)?.[0] ?? (current.startsWith("v:") ? current.slice(2) : current);
            options.push([label, current]);
        }
        return options;
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

/** Standard für „… von …“ im Werkzeugkasten: die erste andere Figur, sonst (in einer Figur) die Bühne */
function vonStandard(): { FIGUR: string; ATTR: string } | undefined {
    const andere = ui.figuren.find((f) => f !== ui.klasse);
    if (andere) return { FIGUR: andere, ATTR: "xPosition" };
    return ui.stage ? undefined : { FIGUR: BL_STAGE, ATTR: vonOptionen(BL_STAGE)[0][1] };
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
    Blockly.fieldRegistry.register("field_gsg_bl_von_attr", FieldVonAttr as unknown as Blockly.fieldRegistry.RegistrableField);
    // Paket 19b: „[x-Position ▾] von [Pinguin ▾]“ – wechselt die Figur, passt die linke Auswahl dazu
    Blockly.Blocks[B.blVon] = {
        init(this: Blockly.Block) {
            this.jsonInit({
                message0: "%1 von %2",
                args0: [
                    { type: "field_gsg_bl_von_attr", name: "ATTR", value: "xPosition" },
                    { type: "field_gsg_bl_choice", name: "FIGUR", fixed: [["Bühne", BL_STAGE, "figur"]], source: "figuren", value: "" },
                ],
                output: null, colour: categoryColour("fuehlen"),
                tooltip: "Ein Wert einer anderen Figur (x-Position, Richtung, Kostüm, Größe oder eine ihrer eigenen Variablen) oder das Bühnenbild. Gemeint ist die Figur selbst, nicht ihre Klone.",
            });
            this.setOnChange((e: Blockly.Events.Abstract) => {
                const c = e as Blockly.Events.BlockChange;
                if (e.type !== Blockly.Events.BLOCK_CHANGE || c.blockId !== this.id || c.name !== "FIGUR") return;
                const options = vonOptionen(String(this.getFieldValue("FIGUR")));
                if (!options.some(([, v]) => v === this.getFieldValue("ATTR"))) this.setFieldValue(options[0][1], "ATTR");
            });
        },
    };
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
        hat(B.blMsgData, "Wenn ich %1 empfange mit Wert (%2)", [
            { type: "field_gsg_message", name: "MSG", value: DEFAULT_MESSAGE },
            { type: "field_dropdown", name: "TYPE", options: WERT_TYPES },
        ], "Startet bei dieser Nachricht und bekommt ihren Wert („sende … mit …“). Im Skript steht er im Block „Wert“; kommt die Nachricht ohne Wert, ist er 0 bzw. leer." + tail),
        hat(B.blBackdrop, "Wenn Bühnenbild wechselt zu %1", [{ type: "field_gsg_bl_choice", name: "BILD", source: "buehnenbilder", fixed: [], value: "" }],
            "Startet, sobald die Bühne zu diesem Bühnenbild wechselt („wechsle zu Bühnenbild …“, „nächstes Bühnenbild“)." + tail),
        hat(B.blTimer, "Wenn Stoppuhr > %1", [{ type: "field_number", name: "SEK", value: 10, min: 0 }],
            "Startet einmal, sobald die Stoppuhr diesen Wert (Sekunden) überschreitet – nach „setze Stoppuhr zurück“ wieder." + tail),
        {
            type: B.blWert, message0: "Wert", output: null, colour: events,
            tooltip: "Der Wert der Nachricht – nur im Skript „Wenn ich … empfange mit Wert“.",
        },
        {
            type: B.blSendWith, message0: "sende %1 mit %2", args0: [{ type: "field_gsg_message", name: "MSG", value: DEFAULT_MESSAGE }, { type: "input_value", name: "WERT" }],
            inputsInline: true, ...statement, colour: events,
            tooltip: "Sendet die Nachricht an alle Figuren und die Bühne und gibt einen Wert mit (Zahl oder Text). Skripte „Wenn ich … empfange mit Wert“ bekommen ihn.",
        },
        {
            type: B.blSendWithWait, message0: "sende %1 mit %2 und warte", args0: [{ type: "field_gsg_message", name: "MSG", value: DEFAULT_MESSAGE }, { type: "input_value", name: "WERT" }],
            inputsInline: true, ...statement, colour: events,
            tooltip: "Wie „sende … mit …“, wartet aber, bis alle gestarteten Skripte fertig sind.",
        },
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
export const NEW_LIST_BUTTON = "BL_NEW_LIST";

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

/** Beispiel „Meine Blöcke“: Operation istGerade(int x) liefert wahr/falsch (x % 2 == 0) */
function istGeradeBeispiel(): Item {
    const v = (name: string) => ({ block: { type: B.varGet, fields: { NAME: name } } });
    const rest = { block: { type: B.arith, fields: { OP: "%" }, inputs: { A: v("x"), B: { block: { type: B.number, fields: { NUM: "2" } } } } } };
    const vergleich = { block: { type: B.compare, fields: { OP: "==" }, inputs: { A: rest, B: { block: { type: B.number, fields: { NUM: "0" } } } } } };
    return {
        kind: "block", type: B.method, extraState: { params: [{ name: "x", type: "int" }] },
        fields: { NAME: "istGerade", RETURN: "boolean", PNAME0: "x", PTYPE0: "int" },
        inputs: { BODY: { block: { type: B.return, inputs: { VALUE: vergleich } } } },
    };
}

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
                label("Nachrichten mit Wert (z. B. Punkte):"),
                blk(B.blSendWith, { inputs: { WERT: num("10") } }), blk(B.blSendWithWait, { inputs: { WERT: num("10") } }),
                blk(B.blWert),
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
        case "fuehlen": {
            const von = vonStandard();
            const i = specs.findIndex((s) => s.type === "bl_abstand");
            if (von && i >= 0) specs.splice(i + 1, 0, blk(B.blVon, { fields: von }));
            return specs;
        }
        case "meine": {
            const items = (operationsFlyout(ws) as unknown as Item[]).filter((i) => i.kind !== "label" || !String(i.text).startsWith("Neue Operation"));
            // Paket 19h: neben „quadrat“ ein Beispiel mit Ja/Nein-Ergebnis
            const quadrat = items.findIndex((i) => (i.fields as Record<string, unknown> | undefined)?.NAME === "quadrat");
            if (quadrat >= 0) items.splice(quadrat + 1, 0, istGeradeBeispiel());
            return [
                label("Eigene Blöcke fassen Blöcke zusammen, die du öfter brauchst. Sie gehören zu dieser Figur."),
                label("Liefert der Block etwas (Zahl, Text, wahr/falsch), legt „gib zurück“ das Ergebnis fest – du benutzt ihn wie „x-Position“ oder „berührt …?“."),
                ...items,
            ];
        }
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
    const all = [...collectVariables(mainWorkspace(ws)).entries()].sort((a, b) => a[0].localeCompare(b[0], "de"));
    const vars = all.filter(([, t]) => !istBlListe(t));
    if (vars.length === 0) items.push(label("Lege eine Variable an – dann erscheinen hier ihre Blöcke."));
    else {
        items.push(label("Deine Variablen"));
        for (const [name] of vars) items.push(blk(B.varGet, { fields: { NAME: name } }));
        const first = vars[0][0];
        items.push(blk(B.varSet, { fields: { NAME: first }, inputs: { VALUE: num("0") } }));
        const numeric = vars.find(([, t]) => t === "int" || t === "double");
        if (numeric) items.push(blk(B.varChange, { fields: { OP: "+", NAME: numeric[0] }, inputs: { VALUE: num("1") } }));
    }
    return [...items, ...listItems(all.filter(([, t]) => istBlListe(t)))];
}

/** Paket 19f: Listen wie in Scratch (Positionen ab 0) – Knopf „Neue Liste“ und die Blöcke zur ersten Liste */
function listItems(lists: [string, string][]): Item[] {
    const items: Item[] = [
        label("Listen: viele Werte unter einem Namen. Das erste Element hat die Position 0."),
        { kind: "button", text: "Neue Liste für alle Figuren", callbackKey: NEW_LIST_BUTTON },
    ];
    if (lists.length === 0) return items;
    const [name, typ] = lists[0];
    const wert = () => (typ === "ArrayList<String>" ? txt("Ding") : num("1"));
    const NAME = { NAME: name };
    items.push(
        label("Deine Listen: " + lists.map((l) => l[0]).join(", ")),
        blk(B.listAdd, { fields: NAME, inputs: { V: wert() } }),
        blk(B.listRemove, { fields: NAME, inputs: { I: num("0") } }),
        blk(B.listClear, { fields: NAME }),
        blk(B.listInsert, { fields: NAME, inputs: { V: wert(), I: num("0") } }),
        blk(B.listSet, { fields: NAME, inputs: { I: num("0"), V: wert() } }),
        blk(B.listGet, { fields: NAME, inputs: { I: num("0") } }),
        blk(B.listIndexOf, { fields: NAME, inputs: { V: wert() } }),
        blk(B.listSize, { fields: NAME }),
        blk(B.listContains, { fields: NAME, inputs: { V: wert() } }),
    );
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
    ws.registerButtonCallback(NEW_LIST_BUTTON, () => void newVariable(ws, true));
    // Paket 19k: in einer Mikrowelt nur, wenn die passenden Blöcke dabei sind
    knopfGehoertZu(NEW_VARIABLE_BUTTON, [B.varGet, B.varSet, B.varChange + ":+"]);
    knopfGehoertZu(NEW_LIST_BUTTON, [B.listAdd, B.listRemove, B.listClear, B.listInsert, B.listSet, B.listGet, B.listIndexOf, B.listSize, B.listContains]);
    registerGlobalVariableMenu();
}

const VAR_BLOCKS: string[] = [B.varGet, B.varSet, B.varChange, B.listAdd, B.listRemove, B.listClear, B.listInsert, B.listSet, B.listGet,
    B.listIndexOf, B.listSize, B.listContains];

/** „Variable“ bzw. „Liste“ (Paket 19f) */
const artDerGlobalen = (name: string | undefined) => (istBlListe(name ? ui.globals[name] : undefined) ? "Liste" : "Variable");

/** Name der Variablen (bzw. Liste) für alle Figuren an diesem Block (sonst undefined) */
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
        displayText: (scope) => {
            const name = globalAt(scope.block as Blockly.BlockSvg);
            return `${artDerGlobalen(name)} „${name}“ umbenennen …`;
        },
        weight: 150,
        preconditionFn: (scope) => sichtbar(scope, ui.globaleUmbenennen),
        callback: (scope) => void renameGlobal(globalAt(scope.block as Blockly.BlockSvg)),
    });
    registry.register({
        id: "gsg_bl_global_delete",
        scopeType: Blockly.ContextMenuRegistry.ScopeType.BLOCK,
        displayText: (scope) => {
            const name = globalAt(scope.block as Blockly.BlockSvg);
            return `${artDerGlobalen(name)} „${name}“ löschen`;
        },
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
    const art = artDerGlobalen(alt);
    const neu = await nameFragen(`${art} „${alt}“ umbenennen`, alt, (name) => {
        const f = namensFehler(name, []);
        if (f) return f.replace("Figur", art);
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
        const art = artDerGlobalen(name);
        await hinweisZeigen(`${art} wird noch benutzt`,
            `„${name}“ kommt noch in Blöcken von ${wo} vor. Entferne zuerst diese Blöcke – dann lässt sich die ${art} löschen.`);
        return;
    }
    setTimeout(() => (ws?.getToolbox() as Blockly.Toolbox | null)?.refreshSelection(), 50);
}

/** „Neue Variable für alle Figuren“ (bzw. „Neue Liste“, Paket 19f): steht (unsichtbar) in der Bühne */
async function newVariable(ws: Blockly.WorkspaceSvg, liste = false) {
    const { neueVariableFragen } = await import("./BloecklyDialog");
    const taken = [...collectVariables(mainWorkspace(ws)).keys(), ...Object.keys(ui.globals), ...ui.figuren];
    const answer = await neueVariableFragen(false, (name) => {
        if (name === "") return "Bitte gib einen Namen ein.";
        const f = namensFehler(name, []);
        if (f) return f.replace("Figur", liste ? "Liste" : "Variable");
        if (taken.some((t) => t.toLowerCase() === name.toLowerCase())) return `„${name}“ gibt es schon.`;
        return undefined;
    }, liste);
    if (!answer) return;
    ui.addGlobal?.(answer.name, answer.typ);
    setTimeout(() => (ws.getToolbox() as Blockly.Toolbox | null)?.refreshSelection(), 50);
}
