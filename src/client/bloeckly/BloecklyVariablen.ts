import type { Interpreter } from "../../compiler/common/interpreter/Interpreter";
import { BuehneClass } from "../../compiler/java/runtime/graphics/BuehneClass";
import { captureScripts, type ThreadCapture } from "../objects/HeapCapture";
import type { RootVariable } from "../objects/HeapSnapshot";
import { keyLabel } from "../blocks/FigureSpec";
import type { VariableScope } from "../objects/ScopeTitles";

/**
 * Blöckly (Paket 18f): Variablen für den Reiter „Variablen“ wie in Scratch – zuerst die Variablen für alle
 * Figuren (statische Attribute der Bühnenklasse), dann je Figur ihre eigenen; jeder Klon bekommt einen
 * eigenen Kasten („Waschbär (Klon 2)“). Darunter je laufendem Skript seine Variablen („erstelle neue Variable …“),
 * z. B. „🐾 Waschbär · Wenn 🚩 angeklickt“. Ohne laufende Bühne: leer.
 */

type Field = { identifier: string; hiddenWhenDebugging?: boolean; isStatic?: () => boolean; getInternalName(): string; type?: { identifier?: string } };
type ClassType = { identifier: string; getFields?: () => Field[] };
type Obj = { getType?: () => ClassType; figName?: () => string; figIstKlon?: boolean; figGeloescht?: boolean };

export const ALLE_SCOPE: VariableScope = { key: "bl-alle", title: "🎭 Für alle Figuren", inner: false };

function fieldsOf(type: ClassType | undefined): Field[] {
    try {
        return (type?.getFields?.() ?? []).filter((f) => !f.hiddenWhenDebugging);
    } catch {
        return [];
    }
}

/** Name des Skripts wie auf seinem Hut-Block */
export function skriptTitel(annotations: Map<string, string>, buehne: boolean): string {
    const p = (a: string) => annotations.get(a);
    if (p("BeimStart") !== undefined) return "Wenn 🚩 angeklickt";
    if (p("WennTaste") !== undefined) return `Wenn Taste ${keyLabel(p("WennTaste")!)} gedrückt`;
    if (p("WennAngeklickt") !== undefined) return buehne ? "Wenn die Bühne angeklickt" : "Wenn diese Figur angeklickt";
    if (p("WennNachricht") !== undefined) return `Wenn ich ${p("WennNachricht")} empfange`;
    if (p("WennIchAlsKlonEntstehe") !== undefined) return "Wenn ich als Klon entstehe";
    return "Skript";
}

/** Variablen der Skripte eines Objekts (Figur, Klon oder Bühne) unter dessen Titel */
function skriptVariablen(skripte: ThreadCapture[], self: unknown, titel: string, buehne: boolean): RootVariable[] {
    const roots: RootVariable[] = [];
    for (const s of skripte) {
        if (s.self !== self) continue;
        const scopes = new Map<VariableScope, VariableScope>();
        for (const r of s.roots) {
            let scope = r.scope;
            if (scope && !scope.inner) {
                if (!scopes.has(scope)) {
                    const erster = /-0$/.test(scope.key);
                    scopes.set(scope, { ...scope, title: `${titel} · ${erster ? skriptTitel(s.annotations, buehne) : scope.title}` });
                }
                scope = scopes.get(scope);
            }
            roots.push({ ...r, scope });
        }
    }
    return roots;
}

export function bloecklyVariablen(interpreter: Interpreter): RootVariable[] {
    const buehne = BuehneClass.von(interpreter) as (BuehneClass & Obj) | undefined;
    if (!buehne) return [];
    let skripte: ThreadCapture[] = [];
    try {
        skripte = captureScripts(interpreter);
    } catch {
        // ohne Übersetzung (Tests mit Attrappen) keine Skriptvariablen
    }
    const roots: RootVariable[] = [];
    // für alle Figuren: statische Attribute der Bühnenklasse (z. B. class Spiel extends Buehne)
    const stageType = buehne.getType?.();
    const klass = stageType ? (interpreter.scheduler.classObjectRegistry as Record<string, Record<string, unknown> | undefined>)[stageType.identifier] : undefined;
    for (const f of fieldsOf(stageType)) {
        if (!f.isStatic?.()) continue;
        roots.push({ name: f.identifier, value: klass?.[f.getInternalName()], type: f.type?.identifier, scope: ALLE_SCOPE });
    }
    roots.push(...skriptVariablen(skripte, buehne, "🎭 Bühne", true));
    // je Figur (auch jeder Klon) ihre eigenen Variablen
    const clones = new Map<string, number>();
    buehne.figuren.forEach((figur, i) => {
        const o = figur as unknown as Obj & Record<string, unknown>;
        if (o.figGeloescht) return;
        const name = o.figName?.() ?? "Figur";
        let title = "🐾 " + name;
        if (o.figIstKlon) {
            const n = (clones.get(name) ?? 0) + 1;
            clones.set(name, n);
            title += ` (Klon ${n})`;
        }
        const scope: VariableScope = { key: `bl-figur-${i}`, title, inner: false };
        for (const f of fieldsOf(o.getType?.())) {
            if (f.isStatic?.()) continue;
            roots.push({ name: f.identifier, value: o[f.getInternalName()], type: f.type?.identifier, scope });
        }
        roots.push(...skriptVariablen(skripte, figur, title, false));
    });
    return roots;
}
