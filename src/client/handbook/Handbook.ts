/**
 * Handbuch (GSG): Nachschlagen mit kleinen Beispielprogrammen – eins für die Blöcke (gegliedert wie die
 * Kategorien der Werkzeugleiste) und eins für Java. Jedes Beispiel ist Java-Code: im Blöcke-Handbuch wird
 * er als Blöcke gezeigt, im Java-Handbuch als Text. „Ausprobieren“ legt ihn als neue Datei an.
 * Idee nach dem Handbuch der Python-IDE von Marc Franke (nur das Konzept, eigene Umsetzung und Inhalte).
 * Dazu ein Handbuch für Struktogramme (Beispiele als Struktogramm, „Ausprobieren“ legt eine
 * Struktogramm-Datei an).
 */

import type { StructogramDoc } from "../structogram/StructogramDoc";

export type HandbookKind = "blocks" | "java" | "struktogramm";

export type HandbookEntry = {
    /** Überschrift des Beispiels */
    title: string;
    /** kurze Erklärung (Markdown wie bei Aufgaben: **fett**, `Code`, Listen) */
    text: string;
    /** Beispielprogramm (Java; bei Struktogrammen daraus erzeugt) */
    code: string;
    /** Struktogramm-Handbuch: das Beispiel als Struktogramm */
    structogram?: StructogramDoc;
    /** Struktogramm einer Operation: Java-Anweisungen, die sie im Test aufrufen */
    call?: string;
    /** Bibliotheken, die das Beispiel braucht (z. B. Abiturklassen „niedersachsen“) */
    libs?: string[];
    /** läuft im Test ohne Eingabe, Grafik und Endlosschleife (dann wird es dort auch ausgeführt) */
    runs?: boolean;
    /**
     * Übung „Finde den Fehler“ (Paket 16): code enthält den Fehler, solution die Lösung mit Erklärung
     * (aufklappbar). „Ausprobieren“ legt das fehlerhafte Programm an.
     */
    solution?: { text: string; code: string };
    /**
     * Blöckly (Paket 18h): das Beispiel ist ein ganzes Projekt (Bühne, Figuren, Hauptprogramm). Gezeichnet werden die
     * Dateien in show; „Ausprobieren“ legt ein neues Projekt mit allen Dateien an.
     */
    bloeckly?: { files: { name: string; text: string }[]; show: string[] };
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
    /** zu diesem Eintrag (Überschrift) im Abschnitt springen (Paket 17b: Hilfe zu einer Meldung) */
    entry?: string;
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
