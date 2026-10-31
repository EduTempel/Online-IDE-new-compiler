import { docToJava } from "../structogram/PseudoJava";
import { emptyDoc, newId, type ENode, type StructogramDoc } from "../structogram/StructogramDoc";
import type { HandbookEntry, HandbookSection } from "./Handbook";

/**
 * Handbuch Struktogramme (GSG): Beispiele in der Schreibweise der Ergänzenden Hinweise (Niedersachsen),
 * gezeichnet wie im Struktogramm-Editor. Jedes Beispiel lässt sich in Java umwandeln (der Java-Code wird
 * daraus erzeugt; der Test prüft, dass er übersetzt bzw. läuft). „Ausprobieren“ legt eine
 * Struktogramm-Datei an.
 */

// ------------------------------------------------------------------ kurze Schreibweise für die Beispiele

const s = (text: string): ENode => ({ id: newId(), kind: "stmt", text });
const wenn = (cond: string, yes: ENode[], no: ENode[] = []): ENode => ({ id: newId(), kind: "if", cond, yes, no });
const schleife = (head: string, ...body: ENode[]): ENode => ({ id: newId(), kind: "loop", head, body });
const fuss = (foot: string, ...body: ENode[]): ENode => ({ id: newId(), kind: "footloop", foot, body });
const auswahl = (subject: string, cases: [string, ENode[]][], other?: ENode[]): ENode =>
    ({ id: newId(), kind: "switch", subject, cases: cases.map(([label, body]) => ({ label, body })), ...(other ? { other } : {}) });

type Example = {
    title: string;
    text: string;
    /** Titel des Struktogramms: „Hauptprogramm“ oder Signatur wie istGerade(x: Ganzzahl): Wahrheitswert */
    head?: string;
    body: ENode[];
    /** Operation: Java-Anweisungen, die sie im Test aufrufen */
    call?: string;
    libs?: string[];
    runs?: boolean;
};

function entry(e: Example): HandbookEntry {
    const doc: StructogramDoc = { ...emptyDoc(e.head ?? "Hauptprogramm"), body: e.body };
    return {
        title: e.title,
        text: e.text,
        code: docToJava(doc).code,
        structogram: doc,
        ...(e.call ? { call: e.call } : {}),
        ...(e.libs ? { libs: e.libs } : {}),
        ...(e.runs ? { runs: true } : {}),
    };
}

const NDS = ["niedersachsen"];

export const STRUCTOGRAM_HANDBOOK: HandbookSection[] = [
    {
        id: "anweisungen", title: "Anweisungen und Variablen", icon: "▭",
        intro: "Ein Struktogramm wird von oben nach unten gelesen. Jedes Rechteck ist eine **Anweisung**. Eine Variable bekommt ihren Wert mit dem Zuweisungspfeil `←` (im Editor: Knopf **←** oder **Alt + -**). Kommentare beginnen mit `//`.",
        entries: [
            entry({
                title: "Zuweisung und Ausgabe", runs: true,
                text: "`anzahl ← 3` heißt: Die Variable `anzahl` bekommt den Wert 3. Rechts vom Pfeil darf auch eine Rechnung stehen. `gib … aus` zeigt einen Wert an.",
                body: [s("// Preis für drei Hefte"), s("anzahl ← 3"), s("preis ← 2.5"), s("gesamt ← anzahl * preis"), s("gib gesamt aus")],
            }),
            entry({
                title: "Eingabe",
                text: "`eingegebene Ganzzahl(\"…\")` fragt beim Programmlauf nach einer Zahl. Mehrere Werte in einer Ausgabe werden durch Kommas getrennt.",
                body: [s("alter ← eingegebene Ganzzahl(\"Wie alt bist du?\")"), s("gib \"Nächstes Jahr bist du\", alter + 1 aus")],
            }),
            entry({
                title: "Rechnen mit / und mod", runs: true,
                text: "Bei zwei ganzen Zahlen rechnet `/` **ohne Rest** (17 / 5 = 3). `mod` liefert den **Rest** der Division (17 mod 5 = 2).",
                body: [s("a ← 17"), s("b ← 5"), s("gib a / b aus  // 3"), s("gib a mod b aus  // 2")],
            }),
            entry({
                title: "Erhöhen und verringern", runs: true,
                text: "`erhöhe punkte um 5` ist dasselbe wie `punkte ← punkte + 5`.",
                body: [s("punkte ← 10"), s("erhöhe punkte um 5"), s("verringere punkte um 1"), s("gib punkte aus")],
            }),
            entry({
                title: "Zufallszahl und Runden", runs: true,
                text: "`ganzzahlige Zufallszahl zwischen 1 und 6` würfelt (1 und 6 sind möglich). `x gerundet` rundet auf eine ganze Zahl.",
                body: [s("wurf ← ganzzahlige Zufallszahl zwischen 1 und 6"), s("gib wurf aus"), s("x ← 2.7"), s("gib x gerundet aus")],
            }),
            entry({
                title: "Wo gilt eine Variable?", runs: true,
                text: "Im Struktogramm gilt eine Variable **ab ihrer ersten Zuweisung im ganzen Struktogramm** – auch wenn sie zuerst in einem Zweig oder einer Schleife einen Wert bekommt. " +
                    "In Java gilt eine Variable dagegen nur bis zum Ende der Klammer `}`, in der sie angelegt wird. Deshalb legt die Java-Übersetzung `note` hier **vor** der Verzweigung an. " +
                    "Ausnahme: Die Zählvariable einer Zählschleife (`für i von …`) gilt nur in der Schleife.",
                body: [s("punkte ← 17"), wenn("punkte ≥ 15", [s("note ← \"gut\"")], [s("note ← \"nicht ganz\"")]), s("gib note aus")],
            }),
        ],
    },
    {
        id: "verzweigung", title: "Verzweigungen", icon: "◇",
        intro: "Eine **Verzweigung** prüft eine Bedingung. Ist sie wahr, läuft der linke Zweig, sonst der rechte. Vergleiche: `=`, `≠`, `<`, `>`, `≤`, `≥`; verknüpfen mit `und`, `oder`, `nicht`.",
        entries: [
            entry({
                title: "Zweiseitige Verzweigung", runs: true,
                text: "Links steht, was bei **wahr** passiert, rechts, was bei **falsch** passiert.",
                body: [s("note ← 3"), wenn("note ≤ 4", [s("gib \"bestanden\" aus")], [s("gib \"nicht bestanden\" aus")])],
            }),
            entry({
                title: "Einseitige Verzweigung", runs: true,
                text: "Ein Zweig darf leer bleiben. Hier wird eine negative Zahl positiv gemacht (Betrag).",
                body: [s("x ← -5"), wenn("x < 0", [s("x ← -x")]), s("gib x aus")],
            }),
            entry({
                title: "Bedingungen verknüpfen", runs: true,
                text: "`und`: Beide Bedingungen müssen wahr sein. `oder`: Mindestens eine muss wahr sein.",
                body: [s("alter ← 15"), s("hatTicket ← wahr"),
                    wenn("alter ≥ 12 und hatTicket", [s("gib \"Einlass\" aus")], [s("gib \"Kein Einlass\" aus")])],
            }),
            entry({
                title: "Verschachtelte Verzweigung", runs: true,
                text: "In einem Zweig darf wieder eine Verzweigung stehen – so lassen sich mehr als zwei Fälle unterscheiden.",
                body: [s("temperatur ← 23"),
                    wenn("temperatur < 10", [s("gib \"kalt\" aus")], [
                        wenn("temperatur < 25", [s("gib \"angenehm\" aus")], [s("gib \"heiß\" aus")]),
                    ])],
            }),
        ],
    },
    {
        id: "auswahl", title: "Mehrfachauswahl", icon: "⋔",
        intro: "Die **Mehrfachauswahl** vergleicht einen Wert mit mehreren Fällen. Passt keiner, läuft der Zweig **sonst** (er darf auch fehlen).",
        entries: [
            entry({
                title: "Wochentag", runs: true,
                text: "Oben steht, was verglichen wird (`tag ist gleich`), darunter die Fälle.",
                body: [s("tag ← 3"), auswahl("tag ist gleich", [
                    ["1", [s("gib \"Montag\" aus")]],
                    ["2", [s("gib \"Dienstag\" aus")]],
                    ["3", [s("gib \"Mittwoch\" aus")]],
                ], [s("gib \"anderer Tag\" aus")])],
            }),
            entry({
                title: "Auswahl mit Zeichen", runs: true,
                text: "Auch Zeichen (in einfachen Anführungszeichen) können Fälle sein.",
                body: [s("antwort ← 'j'"), auswahl("antwort ist gleich", [
                    ["'j'", [s("gib \"ja\" aus")]],
                    ["'n'", [s("gib \"nein\" aus")]],
                ], [s("gib \"Bitte j oder n eingeben\" aus")])],
            }),
        ],
    },
    {
        id: "schleifen", title: "Schleifen", icon: "↻",
        intro: "Eine **Schleife** wiederholt die Anweisungen in ihrem Rumpf. Bei der **kopfgesteuerten** Schleife steht die Bedingung oben (sie wird vor jedem Durchlauf geprüft), bei der **fußgesteuerten** unten (der Rumpf läuft mindestens einmal).",
        entries: [
            entry({
                title: "solange", runs: true,
                text: "Wiederholt, **solange** die Bedingung wahr ist. Hier wird verdoppelt, bis die Zahl 100 erreicht.",
                body: [s("zahl ← 1"), schleife("solange zahl < 100", s("zahl ← zahl * 2")), s("gib zahl aus")],
            }),
            entry({
                title: "Zählschleife", runs: true,
                text: "`für i von 1 bis 5` zählt `i` von 1 bis einschließlich 5 hoch.",
                body: [schleife("für i von 1 bis 5", s("gib i * i aus"))],
            }),
            entry({
                title: "Zählschleife mit Schrittweite", runs: true,
                text: "Mit `Schrittweite` zählt die Schleife in anderen Schritten – auch rückwärts.",
                body: [schleife("für i von 10 bis 0, Schrittweite -2", s("gib i aus"))],
            }),
            entry({
                title: "n-mal wiederholen", runs: true,
                text: "Wenn nur die Anzahl der Durchläufe zählt: `wiederhole 3-mal`.",
                body: [schleife("wiederhole 3-mal", s("gib \"Hallo\" aus"))],
            }),
            entry({
                title: "wiederhole bis (fußgesteuert)", runs: true,
                text: "Erst würfeln, dann prüfen: Die Schleife endet, **sobald** eine 6 fällt.",
                body: [s("wurf ← 0"), fuss("wiederhole bis wurf = 6", s("wurf ← ganzzahlige Zufallszahl zwischen 1 und 6"), s("gib wurf aus"))],
            }),
            entry({
                title: "für alle Elemente", runs: true,
                text: "Geht der Reihe nach **jedes Element** einer Reihung durch, ohne Zählvariable.",
                body: [s("zahlen ← statische Reihung mit den Elementen 4, 8, 15"), s("summe ← 0"),
                    schleife("für alle Elemente z aus zahlen", s("erhöhe summe um z")), s("gib summe aus")],
            }),
        ],
    },
    {
        id: "operationen", title: "Operationen", icon: "ƒ",
        intro: "Eine **Operation** bekommt einen eigenen Titel – die Signatur wie in den Aufgaben: `name(parameter: Typ, …): Rückgabetyp`. Mit `gib … zurück` endet die Operation und liefert ihr Ergebnis. Datentypen: Ganzzahl, Fließkommazahl, Zeichenkette, Wahrheitswert, Zeichen.",
        entries: [
            entry({
                title: "Operation mit Rückgabe", runs: true,
                head: "istGerade(x: Ganzzahl): Wahrheitswert",
                call: "println(istGerade(4));",
                text: "Eine Zahl ist gerade, wenn beim Teilen durch 2 kein Rest bleibt.",
                body: [wenn("x mod 2 = 0", [s("gib wahr zurück")], [s("gib falsch zurück")])],
            }),
            entry({
                title: "Mehrere Parameter", runs: true,
                head: "maximum(a, b: Fließkommazahl): Fließkommazahl",
                call: "println(maximum(2.5, 7.0));",
                text: "Parameter mit demselben Typ dürfen zusammen angegeben werden: `a, b: Fließkommazahl`.",
                body: [wenn("a > b", [s("gib a zurück")], [s("gib b zurück")])],
            }),
            entry({
                title: "Operation ohne Rückgabe", runs: true,
                head: "zeichneLinie(laenge: Ganzzahl)",
                call: "zeichneLinie(3);",
                text: "Ohne Rückgabetyp tut die Operation etwas, liefert aber kein Ergebnis.",
                body: [schleife("wiederhole laenge-mal", s("gib \"*\" aus"))],
            }),
            entry({
                title: "Rekursion", runs: true,
                head: "fakultaet(n: Ganzzahl): Ganzzahl",
                call: "println(fakultaet(5));",
                text: "Eine Operation darf sich selbst aufrufen. 5! = 5 · 4 · 3 · 2 · 1 = 120.",
                body: [wenn("n ≤ 1", [s("gib 1 zurück")], [s("gib n * fakultaet(n - 1) zurück")])],
            }),
        ],
    },
    {
        id: "zeichenketten", title: "Zeichenketten", icon: "Aa",
        intro: "Die Positionen in einer Zeichenkette beginnen bei **0**. Zeichenketten stehen in doppelten, einzelne Zeichen in einfachen Anführungszeichen.",
        entries: [
            entry({
                title: "Länge und einzelne Zeichen", runs: true,
                text: "`Länge von wort` zählt die Zeichen; `Zeichen an Position 0 von wort` ist das erste Zeichen.",
                body: [s("wort ← \"Informatik\""), s("gib Länge von wort aus"), s("gib Zeichen an Position 0 von wort aus"),
                    s("gib Zeichen an Position Länge von wort - 1 von wort aus")],
            }),
            entry({
                title: "Teilzeichenkette und Verbinden", runs: true,
                text: "`Teilzeichenkette von s von Position 0 bis vor 4` nimmt die Zeichen 0 bis 3. Mit `+` werden Zeichenketten verbunden.",
                body: [s("s ← \"Datenbank\""), s("anfang ← Teilzeichenkette von s von Position 0 bis vor 5"), s("gib anfang + \"satz\" aus")],
            }),
            entry({
                title: "Zeichen zählen", runs: true,
                head: "zaehle(s: Zeichenkette, c: Zeichen): Ganzzahl",
                call: "println(zaehle(\"Banane\", 'a'));",
                text: "Jede Position wird geprüft; passt das Zeichen, wird gezählt.",
                body: [s("anzahl ← 0"),
                    schleife("für i von 0 bis Länge von s - 1", wenn("Zeichen an Position i von s = c", [s("erhöhe anzahl um 1")])),
                    s("gib anzahl zurück")],
            }),
            entry({
                title: "ASCII-Wert", runs: true,
                text: "Jedes Zeichen hat eine Nummer (ASCII-Wert): 'A' ist 65. Umgekehrt wird aus einer Nummer wieder ein Zeichen.",
                body: [s("nummer ← ASCII-Wert von 'A'"), s("gib nummer aus"), s("erhöhe nummer um 1"), s("gib Zeichen mit ASCII-Wert nummer aus  // B")],
            }),
        ],
    },
    {
        id: "reihungen", title: "Statische Reihungen", icon: "▦",
        intro: "Eine **statische Reihung** hat eine feste Länge. Die Positionen beginnen bei **0**; `zahlen[i]` ist das Element an Position `i`.",
        entries: [
            entry({
                title: "Reihung anlegen und füllen", runs: true,
                text: "Eine Reihung der Länge 5 hat die Positionen 0 bis 4.",
                body: [s("quadrate ← statische Reihung der Länge 5 vom Inhaltstyp Ganzzahl"),
                    schleife("für i von 0 bis Länge von quadrate - 1", s("quadrate[i] ← i * i")),
                    schleife("für alle Elemente q aus quadrate", s("gib q aus"))],
            }),
            entry({
                title: "Maximum suchen", runs: true,
                head: "maximum(zahlen: statische Reihung vom Inhaltstyp Ganzzahl): Ganzzahl",
                call: "println(maximum(new int[]{3, 9, 2}));",
                text: "Das erste Element ist der erste Kandidat; jedes größere Element ersetzt ihn.",
                body: [s("max ← zahlen[0]"),
                    schleife("für alle Elemente z aus zahlen", wenn("z > max", [s("max ← z")])),
                    s("gib max zurück")],
            }),
            entry({
                title: "Zweidimensionale Reihung", runs: true,
                text: "Zweidimensionale Reihungen werden als `[Zeile][Spalte]` angesprochen – wie eine Tabelle.",
                body: [s("tabelle ← statische zweidimensionale Reihung mit 3 Zeilen und 4 Spalten vom Inhaltstyp Ganzzahl"),
                    schleife("für z von 0 bis Anzahl der Zeilen von tabelle - 1",
                        schleife("für sp von 0 bis Anzahl der Spalten von tabelle - 1", s("tabelle[z][sp] ← (z + 1) * (sp + 1)"))),
                    s("gib tabelle[2][3] aus")],
            }),
        ],
    },
    {
        id: "dynreihung", title: "Dynamische Reihung", icon: "⋯",
        intro: "Eine **dynamische Reihung** (Abiturklasse DynArray) wächst beim Hinzufügen. Positionen beginnen bei 0. Vor dem Lesen oder Löschen prüfen, ob es die Position gibt.",
        entries: [
            entry({
                title: "Anlegen, anfügen, einfügen", runs: true, libs: NDS,
                text: "`füge … zu namen hinzu` hängt hinten an; `füge … an Position 1 in namen ein` schiebt die übrigen Elemente nach hinten.",
                body: [s("namen ← leere dynamische Reihung vom Inhaltstyp Zeichenkette"), s("füge \"Ada\" zu namen hinzu"),
                    s("füge \"Alan\" zu namen hinzu"), s("füge \"Grace\" an Position 1 in namen ein"),
                    s("gib Element an Position 1 von namen aus"), s("gib Länge von namen aus")],
            }),
            entry({
                title: "Löschen und durchlaufen", runs: true, libs: NDS,
                text: "Nach dem Löschen rücken die folgenden Elemente nach vorne.",
                body: [s("tiere ← leere dynamische Reihung vom Inhaltstyp Zeichenkette"), s("füge \"Hund\" zu tiere hinzu"),
                    s("füge \"Katze\" zu tiere hinzu"), s("füge \"Maus\" zu tiere hinzu"),
                    wenn("nicht tiere ist leer", [s("lösche Element an Position 0 von tiere")]),
                    schleife("für alle Elemente t aus tiere", s("gib t aus"))],
            }),
        ],
    },
    {
        id: "stapel", title: "Stapel und Schlange", icon: "☰",
        intro: "Beim **Stapel** (Stack) wird oben aufgelegt und oben entnommen – das zuletzt Aufgelegte kommt zuerst wieder heraus. Bei der **Schlange** (Queue) wird hinten angestellt und vorne entnommen. Vor dem Entnehmen prüfen, ob sie leer sind.",
        entries: [
            entry({
                title: "Stapel", runs: true, libs: NDS,
                text: "Ausgegeben wird in umgekehrter Reihenfolge: C, B, A.",
                body: [s("stapel ← leerer Stapel vom Inhaltstyp Zeichenkette"), s("lege \"A\" auf stapel"), s("lege \"B\" auf stapel"),
                    s("lege \"C\" auf stapel"),
                    schleife("solange stapel nicht leer", s("gib oberstes Element von stapel aus"), s("entnimm Element von stapel"))],
            }),
            entry({
                title: "Schlange", runs: true, libs: NDS,
                text: "Wer zuerst kommt, ist zuerst dran: Ausgabe 1, 2, 3.",
                body: [s("warteschlange ← leere Schlange vom Inhaltstyp Ganzzahl"),
                    schleife("für nr von 1 bis 3", s("füge nr zu warteschlange hinzu")),
                    schleife("solange warteschlange nicht leer", s("gib erstes Element von warteschlange aus"), s("entnimm Element aus warteschlange"))],
            }),
        ],
    },
    {
        id: "baum", title: "Binärbaum", icon: "⋀",
        intro: "Ein **Binärbaum** (BinTree) hat an der Wurzel einen Inhalt und einen linken und rechten Teilbaum. Viele Algorithmen für Bäume sind **rekursiv**: Sie rufen sich für die Teilbäume selbst auf.",
        entries: [
            entry({
                title: "Baum aufbauen", runs: true, libs: NDS,
                text: "Die Wurzel 5 bekommt links den Teilbaum 3 und rechts den Teilbaum 8.",
                body: [s("b ← neuer Binärbaum mit Inhalt 5"), s("setze linken Teilbaum von b auf neuer Binärbaum mit Inhalt 3"),
                    s("setze rechten Teilbaum von b auf neuer Binärbaum mit Inhalt 8"),
                    s("gib Inhalt von b aus"), s("gib Inhalt von linker Teilbaum von b aus")],
            }),
            entry({
                title: "Knoten zählen (rekursiv)", runs: true, libs: NDS,
                head: "anzahlKnoten(b: Binärbaum vom Inhaltstyp Ganzzahl): Ganzzahl",
                call: "BinTree b = new BinTree(5);\nb.setLeft(new BinTree(3));\nb.setRight(new BinTree(8));\nprintln(anzahlKnoten(b));",
                text: "Ein leerer Baum hat 0 Knoten; sonst zählt die Wurzel 1 plus die Knoten beider Teilbäume.",
                body: [wenn("b ist leer", [s("gib 0 zurück")],
                    [s("gib 1 + anzahlKnoten(linker Teilbaum von b) + anzahlKnoten(rechter Teilbaum von b) zurück")])],
            }),
        ],
    },
];
