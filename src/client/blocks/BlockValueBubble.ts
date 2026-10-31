import * as Blockly from "blockly/core";
import type { Main } from "../main/Main";
import { SchedulerState } from "../../compiler/common/interpreter/SchedulerState";
import { B, type BlockState } from "./BlockTypes";
import { JavaBlockGenerator } from "./JavaBlockGenerator";
import { TYPE_NAMES } from "./BlockTypeSystem";
import type { ReplReturnValue } from "../../compiler/common/repl/ReplReturnValue";
import { ValueRenderer } from "../../compiler/common/debugger/ValueRenderer";

/**
 * Paket 17a: Klick auf einen Werte-Block (Rechnung, Vergleich, Text, „x von ball“ …) zeigt in einer
 * Sprechblase seinen Wert und Datentyp – wie in Scratch. Ausgewertet wird der erzeugte Java-Ausdruck mit der
 * REPL der IDE: Ist das Programm angehalten (Einzelschritt, Haltepunkt), mit den aktuellen Variablen.
 */

export type EvalPlan = { code: string } | { problem: string };

/** Blöcke, deren Wert nur das laufende Programm kennt (Variablen, Figuren, Parameter …) */
const NEEDS_PROGRAM = /^(j_var_get|j_this|j_attr|j_obj|j_array|j_dyn|j_list|j_coll|j_adt|j_stack|j_queue|j_tree|j_fig|j_call|j_super|j_mouse|j_key)/;

function walk(b: BlockState, visit: (x: BlockState) => void) {
    visit(b);
    for (const input of Object.values(b.inputs ?? {})) if (input?.block) walk(input.block, visit);
}

/** Was wird ausgewertet – oder warum nicht? (ohne Oberfläche testbar) */
export function evalPlan(b: BlockState, valueInputs: number, filled: number): EvalPlan {
    let reads = false;
    walk(b, (x) => { if (x.type === B.input) reads = true; });
    if (reads) return { problem: "Eingaben fragt das Programm erst beim Ausführen ab – starte es dafür." };
    if (filled < valueInputs) return { problem: "Hier fehlt noch ein Wert – fülle zuerst alle Lücken des Blocks." };
    const code = JavaBlockGenerator.expressionCode(b).trim();
    if (!code) return { problem: "Diesen Block kann ich nicht einzeln ausrechnen." };
    return { code };
}

/** Braucht der Block Werte aus dem laufenden Programm? */
export function needsProgram(b: BlockState): boolean {
    let needs = false;
    walk(b, (x) => { if (NEEDS_PROGRAM.test(x.type)) needs = true; });
    return needs;
}

/** Name des Datentyps für die Blase (Java-Name, wenn es keinen deutschen gibt) */
export function typeName(identifier: string | undefined): string {
    if (!identifier) return "";
    if (identifier === "Integer") return TYPE_NAMES.int;
    if (identifier === "Double") return TYPE_NAMES.double;
    if (identifier === "Boolean") return TYPE_NAMES.boolean;
    if (identifier === "Character") return TYPE_NAMES.char;
    if (identifier === "float") return TYPE_NAMES.double;
    if (identifier === "long" || identifier === "short" || identifier === "byte") return TYPE_NAMES.int;
    return TYPE_NAMES[identifier] ?? identifier;
}

/** Wert für die Blase: Texte in Anführungszeichen, Wahrheitswerte deutsch */
export function valueText(text: string | null | undefined, type: string | undefined): string {
    const t = String(text ?? "");
    if (type === "boolean" || type === "Boolean") return t === "true" ? "wahr (true)" : t === "false" ? "falsch (false)" : t;
    if (type === "String" && !/^".*"$/s.test(t)) return `„${t}“`;
    if (type === "String") return `„${t.slice(1, -1)}“`;
    return t;
}

/** Verständlicher Text zu einer Meldung des Compilers bzw. der Laufzeit */
export function problemText(message: string): string {
    if (/division by zero|durch 0|durch null|\/ by zero/i.test(message)) return "Durch 0 kann man nicht teilen.";
    if (/index.*(out of|außerhalb)|outofbounds/i.test(message)) return "Diese Position gibt es nicht (Zählung beginnt bei 0).";
    return message;
}

export class ValueBubble {

    private bubble?: HTMLDivElement;
    private timer?: ReturnType<typeof setTimeout>;
    private token = 0;

    constructor(private main: Main, private ws: Blockly.WorkspaceSvg) { }

    hide() {
        clearTimeout(this.timer);
        this.bubble?.remove();
        this.bubble = undefined;
        this.token++;
    }

    /** Klick auf einen Block (Arbeitsfläche oder Werkzeugleiste) */
    clicked(block: Blockly.BlockSvg) {
        this.hide();
        if (!block.outputConnection || block.isInsertionMarker()) return;

        let valueInputs = 0, filled = 0;
        for (const d of block.getDescendants(false)) {
            for (const input of d.inputList) {
                if (input.type !== Blockly.inputs.inputTypes.VALUE) continue;
                valueInputs++;
                if (input.connection?.targetBlock()) filled++;
            }
        }
        const state = Blockly.serialization.blocks.save(block, { addNextBlocks: false, addCoordinates: false }) as unknown as BlockState;
        const plan = evalPlan(state, valueInputs, filled);
        if ("problem" in plan) return this.show(block, plan.problem, "", true);

        const interpreter = this.main.getInterpreter();
        const scheduler = interpreter?.scheduler.state;
        const paused = scheduler === SchedulerState.paused;
        if (scheduler === SchedulerState.running) {
            return this.show(block, "Das Programm läuft gerade. Halte es an (⏸), dann zeigt ein Klick den Wert mit den aktuellen Variablen.", "", true);
        }
        if (!paused && needsProgram(state)) {
            return this.show(block, "Dieser Wert hängt von Variablen oder Figuren ab. Die gibt es erst, während das Programm läuft: "
                + "Starte es im Einzelschritt (oder halte es an) und klicke dann auf den Block.", "", true);
        }

        const repl = this.main.getRepl?.();
        if (!repl || !interpreter) return;
        // sofort auswerten (wie der Hover im Editor), ohne die Oberfläche auf „läuft“ (Debugger) umzuschalten
        let result: ReplReturnValue;
        let failure: string | undefined;
        const before = interpreter.scheduler.state;
        try {
            result = repl.executeSynchronously(plan.code);
            if (!result) failure = repl.getCurrentModule()?.errors?.find((e) => e.level === "error")?.message;
        } catch (e) {
            failure = String((e as Error)?.message ?? e);
        } finally {
            if (interpreter.scheduler.state !== before) interpreter.scheduler.setState(before);
        }
        if (!result) return this.show(block, failure ? problemText(failure) : "Dieser Wert lässt sich gerade nicht ausrechnen.", "", true);
        const typeId = (result.type as { identifier?: string } | undefined)?.identifier;
        if (typeId === "void") return this.show(block, "Dieser Block liefert keinen Wert.", "", true);
        const text = typeof result.text === "string" ? result.text : ValueRenderer.renderValue(result.value, 100);
        this.show(block, valueText(text, typeId), typeName(typeId), false);
    }

    private show(block: Blockly.BlockSvg, text: string, type: string, problem: boolean) {
        const host = this.ws.getInjectionDiv();
        const root = block.getSvgRoot().getBoundingClientRect();
        const base = host.getBoundingClientRect();
        const bubble = document.createElement("div");
        bubble.className = "gsg-value-bubble" + (problem ? " is-problem" : "");
        const value = document.createElement("span");
        value.className = "gsg-value-text";
        value.textContent = text;
        bubble.append(value);
        if (type) {
            const t = document.createElement("span");
            t.className = "gsg-value-type";
            t.textContent = type;
            bubble.append(t);
        }
        bubble.style.left = Math.max(4, root.left - base.left) + "px";
        bubble.style.top = Math.max(4, root.top - base.top) + "px";
        host.append(bubble);
        this.bubble = bubble;
        this.timer = setTimeout(() => this.hide(), problem ? 8000 : 6000);
    }
}
