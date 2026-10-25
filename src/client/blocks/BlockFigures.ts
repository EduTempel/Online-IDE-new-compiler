import * as Blockly from "blockly/core";
import { B } from "./BlockTypes";
import { variablesFor, collectVariables } from "./BlockTypeSystem";
import {
    COLOURS, DEFAULT_FIGURE_NAME, FIGURE_ACTIONS, FIGURE_CLASSES, FIGURE_NAMES_DE, FIGURE_PROPS, FILLED, isFigureClass, KEYS,
    type FigureClass,
} from "./FigureSpec";

/**
 * Blockmodus Paket 8: Figuren und Sprites, Tasten und Maus (Spielschleife im Hauptprogramm).
 * Figuren werden über ihren Namen ausgewählt (wie Reihungen und Listen).
 */

export const FIGURES_COLOUR = "#c2185b";
export const INPUT_COLOUR = "#00838f";
export const FIGURES_CATEGORY = "GSG_FIGURES";
export const INPUT_CATEGORY = "GSG_KEYS_MOUSE";

// ------------------------------------------------------------------ Sprite-Bilder

export type SpriteSource = {
    /** Namen aller Bilder (SpriteLibrary.…), eigene zuerst */
    names(): string[];
    /** Vorschau (data-URL) des Bildes mit Nummer index, falls schon geladen */
    preview(name: string, index: number): string | undefined;
    /** eigene Bilder des Projekts? */
    isOwn?(name: string): boolean;
};

let spriteSource: SpriteSource = { names: () => ["Ship_1"], preview: () => undefined };

/** Von der Blockansicht gesetzt (Bilder der IDE und des Projekts) */
export function setSpriteSource(source: SpriteSource) {
    spriteSource = source;
}

const EMPTY_IMAGE = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

// ------------------------------------------------------------------ Felder

/** Auswahl mit festen Einträgen, die zusätzlich jeden anderen Wert aus dem Java-Code behält */
export class FieldOpenDropdown extends Blockly.FieldDropdown {
    static override fromJson(options: Blockly.FieldDropdownFromJsonConfig) {
        const o = options as { value?: string; choices?: [string, string][] };
        return new FieldOpenDropdown(o.choices ?? [["-", "-"]], String(o.value ?? o.choices?.[0]?.[1] ?? ""));
    }

    constructor(private choices: [string, string][], value: string) {
        super(function (this: FieldOpenDropdown) { return this.openOptions(); } as unknown as Blockly.MenuGenerator);
        this.setValue(value);
    }

    private openOptions(): [string, string][] {
        if (this.choices === undefined) return [["-", "-"]];   // im Konstruktor von FieldDropdown noch nicht gesetzt
        const current = this.getValue();
        if (typeof current === "string" && current && !this.choices.some(([, v]) => v === current)) {
            return [...this.choices, [current, current]];
        }
        return this.choices;
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

/** Auswahl einer Figur (Variable vom Typ Circle, Rectangle, Text oder Sprite) */
export class FieldFigureName extends Blockly.FieldDropdown {
    static override fromJson(options: Blockly.FieldDropdownFromJsonConfig) {
        const o = options as { text?: string; kinds?: FigureClass[] };
        return new FieldFigureName(String(o.text ?? "ball"), o.kinds ?? [...FIGURE_CLASSES]);
    }

    constructor(value: string, private kinds: FigureClass[]) {
        super(function (this: FieldFigureName) { return this.figureOptions(); } as unknown as Blockly.MenuGenerator);
        this.setValue(value);
    }

    private figureOptions(): [string, string][] {
        const kinds = this.kinds ?? [...FIGURE_CLASSES];
        const block = this.getSourceBlock();
        const names = new Set<string>();
        if (block) for (const [name, type] of variablesFor(block)) if (isFigureClass(type) && kinds.includes(type)) names.add(name);
        const current = this.getValue();
        if (typeof current === "string" && current) names.add(current);
        if (names.size === 0) names.add(DEFAULT_FIGURE_NAME[kinds[0]]);
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

/** Auswahl eines Bildes aus der SpriteLibrary (eigene Bilder des Projekts zuerst) */
export class FieldSpriteImage extends Blockly.FieldDropdown {
    static override fromJson(options: Blockly.FieldDropdownFromJsonConfig) {
        return new FieldSpriteImage(String((options as { value?: string }).value ?? "Ship_1"));
    }

    constructor(value: string) {
        super(function (this: FieldSpriteImage) { return this.imageOptions(); } as unknown as Blockly.MenuGenerator);
        this.setValue(value);
    }

    private imageOptions(): [string, string][] {
        const names = new Set(spriteSource.names());
        const current = this.getValue();
        if (typeof current === "string" && current) names.add(current);
        return [...names].map((n) => [spriteSource.isOwn?.(n) ? `${n} (eigenes Bild)` : n, n]);
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

// ------------------------------------------------------------------ Blöcke

const hint = (text: string) => ({ type: "field_label", text, class: "gsg-java-hint" });
const value = (name: string) => ({ type: "input_value", name });
const statement = { previousStatement: null, nextStatement: null };
const figure = (kinds: FigureClass[] = [...FIGURE_CLASSES], name = "NAME") =>
    ({ type: "field_gsg_figure", name, text: DEFAULT_FIGURE_NAME[kinds[0]], kinds });
const colour = (name = "COLOR", initial = "red") => ({ type: "field_gsg_open_dropdown", name, choices: COLOURS, value: initial });

export function defineFigureBlocks(defineJson: (json: object[]) => void) {
    Blockly.fieldRegistry.register("field_gsg_figure", FieldFigureName as unknown as Blockly.fieldRegistry.RegistrableField);
    Blockly.fieldRegistry.register("field_gsg_open_dropdown", FieldOpenDropdown as unknown as Blockly.fieldRegistry.RegistrableField);
    Blockly.fieldRegistry.register("field_gsg_sprite", FieldSpriteImage as unknown as Blockly.fieldRegistry.RegistrableField);
    registerSpritePreview();

    const fig = { colour: FIGURES_COLOUR, inputsInline: true };
    const inp = { colour: INPUT_COLOUR, inputsInline: true };
    const nameField = (cls: FigureClass) => ({ type: "field_input", name: "NAME", text: DEFAULT_FIGURE_NAME[cls] });
    defineJson([
        // ------------------------------------------------------------ Welt und Figuren anlegen
        {
            type: B.worldNew, message0: "Grafikfenster Breite %1 Höhe %2 Hintergrund %3 %4",
            args0: [value("W"), value("H"), colour("COLOR", "white"), hint("new World")],
            ...statement, ...fig,
            tooltip: "Legt das Grafikfenster an (als erste Anweisung). Koordinaten: (0|0) ist oben links, x nach rechts, y nach unten. "
                + "Ohne diesen Block ist das Fenster 800 × 600 groß und weiß.",
        },
        {
            type: B.figCircle, message0: "erstelle Kreis %1 Mittelpunkt ( %2 | %3 ) Radius %4 %5",
            args0: [nameField("Circle"), value("X"), value("Y"), value("R"), hint("new Circle")],
            ...statement, ...fig, extensions: ["gsg_identifier"],
            tooltip: "Legt einen Kreis an. Mit dem Namen sprichst du ihn später an (bewegen, färben, …).",
        },
        {
            type: B.figRect, message0: "erstelle Rechteck %1 links oben ( %2 | %3 ) Breite %4 Höhe %5 %6",
            args0: [nameField("Rectangle"), value("X"), value("Y"), value("W"), value("H"), hint("new Rectangle")],
            ...statement, ...fig, extensions: ["gsg_identifier"],
            tooltip: "Legt ein Rechteck an (Ecke links oben, Breite, Höhe).",
        },
        {
            type: B.figText, message0: "erstelle Text %1 bei ( %2 | %3 ) Größe %4 Inhalt %5 %6",
            args0: [nameField("Text"), value("X"), value("Y"), value("SIZE"), value("TEXT"), hint("new Text")],
            ...statement, ...fig, extensions: ["gsg_identifier"],
            tooltip: "Legt einen Text im Grafikfenster an, z. B. für den Punktestand.",
        },
        {
            type: B.figSprite, message0: "erstelle Sprite %1 bei ( %2 | %3 ) Bild %4 Nr. %5 %6 %7",
            args0: [nameField("Sprite"), value("X"), value("Y"), { type: "field_gsg_sprite", name: "IMG", value: "Ship_1" }, value("INDEX"),
                { type: "field_image", name: "PREVIEW", src: EMPTY_IMAGE, width: 32, height: 32, alt: "" }, hint("new Sprite")],
            ...statement, ...fig, extensions: ["gsg_identifier", "gsg_sprite_preview"],
            tooltip: "Legt ein Sprite (eine Bildfigur) an. Viele Bilder haben mehrere Nummern (z. B. für Bewegungen). "
                + "Eigene Bilder fügst du über das Menü „Sprites“ hinzu.",
        },

        // ------------------------------------------------------------ Figuren verändern
        {
            type: B.figMove, message0: "bewege %1 um ( %2 | %3 ) %4", args0: [figure(), value("DX"), value("DY"), hint(".move")],
            ...statement, ...fig, tooltip: "Verschiebt die Figur: erste Zahl nach rechts (negativ: links), zweite nach unten (negativ: oben).",
        },
        {
            type: B.figMoveTo, message0: "setze %1 auf Position ( %2 | %3 ) %4", args0: [figure(), value("X"), value("Y"), hint(".moveTo")],
            ...statement, ...fig, tooltip: "Setzt die Figur an eine Stelle im Grafikfenster.",
        },
        {
            type: B.figRotate, message0: "drehe %1 um %2 Grad %3", args0: [figure(), value("A"), hint(".rotate")],
            ...statement, ...fig, tooltip: "Dreht die Figur gegen den Uhrzeigersinn (negativ: im Uhrzeigersinn).",
        },
        {
            type: B.figForward, message0: "gehe mit %1 %2 Schritte in Blickrichtung %3", args0: [figure(), value("D"), hint(".forward")],
            ...statement, ...fig, tooltip: "Bewegt die Figur in die Richtung, in die sie gedreht ist (am Anfang: nach rechts).",
        },
        {
            type: B.figScale, message0: "vergrößere %1 um Faktor %2 %3", args0: [figure(), value("F"), hint(".scale")],
            ...statement, ...fig, tooltip: "Streckt die Figur: 2 macht sie doppelt so groß, 0.5 halb so groß.",
        },
        {
            type: B.figColor, message0: "färbe %1 %2 %3", args0: [figure(FILLED), colour(), hint(".setFillColor")],
            ...statement, ...fig, tooltip: "Ändert die Füllfarbe (Kreis, Rechteck, Text).",
        },
        {
            type: B.figAction, message0: "%1 %2 %3",
            args0: [{ type: "field_dropdown", name: "ACTION", options: FIGURE_ACTIONS.map(([label, v]) => [label, v]) }, figure(), hint(".setVisible …")],
            ...statement, ...fig,
            tooltip: "zeige/verstecke: sichtbar oder unsichtbar machen; nach vorne/hinten: verdeckt andere bzw. wird verdeckt; entferne: Figur verschwindet ganz.",
        },
        {
            type: B.figSetText, message0: "setze Inhalt von %1 auf %2 %3", args0: [figure(["Text"]), value("TEXT"), hint(".setText")],
            ...statement, ...fig, tooltip: "Ändert, was der Text anzeigt, z. B. \"Punkte: \" + punkte.",
        },
        {
            type: B.figSetImage, message0: "setze Bildnummer von %1 auf %2 %3", args0: [figure(["Sprite"]), value("I"), hint(".setImageIndex")],
            ...statement, ...fig, tooltip: "Zeigt ein anderes Bild aus derselben Bildreihe (z. B. für eine Laufbewegung).",
        },

        // ------------------------------------------------------------ Werte von Figuren
        {
            type: B.figProp, message0: "%1 von %2 %3",
            args0: [{ type: "field_dropdown", name: "PROP", options: FIGURE_PROPS.map(([label, v]) => [label, v]) }, figure(), hint(".getCenterX()")],
            output: null, ...fig, tooltip: "Position der Mitte bzw. Drehwinkel der Figur (Kommazahl).",
        },
        {
            type: B.figTouches, message0: "%1 berührt %2 %3", args0: [figure(), figure(undefined, "OTHER"), hint(".collidesWith")],
            output: null, ...fig, tooltip: "Wahr, wenn sich die beiden Figuren überlappen.",
        },
        {
            type: B.figOutside, message0: "%1 ist außerhalb des Fensters %2", args0: [figure(), hint(".isOutsideView()")],
            output: null, ...fig, tooltip: "Wahr, wenn die Figur ganz aus dem Grafikfenster heraus ist.",
        },

        // ------------------------------------------------------------ Tasten und Maus
        {
            type: B.keyDown, message0: "Taste %1 gedrückt %2",
            args0: [{ type: "field_gsg_open_dropdown", name: "KEY", choices: KEYS, value: "ArrowRight" }, hint("Input.isKeyDown")],
            output: null, ...inp, tooltip: "Wahr, solange die Taste gedrückt ist. Gehört in eine Schleife (z. B. „wiederhole fortlaufend“).",
        },
        {
            type: B.mouseDown, message0: "%1 %2",
            args0: [{ type: "field_dropdown", name: "WHAT", options: [["Maustaste gedrückt", "down"], ["Maus wurde geklickt", "clicked"]] }, hint("Mouse.isDown()")],
            output: null, ...inp,
            tooltip: "„gedrückt“: wahr, solange die Maustaste unten ist. „geklickt“: wahr, wenn seit der letzten Abfrage geklickt wurde (jeder Klick einmal).",
        },
        {
            type: B.mouseOver, message0: "%1 %2 %3",
            args0: [{ type: "field_dropdown", name: "WHAT", options: [["Mausklick auf", "clicked"], ["Maus ist über", "over"]] }, figure(), hint("Mouse.wasClicked")],
            output: null, ...inp,
            tooltip: "„Mausklick auf“: wahr, wenn die Figur gerade angeklickt wurde (jeder Klick zählt einmal). „Maus ist über“: wahr, solange der Mauszeiger über der Figur ist.",
        },
        {
            type: B.mouseXY, message0: "Maus %1 %2",
            args0: [{ type: "field_dropdown", name: "AXIS", options: [["x-Position", "x"], ["y-Position", "y"]] }, hint("Mouse.getX()")],
            output: null, ...inp, tooltip: "Position des Mauszeigers im Grafikfenster.",
        },
    ]);
}

/** Vorschau des Sprite-Bildes im Block (Bild und Nummer) */
function registerSpritePreview() {
    if (Blockly.Extensions.isRegistered("gsg_sprite_preview")) return;
    Blockly.Extensions.register("gsg_sprite_preview", function (this: Blockly.Block) {
        const update = () => {
            const preview = this.getField("PREVIEW") as Blockly.FieldImage | null;
            if (!preview) return;
            const indexBlock = this.getInputTargetBlock("INDEX");
            const index = indexBlock?.type === B.number ? Math.trunc(Number(indexBlock.getFieldValue("NUM")) || 0) : 0;
            const src = spriteSource.preview(String(this.getFieldValue("IMG") ?? ""), index);
            preview.setValue(src ?? EMPTY_IMAGE);
        };
        this.setOnChange((e) => {
            if (e.isUiEvent) return;
            update();
        });
        setTimeout(update, 0);
    });
}

// ------------------------------------------------------------------ Werkzeugleiste

const num = (n: string) => ({ block: { type: B.number, fields: { NUM: n } } });
const txt = (t: string) => ({ block: { type: B.text, fields: { TEXT: t } } });

/** Namen vorhandener Figuren (für die Blöcke der Werkzeugleiste) */
function existingFigures(ws: Blockly.WorkspaceSvg): Map<string, FigureClass> {
    const result = new Map<string, FigureClass>();
    for (const [name, type] of collectVariables(ws)) if (isFigureClass(type)) result.set(name, type);
    return result;
}

function firstOf(figures: Map<string, FigureClass>, kinds: FigureClass[]): string {
    for (const [name, type] of [...figures].sort((a, b) => a[0].localeCompare(b[0], "de"))) if (kinds.includes(type)) return name;
    return DEFAULT_FIGURE_NAME[kinds[0]];
}

export function figuresFlyout(ws: Blockly.WorkspaceSvg): Blockly.utils.toolbox.FlyoutItemInfoArray {
    const figs = existingFigures(ws);
    const any = firstOf(figs, [...FIGURE_CLASSES]);
    const filled = firstOf(figs, FILLED);
    const other = [...figs.keys()].find((n) => n !== any) ?? "wand";
    const sprites = spriteSource.names();
    const items: object[] = [
        { kind: "label", text: "Grafikfenster: (0|0) ist oben links, x nach rechts, y nach unten (Standard 800 × 600)." },
        { kind: "block", type: B.worldNew, fields: { COLOR: "white" }, inputs: { W: num("800"), H: num("600") } },
        { kind: "label", text: "Figuren anlegen – der Name ist wie eine Variable" },
        { kind: "block", type: B.figCircle, fields: { NAME: "ball" }, inputs: { X: num("400"), Y: num("300"), R: num("30") } },
        { kind: "block", type: B.figRect, fields: { NAME: "wand" }, inputs: { X: num("100"), Y: num("500"), W: num("600"), H: num("20") } },
        { kind: "block", type: B.figText, fields: { NAME: "anzeige" }, inputs: { X: num("10"), Y: num("10"), SIZE: num("24"), TEXT: txt("Punkte: 0") } },
        { kind: "block", type: B.figSprite, fields: { NAME: "figur", IMG: sprites[0] ?? "Ship_1" }, inputs: { X: num("200"), Y: num("200"), INDEX: num("0") } },
        { kind: "label", text: "Figuren verändern" },
        { kind: "block", type: B.figMove, fields: { NAME: any }, inputs: { DX: num("5"), DY: num("0") } },
        { kind: "block", type: B.figMoveTo, fields: { NAME: any }, inputs: { X: num("400"), Y: num("300") } },
        { kind: "block", type: B.figRotate, fields: { NAME: any }, inputs: { A: num("15") } },
        { kind: "block", type: B.figForward, fields: { NAME: any }, inputs: { D: num("5") } },
        { kind: "block", type: B.figScale, fields: { NAME: any }, inputs: { F: num("1.5") } },
        { kind: "block", type: B.figColor, fields: { NAME: filled, COLOR: "red" } },
        { kind: "block", type: B.figAction, fields: { ACTION: "hide", NAME: any } },
        { kind: "block", type: B.figSetText, fields: { NAME: firstOf(figs, ["Text"]) }, inputs: { TEXT: txt("Punkte: 1") } },
        { kind: "block", type: B.figSetImage, fields: { NAME: firstOf(figs, ["Sprite"]) }, inputs: { I: num("1") } },
        { kind: "label", text: "Werte und Bedingungen" },
        { kind: "block", type: B.figProp, fields: { PROP: "x", NAME: any } },
        { kind: "block", type: B.figTouches, fields: { NAME: any, OTHER: other } },
        { kind: "block", type: B.figOutside, fields: { NAME: any } },
    ];
    return items as Blockly.utils.toolbox.FlyoutItemInfoArray;
}

export function inputFlyout(ws: Blockly.WorkspaceSvg): Blockly.utils.toolbox.FlyoutItemInfoArray {
    const figs = existingFigures(ws);
    const any = firstOf(figs, [...FIGURE_CLASSES]);
    const key = (k: string) => ({ block: { type: B.keyDown, fields: { KEY: k } } });
    const move = (dx: string, dy: string) => ({ block: { type: B.figMove, fields: { NAME: any }, inputs: { DX: num(dx), DY: num(dy) } } });
    const items: object[] = [
        { kind: "label", text: "Spielschleife: Tasten und Maus immer wieder abfragen, kurz warten, von vorn." },
        {
            kind: "block", type: B.forever, inputs: {
                DO: {
                    block: {
                        type: B.if, extraState: { elseIfs: 0, hasElse: false, fixed: true }, inputs: { COND: key("ArrowRight"), DO: move("5", "0") },
                        next: {
                            block: {
                                type: B.if, extraState: { elseIfs: 0, hasElse: false, fixed: true }, inputs: { COND: key("ArrowLeft"), DO: move("-5", "0") },
                                next: { block: { type: B.wait, inputs: { MS: num("20") } } },
                            },
                        },
                    },
                },
            },
        },
        { kind: "label", text: "Tasten" },
        { kind: "block", type: B.keyDown, fields: { KEY: "ArrowRight" } },
        { kind: "block", type: B.keyDown, fields: { KEY: " " } },
        { kind: "label", text: "Maus" },
        { kind: "block", type: B.mouseDown, fields: { WHAT: "clicked" } },
        { kind: "block", type: B.mouseDown, fields: { WHAT: "down" } },
        { kind: "block", type: B.mouseOver, fields: { WHAT: "clicked", NAME: any } },
        { kind: "block", type: B.mouseOver, fields: { WHAT: "over", NAME: any } },
        { kind: "block", type: B.mouseXY, fields: { AXIS: "x" } },
        { kind: "block", type: B.mouseXY, fields: { AXIS: "y" } },
    ];
    return items as Blockly.utils.toolbox.FlyoutItemInfoArray;
}

/** Bezeichnung einer Figurklasse auf Deutsch */
export function figureClassLabel(cls: string): string {
    return isFigureClass(cls) ? FIGURE_NAMES_DE[cls] : cls;
}
