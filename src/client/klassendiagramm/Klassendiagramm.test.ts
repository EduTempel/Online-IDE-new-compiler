import { describe, expect, test } from "vitest";
import "../../compiler/common/interpreter/Interpreter";
import "../../compiler/java/JavaCompiler";
import {
    aendereArt, aendereKlasse, baueTyp, benenneTypenUm, brauchtAbiturklassen, eintragText, emptyDoc, entferneKlasse, javaTyp, neueBeziehung, neueKlasse,
    neuerEintrag, parameterText, parseDoc, probleme, serializeDoc, tauscheRichtung, typText, verschiebeEintrag, zerlegeTyp,
    type KlassenDoc, type Klasse,
} from "./KlassenDoc";
import { docZuJava } from "./KlassenJava";
import { docAusKlassen, klassenAusJava } from "./KlassenJava";
import { linie, renderSvg } from "./KlassenSvg";
import { compileJava, runJava } from "../blocks/RunJava";

const measure = (text: string, bold: boolean) => text.length * (bold ? 8 : 7);
let n = 0;
const id = () => "i" + (++n);

/** Beispiel aus den Ergänzenden Hinweisen, Abschnitt 6 */
function hinweise(): KlassenDoc {
    const person: Klasse = {
        id: "person", name: "Person", x: 20, y: 20, mehrAttribute: true, mehrOperationen: true,
        attribute: [
            { id: id(), sicht: "-", name: "id", typ: "int" },
            { id: id(), sicht: "-", name: "name", typ: "String" },
            { id: id(), sicht: "-", name: "adresse", typ: "Adresse" },
            { id: id(), sicht: "-", name: "bekannte", typ: "Person[]" },
        ],
        operationen: [
            { id: id(), sicht: "+", name: "Person", konstruktor: true, parameter: [], rueckgabe: "" },
            { id: id(), sicht: "+", name: "Person", konstruktor: true, parameter: [{ name: "name", typ: "String" }], rueckgabe: "" },
            { id: id(), sicht: "+", name: "getName", parameter: [], rueckgabe: "String" },
            { id: id(), sicht: "+", name: "kennt", parameter: [{ name: "anderer", typ: "Person" }], rueckgabe: "boolean" },
        ],
    };
    const adresse: Klasse = {
        id: "adresse", name: "Adresse", x: 420, y: 20, mehrOperationen: true,
        attribute: ["strasse", "plz", "ort"].map((name) => ({ id: id(), sicht: "-" as const, name, typ: "String" })),
        operationen: [
            { id: id(), sicht: "+", name: "Adresse", konstruktor: true, parameter: ["a_str", "a_plz", "a_ort"].map((name) => ({ name, typ: "String" })), rueckgabe: "" },
            { id: id(), sicht: "+", name: "alsText", parameter: [], rueckgabe: "String" },
        ],
    };
    const schueler: Klasse = {
        id: "schueler", name: "Schueler", x: 20, y: 300,
        attribute: [{ id: id(), sicht: "-", name: "jahrgang", typ: "int" }],
        operationen: [
            { id: id(), sicht: "+", name: "Schueler", konstruktor: true, parameter: [], rueckgabe: "" },
            { id: id(), sicht: "+", name: "getJahrgang", parameter: [], rueckgabe: "int" },
            { id: id(), sicht: "+", name: "setJahrgang", parameter: [{ name: "jg", typ: "int" }], rueckgabe: "" },
        ],
    };
    const lehrer: Klasse = {
        id: "lehrer", name: "Lehrer", x: 300, y: 300, mehrAttribute: true, mehrOperationen: true,
        attribute: [{ id: id(), sicht: "-", name: "faecher", typ: "DynArray<String>" }],
        operationen: [
            { id: id(), sicht: "+", name: "Lehrer", konstruktor: true, parameter: [], rueckgabe: "" },
            { id: id(), sicht: "+", name: "addFach", parameter: [{ name: "fach", typ: "String" }], rueckgabe: "" },
        ],
    };
    return {
        version: 1, typen: "abitur", klassen: [person, adresse, schueler, lehrer],
        beziehungen: [
            { id: "b1", art: "assoziation", von: "person", nach: "adresse" },
            { id: "b2", art: "vererbung", von: "schueler", nach: "person" },
            { id: "b3", art: "vererbung", von: "lehrer", nach: "person" },
        ],
    };
}

const zeilen = (doc: KlassenDoc, name: string) => {
    const k = doc.klassen.find((c) => c.name === name)!;
    return [...k.attribute, ...k.operationen].map((e) => eintragText(e, k, doc.typen));
};

describe("Klassendiagramm: Schreibweise der Ergänzenden Hinweise", () => {
    test("Einträge wie im Beispiel Person / Adresse / Lehrer", () => {
        const doc = hinweise();
        expect(zeilen(doc, "Person")).toEqual([
            "- id: Ganzzahl", "- name: Zeichenkette", "- adresse: Adresse", "- bekannte: stat. Reihung vom Inhaltstyp Person",
            "c Person()", "c Person(name: Zeichenkette)", "+ getName(): Zeichenkette", "+ kennt(anderer: Person): Wahrheitswert",
        ]);
        expect(zeilen(doc, "Adresse")).toContain("c Adresse(a_str, a_plz, a_ort: Zeichenkette)");
        expect(zeilen(doc, "Lehrer")[0]).toBe("- faecher: dyn. Reihung vom Inhaltstyp Zeichenkette");
        expect(zeilen(doc, "Schueler")).toContain("+ setJahrgang(jg: Ganzzahl)");
        expect(zeilen({ ...doc, typen: "java" }, "Lehrer")[0]).toBe("- faecher: DynArray<String>");
        expect(zeilen({ ...doc, typen: "java" }, "Person")[3]).toBe("- bekannte: Person[]");
    });

    test("Datentypen: Formen, Java, Abitur", () => {
        expect(typText("double", "abitur")).toBe("Fließkommazahl");
        expect(typText("char", "abitur")).toBe("Zeichen");
        expect(typText("ArrayList<Integer>", "abitur")).toBe("Liste vom Inhaltstyp Ganzzahl");
        expect(typText("int[][]", "abitur")).toBe("zweidimensionale stat. Reihung vom Inhaltstyp Ganzzahl");
        expect(typText("int[][][]", "abitur")).toBe("stat. Reihung vom Inhaltstyp zweidimensionale stat. Reihung vom Inhaltstyp Ganzzahl");
        expect(typText("DynArray", "abitur")).toBe("dyn. Reihung");
        expect(zerlegeTyp("ArrayList<Double>")).toEqual({ form: "liste", inhalt: "double" });
        expect(zerlegeTyp("DynArray<Person>")).toEqual({ form: "dyn", inhalt: "Person" });
        expect(baueTyp("liste", "int")).toBe("Liste<Integer>");
        expect(baueTyp("stat", "Person")).toBe("Person[]");
        expect(javaTyp("DynArray<Person>[]")).toBe("DynArray<Person>[]");
        expect(parameterText([{ name: "a", typ: "int" }, { name: "b", typ: "int" }, { name: "s", typ: "String" }], "abitur"))
            .toBe("a, b: Ganzzahl, s: Zeichenkette");
    });

    test("mehrdimensionale Reihung, Stapel, Schlange, Binärbaum: Wendungen der Ergänzenden Hinweise", () => {
        // Beispiele 2 und 4 aus Abschnitt 5
        expect(typText("Stack<char>", "abitur")).toBe("Stapel vom Inhaltstyp Zeichen");
        expect(typText("BinTree<Person>", "abitur")).toBe("Binärbaum vom Inhaltstyp Person");
        expect(typText("Queue<String>", "abitur")).toBe("Schlange vom Inhaltstyp Zeichenkette");
        // ohne Inhaltstyp (getLeft(): Binärbaum) – so kommt es auch aus Java
        expect(typText("BinTree", "abitur")).toBe("Binärbaum");
        expect(zerlegeTyp("Stack")).toEqual({ form: "stapel", inhalt: "" });
        expect(zerlegeTyp("double[][]")).toEqual({ form: "stat2", inhalt: "double" });
        expect(zerlegeTyp("Queue<Person>")).toEqual({ form: "schlange", inhalt: "Person" });
        expect(baueTyp("stat2", "char")).toBe("char[][]");
        expect(baueTyp("baum", "Person")).toBe("BinTree<Person>");
        expect(baueTyp("stapel", "int")).toBe("Stack<int>");
        expect(javaTyp("Stack<Person>")).toBe("Stack<Person>");
        expect(javaTyp("Stack<int>")).toBe("Stack<Integer>");
        expect(javaTyp("Stack")).toBe("Stack<Object>");
        expect(zerlegeTyp("Stack<Integer>")).toEqual({ form: "stapel", inhalt: "int" });
        expect(javaTyp("Person[][]")).toBe("Person[][]");
        expect(typText("Queue<Person>", "java")).toBe("Queue<Person>");
        expect(brauchtAbiturklassen({ klassen: [{ id: "a", name: "A", x: 0, y: 0, attribute: [], operationen: [{ id: "o", sicht: "+", name: "f", parameter: [{ name: "b", typ: "BinTree<int>" }], rueckgabe: "" }] }] })).toBe(true);
        expect(brauchtAbiturklassen({ klassen: [{ id: "a", name: "A", x: 0, y: 0, attribute: [{ id: "t", sicht: "-", name: "t", typ: "int[][]" }], operationen: [] }] })).toBe(false);
    });

    test("SVG: Kästen, „...“, Linie und offene Pfeilspitze", () => {
        const { svg, boxes } = renderSvg(hinweise(), measure);
        expect(svg).toContain(">Person</text>");
        expect(svg).toContain(">...</text>");
        expect((svg.match(/<polygon /g) ?? []).length).toBe(2);   // zwei Vererbungen
        expect(boxes.get("person")!.w).toBeGreaterThan(200);
        // überlappende Kästen: keine Linie
        expect(linie({ x: 0, y: 0, w: 100, h: 100 }, { x: 50, y: 50, w: 100, h: 100 })).toBeNull();
        expect(linie({ x: 0, y: 0, w: 100, h: 100 }, { x: 200, y: 0, w: 100, h: 100 })).toEqual({ x1: 100, y1: 50, x2: 200, y2: 50 });
    });
});

describe("Klassendiagramm: Bearbeiten", () => {
    test("Speichern und Laden; kaputte Datei", () => {
        const doc = hinweise();
        expect(parseDoc(serializeDoc(doc))).toEqual(doc);
        expect(parseDoc("").klassen).toEqual([]);
        expect(parseDoc("{kaputt").fehler).toBeTruthy();
        const ohne = parseDoc(JSON.stringify({ klassen: [{ id: "a", name: "A" }], beziehungen: [{ id: "x", art: "vererbung", von: "a", nach: "fehlt" }] }));
        expect(ohne.beziehungen).toEqual([]);
        expect(ohne.klassen[0]).toMatchObject({ name: "A", attribute: [], operationen: [] });
    });

    test("Klassen und Einträge anlegen, verschieben, umbenennen", () => {
        let { doc, id: a } = neueKlasse(emptyDoc(), 10, 10);
        expect(doc.klassen[0].name).toBe("Klasse");
        ({ doc } = neueKlasse(doc, 300, 10));
        expect(doc.klassen[1].name).toBe("Klasse2");
        const op = neuerEintrag(doc, a, "operation");
        const ctor = neuerEintrag(op.doc, a, "konstruktor");
        // Konstruktoren vor den Operationen
        expect(ctor.doc.klassen[0].operationen.map((o) => !!o.konstruktor)).toEqual([true, false]);
        const at1 = neuerEintrag(ctor.doc, a, "attribut");
        const at2 = neuerEintrag(at1.doc, a, "attribut");
        expect(at2.doc.klassen[0].attribute.map((x) => x.name)).toEqual(["attribut", "attribut2"]);
        doc = verschiebeEintrag(at2.doc, at2.id, -1);
        expect(doc.klassen[0].attribute.map((x) => x.name)).toEqual(["attribut2", "attribut"]);
        // Typ mit der Klasse: beim Umbenennen der Klasse mit umbenannt
        doc = { ...doc, klassen: doc.klassen.map((k, i) => i === 1 ? { ...k, attribute: [{ id: "t", sicht: "-", name: "liste", typ: "ArrayList<Klasse>" }] } : k) };
        doc = benenneTypenUm(aendereKlasse(doc, a, { name: "Hund" }), "Klasse", "Hund");
        expect(doc.klassen[1].attribute[0].typ).toBe("ArrayList<Hund>");
        // nicht, wenn der neue Name schon vergeben ist
        const doppelt = aendereKlasse(doc, a, { name: "Klasse2" });
        expect(benenneTypenUm(doppelt, "Hund", "Klasse2")).toBe(doppelt);
        expect(probleme(doppelt)).toContain("Die Klasse „Klasse2“ gibt es mehrfach.");
        expect(entferneKlasse(doc, a).klassen.length).toBe(1);
    });

    test("Beziehungen: keine doppelte, keine zweite Oberklasse, keine Vererbung im Kreis", () => {
        const doc = hinweise();
        expect(neueBeziehung(doc, "assoziation", "adresse", "person")).toMatchObject({ fehler: expect.stringContaining("schon verbunden") });
        expect(neueBeziehung(doc, "vererbung", "schueler", "adresse")).toMatchObject({ fehler: expect.stringContaining("höchstens eine Oberklasse") });
        expect(neueBeziehung(doc, "vererbung", "person", "lehrer")).toMatchObject({ fehler: expect.stringContaining("im Kreis") });
        expect(neueBeziehung(doc, "vererbung", "person", "person")).toMatchObject({ fehler: expect.any(String) });
        expect("doc" in neueBeziehung(doc, "vererbung", "adresse", "person")).toBe(true);
        const getauscht = tauscheRichtung(doc, "b1") as KlassenDoc;
        expect(getauscht.beziehungen.find((b) => b.id === "b1")).toMatchObject({ von: "adresse", nach: "person" });
        // Schueler ← Person tauschen geht (Lehrer erbt weiter von Person); Person ← Lehrer tauschen nicht (zweite Oberklasse)
        expect(tauscheRichtung(doc, "b2")).toMatchObject({ beziehungen: expect.arrayContaining([expect.objectContaining({ id: "b2", von: "person", nach: "schueler" })]) });
        expect(tauscheRichtung(tauscheRichtung(doc, "b2") as KlassenDoc, "b3")).toMatchObject({ fehler: expect.stringContaining("höchstens eine Oberklasse") });
        expect(aendereArt(doc, "b1", "vererbung")).toMatchObject({ beziehungen: expect.arrayContaining([expect.objectContaining({ id: "b1", art: "vererbung" })]) });
    });

    test("Namen prüfen", () => {
        const doc = hinweise();
        doc.klassen[0].attribute[0].name = "class";
        doc.klassen[0].operationen[2].name = "get Name";
        expect(probleme(doc)).toEqual([
            "„class“ ist ein reserviertes Wort und kein Name.",
            expect.stringContaining("„get Name“ ist kein gültiger Name"),
        ]);
        expect(probleme(hinweise())).toEqual([]);
    });
});

describe("Klassendiagramm ↔ Code", () => {
    test("In Code umwandeln: übersetzt ohne Fehler und läuft", async () => {
        const files = docZuJava(hinweise(), "Schule.klassendiagramm");
        expect(files.map((f) => f.name)).toEqual(["Person.java", "Adresse.java", "Schueler.java", "Lehrer.java"]);
        const person = files[0].code;
        expect(person).toContain("public class Person {");
        expect(person).toContain("    private Person[] bekannte;");
        expect(person).toContain("    public Person(String name) {\n        this.name = name;\n    }");
        expect(person).toContain("    public boolean kennt(Person anderer) {\n        // TODO\n        return false;\n    }");
        expect(files[2].code).toContain("public class Schueler extends Person {");
        expect(files[3].code).toContain("    private DynArray<String> faecher;\n");
        const main = "Schueler s = new Schueler();\ns.setJahrgang(11);\nprintln(s.getJahrgang() + \"|\" + new Adresse(\"a\", \"b\", \"c\").alsText() + \"|\");\n";
        const r = await runJava(main + files.map((f) => f.code).join("\n"), ["niedersachsen"]);
        expect(r.errors).toEqual([]);
        expect(r.output.trim()).toBe("0||");
    });

    test("Stapel, Schlange, Binärbaum, zweidimensionale Reihung: Code übersetzt und läuft", async () => {
        const doc = hinweise();
        doc.klassen[1].attribute.push(
            { id: "s1", sicht: "-", name: "stapel", typ: "Stack<Person>" },
            { id: "s2", sicht: "-", name: "schlange", typ: "Queue<String>" },
            { id: "s3", sicht: "-", name: "baum", typ: "BinTree<int>" },
            { id: "s4", sicht: "-", name: "tabelle", typ: "int[][]" },
        );
        doc.klassen[1].operationen.push({ id: "s5", sicht: "+", name: "links", parameter: [{ name: "b", typ: "BinTree<int>" }], rueckgabe: "BinTree<int>" });
        const adresse = docZuJava(doc)[1].code;
        expect(adresse).toContain("    private Stack<Person> stapel;\n");
        expect(adresse).toContain("    private Queue<String> schlange;\n");
        expect(adresse).toContain("    private BinTree<Integer> baum;\n");
        expect(adresse).toContain("    private int[][] tabelle;\n");
        expect(adresse).toContain("    public BinTree<Integer> links(BinTree<Integer> b) {\n        // TODO\n        return null;\n    }");
        const main = "Stack<String> s = new Stack<>();\ns.push(\"x\");\nQueue<Integer> q = new Queue<>();\nq.enqueue(2);\nBinTree<Integer> b = new BinTree<>(3);\nint[][] t = new int[2][3];\nprintln(s.top() + \"|\" + q.head() + \"|\" + b.getItem() + \"|\" + t[1].length);\n";
        const r = await runJava(main + docZuJava(doc).map((f) => f.code).join("\n"), ["niedersachsen"]);
        expect(r.errors).toEqual([]);
        expect(r.output.trim()).toBe("x|2|3|3");
    });

    test("Oberklasse ohne parameterlosen Konstruktor: super(...) wird erzeugt", async () => {
        const doc = hinweise();
        const person = doc.klassen[0];
        person.operationen = person.operationen.filter((o) => !(o.konstruktor && !o.parameter.length));
        doc.klassen[2].operationen[0].parameter = [{ name: "name", typ: "String" }];   // Schueler(name: Zeichenkette)
        const files = docZuJava(doc);
        expect(files[2].code).toContain("    public Schueler(String name) {\n        super(name);\n    }");
        expect(files[3].code).toContain("        super(\"\");   // TODO: passende Werte für die Oberklasse");
        expect(await compileJava(files.map((f) => f.code).join("\n"), ["niedersachsen"])).toEqual([]);
    });

    test("Aus dem Code übernehmen: Klassen, Vererbung, Linie, Anordnung", () => {
        const code = [
            "public class Tier {",
            "    private String name;",
            "    protected int alter;",
            "    public Tier(String name) { this.name = name; }",
            "    public String getName() { return name; }",
            "}",
            "class Hund extends Tier {",
            "    private ArrayList<Tier> freunde = new ArrayList<>();",
            "    Hund() { super(\"Bello\"); }",
            "    void belle(int mal, int lautstaerke) { }",
            "}",
        ].join("\n");
        const doc = docAusKlassen(klassenAusJava([code, "kein Java {"]), measure);
        expect(doc.klassen.map((k) => k.name)).toEqual(["Tier", "Hund"]);
        expect(zeilen(doc, "Tier")).toEqual(["- name: Zeichenkette", "+ alter: Ganzzahl", "c Tier(name: Zeichenkette)", "+ getName(): Zeichenkette"]);
        expect(zeilen(doc, "Hund")).toEqual(["- freunde: Liste vom Inhaltstyp Tier", "c Hund()", "+ belle(mal, lautstaerke: Ganzzahl)"]);
        expect(doc.beziehungen.map((b) => b.art).sort()).toEqual(["assoziation", "vererbung"]);
        // Oberklasse oben, Unterklasse darunter
        const [tier, hund] = doc.klassen;
        expect(hund.y).toBeGreaterThan(tier.y);
    });
});
