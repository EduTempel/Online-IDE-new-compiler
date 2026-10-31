import { PART_ANNOTATIONS } from "../../common/interpreter/GsgParts";
import type { JavaCompiledModule } from "../module/JavaCompiledModule";

/**
 * GSG (Paket 16): Gültigkeitsbereich einer Variablen des Hauptprogramms für den grünen Balken am Rand.
 * Die Online-IDE macht sie zu statischen Attributen der Hauptklasse; wie in echtem Java gilt sie aber nur
 * im Hauptprogramm – ab ihrer Deklaration bis zur letzten Anweisung, ohne die Methoden und Klassen
 * dazwischen – und in den Programmteilen (@WennTaste …), die mit den Variablen des Hauptprogramms arbeiten.
 */

export type LineRange = { startLineNumber: number; endLineNumber: number };

type Ranged = { range?: { startLineNumber: number; endLineNumber: number } };
type MethodNode = Ranged & { identifier: string; annotations?: { identifier: string }[]; statement?: { statements?: Ranged[] } };

const valid = (r: Ranged["range"]): r is LineRange => !!r && r.startLineNumber > 0 && r.endLineNumber >= r.startLineNumber;

export function mainVariableScopeRanges(module: JavaCompiledModule, declarationLine: number): LineRange[] {
    const mainClass = module.mainClass as unknown as { methods: MethodNode[] } | undefined;
    if (!mainClass) return [];
    const mainMethod = mainClass.methods.find((m) => m.identifier == "main" || m.identifier == "$main");
    const statements = (mainMethod?.statement?.statements ?? []).map((s) => s.range).filter(valid);
    const lastLine = Math.max(0, ...statements.map((r) => r.endLineNumber));
    if (lastLine < declarationLine) return [];

    const isPart = (m: MethodNode) => !!m.annotations?.some((a) => PART_ANNOTATIONS.includes(a.identifier));
    const excluded: LineRange[] = [];
    const parts: LineRange[] = [];
    for (const m of mainClass.methods) {
        if (m === mainMethod || !valid(m.range)) continue;
        (isPart(m) ? parts : excluded).push(m.range);
    }
    for (const t of ((module.ast as unknown as { innerTypes?: Ranged[] } | undefined)?.innerTypes ?? [])) if (valid(t.range)) excluded.push(t.range);
    // Programmteile stehen ebenfalls zwischen den Anweisungen – sie gelten ganz
    const blocked = (line: number) => [...excluded, ...parts].some((r) => line >= r.startLineNumber && line <= r.endLineNumber);

    const result: LineRange[] = [];
    let start: number | undefined;
    for (let line = declarationLine; line <= lastLine + 1; line++) {
        const inside = line <= lastLine && !blocked(line);
        if (inside && start === undefined) start = line;
        if (!inside && start !== undefined) {
            result.push({ startLineNumber: start, endLineNumber: line - 1 });
            start = undefined;
        }
    }
    // Leerzeilen am Anfang und Ende eines Stücks (zwischen Anweisungen und Methoden) gehören nicht dazu
    const lines = (module.file?.getText?.() ?? "").split("\n");
    const blank = (line: number) => !(lines[line - 1] ?? "").trim();
    for (const r of result) {
        while (r.endLineNumber > r.startLineNumber && blank(r.endLineNumber)) r.endLineNumber--;
        while (r.startLineNumber < r.endLineNumber && blank(r.startLineNumber)) r.startLineNumber++;
    }
    return [...result.filter((r) => !blank(r.startLineNumber)), ...parts].sort((a, b) => a.startLineNumber - b.startLineNumber);
}
