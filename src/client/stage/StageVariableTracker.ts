import type { Interpreter } from "../../compiler/common/interpreter/Interpreter";
import { SchedulerState } from "../../compiler/common/interpreter/SchedulerState";
import { captureCurrentFrame, captureMainClassFields, mainProgramRunning, startedMainClass, type Pos } from "../objects/HeapCapture";
import type { RootVariable } from "../objects/HeapSnapshot";
import { render, snapshot } from "../trace/TraceData";

/**
 * Werte für die Variablenanzeige auf der Bühne (ohne Oberfläche, damit testbar):
 *  - beim Programmstart leeren (keine Werte vom letzten Lauf stehen lassen)
 *  - während des Laufs regelmäßig abfragen (poll)
 *  - am Programmende einmal vollständig lesen: auch Programme, die kürzer laufen als ein
 *    Abfrageintervall, zeigen so alle ihre Variablen mit den Endwerten
 */

const MAX_TEXT = 80;

export type Monitor = { name: string; text: string };

/** Wert für die Anzeige: Kommazahlen mit Nachkommastelle, lange Texte gekürzt */
export function monitorText(value: unknown, type?: string): string {
    const float = type === "double" || type === "float" || type === "Double";
    let v = snapshot(value);
    // char wird als Zahl (Zeichencode) gespeichert
    if ((type === "char" || type === "Character") && typeof v === "number") v = String.fromCharCode(v);
    const text = render(v, float);
    return text.length > MAX_TEXT ? text.slice(0, MAX_TEXT - 1) + "…" : text;
}

export class StageVariableTracker {

    monitors: Monitor[] = [];
    /** Hauptklasse des laufenden Programms (ihre statischen Attribute sind die Variablen des Hauptprogramms) */
    private mainClass?: unknown;
    /** zuletzt gesehene Stelle im Hauptprogramm (bei einer Ausnahme: nur bis dorthin deklarierte Variablen) */
    private lastPos?: Pos;
    /** übersetztes Programm des letzten Laufs */
    private runExecutable?: unknown;
    private attached = new WeakSet<Interpreter>();

    constructor(private onChange: () => void, private suggestedModule: () => unknown = () => undefined) { }

    /** an die Ereignisse eines Interpreters hängen (einmal je Interpreter) */
    attach(interpreter: Interpreter) {
        if (this.attached.has(interpreter)) return;
        this.attached.add(interpreter);
        interpreter.eventManager.on("start", () => this.started(interpreter));
        interpreter.eventManager.on("stop", () => this.finished(interpreter));
        interpreter.eventManager.on("done", () => this.finished(interpreter));
    }

    private started(interpreter: Interpreter) {
        this.lastPos = undefined;
        this.mainClass = undefined;
        this.runExecutable = interpreter.executable;
        try {
            this.mainClass = captureCurrentFrame(interpreter, "main")?.mainClass ?? startedMainClass(interpreter, this.suggestedModule());
        } catch { /* noch nichts zu sehen */ }
        this.set([]);
    }

    /** während des Laufs: aktuelle Werte */
    poll(interpreter: Interpreter) {
        const capture = this.capture(interpreter);
        if (capture?.mainClass) {
            this.mainClass = capture.mainClass;
            this.lastPos = capture.pos;
            this.set(capture.roots);
        } else if (this.mainClass && interpreter.isRunningOrPaused() && !mainProgramRunning(interpreter)) {
            // Hauptprogramm ist durch, Figuren oder Timer laufen weiter: alle seine Variablen
            this.set(captureMainClassFields(interpreter, this.mainClass));
        }
        // sonst (Programm beendet oder gerade keine Stelle bekannt): Werte stehen lassen
    }

    /** Programmende (normal, mit Ausnahme oder angehalten) */
    private finished(interpreter: Interpreter) {
        if (!this.mainClass) return;
        // neu übersetzt (jede Änderung im Editor oder an den Blöcken meldet "gestoppt"): die Variablen des
        // neuen Programms sind noch leer – die Endwerte des letzten Laufs stehen lassen
        if (interpreter.executable !== this.runExecutable) return;
        const capture = this.capture(interpreter);
        if (capture?.mainClass) {
            // angehalten: das Hauptprogramm steht noch auf dem Stapel
            this.set(capture.roots);
            return;
        }
        // Hauptprogramm ist durchgelaufen: alle Variablen; nach einer Ausnahme nur die bis zur letzten Stelle
        const error = interpreter.scheduler.state === SchedulerState.error;
        this.set(captureMainClassFields(interpreter, this.mainClass, error ? this.lastPos : undefined));
    }

    private capture(interpreter: Interpreter) {
        try {
            return captureCurrentFrame(interpreter, "main");
        } catch {
            return undefined;   // während des Übersetzens / Startens
        }
    }

    private set(roots: RootVariable[]) {
        const next = roots.filter((r) => r.name !== "this").map((r) => ({ name: r.name, text: monitorText(r.value, r.type) }));
        const changed = next.length !== this.monitors.length || next.some((m, i) => m.name !== this.monitors[i].name || m.text !== this.monitors[i].text);
        if (!changed) return;
        this.monitors = next;
        this.onChange();
    }
}
