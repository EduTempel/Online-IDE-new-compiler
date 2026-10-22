import * as Blockly from "blockly/core";
import { B } from "./BlockTypes";

/**
 * Blöcke, deren Form sich per Knopf ändert (wie in der Python-IDE):
 *  - "falls": Knöpfe "+ sonst falls" und "+ sonst", jeder Zweig mit ✕ zum Entfernen
 *  - "gib aus": ◂ ▸ für weniger/mehr Werte
 * Die Form steht im extraState (Speicherformat) und wird beim Laden wiederhergestellt.
 * Änderungen sind ein Schritt für "Rückgängig".
 */

/** Klickbarer Text im Block (Blockly: Feld mit eigener "Editor"-Funktion) */
export class FieldButton extends Blockly.FieldLabel {
    constructor(text: string, private onClick: (block: Blockly.Block) => void, tooltip?: string) {
        super(text, "gsg-button");
        if (tooltip) this.setTooltip(tooltip);
    }

    protected override showEditor_() {
        const block = this.getSourceBlock();
        if (block && !block.isInFlyout) this.onClick(block);
    }
}

type Mutable<S> = Blockly.BlockSvg & {
    state: S;
    build(): void;
    saveExtraState(): S | null;
    loadExtraState(state: S): void;
    mutate(next: S, rename: (inputName: string) => string | null): void;
};

/**
 * Form ändern: Kinder abnehmen, Eingänge neu aufbauen, Kinder (umbenannt) wieder anstecken,
 * Feldwerte erhalten, Änderung als Ereignis melden (Rückgängig).
 */
function mutate<S>(block: Mutable<S>, next: S, rename: (name: string) => string | null, fireEvent: boolean) {
    const before = JSON.stringify(block.saveExtraState() ?? {});
    const group = Blockly.Events.getGroup();
    if (fireEvent && !group) Blockly.Events.setGroup(true);
    try {
        const children: [string, Blockly.Block][] = [];
        const fields = new Map<string, unknown>();
        for (const input of block.inputList) {
            for (const f of input.fieldRow) if (f.name && f.EDITABLE) fields.set(f.name, f.getValue());
            const child = input.connection?.targetBlock();
            if (child) {
                children.push([input.name, child]);
                input.connection!.disconnect();
            }
        }
        while (block.inputList.length) block.removeInput(block.inputList[0].name);
        block.state = next;
        block.build();
        for (const [name, value] of fields) if (block.getField(name)) block.setFieldValue(value, name);
        for (const [name, child] of children) {
            const target = rename(name);
            const input = target ? block.getInput(target) : null;
            const own = child.outputConnection ?? child.previousConnection;
            if (input?.connection && own) input.connection.connect(own);
        }
        if (fireEvent && Blockly.Events.isEnabled()) {
            const after = JSON.stringify(block.saveExtraState() ?? {});
            if (after !== before) {
                const Change = Blockly.Events.get(Blockly.Events.BLOCK_CHANGE);
                Blockly.Events.fire(new Change(block, "mutation", null, before, after));
            }
        }
    } finally {
        if (fireEvent && !group) Blockly.Events.setGroup(false);
    }
}

const hintLabel = (text: string) => new Blockly.FieldLabel(text, "gsg-java-hint");

// ------------------------------------------------------------------ falls … sonst falls … sonst

export type IfState = { elseIfs: number; hasElse: boolean };

export function defineIfBlock(colour: string) {
    Blockly.Blocks[B.if] = {
        state: { elseIfs: 0, hasElse: false } as IfState,

        init(this: Mutable<IfState>) {
            this.state = { elseIfs: 0, hasElse: false };
            this.setPreviousStatement(true);
            this.setNextStatement(true);
            this.setColour(colour);
            this.setTooltip("Führt die Blöcke nur aus, wenn die Bedingung wahr ist. "
                + "„+ sonst falls“ fügt weitere Bedingungen hinzu, „+ sonst“ einen Teil für alle anderen Fälle.");
            this.build();
        },

        build(this: Mutable<IfState>) {
            this.appendValueInput("COND").appendField("falls");
            this.appendDummyInput("COND_HINT").appendField(hintLabel("if"));
            this.appendStatementInput("DO").appendField("dann");
            for (let i = 1; i <= this.state.elseIfs; i++) {
                const index = i;
                this.appendValueInput("COND" + i).appendField(new FieldButton("✕", (b) => removeElseIf(b as Mutable<IfState>, index), "Diesen Zweig entfernen"))
                    .appendField("sonst falls");
                this.appendDummyInput("COND_HINT" + i).appendField(hintLabel("else if"));
                this.appendStatementInput("DO" + i).appendField("dann");
            }
            if (this.state.hasElse) {
                this.appendDummyInput("ELSE_LABEL")
                    .appendField(new FieldButton("✕", (b) => removeElse(b as Mutable<IfState>), "Den sonst-Teil entfernen"))
                    .appendField("sonst").appendField(hintLabel("else"));
                this.appendStatementInput("ELSE");
            }
            const add = this.appendDummyInput("ADD")
                .appendField(new FieldButton("+ sonst falls", (b) => addElseIf(b as Mutable<IfState>), "Weitere Bedingung hinzufügen"));
            if (!this.state.hasElse) add.appendField(new FieldButton("+ sonst", (b) => addElse(b as Mutable<IfState>), "sonst-Teil hinzufügen"));
            // Bedingung und Java-Hinweis in einer Zeile (Anweisungen stehen ohnehin in eigenen Zeilen)
            this.setInputsInline(true);
        },

        saveExtraState(this: Mutable<IfState>): IfState | null {
            return this.state.elseIfs || this.state.hasElse ? { ...this.state } : null;
        },

        loadExtraState(this: Mutable<IfState>, state: Partial<IfState>) {
            const next = { elseIfs: Math.max(0, Number(state?.elseIfs ?? 0)), hasElse: !!state?.hasElse };
            mutate(this, next, (n) => n, false);
        },
    };

    function addElseIf(b: Mutable<IfState>) {
        mutate(b, { ...b.state, elseIfs: b.state.elseIfs + 1 }, (n) => n, true);
    }
    function addElse(b: Mutable<IfState>) {
        mutate(b, { ...b.state, hasElse: true }, (n) => n, true);
    }
    function removeElse(b: Mutable<IfState>) {
        mutate(b, { ...b.state, hasElse: false }, (n) => (n === "ELSE" ? null : n), true);
    }
    function removeElseIf(b: Mutable<IfState>, index: number) {
        mutate(b, { ...b.state, elseIfs: b.state.elseIfs - 1 }, (n) => {
            const m = /^(COND|DO)(\d+)$/.exec(n);
            if (!m) return n;
            const i = Number(m[2]);
            return i === index ? null : i > index ? m[1] + (i - 1) : n;
        }, true);
    }
}

// ------------------------------------------------------------------ gib aus (mehrere Werte)

export type PrintState = { items: number };

export function definePrintBlock(colour: string) {
    Blockly.Blocks[B.print] = {
        state: { items: 1 } as PrintState,

        init(this: Mutable<PrintState>) {
            this.state = { items: 1 };
            this.setPreviousStatement(true);
            this.setNextStatement(true);
            this.setColour(colour);
            this.setInputsInline(true);
            this.setTooltip("Schreibt Werte in die Ausgabe, mehrere durch Leerzeichen getrennt. "
                + "▸ fügt einen Wert hinzu, ◂ entfernt den letzten. println beginnt danach eine neue Zeile.");
            this.build();
        },

        build(this: Mutable<PrintState>) {
            this.appendValueInput("VALUE").appendField("gib aus");
            for (let i = 1; i < this.state.items; i++) this.appendValueInput("VALUE" + i).appendField("und");
            const tail = this.appendDummyInput("TAIL");
            if (this.state.items > 1) tail.appendField(new FieldButton("◂", (b) => setItems(b as Mutable<PrintState>, -1), "Letzten Wert entfernen"));
            tail.appendField(new FieldButton("▸", (b) => setItems(b as Mutable<PrintState>, +1), "Weiteren Wert hinzufügen"));
            tail.appendField(new Blockly.FieldDropdown([["mit Zeilenumbruch (println)", "println"], ["ohne Zeilenumbruch (print)", "print"]]), "MODE");
        },

        saveExtraState(this: Mutable<PrintState>): PrintState | null {
            return this.state.items > 1 ? { items: this.state.items } : null;
        },

        loadExtraState(this: Mutable<PrintState>, state: Partial<PrintState>) {
            mutate(this, { items: Math.max(1, Number(state?.items ?? 1)) }, (n) => n, false);
        },
    };

    function setItems(b: Mutable<PrintState>, delta: number) {
        const items = Math.max(1, b.state.items + delta);
        mutate(b, { items }, (n) => {
            const m = /^VALUE(\d+)$/.exec(n);
            return m && Number(m[1]) >= items ? null : n;
        }, true);
    }
}
