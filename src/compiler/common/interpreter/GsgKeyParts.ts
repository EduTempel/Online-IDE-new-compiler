import type { Interpreter } from "./Interpreter";
import type { Module } from "../module/Module";
import type { Thread } from "./Thread";
import { SchedulerState } from "./SchedulerState";
import { ThreadState } from "./ThreadState";

/**
 * GSG (Blockmodus): Programmteile, die eine Taste startet – wie „Wenn Taste … gedrückt“ in Scratch.
 *
 *     // Hauptprogramm
 *     Circle ball = new Circle(400, 300, 30);
 *
 *     @WennTaste("ArrowUp")
 *     void hoch() {
 *         ball.move(0, -10);
 *     }
 *
 * Methoden des Hauptprogramms mit @WennTaste("Taste") (void, ohne Parameter) laufen bei jedem Drücken der
 * Taste in einem eigenen Thread – gleichzeitig mit dem Hauptprogramm, mit denselben Variablen. Läuft der
 * Programmteil noch, zählt erneutes Drücken nicht. Gibt es solche Programmteile, läuft das Programm nach
 * dem Ende des Hauptprogramms weiter (wartet auf Tasten), bis „Stopp“ gedrückt wird.
 * Je Taste zählt nur der erste Programmteil.
 */
export const KEY_PART_ANNOTATION = "WennTaste";

type KeyPart = { key: string; name: string; start: (thread: Thread) => void };

type AnnotatedMethod = {
    identifier: string; isStatic: boolean; parameters: unknown[];
    returnParameterType?: { identifier: string };
    getAnnotation(identifier: string): { parameter?: string } | undefined;
    getInternalName(kind: "java"): string;
};

/** Programmteile einer Klasse (des Hauptprogramms): Taste und Methode */
export function keyPartMethods(cls: { getOwnMethods(): unknown[] } | undefined): { key: string; method: AnnotatedMethod }[] {
    const result: { key: string; method: AnnotatedMethod }[] = [];
    const seen = new Set<string>();
    for (const m of (cls?.getOwnMethods() ?? []) as AnnotatedMethod[]) {
        const key = m.getAnnotation?.(KEY_PART_ANNOTATION)?.parameter;
        if (!key || m.parameters.length || m.returnParameterType?.identifier !== "void") continue;
        if (seen.has(key.toLowerCase())) continue;
        seen.add(key.toLowerCase());
        result.push({ key, method: m });
    }
    return result;
}

export class GsgKeyParts {
    private parts: KeyPart[] = [];
    private running = new Map<KeyPart, Thread>();

    constructor(private interpreter: Interpreter) { }

    /** beim Start des Programms: Programmteile des Hauptprogramms anmelden */
    register(module: Module | undefined) {
        this.clear();
        const cls = (module as { getClassWithStartableMainMethod?(): { getOwnMethods(): unknown[]; runtimeClass?: Record<string, Function> } | undefined } | undefined)
            ?.getClassWithStartableMainMethod?.();
        const runtimeClass = cls?.runtimeClass;
        if (!cls || !runtimeClass) return;
        for (const { key, method } of keyPartMethods(cls)) {
            const stub = runtimeClass[method.getInternalName("java")];
            if (typeof stub !== "function") continue;
            this.parts.push({
                key, name: method.identifier,
                start: (thread) => method.isStatic ? stub.call(runtimeClass, thread, undefined) : undefined,
            });
        }
        if (this.parts.length) this.interpreter.keyboardManager?.addKeyDownListener((key) => this.onKey(key));
    }

    /** Taste gedrückt (auch für Tests) */
    onKey(key: string) {
        const scheduler = this.interpreter.scheduler;
        if (scheduler.state !== SchedulerState.running) return;
        const part = this.parts.find((p) => p.key.toLowerCase() === key.toLowerCase());
        if (!part) return;
        const last = this.running.get(part);
        // läuft noch (auch während „warte“); „new“: gar nicht erst gestartet
        if (last && ![ThreadState.new, ThreadState.terminated, ThreadState.terminatedWithException].includes(last.state)) return;
        const thread = scheduler.createThread(`Taste „${part.key}“: ${part.name}`, []);
        part.start(thread);
        thread.startIfNotEmptyOrDestroy();
        this.running.set(part, thread);
    }

    /** Hält das Programm am Leben, solange Tasten Programmteile starten können */
    isActive(): boolean {
        return this.parts.length > 0;
    }

    clear() {
        this.parts = [];
        this.running.clear();
    }
}
