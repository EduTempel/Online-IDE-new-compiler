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
 * Blöckly (Paket 18c): Auch Figuren und die Bühne haben Programmteile – als Methoden ihrer Klasse
 * (class Waschbaer extends Figur). Sie gehören zum Objekt: Jeder Klon hat seine eigenen. @WennAngeklickt ohne
 * Argument heißt dort „wenn diese Figur angeklickt wird“, @WennIchAlsKlonEntstehe startet in jedem neuen Klon.
 *
 * Paket 19d/19e: @WennBuehnenbild("Wald") startet, wenn die Bühne zu diesem Bild wechselt; @WennStoppuhrUeber(10)
 * einmal, sobald die Stoppuhr den Wert überschreitet (nach „setze Stoppuhr zurück“ wieder). Ein Programmteil mit
 * @WennNachricht darf einen Parameter haben (double, int oder String): Er bekommt die Daten der Nachricht
 * (Nachricht.sende("Treffer", 10)); ohne Daten 0 bzw. "".
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
export const CLONE_PART_ANNOTATION = "WennIchAlsKlonEntstehe";
export const BACKDROP_PART_ANNOTATION = "WennBuehnenbild";
export const TIMER_PART_ANNOTATION = "WennStoppuhrUeber";
export const PART_ANNOTATIONS = [KEY_PART_ANNOTATION, MESSAGE_PART_ANNOTATION, CLICK_PART_ANNOTATION, START_PART_ANNOTATION, CLONE_PART_ANNOTATION,
    BACKDROP_PART_ANNOTATION, TIMER_PART_ANNOTATION];

export type PartKind = "key" | "message" | "click" | "start" | "clone" | "backdrop" | "timer";
const KIND_OF: Record<string, PartKind> = {
    [KEY_PART_ANNOTATION]: "key", [MESSAGE_PART_ANNOTATION]: "message",
    [CLICK_PART_ANNOTATION]: "click", [START_PART_ANNOTATION]: "start", [CLONE_PART_ANNOTATION]: "clone",
    [BACKDROP_PART_ANNOTATION]: "backdrop", [TIMER_PART_ANNOTATION]: "timer",
};

/** Datentyp des Parameters eines Programmteils mit Nachricht (Paket 19e) */
export type PartParam = "double" | "int" | "String";
const PART_PARAMS: string[] = ["double", "int", "String"];

/** Vergleich von Namen der Bühnenbilder: klein, ohne Umlaute und Leerzeichen */
const nameKey = (s: string) => s.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/[^a-z0-9]/g, "");

/** erzeugt einen Java-String (setzt die Java-Laufzeit, siehe NachrichtClass) */
let javaString: ((s: string) => unknown) | undefined;
export function setJavaStringFactory(f: (s: string) => unknown) {
    javaString = f;
}

/** Daten einer Nachricht passend zum Parameter: Zahl aus Text (3,5 geht), Text aus Zahl; ohne Daten 0 bzw. "" */
function partData(param: PartParam, data: unknown): unknown {
    const raw = typeof data === "object" && data !== null && "value" in data ? (data as { value: unknown }).value : data;
    if (param === "String") {
        // Java-Strings sind Objekte (StringClass); schon eins: so weitergeben
        if (typeof data === "object" && data !== null && "value" in data && typeof raw === "string") return data;
        const text = raw === undefined || raw === null ? "" : String(raw);
        return javaString ? javaString(text) : text;
    }
    const s = String(raw ?? "").trim();
    const n = typeof raw === "number" ? raw : Number(s.replace(",", "."));
    const v = Number.isFinite(n) && (typeof raw === "number" || s !== "") ? n : 0;
    return param === "int" ? Math.trunc(v) : v;
}

/**
 * Figur oder Bühne (Blöckly) mit eigenen Programmteilen. hit: liegt der Punkt (Koordinaten der Welt) auf ihr?
 * order: Ebene (höher = weiter vorne); stage: die Bühne (bekommt Klicks, die keine Figur treffen)
 */
export interface PartOwner {
    gsgPartsHit(x: number, y: number): boolean;
    gsgPartsOrder(): number;
    gsgPartsIsStage(): boolean;
    /** Paket 19i: Figur mit der Maus ziehen – ziehbar? (Lage beim Anfassen merken bzw. mitziehen) */
    gsgPartsZiehbar?(): boolean;
    gsgPartsZiehen?(x: number, y: number, anfang: boolean): void;
}

/**
 * Maus in der Grafik (Koordinaten der Welt): MouseClass meldet jeden mousedown ohne kind (Klick), dazu
 * mousemove, mouseup und mouseleave mit kind (Ziehen von Figuren, Paket 19i)
 */
export const gsgClickListeners = new Set<(x: number, y: number, kind?: string) => void>();

type Part = {
    kind: PartKind; trigger: string; name: string; start: (thread: Thread, data?: unknown) => void; owner?: PartOwner;
    param?: PartParam;
    /** „Wenn Stoppuhr > …“: schon ausgelöst (bis die Stoppuhr wieder darunter ist) */
    fired?: boolean;
};

type AnnotatedMethod = {
    identifier: string; isStatic: boolean; parameters: { type?: { identifier?: string } }[];
    returnParameterType?: { identifier: string };
    getAnnotation(identifier: string): { parameter?: string } | undefined;
    getInternalName(kind: "java"): string;
};

type MainClass = {
    getOwnMethods(): unknown[];
    getFields?(): { identifier: string; isStatic?(): boolean; getInternalName(): string }[];
    runtimeClass?: Record<string, unknown>;
};

/**
 * Programmteile einer Klasse: Art, Auslöser und Methode. forObject: Klasse einer Figur oder der Bühne – dort
 * gilt @WennAngeklickt ohne Argument (diese Figur) und @WennIchAlsKlonEntstehe; im Hauptprogramm nicht.
 */
export function partMethods(cls: { getOwnMethods(): unknown[] } | undefined, forObject = false): { kind: PartKind; trigger: string; method: AnnotatedMethod; param?: PartParam }[] {
    const result: { kind: PartKind; trigger: string; method: AnnotatedMethod; param?: PartParam }[] = [];
    const keys = new Set<string>();
    for (const m of (cls?.getOwnMethods() ?? []) as AnnotatedMethod[]) {
        if (m.parameters.length > 1 || m.returnParameterType?.identifier !== "void") continue;
        const paramType = m.parameters.length ? String(m.parameters[0]?.type?.identifier ?? "") : undefined;
        for (const annotation of PART_ANNOTATIONS) {
            const a = m.getAnnotation?.(annotation);
            if (!a) continue;
            const kind = KIND_OF[annotation];
            if ((kind === "clone" || kind === "backdrop" || kind === "timer") && !forObject) continue;
            // nur Nachrichten an Figuren und Bühne (Blöckly) bringen Daten mit (ein Parameter: double, int oder String)
            if (paramType !== undefined && (kind !== "message" || !forObject || !PART_PARAMS.includes(paramType))) continue;
            const noTrigger = kind === "start" || kind === "clone" || (kind === "click" && forObject);
            const trigger = noTrigger ? "" : String(a.parameter ?? "");
            if (!noTrigger && !trigger) continue;
            if (kind === "key") {
                if (keys.has(trigger.toLowerCase())) continue;
                keys.add(trigger.toLowerCase());
            }
            if (kind === "timer" && !Number.isFinite(Number(trigger))) continue;
            result.push({ kind, trigger, method: m, ...(paramType ? { param: paramType as PartParam } : {}) });
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
    private clickListener: ((x: number, y: number, kind?: string) => void) | undefined;
    /** Paket 19i: Figur, die gerade gezogen wird (moved: schon bewegt – dann ist es kein Klick) */
    private drag: { owner: PartOwner; x: number; y: number; moved: boolean } | undefined;
    private keyListener: ((key: string) => void) | undefined;
    /** Programmteile „wenn das Programm startet“, die noch auf das Hauptprogramm warten */
    private pendingStart = false;
    /** Figuren und Bühne mit Programmteilen (Blöckly) */
    private owners = new Set<PartOwner>();

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
        if (this.parts.some((p) => p.kind === "key")) this.listenToKeys();
        if (this.parts.some((p) => p.kind === "click")) this.listenToClicks();
        // „wenn das Programm startet“: auch für Figuren, die das Hauptprogramm erst noch erzeugt
        this.pendingStart = true;
        if (mainThread) {
            const before = mainThread.callbackAfterTerminated;
            mainThread.callbackAfterTerminated = () => { before?.(); this.startStartParts(); };
        }
    }

    private listenToKeys() {
        if (this.keyListener) return;
        this.keyListener = (key) => this.onKey(key);
        this.interpreter.keyboardManager?.addKeyDownListener(this.keyListener);
    }

    private listenToClicks() {
        if (this.clickListener) return;
        this.clickListener = (x, y, kind) => kind ? this.onPointer(kind, x, y) : this.onClick(x, y);
        gsgClickListeners.add(this.clickListener);
    }

    /**
     * Blöckly: Programmteile einer Figur oder der Bühne anmelden (Methoden ihrer Klasse und der Oberklassen bis
     * zur Bibliothek, Unterklasse zuerst). clone: neuer Klon – „wenn ich als Klon entstehe“ startet gleich, „wenn
     * das Programm startet“ nie. Sonst startet „wenn das Programm startet“ mit den anderen oder sofort, wenn der
     * Start schon war.
     */
    registerObject(owner: PartOwner, classes: { getOwnMethods(): unknown[] }[], clone = false) {
        if (this.owners.has(owner)) return;
        this.owners.add(owner);
        const seen = new Set<string>();
        const added: Part[] = [];
        for (const cls of classes) {
            for (const { kind, trigger, method, param } of partMethods(cls, true)) {
                if (method.isStatic) continue;
                const internal = method.getInternalName("java");
                if (seen.has(internal)) continue;     // in der Unterklasse überschrieben
                seen.add(internal);
                const part: Part = {
                    kind, trigger, name: method.identifier, owner, param,
                    start: (thread, data) => {
                        const fn = (owner as unknown as Record<string, Function>)[internal];
                        if (typeof fn !== "function") return;
                        if (param) fn.call(owner, thread, undefined, partData(param, data));
                        else fn.call(owner, thread, undefined);
                    },
                };
                added.push(part);
                this.parts.push(part);
            }
        }
        if (added.some((p) => p.kind === "key")) this.listenToKeys();
        this.listenToClicks();      // Klicks auf Figuren und Bühne
        if (clone) {
            for (const part of added.filter((p) => p.kind === "clone")) this.startPart(part);
        } else if (!this.pendingStart) {
            for (const part of added.filter((p) => p.kind === "start")) this.startPart(part);
        }
    }

    /** Figur (Klon) entfernt: Programmteile abmelden und ihre laufenden Skripte beenden (auch das aufrufende) */
    unregisterObject(owner: PartOwner) {
        this.stopThreadsOf(owner);
        this.owners.delete(owner);
        this.parts = this.parts.filter((p) => p.owner !== owner);
        for (const part of [...this.running.keys()]) if (part.owner === owner) this.running.delete(part);
    }

    /** Skripte einer Figur beenden; except: dieses nicht („stoppe andere Skripte dieser Figur“) */
    stopThreadsOf(owner: PartOwner, except?: Thread) {
        for (const [part, thread] of this.running) {
            if (part.owner !== owner || thread === except || finished(thread)) continue;
            this.interpreter.scheduler.killThread(thread);
        }
    }

    /** Läuft gerade ein Programmteil dieser Figur in diesem Thread? */
    ownerOf(thread: Thread): PartOwner | undefined {
        for (const [part, t] of this.running) if (t === thread) return part.owner;
        return undefined;
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
        const k = key.toLowerCase();
        const part = this.parts.find((p) => p.kind === "key" && !p.owner && p.trigger.toLowerCase() === k);
        if (part) this.startPart(part);
        // Blöckly: jede Figur (auch jeder Klon) mit diesem Programmteil
        for (const p of this.parts.filter((p) => p.kind === "key" && p.owner && p.trigger.toLowerCase() === k)) this.startPart(p);
    }

    /**
     * Nachricht gesendet: startet alle Programmteile mit dieser Nachricht. Liefert die Threads (neu gestartet
     * oder noch laufend), auf die „sende … und warte“ wartet.
     */
    onMessage(message: string, data?: unknown): Thread[] {
        const threads: Thread[] = [];
        for (const part of this.parts.filter((p) => p.kind === "message" && p.trigger === message)) {
            const thread = this.startPart(part, data);
            if (thread) threads.push(thread);
        }
        return threads;
    }

    /** Paket 19d: die Bühne wechselt zu diesem Bühnenbild */
    onBackdrop(name: string) {
        const k = nameKey(name);
        for (const part of this.parts.filter((p) => p.kind === "backdrop" && nameKey(p.trigger) === k)) this.startPart(part);
    }

    /** Paket 19d: Stand der Stoppuhr (regelmäßig von der Bühne) – „Wenn Stoppuhr > …“ startet beim Überschreiten */
    onTimer(seconds: number) {
        for (const part of this.parts) {
            if (part.kind !== "timer") continue;
            const over = seconds > Number(part.trigger);
            if (over && !part.fired) {
                part.fired = true;
                this.startPart(part);
            } else if (!over) part.fired = false;
        }
    }

    /** Klick in die Grafik (Koordinaten der Welt): Programmteile der getroffenen Figuren */
    onClick(x: number, y: number) {
        // Blöckly: nur die vorderste getroffene Figur, sonst die Bühne
        if (this.owners.size) {
            let target: PartOwner | undefined;
            for (const owner of this.owners) {
                if (owner.gsgPartsIsStage() || !owner.gsgPartsHit(x, y)) continue;
                if (!target || owner.gsgPartsOrder() > target.gsgPartsOrder()) target = owner;
            }
            // Paket 19i: eine ziehbare Figur startet „wenn angeklickt“ erst beim Loslassen – und nur, wenn sie nicht gezogen wurde
            if (target?.gsgPartsZiehbar?.()) {
                this.drag = { owner: target, x, y, moved: false };
                target.gsgPartsZiehen?.(x, y, true);
            } else {
                target ??= [...this.owners].find((o) => o.gsgPartsIsStage());
                this.startClickParts(target);
            }
        }
        for (const part of this.parts.filter((p) => p.kind === "click" && !p.owner)) {
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

    private startClickParts(target: PartOwner | undefined) {
        for (const part of this.parts.filter((p) => p.kind === "click" && p.owner && p.owner === target)) this.startPart(part);
    }

    /** Paket 19i: Maus bewegt bzw. losgelassen, während eine Figur angefasst ist */
    private onPointer(kind: string, x: number, y: number) {
        const drag = this.drag;
        if (!drag) return;
        if (kind === "mousemove") {
            // kleines Wackeln beim Klicken ist noch kein Ziehen
            if (!drag.moved && Math.hypot(x - drag.x, y - drag.y) < 4) return;
            drag.moved = true;
            drag.owner.gsgPartsZiehen?.(x, y, false);
        } else if (kind === "mouseup" || kind === "mouseleave") {
            this.drag = undefined;
            if (!drag.moved && kind === "mouseup") this.startClickParts(drag.owner);
        }
    }

    /** Wert einer Variablen des Hauptprogramms (Figur für „wenn … angeklickt“) */
    private figure(name: string): { isDestroyed?: boolean; container?: { visible?: boolean }; _containsPoint?(x: number, y: number): unknown } | undefined {
        const field = this.mainClass?.getFields?.().find((f) => f.identifier === name && f.isStatic?.());
        const value = field ? this.mainClass?.runtimeClass?.[field.getInternalName()] : undefined;
        return value && typeof value === "object" ? value as never : undefined;
    }

    /** Programmteil starten; läuft er noch, bleibt es dabei (der laufende Thread wird geliefert) */
    private startPart(part: Part, data?: unknown): Thread | undefined {
        const scheduler = this.interpreter.scheduler;
        if (scheduler.state !== SchedulerState.running) return undefined;
        const last = this.running.get(part);
        // läuft noch (auch während „warte“); „new“: gar nicht erst gestartet
        if (last && last.state !== ThreadState.new && !finished(last)) return last;
        const label = part.kind === "key" ? `Taste „${part.trigger}“` : part.kind === "message" ? `Nachricht „${part.trigger}“`
            : part.kind === "click" ? `Klick auf ${part.trigger || "die Figur"}` : part.kind === "clone" ? "neuer Klon"
            : part.kind === "backdrop" ? `Bühnenbild „${part.trigger}“` : part.kind === "timer" ? `Stoppuhr > ${part.trigger}` : "Programmstart";
        const thread = scheduler.createThread(`${label}: ${part.name}`, []);
        part.start(thread, data);
        thread.startIfNotEmptyOrDestroy();
        this.running.set(part, thread);
        return thread;
    }

    /** Hält das Programm am Leben, solange Tasten oder Klicks Programmteile starten können */
    isActive(): boolean {
        return this.parts.some((p) => p.kind === "key" || p.kind === "click" || p.kind === "timer" || p.kind === "backdrop");
    }

    /** Thread, in dem gerade ein Programmteil läuft (für Tests) */
    runningThreads(): Thread[] {
        return [...this.running.values()].filter((t) => !finished(t));
    }

    clear() {
        this.parts = [];
        this.running.clear();
        this.mainClass = undefined;
        this.pendingStart = false;
        this.owners.clear();
        this.drag = undefined;
        if (this.clickListener) gsgClickListeners.delete(this.clickListener);
        this.clickListener = undefined;
        this.keyListener = undefined;
    }
}
