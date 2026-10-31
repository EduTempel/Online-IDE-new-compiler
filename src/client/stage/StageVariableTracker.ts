import type { Interpreter } from "../../compiler/common/interpreter/Interpreter";
import { SchedulerState } from "../../compiler/common/interpreter/SchedulerState";
import { captureCalls, captureCurrentFrame, captureParts, captureMainClassFields, mainProgramRunning, startedMainClass, type Pos } from "../objects/HeapCapture";
import type { ScopeStyle, VariableScope } from "../objects/ScopeTitles";
import type { RootVariable } from "../objects/HeapSnapshot";
import { render, snapshot } from "../trace/TraceData";

/**
 * Werte für den Reiter „Variablen“ (ohne Oberfläche, damit testbar):
 *  - beim Programmstart leeren (keine Werte vom letzten Lauf stehen lassen)
 *  - während des Laufs regelmäßig abfragen (poll)
 *  - am Programmende einmal vollständig lesen: auch Programme, die kürzer laufen als ein
 *    Abfrageintervall, zeigen so alle ihre Variablen mit den Endwerten
 *  - jede Variable mit ihrem Gültigkeitsbereich (Paket 16g): Hauptprogramm, gerade laufende Operationen
 *    (bei Rekursion jeder Aufruf), Schleifen und Zweige darin
 */

const MAX_TEXT = 80;

/** Reihungen und Listen haben zusätzlich ihre Elemente (für die Anzeige mit Positionen) und ihre Länge; scope: Gültigkeitsbereich */
export type Monitor = { name: string; text: string; list?: { items: string[]; length: number }; scope?: VariableScope };

const MAIN_SCOPE: VariableScope = { key: "main", title: "Hauptprogramm", inner: false };

/** so viele Elemente zeigt die Listenanzeige höchstens (die Länge stimmt trotzdem) */
export const MAX_LIST_ITEMS = 100;
const LIST_CLASSES = new Set(["ArrayList", "LinkedList", "CopyOnWriteArrayList", "Vector", "List", "DynArray"]);
const BOXED_TYPES = new Set(["Integer", "Double", "Float", "Long", "Short", "Byte", "Character", "Boolean", "String"]);

/** Elemente einer Reihung (int[] …), Liste (ArrayList) oder dynamischen Reihung; sonst undefined */
function listElements(value: unknown): unknown[] | undefined {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== "object") return undefined;
    const v = value as { getType?: () => { identifier?: string } | undefined; constructor?: { name?: string }; elements?: unknown; getElements?: () => unknown };
    let cls: string | undefined;
    try { cls = v.getType?.()?.identifier; } catch { /* egal */ }
    if (!cls || !LIST_CLASSES.has(cls)) return undefined;
    try {
        const elements = Array.isArray(v.elements) ? v.elements : v.getElements?.();
        return Array.isArray(elements) ? elements : undefined;
    } catch {
        return undefined;
    }
}

/** Datentyp eines Elements: bei Reihungen aus dem Typ (double[] → double), bei Listen aus der Hüllklasse */
function elementType(element: unknown, arrayType?: string): string | undefined {
    if (arrayType?.endsWith("[]")) return arrayType.slice(0, -2);
    if (element && typeof element === "object") {
        try {
            const cls = (element as { getType?: () => { identifier?: string } | undefined }).getType?.()?.identifier;
            if (cls && BOXED_TYPES.has(cls)) return cls;
        } catch { /* egal */ }
    }
    return undefined;
}

const FIGURE_NAMES: Record<string, string> = { Circle: "Kreis", Rectangle: "Rechteck", Text: "Text", Sprite: "Sprite" };

/** Figur in einer Liste kurz: „Kreis bei (120 | 300)“, dazu „versteckt“ bzw. „entfernt“ (Paket 15e) */
export function figureText(element: unknown): string | undefined {
    if (!element || typeof element !== "object") return undefined;
    const e = element as {
        getType?: () => { identifier?: string } | undefined; isDestroyed?: boolean; container?: { visible?: boolean };
        _getCenterX?: () => number; _getCenterY?: () => number;
    };
    let cls: string | undefined;
    try { cls = e.getType?.()?.identifier; } catch { return undefined; }
    if (!cls || !FIGURE_NAMES[cls] || typeof e._getCenterX !== "function") return undefined;
    let where = "";
    try {
        where = ` bei (${Math.round(e._getCenterX!())} | ${Math.round(e._getCenterY?.() ?? 0)})`;
    } catch { /* entfernt: keine Position mehr */ }
    const state = e.isDestroyed ? " – entfernt" : e.container?.visible === false ? " – versteckt" : "";
    return FIGURE_NAMES[cls] + where + state;
}

/** Anzeige einer Reihung bzw. Liste: Elemente als Text (höchstens MAX_LIST_ITEMS) und Länge */
export function listMonitor(value: unknown, type?: string): Monitor["list"] {
    const elements = listElements(value);
    if (!elements) return undefined;
    const arrayType = Array.isArray(value) ? type : undefined;
    return {
        items: elements.slice(0, MAX_LIST_ITEMS).map((e) => figureText(e) ?? monitorText(e, elementType(e, arrayType))),
        length: elements.length,
    };
}

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

    /** zuletzt gelesene Zusatzvariablen (Blöckly: Bühne und Figuren) – die Bühne räumt beim Stopp auf */
    private lastExtra: RootVariable[] = [];

    /**
     * extra: weitere Variablen, die nicht im Hauptprogramm stehen (Blöckly: für alle Figuren, je Figur und je Skript);
     * withParts: Variablen der Programmteile (eigene Threads) selbst zeigen – in Blöckly ordnet extra sie den Figuren zu
     */
    constructor(private onChange: () => void, private suggestedModule: () => unknown = () => undefined, private style: () => ScopeStyle = () => "java",
        private extra: (interpreter: Interpreter) => RootVariable[] = () => [], private withParts: () => boolean = () => true) { }

    private extraRoots(interpreter: Interpreter, keepLast = false): RootVariable[] {
        let roots: RootVariable[] = [];
        try { roots = this.extra(interpreter); } catch { /* egal */ }
        if (roots.length || !keepLast) this.lastExtra = roots;
        return roots.length ? roots : keepLast ? this.lastExtra : roots;
    }

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
        this.lastExtra = [];
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
            this.set([...capture.roots, ...this.extraRoots(interpreter), ...this.calls(interpreter), ...this.parts(interpreter)]);
        } else if (this.mainClass && interpreter.isRunningOrPaused() && !mainProgramRunning(interpreter)) {
            // Hauptprogramm ist durch, Figuren oder Timer laufen weiter: alle seine Variablen
            this.set([...this.mainFields(interpreter), ...this.extraRoots(interpreter), ...this.parts(interpreter)]);
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
            this.set([...capture.roots, ...this.extraRoots(interpreter, true), ...this.calls(interpreter)]);
            return;
        }
        // Hauptprogramm ist durchgelaufen: alle Variablen; nach einer Ausnahme nur die bis zur letzten Stelle
        const error = interpreter.scheduler.state === SchedulerState.error;
        this.set([...this.mainFields(interpreter, error ? this.lastPos : undefined), ...this.extraRoots(interpreter, true)]);
    }

    /** Variablen des Hauptprogramms, wenn es nicht mehr läuft */
    private mainFields(interpreter: Interpreter, pos?: Pos): RootVariable[] {
        return captureMainClassFields(interpreter, this.mainClass, pos).map((r) => ({ ...r, scope: MAIN_SCOPE }));
    }

    /** Variablen der gerade laufenden Programmteile (eigene Threads) */
    private parts(interpreter: Interpreter): RootVariable[] {
        if (!this.withParts()) return [];
        try {
            return captureParts(interpreter, this.style());
        } catch {
            return [];
        }
    }

    /** Variablen der gerade laufenden Operationen */
    private calls(interpreter: Interpreter): RootVariable[] {
        try {
            return captureCalls(interpreter, this.style());
        } catch {
            return [];
        }
    }

    private capture(interpreter: Interpreter) {
        try {
            return captureCurrentFrame(interpreter, "main", this.style());
        } catch {
            return undefined;   // während des Übersetzens / Startens
        }
    }

    private set(roots: RootVariable[]) {
        const next: Monitor[] = roots.filter((r) => r.name !== "this").map((r) => {
            const list = listMonitor(r.value, r.type);
            const m: Monitor = { name: r.name, text: monitorText(r.value, r.type) };
            if (list) m.list = list;
            if (r.scope) m.scope = r.scope;
            return m;
        });
        const key = (m: Monitor) => (m.scope ? m.scope.key + "|" + m.scope.title + "|" : "") + (m.list ? JSON.stringify(m.list) : m.text);
        const changed = next.length !== this.monitors.length || next.some((m, i) => m.name !== this.monitors[i].name || key(m) !== key(this.monitors[i]));
        if (!changed) return;
        this.monitors = next;
        this.onChange();
    }
}
