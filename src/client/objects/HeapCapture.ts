import type { Interpreter } from "../../compiler/common/interpreter/Interpreter";
import type { ProgramPointerPositionInfo } from "../../compiler/common/monacoproviders/ProgramPointerManager";
import { DebuggerCallstackEntry } from "../../compiler/common/debugger/DebuggerCallstackEntry";
import type { BaseSymbolTable } from "../../compiler/common/BaseSymbolTable";
import { JavaSymbolTable } from "../../compiler/java/codegenerator/JavaSymbolTable";
import { StaticNonPrimitiveType } from "../../compiler/java/types/StaticNonPrimitiveType";
import type { RootVariable } from "./HeapSnapshot";

/**
 * Objektdiagramm (Paket 9): Variablen des angehaltenen Programms – wie die Variablenansicht des
 * Debuggers: lokale Variablen und Parameter der aktuellen Operation, this, Variablen des Hauptprogramms.
 */

type Pos = { lineNumber: number; column: number };

function declaredBefore(range: { endLineNumber: number; endColumn: number } | undefined, pos: Pos): boolean {
    if (!range) return true;
    return range.endLineNumber < pos.lineNumber || (range.endLineNumber === pos.lineNumber && range.endColumn < pos.column);
}

export type Capture = { roots: RootVariable[]; position?: ProgramPointerPositionInfo; method: string; line?: number };

/**
 * frame "top": aktuelle Operation (Objektdiagramm beim Anhalten);
 * frame "main": Hauptprogramm, auch wenn gerade eine Operation läuft (Variablenanzeige auf der Bühne)
 */
export function captureCurrentFrame(interpreter: Interpreter, frame: "top" | "main" = "top"): Capture | undefined {
    // Hauptprogramm: auch wenn sein Thread gerade wartet (warte …, Eingabe) – dann ist er nicht der aktuelle
    const hasProgram = (t: { programStack: { program?: { isReplProgram?: boolean } }[] }) => t.programStack.some((p) => !p.program?.isReplProgram);
    const thread = frame === "main"
        ? (() => {
            const all = interpreter.scheduler.getAllThreads().filter(hasProgram);
            return all.find((t) => /main/i.test(t.name)) ?? all[0] ?? interpreter.scheduler.getCurrentThread();
        })()
        : interpreter.scheduler.getCurrentThread();
    const stack = thread?.programStack ?? [];
    const programState = frame === "main" ? stack.find((p) => !p.program?.isReplProgram) : stack[stack.length - 1];
    if (!thread || !programState || programState.program?.isReplProgram) return undefined;
    const entry = new DebuggerCallstackEntry(programState);
    if (!entry.symbolTable) return undefined;

    const range = entry.nextStep?.getValidRangeOrUndefined();
    const pos: Pos = range && range.startLineNumber >= 0
        ? { lineNumber: range.startLineNumber, column: range.startColumn }
        : { lineNumber: Number.MAX_SAFE_INTEGER, column: 0 };

    const tables: BaseSymbolTable[] = [];
    for (let t: BaseSymbolTable | undefined = entry.symbolTable; t; t = t.parent) if (!t.hiddenWhenDebugging) tables.unshift(t);

    const roots: RootVariable[] = [];
    const seen = new Set<string>();
    const add = (name: string, value: unknown, type: unknown) => {
        const i = roots.findIndex((r) => r.name === name);
        const t = (type as { identifier?: string } | undefined)?.identifier;
        if (i >= 0) roots[i] = { name, value, type: t };   // innen verdeckt außen
        else roots.push({ name, value, type: t });
        seen.add(name);
    };

    for (const table of tables) {
        // Variablen des Hauptprogramms (statische Attribute der Hauptklasse)
        if (table instanceof JavaSymbolTable) {
            const cls = table.classContext instanceof StaticNonPrimitiveType ? table.classContext.nonPrimitiveType : table.classContext;
            if (cls && (cls as { isMainClass?: boolean }).isMainClass && table.classContext !== table.parent?.classContext) {
                const klass = interpreter.scheduler.classObjectRegistry[(cls as { identifier: string }).identifier];
                for (const field of (cls as { getFields(): any[] }).getFields()) {
                    if (!field.isStatic?.() || field.hiddenWhenDebugging) continue;
                    if (!declaredBefore(field.identifierRange, pos)) continue;
                    add(field.identifier, klass?.[field.getInternalName()], field.type);
                }
            }
        }
        for (const symbol of table.getSymbolsOnStackframeForDebugger()) {
            if (symbol.hiddenWhenDebugging) continue;
            if (symbol.identifier !== "this" && !declaredBefore(symbol.identifierRange, pos)) continue;
            add(symbol.identifier, symbol.getValue(thread.s, programState.stackBase), (symbol as { type?: unknown }).type);
        }
    }
    // "this" nach hinten (die eigenen Variablen zuerst)
    roots.sort((a, b) => (a.name === "this" ? 1 : 0) - (b.name === "this" ? 1 : 0));

    let method = (programState.program.methodIdentifierWithClass ?? "")
        .replace(/\d*\./g, ".").replaceAll("$", "").replace(/^\./, "")
        .replace(/^MainClass\./, "");   // Operationen des Hauptprogramms ohne Klassennamen
    if (method === "main" || method === "") method = "Hauptprogramm";
    return { roots, position: interpreter.scheduler.getNextStepPosition(thread), method, line: range?.startLineNumber };
}
