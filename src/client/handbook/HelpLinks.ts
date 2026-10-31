import type { HandbookKind } from "./Handbook";

/**
 * Paket 17b: Fehlermeldung → Handbuch. Zu bekannten Meldungen (Compiler und Blöcke) der passende
 * Handbuch-Eintrag, getrennt für das Java- und das Blöcke-Handbuch. Die erste passende Regel gilt.
 * Handbook.test.ts prüft, dass jedes Ziel ein vorhandener Eintrag ist.
 */

export type HelpTarget = { section: string; entry: string };

type Rule = { match: RegExp; java?: HelpTarget; blocks?: HelpTarget };

const J = (section: string, entry: string): HelpTarget => ({ section, entry });

export const HELP_RULES: Rule[] = [
    // Operationen/Methoden und ihre Variablen
    {
        match: /Variable des Hauptprogramms|gehört zu(r|m) (Methode|Operation|Konstruktor)|ist schon ein Parameter/,
        java: J("variablen", "Gültigkeitsbereich (Scope)"),
        blocks: J("operationen", "Jede Operation hat ihre eigenen Variablen"),
    },
    // Gültigkeitsbereich und Verdecken
    {
        match: /gibt es hier (noch )?(nicht|schon)|gilt nur|gilt erst|erst weiter unten angelegt|gerade erst angelegt|Programmteile kennen nur|gehört zu|verdeckt die gleichnamige|von weiter außen/,
        java: J("variablen", "Gültigkeitsbereich (Scope)"),
        blocks: J("variablen", "Wo gilt eine Variable? (Gültigkeitsbereich)"),
    },
    // Attribute, this, private, Konstruktoren
    {
        match: /verdeckt das Attribut|eigenen Wert zu|ist private|passender Konstruktor|Gehört direkt in eine Klasse|gehören in eine Operation oder einen Konstruktor|super\(/,
        java: J("klassen", "Klasse, Konstruktor, Methoden"),
        blocks: J("klassen", "Klasse mit Attributen und Konstruktor"),
    },
    // Ergebnis zurückgeben
    {
        match: /return|Rückgabewert|zurückliefern|gib zurück|kein Ergebnis|ein Ergebnis liefern|beende die Operation/,
        java: J("methoden", "Methode mit Rückgabewert"),
        blocks: J("operationen", "Operation mit Ergebnis"),
    },
    // Texte vergleichen
    {
        match: /equals|„ist gleich“/,
        java: J("strings", "Vergleichen"),
        blocks: J("text", "Ist gleich und enthält"),
    },
    // Bedingungen
    {
        match: /Bedingung erwartet|boolescher Wert erwartet|Vergleichsoperator ==|Zuweisungsoperator =/,
        java: J("verzweigungen", "if und else"),
        blocks: J("bedingungen", "Vergleichen"),
    },
    // Reihungen
    {
        match: /Array-Index|Vor \[ muss ein Array|Arrays haben nur das Attribut length/,
        java: J("arrays", "Anlegen und benutzen"),
        blocks: J("reihungen", "Reihung mit Länge anlegen"),
    },
    // Datentypen passen nicht
    {
        match: /Datentyp|Hier passt .* hinein|nicht verrechnet|Ganzzahl erwartet|für Operanden der Typen/,
        java: J("variablen", "Typumwandlung (Cast)"),
        blocks: J("variablen", "erstelle neue Variable"),
    },
    // Tasten und Programmteile
    {
        match: /Diese Taste startet schon/,
        blocks: J("tasten", "Programmteile mit Tasten starten"),
    },
    // unbekannter Name (auch Groß-/Kleinschreibung)
    {
        match: /nicht definiert|Meinst du|nirgends angelegt/,
        java: J("variablen", "Deklarieren und zuweisen"),
        blocks: J("variablen", "erstelle neue Variable"),
    },
    // keine passende Methode
    {
        match: /keine passende Methode/,
        java: J("methoden", "Methode ohne Rückgabe"),
        blocks: J("operationen", "Operation ohne Ergebnis"),
    },
    // Strichpunkt und Klammern
    {
        match: /Erwartet wird:? ;|Strichpunkt/,
        java: J("aufbau", "Ausgeben"),
    },
    {
        match: /Erwartet wird:? [{}()]|Anweisungsblock \(in geschweiften Klammern\)/,
        java: J("aufbau", "Blöcke und Einrückung"),
    },
];

/** Handbuch-Eintrag zu einer Meldung (oder undefined) */
export function helpFor(message: string, kind: HandbookKind): HelpTarget | undefined {
    for (const rule of HELP_RULES) {
        if (!rule.match.test(message)) continue;
        const target = kind === "blocks" ? rule.blocks : kind === "java" ? rule.java : undefined;
        if (target) return target;
    }
    return undefined;
}

/** Adresse für den Link im Hover einer Java-Meldung (Monaco öffnet sie über registerLinkOpener) */
export const HELP_SCHEME = "gsg-handbuch";

export function helpUri(kind: HandbookKind, t: HelpTarget): string {
    return `${HELP_SCHEME}:///${kind}/${encodeURIComponent(t.section)}/${encodeURIComponent(t.entry)}`;
}

export function parseHelpUri(uri: string): { kind: HandbookKind; target: HelpTarget } | undefined {
    const m = /^gsg-handbuch:\/*(blocks|java|struktogramm)\/([^/]+)\/(.+)$/.exec(uri);
    if (!m) return undefined;
    return { kind: m[1] as HandbookKind, target: { section: decodeURIComponent(m[2]), entry: decodeURIComponent(m[3]) } };
}
