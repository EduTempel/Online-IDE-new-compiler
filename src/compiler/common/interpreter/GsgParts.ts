import type { Interpreter } from "./Interpreter";
import type { Module } from "../module/Module";
import type { Thread } from "./Thread";
import { SchedulerState } from "./SchedulerState";
import { ThreadState } from "./ThreadState";

/**
 * GSG (Blockmodus): weitere Programmteile neben dem Hauptprogramm – wie die Hut-Blöcke in Scratch.
 *
 *     // Hauptprogramm
 *     Circle ball = new Circle(400, 300, 30);
 *
 *     @WennTaste("ArrowUp")          // bei jedem Druck auf ↑
 *     void hoch() { ball.move(0, -10); }
 *
 *     @WennNachricht("Tor")          // wenn irgendwo Nachricht.sende("Tor") steht
 *     void jubeln() { … }
 *
 *     @WennAngeklickt("ball")        // Klick auf die Figur in der Variablen ball
 *     void ballGeklickt() { … }
 *
 *     @BeimStart                     // beginnt, sobald das Hauptprogramm zum ersten Mal wartet oder fertig ist
 *     void blinken() { … }
 *
 * Die Methoden (void, ohne Parameter) laufen in eigenen Threads – gleichzeitig mit dem Hauptprogramm und mit
 * dessen Variablen. Läuft ein Programmteil noch, startet er nicht ein zweites Mal (neuer Tastendruck, Klick oder
 * dieselbe Nachricht zählt dann nicht). Mit Programmteilen für Tasten oder Klicks läuft das Programm nach dem
 * Ende des Hauptprogramms weiter, bis „Stopp“ gedrückt wird. Je Taste zählt nur der erste Programmteil; Nachrichten
 * und Klicks dürfen mehrere Programmteile haben.
 */
export const KEY_PART_ANNOTATION = "WennTaste";
export const MESSAGE_PART_ANNOTATION = "WennNachricht";
export const CLICK_PART_ANNOTATION = "WennAngeklickt";
export const START_PART_ANNOTATION = "BeimStart";
export const PART_ANNOTATIONS = [KEY_PART_ANNOTATION, MESSAGE_PART_ANNOTATION, CLICK_PART_ANNOTATION, START_PART_ANNOTATION];

export type PartKind = "key" | "message" | "click" | "start";
const KIND_OF: Record<string, PartKind> = {
    [KEY_PART_ANNOTATION]: "key", [MESSAGE_PART_ANNOTATION]: "message",
    [CLICK_PART_ANNOTATION]: "click", [START_PART_ANNOTATION]: "start",
};

/** Klicks in die Grafik (MouseClass meldet jeden mousedown in Koordinaten der Welt) */
export const gsgClickListeners = new Set<(x: number, y: number) => void>();

type Part = { kind: PartKind; trigger: string; name: string; start: (thread: Thread) => void };

type AnnotatedMethod = {
    identifier: string; isStatic: boolean; parameters: unknown[];
    returnParameterType?: { identifier: string };
    getAnnotation(identifier: string): { parameter?: string } | undefined;
    getInternalName(kind: "java"): string;
};

type MainClass = {
    getOwnMethods(): unknown[];
    getFields?(): { identifier: string; isStatic?(): boolean; getInternalName(): string }[];
    runtimeClass?: Record<string, unknown>;
};

/** Programmteile einer Klasse (des Hauptprogramms): Art, Auslöser und Methode */
export function partMethods(cls: { getOwnMethods(): unknown[] } | undefined): { kind: PartKind; trigger: string; method: AnnotatedMethod }[] {
    const result: { kind: PartKind; trigger: string; method: AnnotatedMethod }[] = [];
    const keys = new Set<string>();
    for (const m of (cls?.getOwnMethods() ?? []) as AnnotatedMethod[]) {
        if (m.parameters.length || m.returnParameterType?.identifier !== "void") continue;
        for (const annotation of PART_ANNOTATIONS) {
            const a = m.getAnnotation?.(annotation);
            if (!a) continue;
            const kind = KIND_OF[annotation];
            const trigger = kind === "start" ? "" : String(a.parameter ?? "");
            if (kind !== "start" && !trigger) continue;
            if (kind === "key") {
                if (keys.has(trigger.toLowerCase())) continue;
                keys.add(trigger.toLowerCase());
            }
            result.push({ kind, trigger, method: m });
            break;
        }
    }
    return result;
}

const finished = (t: Thread | undefined) => !t || [ThreadState.terminated, ThreadState.terminatedWithException].includes(t.state);

export class GsgParts {
    private parts: Part[] = [];
    private running = new Map<Part, Thread>();
    private mainClass: MainClass | undefined;
    private clickListener: ((x: number, y: number) => void) | undefined;
    /** Programmteile „wenn das Programm startet“, die noch auf das Hauptprogramm warten */
    private pendingStart = false;

    constructor(private interpreter: Interpreter) { }

    /** beim Start des Programms: Programmteile des Hauptprogramms anmelden */
    register(module: Module | undefined, mainThread?: Thread) {
        this.clear();
        const cls = (module as { getClassWithStartableMainMethod?(): MainClass | undefined } | undefined)
            ?.getClassWithStartableMainMethod?.();
        const runtimeClass = cls?.runtimeClass as Record<string, Function> | undefined;
        if (!cls || !runtimeClass) return;
        this.mainClass = cls;
        for (const { kind, trigger, method } of partMethods(cls)) {
            const stub = runtimeClass[method.getInternalName("java")];
            if (typeof stub !== "function") continue;
            this.parts.push({
                kind, trigger, name: method.identifier,
                start: (thread) => method.isStatic ? stub.call(runtimeClass, thread, undefined) : undefined,
            });
        }
        if (this.parts.some((p) => p.kind === "key")) this.interpreter.keyboardManager?.addKeyDownListener((key) => this.onKey(key));
        if (this.parts.some((p) => p.kind === "click")) {
            this.clickListener = (x, y) => this.onClick(x, y);
            gsgClickListeners.add(this.clickListener);
        }
        if (this.parts.some((p) => p.kind === "start")) {
            this.pendingStart = true;
            if (mainThread) {
                const before = mainThread.callbackAfterTerminated;
                mainThread.callbackAfterTerminated = () => { before?.(); this.startStartParts(); };
            }
        }
    }

    /** Ein Thread wartet (warte …): wartet das Hauptprogramm, beginnen die Programmteile „wenn das Programm startet“ */
    onSuspend(thread: Thread) {
        if (this.pendingStart && /main/i.test(thread.name)) this.startStartParts();
    }

    /** „wenn das Programm startet“ – auch für Tests */
    startStartParts() {
        if (!this.pendingStart) return;
        this.pendingStart = false;
        for (const part of this.parts.filter((p) => p.kind === "start")) this.startPart(part);
    }

    /** Taste gedrückt (auch für Tests) */
    onKey(key: string) {
        const part = this.parts.find((p) => p.kind === "key" && p.trigger.toLowerCase() === key.toLowerCase());
        if (part) this.startPart(part);
    }

    /**
     * Nachricht gesendet: startet alle Programmteile mit dieser Nachricht. Liefert die Threads (neu gestartet
     * oder noch laufend), auf die „sende … und warte“ wartet.
     */
    onMessage(message: string): Thread[] {
        const threads: Thread[] = [];
        for (const part of this.parts.filter((p) => p.kind === "message" && p.trigger === message)) {
            const thread = this.startPart(part);
            if (thread) threads.push(thread);
        }
        return threads;
    }

    /** Klick in die Grafik (Koordinaten der Welt): Programmteile der getroffenen Figuren */
    onClick(x: number, y: number) {
        for (const part of this.parts.filter((p) => p.kind === "click")) {
            const shape = this.figure(part.trigger);
            if (!shape || shape.isDestroyed || shape.container?.visible === false) continue;
            let hit = false;
            try {
                hit = !!shape._containsPoint?.(x, y);
            } catch {
                hit = false;
            }
            if (hit) this.startPart(part);
        }
    }

    /** Wert einer Variablen des Hauptprogramms (Figur für „wenn … angeklickt“) */
    private figure(name: string): { isDestroyed?: boolean; container?: { visible?: boolean }; _containsPoint?(x: number, y: number): unknown } | undefined {
        const field = this.mainClass?.getFields?.().find((f) => f.identifier === name && f.isStatic?.());
        const value = field ? this.mainClass?.runtimeClass?.[field.getInternalName()] : undefined;
        return value && typeof value === "object" ? value as never : undefined;
    }

    /** Programmteil starten; läuft er noch, bleibt es dabei (der laufende Thread wird geliefert) */
    private startPart(part: Part): Thread | undefined {
        const scheduler = this.interpreter.scheduler;
        if (scheduler.state !== SchedulerState.running) return undefined;
        const last = this.running.get(part);
        // läuft noch (auch während „warte“); „new“: gar nicht erst gestartet
        if (last && last.state !== ThreadState.new && !finished(last)) return last;
        const label = part.kind === "key" ? `Taste „${part.trigger}“` : part.kind === "message" ? `Nachricht „${part.trigger}“`
            : part.kind === "click" ? `Klick auf ${part.trigger}` : "Programmstart";
        const thread = scheduler.createThread(`${label}: ${part.name}`, []);
        part.start(thread);
        thread.startIfNotEmptyOrDestroy();
        this.running.set(part, thread);
        return thread;
    }

    /** Hält das Programm am Leben, solange Tasten oder Klicks Programmteile starten können */
    isActive(): boolean {
        return this.parts.some((p) => p.kind === "key" || p.kind === "click");
    }

    clear() {
        this.parts = [];
        this.running.clear();
        this.mainClass = undefined;
        this.pendingStart = false;
        if (this.clickListener) gsgClickListeners.delete(this.clickListener);
        this.clickListener = undefined;
    }
}
