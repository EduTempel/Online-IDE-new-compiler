import * as Blockly from "blockly/core";
import { B } from "./BlockTypes";
import { collectVariables, variablesFor } from "./BlockTypeSystem";
import { defineIfBlock, definePrintBlock } from "./BlockMutators";
import { defineOperationBlocks, OPERATIONS_CATEGORY, OPERATIONS_COLOUR } from "./BlockOperations";

/**
 * Blöcke der Stufe 1 (Grundlagen, Abitur-Operationen): deutsche Beschriftung, das Java-Wort klein dahinter
 * (Klasse gsg-java-hint). Farben nach Kategorie; der Programmstart in GSG-Dunkelblau.
 */

export const COLOURS = {
    start: "#00376D",
    output: "#4a6cd4",
    variables: "#e07b00",
    control: "#b07a00",
    conditions: "#2e8fa8",
    values: "#3a9a27",
    text: "#8e5bb5",
    java: "#6b6b6b",
    comment: "#8a8a8a",
};

const hint = (text: string) => ({ type: "field_label", text, class: "gsg-java-hint" });
const statement = { previousStatement: null, nextStatement: null };

const VAR_TYPE_OPTIONS = [
    ["Ganzzahl (int)", "int"], ["Kommazahl (double)", "double"], ["Text (String)", "String"],
    ["Wahrheitswert (boolean)", "boolean"], ["Zeichen (char)", "char"],
];

/**
 * Auswahl einer deklarierten Variablen (statt freier Eingabe, damit es keine Tippfehler gibt).
 * Nimmt auch Namen an, die (noch) nicht deklariert sind – z. B. aus dem Java-Code übernommen.
 */
export class FieldVariableName extends Blockly.FieldDropdown {
    static override fromJson(options: Blockly.FieldDropdownFromJsonConfig) {
        return new FieldVariableName(String((options as { text?: string }).text ?? "zahl"));
    }

    constructor(value: string) {
        super(function (this: FieldVariableName) { return this.variableOptions(); } as unknown as Blockly.MenuGenerator);
        this.setValue(value);
    }

    /** Variablen des eigenen Hauptprogramms bzw. der eigenen Operation (lose Blöcke: alle) */
    private variableOptions(): [string, string][] {
        const block = this.getSourceBlock();
        const names = new Set<string>(block ? [...variablesFor(block).keys()] : []);
        const current = this.getValue();
        if (typeof current === "string" && current) names.add(current);
        if (names.size === 0) names.add("zahl");
        return [...names].sort((a, b) => a.localeCompare(b, "de")).map((n) => [n, n]);
    }

    protected override doClassValidation_(newValue?: unknown): string | null {
        return typeof newValue === "string" && /^[\p{L}_$][\p{L}\p{N}_$]*$/u.test(newValue) ? newValue : null;
    }

    /** Die Auswahlliste wird zwischengespeichert: nach dem Setzen neu erzeugen, damit der Name darin steht */
    protected override doValueUpdate_(newValue: string) {
        super.doValueUpdate_(newValue);
        this.getOptions(false);
        super.doValueUpdate_(newValue);
    }
}

let defined = false;

export function defineBlocks() {
    if (defined) return;
    defined = true;
    Blockly.fieldRegistry.register("field_gsg_variable", FieldVariableName as unknown as Blockly.fieldRegistry.RegistrableField);

    // Java-Bezeichner: nur Buchstaben, Ziffern, _ und $; nicht mit Ziffer beginnen
    Blockly.Extensions.register("gsg_identifier", function (this: Blockly.Block) {
        for (const name of ["NAME", "VAR"]) {
            const field = this.getField(name);
            field?.setValidator((v: string) => {
                const cleaned = String(v).replace(/[^\p{L}\p{N}_$]/gu, "");
                return cleaned === "" || /^\p{N}/u.test(cleaned) ? null : cleaned;
            });
        }
    });
    Blockly.Extensions.register("gsg_char", function (this: Blockly.Block) {
        this.getField("CHAR")?.setValidator((v: string) => {
            const chars = [...String(v)];
            return chars.length === 1 ? chars[0] : chars.length > 1 ? chars[chars.length - 1] : null;
        });
    });
    Blockly.Extensions.register("gsg_number", function (this: Blockly.Block) {
        this.getField("NUM")?.setValidator((v: string) => {
            const s = String(v).trim().replace(",", ".");
            return /^-?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?[dDfFlL]?$/.test(s) ? s : null;
        });
    });

    defineIfBlock(COLOURS.control);
    definePrintBlock(COLOURS.output);
    defineOperationBlocks((json) => Blockly.common.defineBlocksWithJsonArray(json));

    Blockly.common.defineBlocksWithJsonArray([
        {
            type: B.start, message0: "Hauptprogramm %1", args0: [hint("main")],
            message1: "%1", args1: [{ type: "input_statement", name: "BODY" }],
            colour: COLOURS.start, hat: "cap",
            tooltip: "Hier beginnt das Programm. Ausgeführt werden die Blöcke, die hier angehängt sind "
                + "(und Operationen, wenn sie aufgerufen werden).",
        },

        // ------------------------------------------------------------ Variablen
        {
            type: B.varDeclare, message0: "erstelle neue Variable %1 vom Datentyp %2 mit Wert %3",
            args0: [{ type: "field_input", name: "NAME", text: "zahl" },
                { type: "field_dropdown", name: "TYPE", options: VAR_TYPE_OPTIONS }, { type: "input_value", name: "VALUE" }],
            inputsInline: true, ...statement, colour: COLOURS.variables, extensions: ["gsg_identifier"],
            tooltip: "Legt eine neue Variable an und gibt ihr einen Startwert, z. B. int zahl = 5; "
                + "Beim Wechsel des Datentyps wird der Startwert passend umgestellt.",
        },
        {
            type: B.varSet, message0: "setze %1 auf %2 %3",
            args0: [{ type: "field_gsg_variable", name: "NAME", text: "zahl" }, { type: "input_value", name: "VALUE" }, hint("=")],
            inputsInline: true, ...statement, colour: COLOURS.variables,
            tooltip: "Gibt der Variablen einen neuen Wert, z. B. zahl = 7;",
        },
        {
            type: B.varChange, message0: "erhöhe %1 um %2 %3",
            args0: [{ type: "field_gsg_variable", name: "NAME", text: "zahl" }, { type: "input_value", name: "VALUE" }, hint("+=")],
            inputsInline: true, ...statement, colour: COLOURS.variables,
            tooltip: "Zählt etwas zur Variablen dazu, z. B. zahl += 2; Bei Texten wird angehängt.",
        },
        {
            type: B.varSub, message0: "verringere %1 um %2 %3",
            args0: [{ type: "field_gsg_variable", name: "NAME", text: "zahl" }, { type: "input_value", name: "VALUE" }, hint("-=")],
            inputsInline: true, ...statement, colour: COLOURS.variables,
            tooltip: "Zieht etwas von der Variablen ab, z. B. zahl -= 2;",
        },
        {
            type: B.varInc, message0: "erhöhe %1 um 1 %2",
            args0: [{ type: "field_gsg_variable", name: "NAME", text: "zahl" }, hint("++")],
            ...statement, colour: COLOURS.variables, tooltip: "zahl++ erhöht die Variable um 1.",
        },
        {
            type: B.varDec, message0: "verringere %1 um 1 %2",
            args0: [{ type: "field_gsg_variable", name: "NAME", text: "zahl" }, hint("--")],
            ...statement, colour: COLOURS.variables, tooltip: "zahl-- verringert die Variable um 1.",
        },
        {
            type: B.varGet, message0: "%1", args0: [{ type: "field_gsg_variable", name: "NAME", text: "zahl" }],
            output: null, colour: COLOURS.variables,
            tooltip: "Der aktuelle Wert der Variablen.",
        },

        // ------------------------------------------------------------ Ausgabe und Eingabe
        {
            type: B.input, message0: "Eingabe %1 Frage %2",
            args0: [{
                type: "field_dropdown", name: "METHOD", options: [["Ganzzahl (Input.readInt)", "readInt"],
                    ["Kommazahl (Input.readDouble)", "readDouble"], ["Text (Input.readString)", "readString"],
                    ["Wahrheitswert (Input.readBoolean)", "readBoolean"], ["Zeichen (Input.readChar)", "readChar"]],
            }, { type: "input_value", name: "PROMPT" }],
            inputsInline: true, output: null, colour: COLOURS.output,
            tooltip: "Fragt beim Programmlauf nach einer Eingabe.",
        },

        // ------------------------------------------------------------ Steuerung
        {
            type: B.while, message0: "wiederhole solange %1 %2", args0: [{ type: "input_value", name: "COND" }, hint("while")],
            message1: "%1", args1: [{ type: "input_statement", name: "DO" }],
            ...statement, colour: COLOURS.control,
            tooltip: "Wiederholt die Blöcke, solange die Bedingung wahr ist.",
        },
        {
            type: B.forever, message0: "wiederhole fortlaufend %1", args0: [hint("while (true)")],
            message1: "%1", args1: [{ type: "input_statement", name: "DO" }],
            ...statement, colour: COLOURS.control,
            tooltip: "Wiederholt die Blöcke immer wieder, bis das Programm angehalten wird.",
        },
        {
            type: B.repeat, message0: "wiederhole %1 mal %2", args0: [{ type: "input_value", name: "TIMES" }, hint("for")],
            message1: "%1", args1: [{ type: "input_statement", name: "DO" }],
            inputsInline: true, ...statement, colour: COLOURS.control,
            tooltip: "Wiederholt die Blöcke so oft wie angegeben. In Java: for (int durchlauf = 1; durchlauf <= 10; durchlauf++)",
        },
        {
            type: B.for, message0: "zähle %1 %2 von %3 %4 %5 mit Schrittweite %6 %7",
            args0: [{ type: "field_input", name: "VAR", text: "i" },
                { type: "field_dropdown", name: "DIR", options: [["aufsteigend", "up"], ["absteigend", "down"]] },
                { type: "input_value", name: "FROM" },
                { type: "field_dropdown", name: "CMP", options: [["bis", "incl"], ["bis vor", "excl"]] },
                { type: "input_value", name: "TO" }, { type: "input_value", name: "STEP" }, hint("for")],
            message1: "%1", args1: [{ type: "input_statement", name: "DO" }],
            inputsInline: true, ...statement, colour: COLOURS.control, extensions: ["gsg_identifier"],
            tooltip: "Die Zählvariable läuft vom Start- bis zum Endwert (\"bis\": einschließlich, \"bis vor\": ohne den Endwert), "
                + "z. B. for (int i = 1; i <= 10; i++).",
        },
        {
            type: B.wait, message0: "warte %1 Millisekunden %2", args0: [{ type: "input_value", name: "MS" }, hint("Thread.sleep")],
            inputsInline: true, ...statement, colour: COLOURS.control,
            tooltip: "Hält das Programm kurz an. 1000 Millisekunden sind eine Sekunde.",
        },

        // ------------------------------------------------------------ Bedingungen
        {
            type: B.compare, message0: "%1 %2 %3",
            args0: [{ type: "input_value", name: "A" }, {
                type: "field_dropdown", name: "OP", options: [["== (gleich)", "=="], ["!= (ungleich)", "!="],
                    ["<", "<"], ["<=", "<="], [">", ">"], [">=", ">="]],
            }, { type: "input_value", name: "B" }],
            inputsInline: true, output: null, colour: COLOURS.conditions,
            tooltip: "Vergleicht zwei Werte; das Ergebnis ist wahr oder falsch. Texte mit „ist gleich“ vergleichen.",
        },
        {
            type: B.logic, message0: "%1 %2 %3",
            args0: [{ type: "input_value", name: "A" },
                { type: "field_dropdown", name: "OP", options: [["und (&&)", "&&"], ["oder (||)", "||"]] },
                { type: "input_value", name: "B" }],
            inputsInline: true, output: null, colour: COLOURS.conditions,
            tooltip: "und: beide müssen wahr sein. oder: mindestens eine.",
        },
        {
            type: B.not, message0: "nicht %1 %2", args0: [{ type: "input_value", name: "VALUE" }, hint("!")],
            inputsInline: true, output: null, colour: COLOURS.conditions,
            tooltip: "Kehrt wahr und falsch um.",
        },
        {
            type: B.bool, message0: "%1",
            args0: [{ type: "field_dropdown", name: "VALUE", options: [["wahr (true)", "true"], ["falsch (false)", "false"]] }],
            output: null, colour: COLOURS.conditions,
        },

        // ------------------------------------------------------------ Rechnen und Werte
        {
            type: B.number, message0: "%1", args0: [{ type: "field_input", name: "NUM", text: "0" }],
            output: null, colour: COLOURS.values, extensions: ["gsg_number"],
            tooltip: "Eine Zahl, Kommazahlen mit Punkt: 3.5",
        },
        {
            type: B.arith, message0: "%1 %2 %3",
            args0: [{ type: "input_value", name: "A" }, {
                type: "field_dropdown", name: "OP", options: [["+", "+"], ["-", "-"], ["*", "*"], ["/", "/"], ["mod (Rest)  %", "%"]],
            }, { type: "input_value", name: "B" }],
            inputsInline: true, output: null, colour: COLOURS.values,
            tooltip: "Rechnen. Achtung: / mit zwei ganzen Zahlen teilt ganzzahlig ohne Rest (7 / 2 ergibt 3). "
                + "mod liefert den Rest der ganzzahligen Division (7 mod 2 ergibt 1).",
        },
        {
            type: B.random, message0: "Zufallszahl von %1 bis %2 %3",
            args0: [{ type: "input_value", name: "FROM" }, { type: "input_value", name: "TO" }, hint("Random.randint")],
            inputsInline: true, output: null, colour: COLOURS.values,
            tooltip: "Eine zufällige ganze Zahl, beide Grenzen eingeschlossen.",
        },
        {
            type: B.randomDouble, message0: "Zufallskommazahl zwischen 0 und 1 %1", args0: [hint("Math.random()")],
            output: null, colour: COLOURS.values,
            tooltip: "Eine zufällige Kommazahl von 0 (einschließlich) bis 1 (ausschließlich).",
        },
        {
            type: B.math, message0: "%1 %2",
            args0: [{
                type: "field_dropdown", name: "FUNC", options: [["runde (Math.round)", "round"],
                    ["Wurzel aus (Math.sqrt)", "sqrt"], ["Betrag von (Math.abs)", "abs"]],
            }, { type: "input_value", name: "VALUE" }],
            inputsInline: true, output: null, colour: COLOURS.values,
            tooltip: "runde: auf eine ganze Zahl runden (2.5 ergibt 3).",
        },
        {
            type: B.minMax, message0: "%1 von %2 und %3",
            args0: [{ type: "field_dropdown", name: "FUNC", options: [["kleinste (Math.min)", "min"], ["größte (Math.max)", "max"]] },
                { type: "input_value", name: "A" }, { type: "input_value", name: "B" }],
            inputsInline: true, output: null, colour: COLOURS.values,
            tooltip: "Die kleinere bzw. größere der beiden Zahlen.",
        },
        {
            type: B.cast, message0: "%1 %2",
            args0: [{
                type: "field_dropdown", name: "TYPE", options: [["als Ganzzahl / ASCII-Code von (int)", "int"],
                    ["als Kommazahl (double)", "double"], ["als Zeichen / Zeichen mit ASCII-Code (char)", "char"]],
            }, { type: "input_value", name: "VALUE" }],
            inputsInline: true, output: null, colour: COLOURS.values,
            tooltip: "Wandelt einen Wert um: Kommazahl -> Ganzzahl schneidet die Nachkommastellen ab; "
                + "ein Zeichen als Ganzzahl ist sein ASCII-Code ('A' -> 65), eine Ganzzahl als Zeichen das Zeichen dazu (65 -> 'A').",
        },

        // ------------------------------------------------------------ Text (Abitur: Umgang mit Zeichenketten)
        {
            type: B.text, message0: "„%1“", args0: [{ type: "field_input", name: "TEXT", text: "" }],
            output: null, colour: COLOURS.text, tooltip: "Ein Text (String).",
        },
        {
            type: B.char, message0: "‚%1‘", args0: [{ type: "field_input", name: "CHAR", text: "a" }],
            output: null, colour: COLOURS.text, extensions: ["gsg_char"],
            tooltip: "Ein einzelnes Zeichen (char), z. B. 'a'.",
        },
        {
            type: B.concat, message0: "verbinde %1 und %2 %3",
            args0: [{ type: "input_value", name: "A" }, { type: "input_value", name: "B" }, hint("+")],
            inputsInline: true, output: null, colour: COLOURS.text,
            tooltip: "Hängt zwei Texte aneinander (auch Zahlen werden dabei zu Text).",
        },
        {
            type: B.strLength, message0: "Länge von %1 %2", args0: [{ type: "input_value", name: "TEXT" }, hint(".length()")],
            inputsInline: true, output: null, colour: COLOURS.text, tooltip: "Anzahl der Zeichen eines Textes.",
        },
        {
            type: B.strCharAt, message0: "Zeichen an Position %1 aus %2 %3",
            args0: [{ type: "input_value", name: "INDEX" }, { type: "input_value", name: "TEXT" }, hint(".charAt")],
            inputsInline: true, output: null, colour: COLOURS.text,
            tooltip: "Das Zeichen an einer Position. Die Zählung beginnt bei 0: Position 0 ist das erste Zeichen.",
        },
        {
            type: B.strSubstring, message0: "Teiltext von %1 ab Position %2 bis vor Position %3 %4",
            args0: [{ type: "input_value", name: "TEXT" }, { type: "input_value", name: "FROM" }, { type: "input_value", name: "TO" }, hint(".substring")],
            inputsInline: true, output: null, colour: COLOURS.text,
            tooltip: "Ein Ausschnitt des Textes. Zählung ab 0; die Endposition gehört nicht mehr dazu: „Hallo“ ab 1 bis vor 3 ergibt „al“.",
        },
        {
            type: B.strEquals, message0: "%1 ist gleich %2 %3",
            args0: [{ type: "input_value", name: "A" }, { type: "input_value", name: "B" }, hint(".equals")],
            inputsInline: true, output: null, colour: COLOURS.text,
            tooltip: "Wahr, wenn beide Texte genau gleich sind (Groß-/Kleinschreibung zählt).",
        },
        {
            type: B.strContains, message0: "%1 enthält %2 %3",
            args0: [{ type: "input_value", name: "A" }, { type: "input_value", name: "B" }, hint(".contains")],
            inputsInline: true, output: null, colour: COLOURS.text,
            tooltip: "Wahr, wenn der zweite Text im ersten vorkommt.",
        },
        {
            type: B.strCompare, message0: "vergleiche %1 alphabetisch mit %2 %3",
            args0: [{ type: "input_value", name: "A" }, { type: "input_value", name: "B" }, hint(".compareTo")],
            inputsInline: true, output: null, colour: COLOURS.text,
            tooltip: "Lexikographischer Vergleich: negativ, wenn der erste Text vorher kommt, 0 bei Gleichheit, positiv, wenn er danach kommt.",
        },
        {
            type: B.strCase, message0: "%1 in %2",
            args0: [{ type: "input_value", name: "TEXT" },
                { type: "field_dropdown", name: "CASE", options: [["Großbuchstaben (.toUpperCase)", "upper"], ["Kleinbuchstaben (.toLowerCase)", "lower"]] }],
            inputsInline: true, output: null, colour: COLOURS.text,
        },

        // ------------------------------------------------------------ Java und Kommentare
        {
            type: B.comment, message0: "Kommentar %1 %2", args0: [{ type: "field_input", name: "TEXT", text: "" }, hint("//")],
            ...statement, colour: COLOURS.comment, tooltip: "Eine Notiz im Programm; wird nicht ausgeführt.",
        },
        {
            type: B.javaStatement, message0: "Java %1", args0: [{ type: "field_input", name: "CODE", text: "" }],
            ...statement, colour: COLOURS.java, tooltip: "Eine beliebige Java-Anweisung.",
        },
        {
            type: B.javaExpression, message0: "Java %1", args0: [{ type: "field_input", name: "CODE", text: "" }],
            output: null, colour: COLOURS.java, tooltip: "Ein beliebiger Java-Ausdruck.",
        },
    ]);

    // Mehrzeiliger Java-Text (z. B. eine Klasse): nur anzeigen, bearbeiten in der Java-Ansicht
    type RawBlock = Blockly.Block & { code: string; renderCode(): void };
    Blockly.Blocks[B.javaRaw] = {
        code: "",
        init(this: RawBlock) {
            this.setPreviousStatement(true);
            this.setNextStatement(true);
            this.setColour(COLOURS.java);
            this.setTooltip("Java-Code, den es nicht als Block gibt. Bearbeiten in der Java-Ansicht.");
            this.setEditable(false);
            this.renderCode();
        },
        renderCode(this: RawBlock) {
            for (const input of [...this.inputList]) this.removeInput(input.name);
            this.appendDummyInput("HEAD").appendField(new Blockly.FieldLabel("Java", "gsg-java-hint"));
            const lines = this.code.split("\n");
            const shown = lines.length > 12 ? [...lines.slice(0, 11), `… (${lines.length - 11} weitere Zeilen)`] : lines;
            shown.forEach((line, i) => this.appendDummyInput("L" + i).appendField(new Blockly.FieldLabel(line.replace(/\t/g, "    ") || " ", "gsg-code-line")));
        },
        saveExtraState(this: { code: string }) { return { code: this.code }; },
        loadExtraState(this: RawBlock, state: { code?: string }) {
            this.code = state?.code ?? "";
            this.renderCode();
        },
    };
}

export const VARIABLES_CATEGORY = "GSG_VARIABLES";
export { OPERATIONS_CATEGORY };

/**
 * Inhalt der Kategorie "Variablen": neue Variablen (je Typ mit passendem Startwert) und
 * für jede deklarierte Variable ihre Blöcke.
 */
export function variablesFlyout(ws: Blockly.WorkspaceSvg): Blockly.utils.toolbox.FlyoutItemInfoArray {
    const num = (n: string) => ({ block: { type: B.number, fields: { NUM: n } } });
    const items: object[] = [
        { kind: "label", text: "Neue Variable" },
        { kind: "block", type: B.varDeclare, fields: { NAME: "zahl", TYPE: "int" }, inputs: { VALUE: num("0") } },
    ];
    const vars = [...collectVariables(ws).entries()].sort((a, b) => a[0].localeCompare(b[0], "de"));
    if (vars.length === 0) {
        items.push({ kind: "label", text: "Lege zuerst eine Variable an – dann erscheinen hier ihre Blöcke." });
    } else {
        items.push({ kind: "label", text: "Deine Variablen" });
        for (const [name] of vars) items.push({ kind: "block", type: B.varGet, fields: { NAME: name } });
        items.push({ kind: "label", text: "Ändern" });
        items.push({ kind: "block", type: B.varSet, fields: { NAME: vars[0][0] } });
        const numeric = vars.find(([, t]) => t === "int" || t === "double");
        if (numeric) {
            items.push({ kind: "block", type: B.varChange, fields: { NAME: numeric[0] }, inputs: { VALUE: num("1") } });
            items.push({ kind: "block", type: B.varSub, fields: { NAME: numeric[0] }, inputs: { VALUE: num("1") } });
            items.push({ kind: "block", type: B.varInc, fields: { NAME: numeric[0] } });
            items.push({ kind: "block", type: B.varDec, fields: { NAME: numeric[0] } });
        }
    }
    return items as Blockly.utils.toolbox.FlyoutItemInfoArray;
}

/** Werkzeugkasten mit Kategorien; Blöcke mit sinnvollen Startwerten */
export function toolbox(): Blockly.utils.toolbox.ToolboxDefinition {
    const num = (n: string) => ({ block: { type: B.number, fields: { NUM: n } } });
    const txt = (t: string) => ({ block: { type: B.text, fields: { TEXT: t } } });
    const v = (name: string) => ({ block: { type: B.varGet, fields: { NAME: name } } });
    const blk = (type: string, extra: object = {}) => ({ kind: "block", type, ...extra });
    return {
        kind: "categoryToolbox",
        contents: [
            // Reihenfolge: Steuerung, Ausgabe & Eingabe, Variablen, Bedingungen, Rechnen & Werte, Text, Java
            {
                kind: "category", name: "Steuerung", colour: COLOURS.control, contents: [
                    { kind: "label", text: "Blöcke unter „Hauptprogramm“ hängen – nur sie werden ausgeführt." },
                    blk(B.if),
                    blk(B.if, { extraState: { elseIfs: 0, hasElse: true } }),
                    blk(B.forever),
                    blk(B.repeat, { inputs: { TIMES: num("10") } }),
                    blk(B.while, { inputs: { COND: { block: { type: B.compare, fields: { OP: "<" }, inputs: { A: v("zahl"), B: num("10") } } } } }),
                    blk(B.for, { inputs: { FROM: num("1"), TO: num("10"), STEP: num("1") } }),
                    blk(B.wait, { inputs: { MS: num("1000") } }),
                ],
            },
            {
                kind: "category", name: "Ausgabe & Eingabe", colour: COLOURS.output, contents: [
                    { kind: "label", text: "▸ fügt bei „gib aus“ weitere Werte hinzu." },
                    blk(B.print, { inputs: { VALUE: txt("Hallo Welt!") } }),
                    blk(B.print, { extraState: { items: 2 }, inputs: { VALUE: txt("Ergebnis:"), VALUE1: v("zahl") } }),
                    blk(B.input, { inputs: { PROMPT: txt("Gib eine Zahl ein:") } }),
                ],
            },
            { kind: "category", name: "Variablen", colour: COLOURS.variables, custom: VARIABLES_CATEGORY },
            {
                kind: "category", name: "Bedingungen", colour: COLOURS.conditions, contents: [
                    { kind: "label", text: "Bedingungen passen in die sechseckigen Löcher." },
                    blk(B.compare, { inputs: { A: v("zahl"), B: num("0") } }),
                    blk(B.logic),
                    blk(B.not),
                    blk(B.bool),
                ],
            },
            {
                kind: "category", name: "Rechnen & Werte", colour: COLOURS.values, contents: [
                    { kind: "label", text: "Zwei Ganzzahlen: 7 / 2 ergibt 3, 7 mod 2 ergibt 1." },
                    blk(B.number),
                    blk(B.arith, { inputs: { A: num("1"), B: num("1") } }),
                    blk(B.arith, { fields: { OP: "/" }, inputs: { A: num("7"), B: num("2") } }),
                    blk(B.arith, { fields: { OP: "%" }, inputs: { A: num("7"), B: num("2") } }),
                    blk(B.random, { inputs: { FROM: num("1"), TO: num("6") } }),
                    blk(B.randomDouble),
                    blk(B.math, { inputs: { VALUE: num("2.5") } }),
                    blk(B.minMax, { inputs: { A: num("3"), B: num("7") } }),
                    blk(B.cast, { inputs: { VALUE: num("2.7") } }),
                    blk(B.cast, { fields: { TYPE: "double" }, inputs: { VALUE: num("7") } }),
                ],
            },
            {
                kind: "category", name: "Text", colour: COLOURS.text, contents: [
                    { kind: "label", text: "Positionen werden ab 0 gezählt." },
                    blk(B.text),
                    blk(B.char),
                    blk(B.concat, { inputs: { A: txt("Hallo "), B: txt("Welt") } }),
                    blk(B.strLength, { inputs: { TEXT: txt("Hallo") } }),
                    blk(B.strCharAt, { inputs: { INDEX: num("0"), TEXT: txt("Hallo") } }),
                    blk(B.strSubstring, { inputs: { TEXT: txt("Hallo"), FROM: num("1"), TO: num("3") } }),
                    blk(B.strEquals, { inputs: { A: txt("Ja"), B: txt("ja") } }),
                    blk(B.strContains, { inputs: { A: txt("Hallo"), B: txt("ll") } }),
                    blk(B.strCompare, { inputs: { A: txt("Anna"), B: txt("Bernd") } }),
                    blk(B.strCase, { inputs: { TEXT: txt("Hallo") } }),
                    { kind: "label", text: "ASCII-Code" },
                    blk(B.cast, { inputs: { VALUE: { block: { type: B.char, fields: { CHAR: "A" } } } } }),
                    blk(B.cast, { fields: { TYPE: "char" }, inputs: { VALUE: num("65") } }),
                ],
            },
            { kind: "category", name: "Operationen", colour: OPERATIONS_COLOUR, custom: OPERATIONS_CATEGORY },
            {
                kind: "category", name: "Java", colour: COLOURS.java, contents: [
                    { kind: "label", text: "Für alles, was es (noch) nicht als Block gibt." },
                    blk(B.comment),
                    blk(B.javaStatement),
                    blk(B.javaExpression),
                ],
            },
        ],
    } as Blockly.utils.toolbox.ToolboxDefinition;
}

/** Farben passend zum hellen bzw. dunklen Thema der IDE */
export function theme(dark: boolean): Blockly.Theme {
    const name = dark ? "gsg-dark" : "gsg-light";
    return Blockly.Theme.defineTheme(name, {
        name,
        base: Blockly.Themes.Classic,
        componentStyles: dark ? {
            workspaceBackgroundColour: "#1e1e1e", toolboxBackgroundColour: "#252526", toolboxForegroundColour: "#e0e0e0",
            flyoutBackgroundColour: "#2d2d30", flyoutForegroundColour: "#cccccc", flyoutOpacity: 0.97,
            scrollbarColour: "#797979", scrollbarOpacity: 0.5, insertionMarkerColour: "#ffffff", insertionMarkerOpacity: 0.3,
            cursorColour: "#d0d0d0",
        } : {
            workspaceBackgroundColour: "#ffffff", toolboxBackgroundColour: "#f3f3f3", toolboxForegroundColour: "#1e1e1e",
            flyoutBackgroundColour: "#e8edf3", flyoutForegroundColour: "#1e1e1e", flyoutOpacity: 0.97,
            scrollbarColour: "#9aa4b1", scrollbarOpacity: 0.5,
        },
        fontStyle: { family: "Roboto, 'Segoe UI', sans-serif", size: 11 },
    });
}
