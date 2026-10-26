/**
 * Handbuch (GSG): Nachschlagen mit kleinen Beispielprogrammen – eins für die Blöcke (gegliedert wie die
 * Kategorien der Werkzeugleiste) und eins für Java. Jedes Beispiel ist Java-Code: im Blöcke-Handbuch wird
 * er als Blöcke gezeigt, im Java-Handbuch als Text. „Ausprobieren“ legt ihn als neue Datei an.
 * Idee nach dem Handbuch der Python-IDE von Marc Franke (nur das Konzept, eigene Umsetzung und Inhalte).
 */

export type HandbookKind = "blocks" | "java";

export type HandbookEntry = {
    /** Überschrift des Beispiels */
    title: string;
    /** kurze Erklärung (Markdown wie bei Aufgaben: **fett**, `Code`, Listen) */
    text: string;
    /** Beispielprogramm (Java) */
    code: string;
    /** Bibliotheken, die das Beispiel braucht (z. B. Abiturklassen „niedersachsen“) */
    libs?: string[];
    /** läuft im Test ohne Eingabe, Grafik und Endlosschleife (dann wird es dort auch ausgeführt) */
    runs?: boolean;
};

export type HandbookSection = {
    /** Kennung; im Blöcke-Handbuch die Kennung der Kategorie (steuerung, variablen …) */
    id: string;
    title: string;
    icon: string;
    /** Einleitung des Abschnitts */
    intro: string;
    entries: HandbookEntry[];
    /** Unterabschnitt von (z. B. Reihungen unter Variablen) */
    parent?: string;
};

export type OpenOptions = {
    kind?: HandbookKind;
    /** Abschnitt öffnen */
    section?: string;
    /** zum ersten Beispiel springen, das diesen Block verwendet */
    blockType?: string;
};

let opener: ((o: OpenOptions) => void) | undefined;

/** vom Reiter „Handbuch“ gesetzt */
export function setHandbookOpener(f: (o: OpenOptions) => void) {
    opener = f;
}

/** Handbuch öffnen (Menü „Handbuch“, Rechtsklick „Hilfe“ auf einem Block) */
export function openHandbook(o: OpenOptions = {}) {
    opener?.(o);
}

export function hasHandbook(): boolean {
    return !!opener;
}

/** Zeilen zu einem Programm (mit Zeilenumbruch am Ende, wie es der Generator schreibt) */
export const lines = (...l: string[]) => l.join("\n") + "\n";
