import * as Blockly from "blockly/core";
import { B, isPartHat } from "./BlockTypes";
import { mainWorkspace, visibleVariables } from "./BlockTypeSystem";
import { isFigureClass } from "./FigureSpec";

/**
 * GSG (Paket 15c/15d): weitere Programmteile und Nachrichten wie in Scratch.
 *  - „wenn ich Nachricht [los ▾] empfange: name“   @WennNachricht("los") void name() { … }
 *  - „sende Nachricht [los ▾]“ / „… und warte“      Nachricht.sende("los"); / Nachricht.sendeUndWarte("los");
 *  - „wenn [ball ▾] angeklickt wird: name“          @WennAngeklickt("ball") void name() { … }
 *  - „wenn das Programm startet: name“              @BeimStart void name() { … }
 */

const hint = (text: string) => ({ type: "field_label", text, class: "gsg-java-hint" });
const statement = { previousStatement: null, nextStatement: null };

/** Farbe der Hut-Blöcke (wie Hauptprogramm) und der Nachrichten-Blöcke */
export const PART_COLOUR = "#00376D";
export const MESSAGE_COLOUR = "#c88330";
export const DEFAULT_MESSAGE = "los";
const NEW_MESSAGE = "\u0000neu";

/** Blöckly: Nachrichten der anderen Dateien des Projekts (andere Figuren, Bühne) */
let projectMessages: string[] = [];
export function setProjectMessages(names: string[]) {
    projectMessages = names;
}

/** Alle Nachrichten, die auf der Arbeitsfläche (und in Blöckly im Projekt) vorkommen (empfangen oder gesendet) */
export function usedMessages(ws: Blockly.Workspace): string[] {
    const names = new Set<string>(projectMessages);
    for (const b of mainWorkspace(ws).getAllBlocks(false)) {
        if (b.type === B.msgStart || b.type === B.blMsg || b.type === B.msgSend || b.type === B.msgSendWait) {
            const m = String(b.getFieldValue("MSG") ?? "");
            if (m) names.add(m);
        }
    }
    return [...names].sort((a, b) => a.localeCompare(b, "de"));
}

/** Name für einen Programmteil, den es (unter Operationen und Programmteilen) noch nicht gibt */
export function freePartName(block: Blockly.Block, base: string): string {
    const taken = new Set(block.workspace.getAllBlocks(false)
        .filter((b) => (isPartHat(b.type) || b.type === B.method) && b !== block)
        .map((b) => String(b.getFieldValue("NAME") ?? "")));
    let name = base;
    for (let n = 2; taken.has(name); n++) name = base + n;
    return name;
}

/** Vorschlag für den Namen eines Programmteils zu einer Nachricht: „Tor!“ → beiTor */
export function messagePartName(message: string): string {
    const words = message.replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(" ").filter((w) => w);
    const camel = words.map((w) => w[0].toUpperCase() + w.slice(1)).join("");
    return camel && !/^\p{N}/u.test(camel) ? "bei" + camel : "nachricht";
}

/** Vorschlag für „wenn ball angeklickt wird“: ballAngeklickt */
export function clickPartName(figure: string): string {
    return figure ? figure + "Angeklickt" : "angeklickt";
}

/**
 * Auswahl einer Nachricht: alle schon benutzten und „Neue Nachricht …“ (fragt nach dem Namen).
 */
export class FieldMessage extends Blockly.FieldDropdown {
    static override fromJson(options: Blockly.FieldDropdownFromJsonConfig) {
        return new FieldMessage(String((options as { value?: string }).value ?? DEFAULT_MESSAGE));
    }

    constructor(value: string) {
        super(function (this: FieldMessage) { return this.messageOptions(); } as unknown as Blockly.MenuGenerator);
        this.setValue(value);
    }

    private messageOptions(): [string, string][] {
        const block = this.getSourceBlock();
        const names = new Set(block ? usedMessages(block.workspace) : []);
        const current = String(this.getValue() ?? "");
        if (current && current !== NEW_MESSAGE) names.add(current);
        if (names.size === 0) names.add(DEFAULT_MESSAGE);
        const options: [string, string][] = [...names].sort((a, b) => a.localeCompare(b, "de")).map((n) => [n, n]);
        return [...options, ["Neue Nachricht …", NEW_MESSAGE]];
    }

    protected override doClassValidation_(newValue?: unknown): string | null {
        if (newValue === NEW_MESSAGE) {
            Blockly.dialog.prompt("Name der neuen Nachricht:", "", (text) => {
                const name = String(text ?? "").replace(/[\r\n"\\]/g, "").trim().slice(0, 40);
                if (name) this.setValue(name);
            });
            return null;
        }
        return typeof newValue === "string" && newValue.trim() !== "" ? newValue : null;
    }

    protected override doValueUpdate_(newValue: string) {
        super.doValueUpdate_(newValue);
        this.getOptions(false);
        super.doValueUpdate_(newValue);
    }
}

let registered = false;

export function definePartBlocks(defineJson: (json: object[]) => void) {
    if (!registered) {
        registered = true;
        Blockly.fieldRegistry.register("field_gsg_message", FieldMessage as unknown as Blockly.fieldRegistry.RegistrableField);
        /*
         * Programmteile mit Nachricht, Klick oder Programmstart: neu hereingezogen oder kopiert bekommen sie einen freien
         * Namen; ein vorgeschlagener Name wandert mit der Nachricht bzw. Figur mit (beiLos → beiTor).
         */
        Blockly.Extensions.register("gsg_part", function (this: Blockly.Block) {
            const suggest = (b: Blockly.Block, value: string) =>
                b.type === B.msgStart ? messagePartName(value) : b.type === B.clickStart ? clickPartName(value) : "beimStart";
            const trigger = this.type === B.msgStart ? "MSG" : this.type === B.clickStart ? "FIG" : "";
            this.setOnChange(function (this: Blockly.Block, e: Blockly.Events.Abstract) {
                if (this.isInFlyout || this.workspace.isFlyout) return;
                if (e.type === Blockly.Events.BLOCK_CREATE && (e as Blockly.Events.BlockCreate).ids?.includes(this.id)) {
                    // „wenn … angeklickt wird“: eine Figur des Hauptprogramms vorschlagen
                    if (this.type === B.clickStart) {
                        const figures = [...visibleVariables(this)].filter(([, t]) => isFigureClass(t)).map(([n]) => n);
                        const fig = String(this.getFieldValue("FIG") ?? "");
                        if (figures.length && !figures.includes(fig)) this.setFieldValue(figures[0], "FIG");
                    }
                    const name = String(this.getFieldValue("NAME") ?? "");
                    const value = trigger ? String(this.getFieldValue(trigger) ?? "") : "";
                    const suggested = name === "" || name === suggest(this, value) || /^(bei[A-ZÄÖÜ]|nachricht$|angeklickt$|beimStart$)/.test(name)
                        || name.endsWith("Angeklickt");
                    const wanted = freePartName(this, suggested ? suggest(this, value) : name);
                    if (wanted !== name) this.setFieldValue(wanted, "NAME");
                } else if (e.type === Blockly.Events.BLOCK_CHANGE && trigger) {
                    const c = e as Blockly.Events.BlockChange;
                    if (c.blockId !== this.id || c.element !== "field" || c.name !== trigger) return;
                    const name = String(this.getFieldValue("NAME") ?? "");
                    if (name === suggest(this, String(c.oldValue ?? "")) || name.startsWith(suggest(this, String(c.oldValue ?? "")))) {
                        this.setFieldValue(freePartName(this, suggest(this, String(c.newValue ?? ""))), "NAME");
                    }
                }
            });
        });
    }

    const tail = "Er läuft gleichzeitig mit dem Hauptprogramm und kennt dessen Variablen. Läuft er noch, startet er nicht ein zweites Mal.";
    defineJson([
        {
            type: B.msgStart, message0: "wenn ich Nachricht %1 empfange: %2 %3",
            args0: [{ type: "field_gsg_message", name: "MSG", value: DEFAULT_MESSAGE }, { type: "field_input", name: "NAME", text: "beiLos" }, hint("@WennNachricht")],
            message1: "%1", args1: [{ type: "input_statement", name: "BODY" }],
            colour: PART_COLOUR, hat: "cap", extensions: ["gsg_identifier", "gsg_part"],
            tooltip: "Ein Programmteil, den eine Nachricht startet („sende Nachricht …“, auch aus einem anderen Programmteil). "
                + "Mehrere Programmteile dürfen dieselbe Nachricht empfangen. " + tail
                + " Java: @WennNachricht(\"los\") void beiLos() { … }",
        },
        {
            type: B.msgSend, message0: "sende Nachricht %1 %2",
            args0: [{ type: "field_gsg_message", name: "MSG", value: DEFAULT_MESSAGE }, hint("Nachricht.sende")],
            ...statement, colour: MESSAGE_COLOUR,
            tooltip: "Startet alle Programmteile „wenn ich Nachricht … empfange“ mit dieser Nachricht. Das Programm läuft "
                + "sofort weiter. Java: Nachricht.sende(\"los\");",
        },
        {
            type: B.msgSendWait, message0: "sende Nachricht %1 und warte %2",
            args0: [{ type: "field_gsg_message", name: "MSG", value: DEFAULT_MESSAGE }, hint("Nachricht.sendeUndWarte")],
            ...statement, colour: MESSAGE_COLOUR,
            tooltip: "Startet alle Programmteile „wenn ich Nachricht … empfange“ mit dieser Nachricht und wartet, bis sie "
                + "alle fertig sind. Java: Nachricht.sendeUndWarte(\"los\");",
        },
        {
            type: B.clickStart, message0: "wenn %1 angeklickt wird: %2 %3",
            args0: [{ type: "field_gsg_figure", name: "FIG", text: "ball" }, { type: "field_input", name: "NAME", text: "ballAngeklickt" }, hint("@WennAngeklickt")],
            message1: "%1", args1: [{ type: "input_statement", name: "BODY" }],
            colour: PART_COLOUR, hat: "cap", extensions: ["gsg_identifier", "gsg_part"],
            tooltip: "Ein Programmteil, der bei jedem Mausklick auf die Figur startet (eine Figur-Variable des Hauptprogramms). "
                + "Versteckte und entfernte Figuren lassen sich nicht anklicken. Das Programm wartet auf Klicks, bis „Stopp“ "
                + "gedrückt wird. " + tail + " Java: @WennAngeklickt(\"ball\") void ballAngeklickt() { … }",
        },
        {
            type: B.progStart, message0: "wenn das Programm startet: %1 %2",
            args0: [{ type: "field_input", name: "NAME", text: "beimStart" }, hint("@BeimStart")],
            message1: "%1", args1: [{ type: "input_statement", name: "BODY" }],
            colour: PART_COLOUR, hat: "cap", extensions: ["gsg_identifier", "gsg_part"],
            tooltip: "Ein Programmteil, der beim Programmstart mitläuft – z. B. eine Figur, die dauernd blinkt. Er beginnt, "
                + "sobald das Hauptprogramm seine Figuren erstellt hat: wenn es zum ersten Mal wartet („warte …“) oder fertig ist. "
                + tail + " Java: @BeimStart void beimStart() { … }",
        },
    ]);
}

const blk = (type: string) => ({ kind: "block", type });

/** Werkzeugleiste, Kategorie Start: alle Startblöcke (Hut-Blöcke der Programmteile) */
export function startToolboxItems(): object[] {
    return [
        { kind: "label", text: "Das Hauptprogramm steht schon auf der Arbeitsfläche. Weitere Programmteile laufen gleichzeitig mit ihm:" },
        blk(B.progStart),
        blk(B.keyStart),
        blk(B.clickStart),
        blk(B.msgStart),
    ];
}

/** Werkzeugleiste, Kategorie Steuerung: Nachrichten senden */
export function messageToolboxItems(): object[] {
    return [
        { kind: "label", text: "Nachrichten starten Programmteile „wenn ich Nachricht … empfange“ (Kategorie Start):" },
        blk(B.msgSend),
        blk(B.msgSendWait),
    ];
}
