import type { BlockState, WorkspaceState } from "./BlockTypes";

/**
 * Paket 17e: Puzzle (Parsons-Aufgabe). Die Lehrkraft macht aus einem fertigen Programm ein Puzzle: die
 * Anweisungen jeder Operation (und des Hauptprogramms) werden gemischt, Schleifen und Verzweigungen geleert
 * (ihr Inhalt steht lose dazwischen). Der Code bleibt gültiges Java – nur in falscher Reihenfolge.
 * Schüler/innen ordnen die Blöcke; „Prüfen“ vergleicht mit der Lösung. Die Lösung steht in den
 * Projekteinstellungen (settings.gsgPuzzle, nach Dateiname) – so geht sie beim Austeilen mit.
 */

/** Eingänge, in denen Anweisungen hängen (falls/sonst, Schleifen, Operationen) */
const STATEMENT_INPUT = /^(DO\d*|ELSE|BODY)$/;

/** Kette next -> Liste */
function chain(first: BlockState | undefined): BlockState[] {
    const list: BlockState[] = [];
    for (let b = first; b; b = b.next?.block) list.push(b);
    return list;
}

/** Liste -> Kette */
function link(list: BlockState[]): BlockState | undefined {
    for (let i = 0; i < list.length; i++) {
        if (i + 1 < list.length) list[i].next = { block: list[i + 1] };
        else delete list[i].next;
    }
    return list[0];
}

/** Anweisungen flach machen: Inhalt von Schleifen und Verzweigungen folgt lose danach */
function flatten(list: BlockState[]): BlockState[] {
    const out: BlockState[] = [];
    for (const b of list) {
        const copy: BlockState = { ...b, inputs: b.inputs ? { ...b.inputs } : undefined };
        delete copy.next;
        const inner: BlockState[] = [];
        for (const [name, input] of Object.entries(copy.inputs ?? {})) {
            if (!STATEMENT_INPUT.test(name)) continue;
            inner.push(...chain(input.block));
            delete copy.inputs![name];
        }
        out.push(copy, ...flatten(inner));
    }
    return out;
}

function shuffle<T>(list: T[], random: () => number): T[] {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

/** Anweisungen eines Rumpfs mischen (nie in der ursprünglichen Reihenfolge, wenn es mehr als eine gibt) */
function scrambleBody(owner: BlockState, input: string, random: () => number) {
    const body = owner.inputs?.[input]?.block;
    if (!body) return;
    const flat = flatten(chain(body));
    let mixed = shuffle(flat, random);
    for (let tries = 0; tries < 10 && flat.length > 1 && mixed.every((b, i) => b === flat[i]); tries++) mixed = shuffle(flat, random);
    if (flat.length > 1 && mixed.every((b, i) => b === flat[i])) mixed = [...flat.slice(1), flat[0]];
    owner.inputs![input] = { block: link(mixed)! };
}

/** Puzzle aus einem Programm: alle Rümpfe (Hauptprogramm, Operationen, Programmteile, Methoden in Klassen) gemischt */
export function scramble(state: WorkspaceState, random: () => number = Math.random): WorkspaceState {
    const copy = JSON.parse(JSON.stringify(state)) as WorkspaceState;
    for (const top of copy.blocks.blocks) {
        if (top.inputs?.BODY) scrambleBody(top, "BODY", random);
        for (const member of chain(top.inputs?.MEMBERS?.block)) {
            if (member.inputs?.BODY) scrambleBody(member, "BODY", random);
        }
    }
    return copy;
}

/** Zeilen, die für den Vergleich zählen: Anweisungen (ohne Leerzeilen und reine Klammerzeilen wie „} else {“) */
export function puzzleLines(code: string): string[] {
    return code.replace(/\r/g, "").split("\n").map((l) => l.replace(/\s+$/, ""))
        .filter((l) => l.trim() !== "" && !/^\s*\}?\s*(else\s*)?\{?\s*$/.test(l));
}

/** Länge der längsten gemeinsamen Teilfolge */
function lcs(a: string[], b: string[]): number {
    const row = new Array<number>(b.length + 1).fill(0);
    for (let i = 1; i <= a.length; i++) {
        let diag = 0;
        for (let j = 1; j <= b.length; j++) {
            const up = row[j];
            row[j] = a[i - 1] === b[j - 1] ? diag + 1 : Math.max(row[j], row[j - 1]);
            diag = up;
        }
    }
    return row[b.length];
}

export type PuzzleResult = { correct: boolean; right: number; total: number };

/**
 * Stand prüfen: richtig, wenn der Code der Lösung entspricht (Einrückung zählt – also auch, was in einer
 * Schleife steht). Sonst: wie viele Anweisungen schon in der richtigen Reihenfolge und Tiefe stehen.
 */
export function checkPuzzle(code: string, solution: string, counts: (line: string) => boolean = () => true): PuzzleResult {
    const mine = puzzleLines(code);
    const want = puzzleLines(solution);
    const correct = mine.length === want.length && mine.every((l, i) => l === want[i]);
    // gezählt werden nur die Zeilen, die Blöcke sind (Blöckly: ohne Kopf, Variablen und Konstruktor)
    const m = mine.filter(counts), w = want.filter(counts);
    return { correct, right: correct ? w.length : lcs(m, w), total: w.length };
}

/** Blöckly: Zeilen in den Skripten (Anweisungen in Methoden, ohne super(…) des versteckten Konstruktors) */
export function bloecklyPuzzleLine(line: string): boolean {
    return /^ {8}/.test(line) && !/^\s*super\(/.test(line);
}

export function puzzleMessage(r: PuzzleResult): string {
    if (r.correct) return "🎉 Richtig! Alle Blöcke stehen an der richtigen Stelle.";
    return `${r.right} von ${r.total} Blöcken stehen schon richtig (Reihenfolge und Einrückung). Weiter so!`;
}

// ------------------------------------------------------------------ Lösung in den Projekteinstellungen

type PuzzleSettings = { gsgPuzzle?: Record<string, string> };

function encode(text: string): string {
    const bytes = new TextEncoder().encode(text);
    let s = "";
    bytes.forEach((b) => (s += String.fromCharCode(b)));
    return btoa(s);
}

function decode(base64: string): string {
    const s = atob(base64);
    return new TextDecoder().decode(Uint8Array.from(s, (c) => c.charCodeAt(0)));
}

/** Lösung des Puzzles in dieser Datei (oder undefined, wenn die Datei kein Puzzle ist) */
export function puzzleSolution(settings: unknown, fileName: string | undefined): string | undefined {
    const encoded = fileName ? (settings as PuzzleSettings | undefined)?.gsgPuzzle?.[fileName] : undefined;
    if (typeof encoded !== "string") return undefined;
    try {
        return decode(encoded);
    } catch {
        return undefined;
    }
}

/** Lösung speichern bzw. (undefined) das Puzzle aufheben */
export function setPuzzleSolution(settings: object, fileName: string, solution: string | undefined) {
    const s = settings as PuzzleSettings;
    const all = { ...(s.gsgPuzzle ?? {}) };
    if (solution === undefined) delete all[fileName];
    else all[fileName] = encode(solution);
    if (Object.keys(all).length) s.gsgPuzzle = all;
    else delete s.gsgPuzzle;
}
