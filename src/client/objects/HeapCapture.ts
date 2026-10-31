import type { Interpreter } from "../../compiler/common/interpreter/Interpreter";
import type { ProgramPointerPositionInfo } from "../../compiler/common/monacoproviders/ProgramPointerManager";
import { DebuggerCallstackEntry } from "../../compiler/common/debugger/DebuggerCallstackEntry";
import type { BaseSymbolTable } from "../../compiler/common/BaseSymbolTable";
import { JavaSymbolTable } from "../../compiler/java/codegenerator/JavaSymbolTable";
import { StaticNonPrimitiveType } from "../../compiler/java/types/StaticNonPrimitiveType";
import type { RootVariable } from "./HeapSnapshot";
import { blockTitle, frameTitle, isFrameLevel, methodRootTable, partTitle, sourceLines, type ScopeStyle, type VariableScope } from "./ScopeTitles";

/**
 * Objektdiagramm (Paket 9): Variablen des angehaltenen Programms – wie die Variablenansicht des
 * Debuggers: lokale Variablen und Parameter der aktuellen Operation, this, Variablen des Hauptprogramms.
 */

export type Pos = { lineNumber: number; column: number };

function declaredBefore(range: { endLineNumber: number; endColumn: number } | undefined, pos: Pos): boolean {
    if (!range) return true;
    return range.endLineNumber < pos.lineNumber || (range.endLineNumber === pos.lineNumber && range.endColumn < pos.column);
}

/** mainClass/pos: Hauptklasse und Stelle, falls der Rahmen zum Hauptprogramm gehört (für die Bühnenanzeige) */
export type Capture = { roots: RootVariable[]; position?: ProgramPointerPositionInfo; method: string; line?: number; mainClass?: unknown; pos?: Pos };

type MainClass = { identifier: string; getFields(): any[] };

/** Variablen des Hauptprogramms = statische Attribute der Hauptklasse; mit pos nur die bis dorthin deklarierten */
function addMainClassFields(interpreter: Interpreter, cls: MainClass, pos: Pos | undefined, add: (name: string, value: unknown, type: unknown) => void) {
    const klass = interpreter.scheduler.classObjectRegistry[cls.identifier];
    for (const field of cls.getFields()) {
        if (!field.isStatic?.() || field.hiddenWhenDebugging) continue;
        if (pos && !declaredBefore(field.identifierRange, pos)) continue;
        add(field.identifier, klass?.[field.getInternalName()], field.type);
    }
}

/**
 * Variablen des Hauptprogramms auch dann, wenn es nicht mehr läuft (Programmende, Ausnahme) oder
 * nur noch Figuren/Timer laufen: Werte stehen in den statischen Attributen der Hauptklasse.
 */
export function captureMainClassFields(interpreter: Interpreter, mainClass: unknown, pos?: Pos): RootVariable[] {
    const roots: RootVariable[] = [];
    addMainClassFields(interpreter, mainClass as MainClass, pos,
        (name, value, type) => roots.push({ name, value, type: (type as { identifier?: string } | undefined)?.identifier }));
    return roots;
}

/** läuft das Hauptprogramm noch (sein Thread existiert, evtl. wartend)? Sonst laufen höchstens Figuren/Timer. */
export function mainProgramRunning(interpreter: Interpreter): boolean {
    return interpreter.scheduler.getAllThreads().some((t) => /main/i.test(t.name) && t.programStack.some((p) => !p.program?.isReplProgram));
}

/** Hauptklasse des Moduls, das beim Start ausgeführt wird */
export function startedMainClass(interpreter: Interpreter, suggestedModule?: unknown): unknown {
    const module = interpreter.executable?.findStartableModule(suggestedModule as never) as { mainClass?: { resolvedType?: unknown } } | null | undefined;
    return module?.mainClass?.resolvedType;
}

type ProgramState = { program: { isReplProgram?: boolean; methodIdentifierWithClass?: string }; stackBase: number };
type Thread = { name: string; s: unknown[]; programStack: ProgramState[] };

/** Thread des Hauptprogramms – auch wenn er gerade wartet (warte …, Eingabe), dann ist er nicht der aktuelle */
function mainThread(interpreter: Interpreter): Thread | undefined {
    // unten auf dem Stapel die main-Methode (Programmteile laufen in eigenen Threads mit ihrer Methode unten)
    const isMain = (t: Thread) => {
        const first = t.programStack.find((p) => !p.program?.isReplProgram);
        return !!first && /(^|\.)\$?main$/.test(first.program.methodIdentifierWithClass ?? "");
    };
    const all = (interpreter.scheduler.getAllThreads() as unknown as Thread[]).filter(isMain);
    const current = interpreter.scheduler.getCurrentThread() as unknown as Thread | undefined;
    return all.find((t) => /main/i.test(t.name)) ?? all[0] ?? (current && isMain(current) ? current : undefined);
}

/** Bereich eines Blocks; Kopf und Rumpf einer Schleife (zwei Tabellen, gleiche Zeile) sind ein Bereich */
function innerScope(frame: VariableScope, table: BaseSymbolTable, title: string): VariableScope {
    return { key: `${frame.key}/${table.range.startLineNumber}/${title}`, title, inner: true, lines: { from: table.range.startLineNumber, to: table.range.endLineNumber } };
}

/**
 * Variablen eines Rahmens (Aufrufs). Mit style bekommt jede Variable ihren Gültigkeitsbereich: die Operation
 * selbst (frameScope) oder ein Block darin („in der for-Schleife …“).
 */
function frameVariables(interpreter: Interpreter, thread: Thread, programState: ProgramState, style?: ScopeStyle, frameScope?: VariableScope, withMainFields = true) {
    const entry = new DebuggerCallstackEntry(programState as never);
    if (!entry.symbolTable) return undefined;

    const range = entry.nextStep?.getValidRangeOrUndefined();
    const pos: Pos = range && range.startLineNumber >= 0
        ? { lineNumber: range.startLineNumber, column: range.startColumn }
        : { lineNumber: Number.MAX_SAFE_INTEGER, column: 0 };

    const tables: BaseSymbolTable[] = [];
    for (let t: BaseSymbolTable | undefined = entry.symbolTable; t; t = t.parent) if (!t.hiddenWhenDebugging) tables.unshift(t);
    const lines = style ? sourceLines(entry.symbolTable) : [];
    const method = methodRootTable(entry.symbolTable).range;
    const ownScope: VariableScope | undefined = frameScope ?? (style ? { key: "frame", title: frameTitle(entry.symbolTable, style), inner: false } : undefined);
    // Operationen und Programmteile: Zeilen der Methode (das Hauptprogramm hat keine eigenen)
    if (ownScope && ownScope.key !== "main" && (entry.symbolTable as JavaSymbolTable).methodContext && !ownScope.lines) {
        ownScope.lines = { from: method.startLineNumber, to: method.endLineNumber };
    }

    const roots: RootVariable[] = [];
    let mainClass: unknown;
    let scope: VariableScope | undefined;
    const add = (name: string, value: unknown, type: unknown) => {
        const i = roots.findIndex((r) => r.name === name);
        const t = (type as { identifier?: string } | undefined)?.identifier;
        const root: RootVariable = scope ? { name, value, type: t, scope } : { name, value, type: t };
        if (i >= 0) roots[i] = root;   // innen verdeckt außen
        else roots.push(root);
    };

    for (const table of tables) {
        scope = !style || isFrameLevel(table) ? ownScope
            : innerScope(ownScope!, table, blockTitle(lines, table, style));
        // Variablen des Hauptprogramms (statische Attribute der Hauptklasse)
        if (table instanceof JavaSymbolTable) {
            const cls = table.classContext instanceof StaticNonPrimitiveType ? table.classContext.nonPrimitiveType : table.classContext;
            if (cls && (cls as { isMainClass?: boolean }).isMainClass && table.classContext !== table.parent?.classContext) {
                mainClass = cls;
                if (withMainFields) addMainClassFields(interpreter, cls as MainClass, pos, add);
            }
        }
        for (const symbol of table.getSymbolsOnStackframeForDebugger()) {
            if (symbol.hiddenWhenDebugging) continue;
            if (symbol.identifier !== "this" && !declaredBefore(symbol.identifierRange, pos)) continue;
            add(symbol.identifier, symbol.getValue(thread.s as never, programState.stackBase), (symbol as { type?: unknown }).type);
        }
    }
    // "this" nach hinten (die eigenen Variablen zuerst)
    roots.sort((a, b) => (a.name === "this" ? 1 : 0) - (b.name === "this" ? 1 : 0));
    return { roots, range, pos, mainClass, table: entry.symbolTable };
}

/**
 * frame "top": aktuelle Operation (Objektdiagramm beim Anhalten);
 * frame "main": Hauptprogramm, auch wenn gerade eine Operation läuft (Reiter „Variablen“).
 * Mit style tragen die Variablen ihren Gültigkeitsbereich (Paket 16g).
 */
export function captureCurrentFrame(interpreter: Interpreter, frame: "top" | "main" = "top", style?: ScopeStyle): Capture | undefined {
    const thread = frame === "main" ? mainThread(interpreter) : interpreter.scheduler.getCurrentThread() as unknown as Thread | undefined;
    const stack = thread?.programStack ?? [];
    const programState = frame === "main" ? stack.find((p) => !p.program?.isReplProgram) : stack[stack.length - 1];
    if (!thread || !programState || programState.program?.isReplProgram) return undefined;
    const frameScope = style && frame === "main" ? { key: "main", title: "Hauptprogramm", inner: false } : undefined;
    const variables = frameVariables(interpreter, thread, programState, style, frameScope);
    if (!variables) return undefined;
    const { roots, range, pos, mainClass } = variables;

    let method = (programState.program.methodIdentifierWithClass ?? "")
        .replace(/\d*\./g, ".").replaceAll("$", "").replace(/^\./, "")
        .replace(/^MainClass\./, "");   // Operationen des Hauptprogramms ohne Klassennamen
    if (method === "main" || method === "") method = "Hauptprogramm";
    return { roots, position: interpreter.scheduler.getNextStepPosition(thread as never), method, line: range?.startLineNumber, mainClass, pos };
}

/**
 * Paket 16g: Variablen der Operationen, die das Hauptprogramm gerade aufgerufen hat (Aufrufstapel ohne das
 * Hauptprogramm selbst) – je Aufruf ein Bereich; bei Rekursion „1. Aufruf“, „2. Aufruf“ …
 */
export function captureCalls(interpreter: Interpreter, style: ScopeStyle): RootVariable[] {
    const thread = mainThread(interpreter);
    if (!thread) return [];
    const stack = thread.programStack;
    const mainIndex = stack.findIndex((p) => !p.program?.isReplProgram);
    if (mainIndex < 0) return [];
    return stackVariables(interpreter, thread, stack.slice(mainIndex + 1), style, "call");
}

/**
 * Paket 16: Variablen der gerade laufenden Programmteile (@WennTaste …, eigene Threads) und der Operationen,
 * die sie aufgerufen haben – je Programmteil ein Bereich.
 */
export function captureParts(interpreter: Interpreter, style: ScopeStyle): RootVariable[] {
    const main = mainThread(interpreter);
    const roots: RootVariable[] = [];
    (interpreter.scheduler.getAllThreads() as unknown as Thread[]).forEach((thread, t) => {
        if (thread === main) return;
        const states = thread.programStack.filter((p) => !p.program?.isReplProgram);
        const first = states[0] && new DebuggerCallstackEntry(states[0] as never).symbolTable;
        const title = first && partTitle(first, style);
        if (!title) return;
        roots.push(...stackVariables(interpreter, thread, states, style, `part${t}-`, title));
    });
    return roots;
}

/** je Rahmen ein Bereich; mehrere Aufrufe derselben Operation (Rekursion) werden durchgezählt */
function stackVariables(interpreter: Interpreter, thread: Thread, states: ProgramState[], style: ScopeStyle, prefix: string, firstTitle?: string): RootVariable[] {
    const calls: { state: ProgramState; title: string }[] = [];
    for (const state of states) {
        if (state.program?.isReplProgram) continue;
        const table = new DebuggerCallstackEntry(state as never).symbolTable;
        if (!table || table.hiddenWhenDebugging) continue;
        calls.push({ state, title: calls.length === 0 && firstTitle ? firstTitle : frameTitle(table, style) });
    }
    const count = new Map<string, number>();
    for (const c of calls) count.set(c.title, (count.get(c.title) ?? 0) + 1);
    const nth = new Map<string, number>();
    const roots: RootVariable[] = [];
    calls.forEach((c, i) => {
        let title = c.title;
        if ((count.get(title) ?? 0) > 1) {
            const n = (nth.get(title) ?? 0) + 1;
            nth.set(title, n);
            title += ` – ${n}. Aufruf`;
        }
        // Variablen der Hauptklasse gehören zum Hauptprogramm, nicht zum Aufruf
        roots.push(...frameVariables(interpreter, thread, c.state, style, { key: `${prefix}${i}`, title, inner: false }, false)?.roots ?? []);
    });
    return roots;
}

/**
 * Blöckly (Paket 18): Variablen je laufendem Skript (eigener Thread) mit der Figur bzw. Bühne, zu der es gehört
 * („this“ des ersten Rahmens) und den Anmerkungen seiner Methode (@BeimStart …). „this“ selbst fehlt in roots.
 */
export type ThreadCapture = { self: unknown; annotations: Map<string, string>; roots: RootVariable[] };

export function captureScripts(interpreter: Interpreter): ThreadCapture[] {
    const main = mainThread(interpreter);
    const result: ThreadCapture[] = [];
    (interpreter.scheduler.getAllThreads() as unknown as Thread[]).forEach((thread, t) => {
        if (thread === main) return;
        const states = thread.programStack.filter((p) => !p.program?.isReplProgram);
        const first = states[0] && new DebuggerCallstackEntry(states[0] as never).symbolTable;
        type Annotated = { getAnnotation?(a: string): { parameter?: string } | undefined };
        const method = (first as JavaSymbolTable | undefined)?.methodContext as (Annotated & { annotations?: { identifier: string; parameter?: string }[] }) | undefined;
        if (!method) return;
        const annotations = new Map<string, string>();
        for (const a of method.annotations ?? []) annotations.set(a.identifier, String(a.parameter ?? ""));
        const all = stackVariables(interpreter, thread, states, "blocks", `bl-skript${t}-`, "Skript");
        const self = all.find((r) => r.name === "this")?.value;
        result.push({ self, annotations, roots: all.filter((r) => r.name !== "this") });
    });
    return result;
}
