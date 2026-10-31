import { describe, expect, test } from "vitest";
import { BLOCK_HANDBOOK } from "./HandbookBlocks";
import { JAVA_HANDBOOK } from "./HandbookJava";
import { HELP_RULES, helpFor, helpUri, parseHelpUri } from "./HelpLinks";

/** Paket 17b: Fehlermeldung → Handbuch */

describe("Verweise zeigen auf vorhandene Einträge", () => {
    const has = (book: typeof JAVA_HANDBOOK, section: string, entry: string) =>
        book.some((s) => s.id === section && s.entries.some((e) => e.title === entry));
    test.each(HELP_RULES.map((r, i) => [String(r.match), i] as const))("%s", (_, i) => {
        const r = HELP_RULES[i];
        if (r.java) expect(has(JAVA_HANDBOOK, r.java.section, r.java.entry), JSON.stringify(r.java)).toBe(true);
        if (r.blocks) expect(has(BLOCK_HANDBOOK, r.blocks.section, r.blocks.entry), JSON.stringify(r.blocks)).toBe(true);
    });
});

describe("Zuordnung typischer Meldungen", () => {
    const cases: [string, "java" | "blocks", string][] = [
        ["Die Variable quadrat gibt es hier nicht: Sie wurde in Zeile 3 in der for-Schleife angelegt …", "java", "Gültigkeitsbereich (Scope)"],
        ["punkte ist eine Variable des Hauptprogramms (Zeile 1). In echtem Java kennt die Methode zeige() sie nicht …", "java", "Gültigkeitsbereich (Scope)"],
        ["„q“ gehört zur Operation „zeige“. Jede Operation hat ihre eigenen Variablen …", "blocks", "Jede Operation hat ihre eigenen Variablen"],
        ["„x“ gibt es hier nicht – …", "blocks", "Wo gilt eine Variable? (Gültigkeitsbereich)"],
        ["„i“ ist die Variable der Schleife „wiederhole für“ und gilt nur in dieser Schleife.", "blocks", "Wo gilt eine Variable? (Gültigkeitsbereich)"],
        ["„x“ wird erst weiter unten angelegt. Eine Variable gilt erst ab dem Block, der sie anlegt – zieh ihn weiter nach oben.", "blocks", "Wo gilt eine Variable? (Gültigkeitsbereich)"],
        ["Die Variable „X“ ist nirgends angelegt. Lege sie zuerst mit „erstelle neue Variable …“ an.", "blocks", "erstelle neue Variable"],
        ["kontostand = kontostand weist der Variablen ihren eigenen Wert zu …", "java", "Klasse, Konstruktor, Methoden"],
        ["Die Methode max muss einen Wert vom Typ int zurückliefern. In einem der Ausführungszweige fehlt ein entsprechendes return-statement.", "java", "Methode mit Rückgabewert"],
        ["Hier passt eine Ganzzahl hinein, nicht ein Text.", "blocks", "erstelle neue Variable"],
        ["Vergleiche Texte mit dem Block „ist gleich“ (.equals) – == prüft nur, ob es dasselbe Objekt ist.", "blocks", "Ist gleich und enthält"],
        ["Erwartet wird: ; - Gefunden wurde: println", "java", "Ausgeben"],
        ["Der Bezeichner Punkte ist an dieser Stelle nicht definiert. Achte auf Groß- und Kleinschreibung: Meinst du punkte?", "java", "Deklarieren und zuweisen"],
        ["Der Term auf der rechten Seite des Zuweisungsoperators hat den Datentyp double und kann daher der Variablen auf der linken Seite (Datentyp int) nicht zugewiesen werden.", "java", "Typumwandlung (Cast)"],
    ];
    test.each(cases)("%s", (message, kind, entry) => {
        expect(helpFor(message, kind)?.entry).toBe(entry);
    });

    test("unbekannte Meldung: kein Verweis", () => {
        expect(helpFor("Irgendetwas ganz anderes.", "java")).toBeUndefined();
    });

    test("Adresse für den Link hin und zurück", () => {
        const t = { section: "variablen", entry: "Gültigkeitsbereich (Scope)" };
        expect(parseHelpUri(helpUri("java", t))).toEqual({ kind: "java", target: t });
    });
});
