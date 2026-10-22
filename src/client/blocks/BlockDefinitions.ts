import * as Blockly from "blockly/core";
import { B } from "./BlockTypes";
import { collectVariables } from "./BlockTypeSystem";

/**
 * Blöcke der Stufe 1 (Grundlagen): deutsche Beschriftung, das Java-Wort klein dahinter
 * (Klasse gsg-java-hint). Farben nach Kategorie; der Programmstart in GSG-Dunkelblau.
 */

export const COLOURS = {
    start: "#00376D",
    output: "#4a6cd4",
    variables: "#e07b00",
    control: "#b07a00",
    conditions: "#2e8fa8",
    values: "#3a9a27",
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

    private variableOptions(): [string, string][] {
        const block = this.getSourceBlock();
        let ws = block?.workspace as Blockly.WorkspaceSvg | undefined;
        if (ws?.isFlyout && ws.targetWorkspace) ws = ws.targetWorkspace;
        const names = new Set<string>(ws ? [...collectVariables(ws).keys()] : []);
        const current = this.getValue();
        if (typeof current === "string" && current) names.add(current);
        if (names.size === 0) names.add("zahl");
        return [...names].sort((a, b) => a.localeCompare(b, "de")).map((n) => [n, n]);
    }

    protected override doClassValidation_(newValue?: unknown): string | null {
        return typeof newValue === "string" && /^[\p{L}_$][\p{L}\p{N}_$]*$/u.test(newValue) ? newValue : null;
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

    Blockly.common.defineBlocksWithJsonArray([
        {
            type: B.start, message0: "Programmstart %1", args0: [hint("main")],
            message1: "%1", args1: [{ type: "input_statement", name: "BODY" }],
            colour: COLOURS.start, hat: "cap",
            tooltip: "Hier beginnt das Programm. Nur Blöcke, die hier angehängt sind, werden ausgeführt.",
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
            tooltip: "Zählt etwas zur Variablen dazu, z. B. zahl += 2;",
        },
        {
            type: B.varIncDec, message0: "%1 %2",
            args0: [{ type: "field_gsg_variable", name: "NAME", text: "zahl" },
                { type: "field_dropdown", name: "OP", options: [["um 1 erhöhen (++)", "++"], ["um 1 verringern (--)", "--"]] }],
            ...statement, colour: COLOURS.variables,
            tooltip: "zahl++ erhöht um 1, zahl-- verringert um 1.",
        },
        {
            type: B.varGet, message0: "%1", args0: [{ type: "field_gsg_variable", name: "NAME", text: "zahl" }],
            output: null, colour: COLOURS.variables,
            tooltip: "Der aktuelle Wert der Variablen.",
        },

        // ------------------------------------------------------------ Ausgabe und Eingabe
        {
            type: B.print, message0: "gib aus %1 %2",
            args0: [{ type: "input_value", name: "VALUE" },
                { type: "field_dropdown", name: "MODE", options: [["mit Zeilenumbruch (println)", "println"], ["ohne Zeilenumbruch (print)", "print"]] }],
            inputsInline: true, ...statement, colour: COLOURS.output,
            tooltip: "Schreibt etwas in die Ausgabe. println beginnt danach eine neue Zeile.",
        },
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
            type: B.if, message0: "falls %1 %2", args0: [{ type: "input_value", name: "COND" }, hint("if")],
            message1: "dann %1", args1: [{ type: "input_statement", name: "DO" }],
            ...statement, colour: COLOURS.control,
            tooltip: "Führt die Blöcke nur aus, wenn die Bedingung wahr ist.",
        },
        {
            type: B.ifElse, message0: "falls %1 %2", args0: [{ type: "input_value", name: "COND" }, hint("if")],
            message1: "dann %1", args1: [{ type: "input_statement", name: "DO" }],
            message2: "sonst %1 %2", args2: [hint("else"), { type: "input_statement", name: "ELSE" }],
            ...statement, colour: COLOURS.control,
            tooltip: "Ist die Bedingung wahr, wird der dann-Teil ausgeführt, sonst der sonst-Teil.",
        },
        {
            type: B.while, message0: "wiederhole solange %1 %2", args0: [{ type: "input_value", name: "COND" }, hint("while")],
            message1: "%1", args1: [{ type: "input_statement", name: "DO" }],
            ...statement, colour: COLOURS.control,
            tooltip: "Wiederholt die Blöcke, solange die Bedingung wahr ist.",
        },
        {
            type: B.for, message0: "zähle %1 von %2 %3 %4 %5",
            args0: [{ type: "field_input", name: "VAR", text: "i" }, { type: "input_value", name: "FROM" },
                { type: "field_dropdown", name: "CMP", options: [["bis unter", "<"], ["bis einschließlich", "<="]] },
                { type: "input_value", name: "TO" }, hint("for")],
            message1: "%1", args1: [{ type: "input_statement", name: "DO" }],
            inputsInline: true, ...statement, colour: COLOURS.control, extensions: ["gsg_identifier"],
            tooltip: "Zählvariable läuft vom Start- bis zum Endwert, z. B. for (int i = 0; i < 10; i++)",
        },

        // ------------------------------------------------------------ Bedingungen
        {
            type: B.compare, message0: "%1 %2 %3",
            args0: [{ type: "input_value", name: "A" }, {
                type: "field_dropdown", name: "OP", options: [["== (gleich)", "=="], ["!= (ungleich)", "!="],
                    ["<", "<"], ["<=", "<="], [">", ">"], [">=", ">="]],
            }, { type: "input_value", name: "B" }],
            inputsInline: true, output: null, colour: COLOURS.conditions,
            tooltip: "Vergleicht zwei Werte; das Ergebnis ist wahr oder falsch.",
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

        // ------------------------------------------------------------ Werte und Rechnen
        {
            type: B.number, message0: "%1", args0: [{ type: "field_input", name: "NUM", text: "0" }],
            output: null, colour: COLOURS.values, extensions: ["gsg_number"],
            tooltip: "Eine Zahl, Kommazahlen mit Punkt: 3.5",
        },
        {
            type: B.text, message0: "„%1“", args0: [{ type: "field_input", name: "TEXT", text: "" }],
            output: null, colour: COLOURS.values, tooltip: "Ein Text (String).",
        },
        {
            type: B.char, message0: "‚%1‘", args0: [{ type: "field_input", name: "CHAR", text: "a" }],
            output: null, colour: COLOURS.values, extensions: ["gsg_char"],
            tooltip: "Ein einzelnes Zeichen (char), z. B. 'a'.",
        },
        {
            type: B.arith, message0: "%1 %2 %3",
            args0: [{ type: "input_value", name: "A" }, {
                type: "field_dropdown", name: "OP", options: [["+", "+"], ["-", "-"], ["*", "*"], ["/", "/"], ["% (Rest)", "%"]],
            }, { type: "input_value", name: "B" }],
            inputsInline: true, output: null, colour: COLOURS.values,
            tooltip: "Rechnen. + hängt bei Texten aneinander. Bei ganzen Zahlen rechnet / ohne Rest.",
        },
        {
            type: B.random, message0: "Zufallszahl von %1 bis %2 %3",
            args0: [{ type: "input_value", name: "FROM" }, { type: "input_value", name: "TO" }, hint("Random.randint")],
            inputsInline: true, output: null, colour: COLOURS.values,
            tooltip: "Eine zufällige ganze Zahl, beide Grenzen eingeschlossen.",
        },
        {
            type: B.math, message0: "%1 %2",
            args0: [{
                type: "field_dropdown", name: "FUNC", options: [["Wurzel aus (Math.sqrt)", "sqrt"],
                    ["Betrag von (Math.abs)", "abs"], ["gerundet (Math.round)", "round"]],
            }, { type: "input_value", name: "VALUE" }],
            inputsInline: true, output: null, colour: COLOURS.values,
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
            items.push({ kind: "block", type: B.varIncDec, fields: { NAME: numeric[0] } });
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
            // Reihenfolge: Steuerung, Ausgabe & Eingabe, Variablen, Bedingungen, Rechnen & Werte, Java
            {
                kind: "category", name: "Steuerung", colour: COLOURS.control, contents: [
                    blk(B.if),
                    blk(B.ifElse),
                    blk(B.while, { inputs: { COND: { block: { type: B.compare, fields: { OP: "<" }, inputs: { A: v("zahl"), B: num("10") } } } } }),
                    blk(B.for, { inputs: { FROM: num("0"), TO: num("10") } }),
                ],
            },
            {
                kind: "category", name: "Ausgabe & Eingabe", colour: COLOURS.output, contents: [
                    blk(B.print, { inputs: { VALUE: txt("Hallo Welt!") } }),
                    blk(B.print, { inputs: { VALUE: v("zahl") } }),
                    blk(B.input, { inputs: { PROMPT: txt("Gib eine Zahl ein:") } }),
                ],
            },
            { kind: "category", name: "Variablen", colour: COLOURS.variables, custom: VARIABLES_CATEGORY },
            {
                kind: "category", name: "Bedingungen", colour: COLOURS.conditions, contents: [
                    blk(B.compare, { inputs: { A: v("zahl"), B: num("0") } }),
                    blk(B.logic),
                    blk(B.not),
                    blk(B.bool),
                ],
            },
            {
                kind: "category", name: "Rechnen & Werte", colour: COLOURS.values, contents: [
                    blk(B.number),
                    blk(B.text),
                    blk(B.char),
                    blk(B.arith, { inputs: { A: num("1"), B: num("1") } }),
                    blk(B.random, { inputs: { FROM: num("1"), TO: num("6") } }),
                    blk(B.math),
                ],
            },
            {
                kind: "category", name: "Java", colour: COLOURS.java, contents: [
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
