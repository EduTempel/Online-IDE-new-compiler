/**
 * PRIMM („Erst vermuten, dann ausführen“): Predict – Run – Investigate – Modify – Make.
 * Die Lehrkraft legt im Aufgaben-Reiter zu einem fertigen Programm fest:
 *  - eine Frage zum Vorhersagen (frei oder mit Antwortmöglichkeiten),
 *  - Fragen zum Untersuchen, Änderungsaufträge und eine eigene Aufgabe („Selbst machen“).
 * Die Fragen stehen in der Aufgabe (settings.gsgTask.primm, gehen beim Austeilen mit), die Antworten der
 * Schüler/innen in ihrem eigenen Projekt (settings.gsgPrimmAnswers). Beim Kopieren (Austeilen, Links,
 * Galerie) entfernt der Server die Antworten. Die Lehrkraft sieht sie im Schülerprojekt und in einer
 * Übersicht je Lerngruppe (Servlet gsgPrimmAnswers, gefunden über die id der Aufgabe).
 */

export type PrimmTask = {
    /** bleibt beim Bearbeiten gleich – verbindet die Antworten der ausgeteilten Kopien mit der Aufgabe */
    id: string;
    predict: string;
    /** Antwortmöglichkeiten (leer: freie Antwort) */
    choices: string[];
    investigate: string[];
    modify: string[];
    make: string;
};

export type PrimmAnswers = {
    taskId: string;
    /** Vermutung als Text (bei Antwortmöglichkeiten: kurze Begründung) */
    predict: string;
    /** gewählte Antwortmöglichkeit (Index) */
    choice?: number;
    /** Zeitpunkt, an dem die Vermutung festgehalten wurde – danach nicht mehr änderbar */
    predictedAt?: string;
    /** erster Programmstart nach der Vermutung */
    ranAt?: string;
    /** „Stimmt's? Was war anders?“ */
    reflect: string;
    investigate: string[];
    modified: boolean[];
    made: boolean;
};

export const ANSWERS_KEY = "gsgPrimmAnswers";

const str = (v: unknown) => (typeof v === "string" ? v : "");
const strList = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x ?? "")) : []);

/** Neue, zufällige id für eine PRIMM-Aufgabe */
export function newPrimmId(): string {
    const c = globalThis.crypto as Crypto | undefined;
    if (c?.randomUUID) return c.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/** PRIMM-Teil einer Aufgabe bereinigen (undefined: keiner) */
export function cleanPrimm(raw: unknown): PrimmTask | undefined {
    if (!raw || typeof raw !== "object") return undefined;
    const p = raw as Record<string, unknown>;
    const id = str(p.id).trim();
    const predict = str(p.predict);
    if (!id || !predict.trim()) return undefined;
    const nonEmpty = (l: string[]) => l.map((x) => x.trim()).filter(Boolean);
    return {
        id, predict,
        choices: nonEmpty(strList(p.choices)),
        investigate: nonEmpty(strList(p.investigate)),
        modify: nonEmpty(strList(p.modify)),
        make: str(p.make),
    };
}

export function emptyAnswers(task: PrimmTask): PrimmAnswers {
    return {
        taskId: task.id, predict: "", reflect: "",
        investigate: task.investigate.map(() => ""),
        modified: task.modify.map(() => false),
        made: false,
    };
}

/** Antworten aus den Projekteinstellungen (passend zur Aufgabe; sonst leer) */
export function answersOf(settings: unknown, task: PrimmTask): PrimmAnswers {
    const raw = (settings as Record<string, unknown> | undefined)?.[ANSWERS_KEY] as Record<string, unknown> | undefined;
    const a = emptyAnswers(task);
    if (!raw || typeof raw !== "object" || raw.taskId !== task.id) return a;
    a.predict = str(raw.predict);
    if (typeof raw.choice === "number" && raw.choice >= 0 && raw.choice < task.choices.length) a.choice = raw.choice;
    if (str(raw.predictedAt)) a.predictedAt = str(raw.predictedAt);
    if (str(raw.ranAt) && a.predictedAt) a.ranAt = str(raw.ranAt);
    a.reflect = str(raw.reflect);
    const inv = strList(raw.investigate);
    a.investigate = a.investigate.map((_, i) => inv[i] ?? "");
    const mod = Array.isArray(raw.modified) ? raw.modified : [];
    a.modified = a.modified.map((_, i) => mod[i] === true);
    a.made = raw.made === true;
    return a;
}

export function storeAnswers(settings: object, answers: PrimmAnswers) {
    (settings as Record<string, unknown>)[ANSWERS_KEY] = answers;
}

/** Ist die Vermutung vollständig genug, um sie festzuhalten? */
export function canCommitPrediction(task: PrimmTask, a: PrimmAnswers): boolean {
    return task.choices.length ? a.choice !== undefined : a.predict.trim().length > 0;
}

/** Vermutung festhalten (danach nicht mehr änderbar) */
export function commitPrediction(task: PrimmTask, a: PrimmAnswers, now = new Date()): boolean {
    if (a.predictedAt || !canCommitPrediction(task, a)) return false;
    a.predictedAt = now.toISOString();
    return true;
}

/**
 * Darf das Programm starten? Ohne festgehaltene Vermutung nicht. Beim ersten erlaubten Start wird ranAt gesetzt
 * (Rückgabe "first"), damit danach „Was war anders?“ und das Untersuchen erscheinen.
 */
export function startAllowed(a: PrimmAnswers, now = new Date()): false | "first" | "again" {
    if (!a.predictedAt) return false;
    if (a.ranAt) return "again";
    a.ranAt = now.toISOString();
    return "first";
}

/** Text der Vermutung für Übersichten („B) 11 – weil …“) */
export function predictionText(task: PrimmTask, a: PrimmAnswers): string {
    if (!a.predictedAt) return "";
    const choice = a.choice !== undefined ? task.choices[a.choice] : undefined;
    const reason = a.predict.trim();
    if (choice === undefined) return reason;
    return reason ? `${choice} – ${reason}` : choice;
}

/** Fortschritt in Worten: Vermutet · Ausgeführt · 2/3 untersucht · 1/2 verändert · selbst gemacht */
export function progress(task: PrimmTask, a: PrimmAnswers) {
    return {
        predicted: !!a.predictedAt,
        ran: !!a.ranAt,
        investigated: a.investigate.filter((x) => x.trim()).length,
        modified: a.modified.filter(Boolean).length,
        made: a.made,
        total: { investigate: task.investigate.length, modify: task.modify.length },
    };
}

// ------------------------------------------------------------------ Übersicht (Beamer)

export type Tally = { label: string; count: number };

/** Gleiche Antworten zusammenfassen (Groß-/Kleinschreibung und Leerzeichen egal), häufigste zuerst */
export function tallyTexts(texts: string[]): Tally[] {
    const map = new Map<string, Tally>();
    for (const t of texts) {
        const label = t.trim().replace(/\s+/g, " ");
        if (!label) continue;
        const key = label.toLowerCase().replace(/[.!]+$/, "");
        const e = map.get(key);
        if (e) e.count++;
        else map.set(key, { label, count: 1 });
    }
    return [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "de"));
}

/** Verteilung der gewählten Antwortmöglichkeiten (alle Möglichkeiten, auch mit 0) */
export function tallyChoices(task: PrimmTask, answers: PrimmAnswers[]): Tally[] {
    return task.choices.map((label, i) => ({
        label, count: answers.filter((a) => a.predictedAt && a.choice === i).length,
    }));
}
