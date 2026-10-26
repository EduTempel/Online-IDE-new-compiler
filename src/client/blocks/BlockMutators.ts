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

export type Mutable<S> = Blockly.BlockSvg & {
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
export function mutate<S>(block: Mutable<S>, next: S, rename: (name: string) => string | null, fireEvent: boolean,
    restoreField: (name: string) => boolean = () => true) {
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
        // Feldwerte ohne Ereignis zurücksetzen: sonst würde "Rückgängig" sie auf die Startwerte stellen
        Blockly.Events.disable();
        try {
            for (const [name, value] of fields) if (restoreField(name) && block.getField(name)) block.setFieldValue(value, name);
        } finally {
            Blockly.Events.enable();
        }
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

/**
 * Java-Schnipsel im Block (z. B. "if"): ausgeblendet – die Blöcke zeigen nur die deutsche Beschriftung.
 * Das Feld bleibt (unsichtbar) erhalten, damit Eingänge und Felder ihre Reihenfolge behalten.
 */
class JavaHintLabel extends Blockly.FieldLabel {
    constructor(text: string) {
        super(text, "gsg-java-hint");
        this.visible_ = false;
    }

    /** bleibt unsichtbar (Blockly schaltet beim Aufbau eines Eingangs alle seine Felder sichtbar) */
    override setVisible(_visible: boolean) { /* immer unsichtbar */ }
}

export const hintLabel = (text: string): Blockly.FieldLabel => new JavaHintLabel(text);

/**
 * Blockdefinitionen (JSON) ohne die Java-Schnipsel (Felder der Klasse gsg-java-hint): aus der Beschriftung
 * entfernt, stattdessen am Ende des Tooltips („Java: .setFillColor“) – für Neugierige und Lehrkräfte.
 */
export function withoutJavaHints<T extends Record<string, unknown>>(json: T[]): T[] {
    return json.map((def) => {
        const d: Record<string, unknown> = { ...def };
        const hints: string[] = [];
        for (let i = 0; typeof d[`message${i}`] === "string"; i++) {
            const args = (d[`args${i}`] as { class?: string; text?: string }[] | undefined) ?? [];
            const keep: unknown[] = [];
            const renumber = new Map<number, number>();
            args.forEach((a, j) => {
                if (a?.class === "gsg-java-hint") {
                    if (a.text && a.text !== "Java") hints.push(a.text);
                } else {
                    keep.push(a);
                    renumber.set(j + 1, keep.length);
                }
            });
            if (keep.length === args.length) continue;
            d[`message${i}`] = String(d[`message${i}`])
                .replace(/%(\d+)/g, (_, n: string) => (renumber.has(Number(n)) ? `%${renumber.get(Number(n))}` : ""))
                .replace(/[ \t]{2,}/g, " ").trim();
            if (keep.length) d[`args${i}`] = keep;
            else delete d[`args${i}`];
        }
        if (hints.length && (d.tooltip === undefined || typeof d.tooltip === "string")) {
            d.tooltip = `${d.tooltip ? d.tooltip + "\n" : ""}Java: ${hints.join(" ")}`;
        }
        return d as T;
    });
}

// ------------------------------------------------------------------ falls … sonst falls … sonst

/**
 * fixed: feste Form ohne Knöpfe – „falls … dann“ bzw. „falls … dann … sonst“ (Werkzeugleiste „Steuerung“
 * und einfaches if/if-else aus dem Java-Code). Sonst umbaubar mit „+ sonst falls“, „+ sonst“ und ✕.
 */
export type IfState = { elseIfs: number; hasElse: boolean; fixed?: boolean };

export function defineIfBlock(colour: string) {
    Blockly.Blocks[B.if] = {
        state: { elseIfs: 0, hasElse: false } as IfState,

        init(this: Mutable<IfState>) {
            this.state = { elseIfs: 0, hasElse: false };
            this.setPreviousStatement(true);
            this.setNextStatement(true);
            this.setColour(colour);
            this.build();
        },

        build(this: Mutable<IfState>) {
            const fixed = !!this.state.fixed && this.state.elseIfs === 0;
            this.setTooltip(fixed
                ? (this.state.hasElse
                    ? "Ist die Bedingung wahr, werden die Blöcke unter „dann“ ausgeführt, sonst die Blöcke unter „sonst“."
                    : "Führt die Blöcke unter „dann“ nur aus, wenn die Bedingung wahr ist.")
                : "Prüft die Bedingungen der Reihe nach und führt die Blöcke beim ersten wahren Fall aus. "
                + "„+ sonst falls“ fügt weitere Bedingungen hinzu, „+ sonst“ einen Teil für alle anderen Fälle, ✕ entfernt einen Teil.");
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
                const label = this.appendDummyInput("ELSE_LABEL");
                if (!fixed) label.appendField(new FieldButton("✕", (b) => removeElse(b as Mutable<IfState>), "Den sonst-Teil entfernen"));
                label.appendField("sonst").appendField(hintLabel("else"));
                this.appendStatementInput("ELSE");
            }
            if (fixed) {
                this.setInputsInline(true);
                return;
            }
            const add = this.appendDummyInput("ADD")
                .appendField(new FieldButton("+ sonst falls", (b) => addElseIf(b as Mutable<IfState>), "Weitere Bedingung hinzufügen"));
            if (!this.state.hasElse) add.appendField(new FieldButton("+ sonst", (b) => addElse(b as Mutable<IfState>), "sonst-Teil hinzufügen"));
            // Bedingung und Java-Hinweis in einer Zeile (Anweisungen stehen ohnehin in eigenen Zeilen)
            this.setInputsInline(true);
        },

        saveExtraState(this: Mutable<IfState>): IfState | null {
            if (!this.state.elseIfs && !this.state.hasElse && !this.state.fixed) return null;
            const s: IfState = { elseIfs: this.state.elseIfs, hasElse: this.state.hasElse };
            if (this.state.fixed) s.fixed = true;
            return s;
        },

        loadExtraState(this: Mutable<IfState>, state: Partial<IfState>) {
            const next: IfState = { elseIfs: Math.max(0, Number(state?.elseIfs ?? 0)), hasElse: !!state?.hasElse };
            if (state?.fixed && next.elseIfs === 0) next.fixed = true;
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
            tail.appendField(new Blockly.FieldDropdown([["mit Zeilenumbruch", "println"], ["ohne Zeilenumbruch", "print"]]), "MODE");
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
