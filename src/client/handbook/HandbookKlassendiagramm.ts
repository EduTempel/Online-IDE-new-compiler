import { emptyDoc, newId, type Attribut, type Beziehung, type Klasse, type KlassenDoc, type Operation } from "../klassendiagramm/KlassenDoc";
import { docZuJava } from "../klassendiagramm/KlassenJava";
import type { HandbookEntry, HandbookSection } from "./Handbook";

/**
 * Handbuch Klassendiagramme (GSG, Paket 20): Bedienung des Editors, Schreibweise nach den Ergänzenden Hinweisen
 * (Abschnitt 6), Beziehungen, Umwandeln in Texva und Übungen zum Modellieren. Beispiele werden wie im Editor
 * gezeichnet; „Ausprobieren“ legt sie als Klassendiagramm-Datei an. Der Test prüft, dass der daraus erzeugte
 * Texva-Code übersetzt.
 */

// ------------------------------------------------------------------ kurze Schreibweise für die Beispiele
// Attribute „- name: String“, Operationen „+ getName(): String“, Konstruktoren „c Person(name: String)“;
// Typen als Java-Text wie in der Datei (int, String, Person[], int[][], DynArray<Person>, Stack<Person>, Liste<String>).

function attribut(spec: string): Attribut {
    const m = /^([+-])\s*(\w+)\s*:\s*(.+)$/.exec(spec.trim());
    if (!m) throw new Error("Attribut: " + spec);
    return { id: newId(), sicht: m[1] as "+" | "-", name: m[2], typ: m[3].trim() };
}

function operation(spec: string, klasse: string): Operation {
    const m = /^(c|[+-])\s*(\w+)\((.*)\)\s*(?::\s*(.+))?$/.exec(spec.trim());
    if (!m) throw new Error("Operation: " + spec);
    const parameter = m[3].trim() ? m[3].split(",").map((p) => {
        const [name, typ] = p.split(":").map((x) => x.trim());
        return { name, typ };
    }) : [];
    if (m[1] === "c") return { id: newId(), sicht: "+", name: klasse, konstruktor: true, parameter, rueckgabe: "" };
    return { id: newId(), sicht: m[1] as "+" | "-", name: m[2], parameter, rueckgabe: m[4]?.trim() ?? "" };
}

type K = { name: string; at?: [number, number]; attribute?: string[]; operationen?: string[]; mehrAttribute?: boolean; mehrOperationen?: boolean };

/** Diagramm aus Klassen und Beziehungen („A — B“ Assoziation, „A ▷ B“: A erbt von B) */
function diagramm(klassen: K[], beziehungen: string[] = [], typen: KlassenDoc["typen"] = "abitur"): KlassenDoc {
    const doc = { ...emptyDoc(), typen };
    const ids = new Map<string, string>();
    for (const k of klassen) {
        const id = newId();
        ids.set(k.name, id);
        const klasse: Klasse = {
            id, name: k.name, x: k.at?.[0] ?? 0, y: k.at?.[1] ?? 0,
            attribute: (k.attribute ?? []).map(attribut),
            operationen: (k.operationen ?? []).map((o) => operation(o, k.name)),
        };
        if (k.mehrAttribute) klasse.mehrAttribute = true;
        if (k.mehrOperationen) klasse.mehrOperationen = true;
        doc.klassen.push(klasse);
    }
    for (const b of beziehungen) {
        const m = /^(\w+)\s*(—|▷)\s*(\w+)$/.exec(b);
        if (!m || !ids.has(m[1]) || !ids.has(m[3])) throw new Error("Beziehung: " + b);
        const bz: Beziehung = { id: newId(), art: m[2] === "▷" ? "vererbung" : "assoziation", von: ids.get(m[1])!, nach: ids.get(m[3])! };
        doc.beziehungen.push(bz);
    }
    return doc;
}

const javaVon = (doc: KlassenDoc) => docZuJava(doc).map((f) => f.code).join("\n");

/** Eintrag mit Diagramm (Lage: at je Klasse, sonst automatisch beim Zeichnen) */
function beispiel(title: string, text: string, doc: KlassenDoc): HandbookEntry {
    return { title, text, code: javaVon(doc), klassendiagramm: doc };
}

/** Eintrag nur mit Text (Bedienung) */
function anleitung(title: string, text: string): HandbookEntry {
    return { title, text, code: "" };
}

/** Übung: „Ausprobieren“ legt ein leeres Diagramm an, die Lösung ist ein Diagramm */
function uebung(title: string, text: string, loesung: string, doc: KlassenDoc): HandbookEntry {
    return { title, text, code: "", klassendiagramm: emptyDoc(), solution: { text: loesung, code: javaVon(doc), klassendiagramm: doc } };
}

// ------------------------------------------------------------------ Beispiele

const HUND = diagramm([{
    name: "Hund",
    attribute: ["- name: String", "- alter: int"],
    operationen: ["c Hund(name: String)", "+ getName(): String", "+ bellen()"],
}]);

const KONTO = diagramm([{
    name: "Konto",
    attribute: ["- nummer: int", "- inhaber: String", "- kontostand: double"],
    operationen: ["c Konto(nummer: int, inhaber: String)", "+ einzahlen(betrag: double)", "+ abheben(betrag: double): boolean", "+ getKontostand(): double"],
}]);

const PERSON = diagramm([{
    name: "Person",
    attribute: ["- vorname: String", "- nachname: String"],
    operationen: ["c Person()", "c Person(vorname: String, nachname: String)", "+ getName(): String"],
}]);

const MESSWERT = diagramm([{
    name: "Messwert",
    attribute: ["- anzahl: int", "- temperatur: double", "- ort: String", "- gueltig: boolean", "- einheit: char"],
    operationen: ["c Messwert(ort: String, temperatur: double)", "+ istGueltig(): boolean"],
}]);

const KURS = diagramm([
    {
        name: "Kurs", at: [24, 24],
        attribute: ["- noten: int[]", "- teilnehmer: DynArray<Schueler>", "- themen: Liste<String>"],
        operationen: ["c Kurs(plaetze: int)", "+ aufnehmen(s: Schueler)", "+ getAnzahl(): int"],
    },
    { name: "Schueler", at: [470, 24], attribute: ["- name: String"], operationen: ["c Schueler(name: String)"] },
], ["Kurs — Schueler"]);

const KINOSAAL = diagramm([{
    name: "Kinosaal",
    attribute: ["- belegt: boolean[][]", "- preise: double[][]", "- titel: String"],
    operationen: ["c Kinosaal(reihen: int, plaetze: int)", "+ buchen(reihe: int, platz: int): boolean", "+ freiePlaetze(reihe: int): int"],
}]);

const DRUCKEREI = diagramm([
    {
        name: "Druckerei", at: [24, 24],
        attribute: ["- auftraege: Queue<Auftrag>", "- erledigt: Stack<Auftrag>", "- kunden: BinTree<Kunde>"],
        operationen: ["c Druckerei()", "+ annehmen(a: Auftrag)", "+ druckeNaechsten(): Auftrag", "+ letzterErledigter(): Auftrag", "+ suche(b: BinTree<Kunde>, name: String): Kunde"],
    },
    { name: "Auftrag", at: [560, 24], attribute: ["- seiten: int"], operationen: ["c Auftrag(seiten: int)"] },
    { name: "Kunde", at: [560, 170], attribute: ["- name: String"], operationen: ["c Kunde(name: String)", "+ getName(): String"] },
], ["Druckerei — Auftrag", "Druckerei — Kunde"]);

const HINWEISE = diagramm([
    {
        name: "Person", at: [24, 24], mehrAttribute: true, mehrOperationen: true,
        attribute: ["- id: int", "- name: String", "- adresse: Adresse", "- bekannte: Person[]"],
        operationen: ["c Person()", "c Person(name: String)", "+ getName(): String", "+ kennt(anderer: Person): boolean"],
    },
    {
        name: "Adresse", at: [440, 24], mehrOperationen: true,
        attribute: ["- strasse: String", "- plz: String", "- ort: String"],
        operationen: ["c Adresse(a_str: String, a_plz: String, a_ort: String)", "+ alsText(): String"],
    },
], ["Person — Adresse"]);

const TIERE = diagramm([
    { name: "Tier", attribute: ["- name: String"], operationen: ["c Tier(name: String)", "+ getName(): String", "+ gibLaut(): String"] },
    { name: "Hund", operationen: ["c Hund(name: String)", "+ apportieren()"] },
    { name: "Katze", operationen: ["c Katze(name: String)", "+ schnurren()"] },
], ["Hund ▷ Tier", "Katze ▷ Tier"]);

const FAHRZEUG = diagramm([
    { name: "Fahrzeug", attribute: ["- kennzeichen: String"], operationen: ["c Fahrzeug(kennzeichen: String)", "+ getKennzeichen(): String"] },
    { name: "Auto", attribute: ["- sitze: int"], operationen: ["c Auto(kennzeichen: String, sitze: int)", "+ getSitze(): int"] },
], ["Auto ▷ Fahrzeug"]);

const BIBLIOTHEK = diagramm([
    {
        name: "Bibliothek", at: [24, 24],
        attribute: ["- name: String", "- buecher: DynArray<Buch>"],
        operationen: ["c Bibliothek(name: String)", "+ hinzufuegen(b: Buch)", "+ suche(titel: String): Buch", "+ anzahlVerfuegbar(): int"],
    },
    {
        name: "Buch", at: [470, 24],
        attribute: ["- titel: String", "- autor: String", "- jahr: int", "- ausgeliehen: boolean"],
        operationen: ["c Buch(titel: String, autor: String, jahr: int)", "+ ausleihen(): boolean", "+ zurueckgeben()", "+ istAusgeliehen(): boolean"],
    },
], ["Bibliothek — Buch"]);

const SCHULE = diagramm([
    {
        name: "Klasse", at: [24, 24],
        attribute: ["- bezeichnung: String", "- schueler: DynArray<Schueler>", "- klassenlehrkraft: Lehrkraft"],
        operationen: ["c Klasse(bezeichnung: String, klassenlehrkraft: Lehrkraft)", "+ aufnehmen(s: Schueler)"],
    },
    { name: "Schueler", at: [470, 24], attribute: ["- name: String", "- geburtsjahr: int"], operationen: ["c Schueler(name: String, geburtsjahr: int)"] },
    { name: "Lehrkraft", at: [470, 170], attribute: ["- name: String", "- kuerzel: String"], operationen: ["c Lehrkraft(name: String, kuerzel: String)"] },
], ["Klasse — Schueler", "Klasse — Lehrkraft"]);

const MEDIEN = diagramm([
    { name: "Medium", attribute: ["- titel: String", "- jahr: int"], operationen: ["c Medium(titel: String, jahr: int)", "+ getTitel(): String"] },
    { name: "Buch", attribute: ["- seiten: int"], operationen: ["c Buch(titel: String, jahr: int, seiten: int)"] },
    { name: "Film", attribute: ["- minuten: int"], operationen: ["c Film(titel: String, jahr: int, minuten: int)"] },
], ["Buch ▷ Medium", "Film ▷ Medium"]);

// ------------------------------------------------------------------ Handbuch

export const KLASSENDIAGRAMM_HANDBOOK: HandbookSection[] = [
    {
        id: "bedienen", title: "Den Editor bedienen", icon: "🖱",
        intro: "Eine Datei mit der Endung `.klassendiagramm` öffnet sich im Klassendiagramm-Editor. In der Dateiliste stehen Klassendiagramme oben, darunter Struktogramme und Code – jeweils durch einen feinen Strich getrennt. Oben stehen die Knöpfe für die ganze Datei, darunter die Leiste **Neu:** und darunter ein Formular für das, was gerade ausgewählt ist.",
        entries: [
            beispiel("Klasse anlegen und benennen",
                "Klicke auf **Neu: Klasse** oder doppelklicke auf eine freie Stelle der Fläche. Die neue Klasse ist ausgewählt; im Formular oben steht ihr Name – einfach überschreiben. Klassennamen beginnen mit einem Großbuchstaben. Benennst du eine Klasse um, werden auch Attribute und Parameter mit diesem Datentyp angepasst.",
                diagramm([{ name: "Hund" }])),
            beispiel("Attribute, Konstruktoren und Operationen",
                "Wähle eine Klasse aus und klicke auf **Attribut**, **Konstruktor** oder **Operation**. Im Formular stellst du ein:\n\n- die **Sichtbarkeit** (`+` öffentlich, `-` privat),\n- den **Namen**,\n- den **Datentyp** (bei Operationen den Rückgabetyp; „keine Rückgabe“, wenn sie nichts zurückgibt),\n- bei Konstruktoren und Operationen die **Parameter** (**+ Parameter**, **×** entfernt einen).\n\nMit **↑** und **↓** (oder **Alt + ↑/↓**) änderst du die Reihenfolge, **🗑** oder **Entf** löscht die Auswahl.",
                HUND),
            anleitung("Auswählen, Verschieben, Zoomen",
                "- Ein Klick auf den **Namen** wählt die Klasse aus, ein Klick auf eine **Zeile** den Eintrag, ein Klick auf eine **Linie** die Beziehung.\n- Klassen verschiebst du, indem du sie mit der Maus ziehst.\n- **−**, **100 %** und **+** verkleinern und vergrößern die Ansicht.\n- **Esc** bricht das Verbinden ab, **Enter** oder **F2** springt ins Namensfeld."),
            anleitung("Rückgängig, Speichern, Drucken",
                "- **↶** und **↷** (oder **Strg + Z** / **Strg + Y**) nehmen Schritte zurück bzw. wiederholen sie.\n- Das Diagramm wird wie jede Datei automatisch gespeichert.\n- **⤓ SVG** und **⤓ PNG** speichern es als Bild (z. B. für ein Arbeitsblatt oder eine Präsentation), **⎙ Drucken** druckt es schwarz auf weiß."),
        ],
    },
    {
        id: "schreibweise", title: "Schreibweise im Abitur", icon: "✎",
        intro: "Der Editor zeichnet Klassendiagramme so, wie es die Ergänzenden Hinweise für das Abitur in Niedersachsen (Informatik, Abschnitt 6) vorsehen: oben der Name der Klasse, darunter die Attribute, unten Konstruktoren und Operationen.",
        entries: [
            beispiel("Sichtbarkeit: + und -",
                "`-` heißt **privat**: Nur die Klasse selbst kann darauf zugreifen. Attribute sind meist privat. `+` heißt **öffentlich**: Andere Klassen dürfen die Operation aufrufen. So bleibt der Kontostand geschützt und lässt sich nur über `einzahlen` und `abheben` ändern.",
                KONTO),
            beispiel("Konstruktoren mit c",
                "Konstruktoren stehen bei den Operationen, beginnen mit `c` und heißen wie die Klasse. Sie haben keinen Rückgabetyp. Eine Klasse kann mehrere Konstruktoren mit verschiedenen Parametern haben.",
                PERSON),
            beispiel("Grundlegende Datentypen",
                "In der Abitur-Schreibweise heißen die Datentypen:\n\n- **Ganzzahl** (`int`)\n- **Fließkommazahl** (`double`)\n- **Zeichenkette** (`String`)\n- **Wahrheitswert** (`boolean`)\n- **Zeichen** (`char`)\n\nEine Klasse des Diagramms kann ebenfalls Datentyp sein. Steht der Rückgabetyp hinter dem Doppelpunkt, gibt die Operation einen Wert zurück.",
                MESSWERT),
            beispiel("Reihungen und Listen",
                "Für mehrere Werte gibt es:\n\n- **stat. Reihung vom Inhaltstyp X** – feste Länge (`X[]`),\n- **dyn. Reihung vom Inhaltstyp X** – wächst mit (Abiturklasse `DynArray`),\n- **Liste vom Inhaltstyp X** (`Liste<X>`).\n\nIm Formular wählst du dafür zuerst die Form und dann den Inhaltstyp.",
                KURS),
            beispiel("Zweidimensionale Reihungen",
                "Eine **zweidimensionale stat. Reihung vom Inhaltstyp X** (`X[][]`) ist eine Tabelle mit fester Größe. Die Indizes stehen meist in der Reihenfolge **[Zeile][Spalte]** und beginnen bei 0 – im Kinosaal also `belegt[reihe][platz]`. Im Formular wählst du **zweidim. stat. Reihung von** und dann den Inhaltstyp.",
                KINOSAAL),
            beispiel("Stapel, Schlange und Binärbaum",
                "Für die Abiturklassen gibt es eigene Formen – die Wörter stammen aus den Ergänzenden Hinweisen:\n\n- **Stapel vom Inhaltstyp X** (`Stack`): `push`, `pop`, `top`, `isEmpty` – wer zuletzt kommt, ist zuerst dran,\n- **Schlange vom Inhaltstyp X** (`Queue`): `enqueue`, `dequeue`, `head`, `isEmpty` – wer zuerst kommt, ist zuerst dran,\n- **Binärbaum vom Inhaltstyp X** (`BinTree`): `getItem`, `getLeft`, `getRight`, `isEmpty`, `isLeaf` …\n\nAuch im Code steht der Inhaltstyp dabei: aus „Stapel vom Inhaltstyp Ganzzahl“ wird `Stack<Integer>`.",
                DRUCKEREI),
            beispiel("Weggelassenes: ...",
                "Nicht immer sind alle Attribute und Operationen wichtig. Setze in der Klasse den Haken **... weitere Attribute** bzw. **... weitere Operationen** – dann steht `...` im Kasten. Mehrere Parameter mit gleichem Typ werden zusammengefasst (`a_str, a_plz, a_ort: Zeichenkette`). Das Beispiel stammt aus den Ergänzenden Hinweisen.",
                HINWEISE),
            beispiel("Typen: Abitur oder Java",
                "Der Knopf **Typen: Abitur** schaltet auf **Typen: Java** um: Dann steht `int` statt Ganzzahl und `Person[]` statt stat. Reihung. Die Einstellung wird in der Datei gespeichert. Im Abitur gilt die Abitur-Schreibweise.",
                diagramm([{ name: "Messwert", attribute: ["- temperatur: double", "- orte: String[]"], operationen: ["+ istWarm(grenze: double): boolean"] }], [], "java")),
        ],
    },
    {
        id: "beziehungen", title: "Beziehungen", icon: "—",
        intro: "Beziehungen zwischen Klassen zeichnest du, indem du eine Klasse auswählst, **— Assoziation** oder **△ Vererbung** anklickst und dann die zweite Klasse anklickst. Eine ausgewählte Linie kannst du im Formular ändern oder mit **🗑** löschen.",
        entries: [
            beispiel("Assoziation",
                "Eine **Linie** zeigt: Die Klassen haben miteinander zu tun – meist hat eine Klasse ein Attribut mit dem Typ der anderen. Die Ergänzenden Hinweise sehen keine Pfeile, Rollen oder Anzahlen an der Linie vor.",
                diagramm([
                    { name: "Person", at: [24, 24], attribute: ["- name: String", "- adresse: Adresse"], operationen: ["c Person(name: String, adresse: Adresse)"] },
                    { name: "Adresse", at: [400, 24], attribute: ["- ort: String"], operationen: ["c Adresse(ort: String)"] },
                ], ["Person — Adresse"])),
            beispiel("Vererbung",
                "Ein **Pfeil mit offener Spitze** zeigt zur **Oberklasse**. Die Unterklassen erben deren Attribute und Operationen und ergänzen eigene. Wähle die Unterklasse aus, klicke **△ Vererbung** und dann die Oberklasse. Oberklassen stehen meist oben.",
                TIERE),
            anleitung("Was der Editor nicht zulässt",
                "- Eine Klasse kann nur **eine** Oberklasse haben (wie in Java).\n- Vererbung **im Kreis** (A erbt von B, B erbt von A) geht nicht.\n- Zwischen zwei Klassen gibt es höchstens **eine** Assoziation, und keine Linie von einer Klasse zu sich selbst.\n- Bei einer ausgewählten Vererbung tauscht **⇄ Richtung tauschen** Ober- und Unterklasse."),
        ],
    },
    {
        id: "texva", title: "Klassendiagramm und Code", icon: "⇄",
        intro: "Aus einem Klassendiagramm kann Code entstehen – und umgekehrt. Das geht nur, wenn deine Lerngruppe Code freigegeben hat.",
        entries: [
            beispiel("In Code umwandeln",
                "**⇢ In Code umwandeln** legt für jede Klasse eine Datei `Name.java` an: Attribute, Konstruktoren und Operationen mit leerem Rumpf und `// TODO`. Parameter, die wie ein Attribut heißen, werden im Konstruktor gleich zugewiesen (`this.name = name;`). Operationen mit Rückgabetyp bekommen eine Standardrückgabe, damit das Programm sofort übersetzt. Gibt es eine Datei schon, fragt der Editor vorher. Klappe **Code** auf, um das Ergebnis zu sehen.",
                HUND),
            beispiel("Vererbung im Code: super(...)",
                "Erbt eine Klasse von einer Oberklasse, die nur Konstruktoren mit Parametern hat, ruft der erzeugte Konstruktor zuerst `super(...)` auf – mit den Parametern, die gleich heißen.",
                FAHRZEUG),
            anleitung("Aus dem Code übernehmen",
                "**⇠ Aus dem Code** zeichnet die Klassen aus den Code-Dateien des Projekts: Vererbung als Pfeil, Attribute mit einer Klasse des Diagramms als Linie, Oberklassen oben. Die Klassen werden automatisch angeordnet; verschiebe sie danach, wie es dir gefällt. Im Reiter **Klassen** (rechts, in Code) legt **＋ Als Datei** ebenfalls ein Klassendiagramm aus dem Code an.\n\nCode und Diagramm werden danach **nicht** automatisch abgeglichen – jeder Schritt geht in eine Richtung."),
        ],
    },
    {
        id: "modellieren", title: "Modellieren üben", icon: "🧩",
        intro: "Lies die Beschreibung, unterstreiche Nomen (mögliche Klassen und Attribute) und Verben (mögliche Operationen) und zeichne dann das Klassendiagramm. **▶ Ausprobieren** legt ein leeres Klassendiagramm an. Vergleiche danach mit der Lösung – andere sinnvolle Lösungen sind möglich.",
        entries: [
            uebung("Übung: Bibliothek",
                "Eine Bibliothek hat einen Namen und verwaltet beliebig viele Bücher. Jedes Buch hat einen Titel, einen Autor und ein Erscheinungsjahr. Ein Buch kann ausgeliehen und zurückgegeben werden. Die Bibliothek kann ein Buch aufnehmen, ein Buch nach seinem Titel suchen und angeben, wie viele Bücher gerade verfügbar sind.",
                "Zwei Klassen, verbunden durch eine Assoziation. Die Bibliothek speichert ihre Bücher in einer **dyn. Reihung vom Inhaltstyp Buch**, weil die Anzahl wächst. Ob ein Buch ausgeliehen ist, merkt sich das Buch selbst in einem Wahrheitswert.",
                BIBLIOTHEK),
            uebung("Übung: Schulklasse",
                "Eine Schulklasse hat eine Bezeichnung (z. B. „10b“), eine Klassenlehrkraft und beliebig viele Schüler/innen. Von den Schüler/innen sind Name und Geburtsjahr bekannt, von der Lehrkraft Name und Kürzel. Schüler/innen können in die Klasse aufgenommen werden.",
                "Drei Klassen. Die Klasse kennt ihre Lehrkraft über ein Attribut vom Typ `Lehrkraft` und ihre Schüler/innen über eine dyn. Reihung – beides sind Assoziationen.",
                SCHULE),
            uebung("Übung: Medien (Vererbung)",
                "In einer Mediathek gibt es Bücher und Filme. Beide haben einen Titel und ein Erscheinungsjahr. Bücher haben außerdem eine Seitenzahl, Filme eine Länge in Minuten.",
                "Gemeinsames kommt in die Oberklasse `Medium`, Besonderes in die Unterklassen `Buch` und `Film`. Ihre Konstruktoren geben Titel und Jahr mit `super(...)` an die Oberklasse weiter.",
                MEDIEN),
        ],
    },
];
