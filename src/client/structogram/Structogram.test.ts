import { describe, expect, test } from "vitest";
// Ladereihenfolge der Compiler-Module wie in der IDE (sonst zyklische Importe)
import "../../compiler/common/interpreter/Interpreter";
import "../../compiler/java/JavaCompiler";
import { diagramsFromJava, neutral, signature, type SNode } from "./StructogramModel";
import { renderSvg } from "./StructogramSvg";
import { JavaBlockParser } from "../blocks/JavaBlockParser";
import { JavaBlockGenerator } from "../blocks/JavaBlockGenerator";

const NL = String.fromCharCode(10);
const lines = (...l: string[]) => l.join(NL) + NL;

/** Struktogramm als lesbarer Text (zum Vergleichen) */
function dump(nodes: SNode[], indent = ""): string[] {
    const out: string[] = [];
    for (const nd of nodes) {
        switch (nd.kind) {
            case "stmt": out.push(indent + nd.text); break;
            case "loop": out.push(indent + "[" + nd.head + "]", ...dump(nd.body, indent + "  ")); break;
            case "footloop": out.push(...dump(nd.body, indent + "  "), indent + "[" + nd.foot + "]"); break;
            case "if": out.push(indent + "<" + nd.cond + "> wahr:", ...dump(nd.yes, indent + "  "), indent + "falsch:", ...dump(nd.no, indent + "  ")); break;
            case "switch":
                out.push(indent + "<" + nd.subject + ">");
                for (const c of nd.cases) out.push(indent + c.label + ":", ...dump(c.body, indent + "  "));
                if (nd.other) out.push(indent + "sonst:", ...dump(nd.other, indent + "  "));
                break;
        }
    }
    return out;
}

describe("Struktogramme (Stil der Ergänzenden Hinweise Niedersachsen)", () => {

    test("Beispiel 1: für alle Elemente, Verzweigung, gib zurück", () => {
        const [d] = diagramsFromJava(lines(
            "boolean istEnthalten(ArrayList<Integer> d, int v) {",
            "    for (Integer e : d) {",
            "        if (e == v) {",
            "            return true;",
            "        }",
            "    }",
            "    return false;",
            "}",
        ));
        expect(d.title).toBe("istEnthalten(d: Liste vom Inhaltstyp Ganzzahl, v: Ganzzahl): Wahrheitswert");
        expect(dump(d.body)).toEqual([
            "[für alle Elemente e aus d]",
            "  <e = v> wahr:",
            "    gib wahr zurück",
            "  falsch:",
            "gib falsch zurück",
        ]);
    });

    test("Beispiel 3: wiederhole bis, ist gleich mit sonst, Zufallszahl, Kommentar", () => {
        const diagrams = diagramsFromJava(lines(
            "int anzahlRot = 0;",
            "do {",
            "    int z = Random.randint(1, 4);   ",
            "    // Farbe wählen",
            "    switch (z) {",
            "        case 1:",
            "            anzahlRot++;",
            "            break;",
            "        case 2:",
            "        case 3:",
            "            println(\"grün oder blau\");",
            "            break;",
            "        default:",
            "            println(\"anders\");",
            "    }",
            "} while (anzahlRot <= 30);",
        ));
        expect(diagrams.map((d) => d.title)).toEqual(["Hauptprogramm"]);
        expect(dump(diagrams[0].body)).toEqual([
            "anzahlRot ← 0",
            "  z ← ganzzahlige Zufallszahl zwischen 1 und 4",
            "  // Farbe wählen",
            "  <z ist gleich>",
            "  1:",
            "    erhöhe anzahlRot um 1",
            "  2, 3:",
            "    gib \"grün oder blau\" aus",
            "  sonst:",
            "    gib \"anders\" aus",
            "[wiederhole bis anzahlRot > 30]",
        ]);
    });

    test("Schleifen, Bedingungen, Reihungen, Listen, Objekte", () => {
        const [main, hund] = diagramsFromJava(lines(
            "int[] zahlen = new int[10];",
            "for (int i = 0; i < zahlen.length; i++) {",
            "    zahlen[i] = i * 2 % 3;",
            "}",
            "for (int k = 0; k < 10; k += 2) {",
            "    println(k);",
            "}",
            "ArrayList<String> liste = new ArrayList<String>();",
            "while (!liste.isEmpty() && zahlen[0] != 1 || false) {",
            "    liste.remove(0);",
            "}",
            "for (int durchlauf = 1; durchlauf <= 100; durchlauf++) {",
            "    liste.add(\"x\");",
            "}",
            "Hund h = new Hund(\"Rex\");",
            "h.bellen();",
            "char c = 'A';",
            "int code = (int) c;",
            "",
            "class Tier {",
            "}",
            "",
            "class Hund extends Tier {",
            "    private String name;",
            "",
            "    public Hund(String name) {",
            "        this.name = name;",
            "    }",
            "",
            "    public void bellen() {",
            "        println(name + \" bellt\");",
            "    }",
            "}",
        ));
        expect(dump(main.body)).toEqual([
            "zahlen ← statische Reihung der Länge 10 vom Inhaltstyp Ganzzahl",
            "[für i von 0 bis (Länge von zahlen) - 1]",
            "  zahlen[i] ← i · 2 mod 3",
            "[für k von 0 bis 9, Schrittweite 2]",
            "  gib k aus",
            "liste ← leere Liste vom Inhaltstyp Zeichenkette",
            "[solange liste nicht leer UND zahlen[0] ≠ 1 ODER falsch]",
            "  lösche Element an Position 0 von liste",
            "[wiederhole 100-mal]",
            "  füge \"x\" zu liste hinzu",
            "h ← erzeuge Hund(\"Rex\")",
            "h.bellen()",
            "c ← 'A'",
            "code ← c",
        ].map((s, i) => (i === 13 ? "code ← ASCII-Wert von c" : s)));
        expect(hund.group).toBe("Klasse Hund (erbt von Tier)");
        expect(hund.title).toBe("Konstruktor Hund(name: Zeichenkette)");
        expect(dump(hund.body)).toEqual(["this.name ← name"]);
    });

    test("Signaturen: gleiche Typen zusammengefasst, Reihungen, ohne Rückgabe", () => {
        expect(signature("minimum", [{ name: "a", type: "double" }, { name: "b", type: "double" }], "double"))
            .toBe("minimum(a, b: Fließkommazahl): Fließkommazahl");
        expect(signature("sortiere", [{ name: "a", type: "String[]" }], "void")).toBe("sortiere(a: statische Reihung vom Inhaltstyp Zeichenkette)");
        expect(signature("f", [], "DynArray")).toBe("f(): dynamische Reihung vom Inhaltstyp Objekt");
        expect(signature("g", [{ name: "a", type: "float" }, { name: "b", type: "long" }, { name: "m", type: "char[][]" }]))
            .toBe("g(a: Fließkommazahl, b: Ganzzahl, m: statische zweidimensionale Reihung vom Inhaltstyp Zeichen)");
    });

    test("Abiturklassen: deutsche Namen und Inhaltstyp aus der Verwendung", () => {
        const diagrams = diagramsFromJava(lines(
            "Stack s = new Stack();",
            "s.push(3);",
            "void sortiere(DynArray a) {",
            "    String x = (String) a.getItem(0);",
            "}",
            "int zaehle(Stack s, Queue q, BinTree t) {",
            "    char c = (char) s.pop();",
            "    Hund h = (Hund) q.head();",
            "    return 0;",
            "}",
            "class Kurs {",
            "    private DynArray namen;",
            "    Kurs() { namen = new DynArray(); }",
            "    void neu(String n) { namen.append(n); }",
            "    DynArray alle() { return namen; }",
            "}",
        ));
        const titles = diagrams.map((d) => d.title);
        expect(dump(diagrams[0].body)).toEqual(["s ← leerer Stapel vom Inhaltstyp Ganzzahl", "lege 3 auf s"]);
        expect(titles).toContain("sortiere(a: dynamische Reihung vom Inhaltstyp Zeichenkette)");
        expect(titles).toContain("zaehle(s: Stapel vom Inhaltstyp Zeichen, q: Schlange vom Inhaltstyp Hund, t: Binärbaum vom Inhaltstyp Objekt): Ganzzahl");
        expect(titles).toContain("alle(): dynamische Reihung vom Inhaltstyp Zeichenkette");
        expect(dump(diagrams.find((d) => d.title === "Konstruktor Kurs()")!.body)).toEqual(["namen ← leere dynamische Reihung vom Inhaltstyp Zeichenkette"]);
    });

    test("Java-Text wird lesbar gemacht", () => {
        expect(neutral("x == 3 && !fertig || y >= 2")).toBe("x = 3 UND nicht fertig ODER y ≥ 2");
        expect(neutral("System.out.println(\"a == b\");")).toBe("System.out.println(\"a == b\")");
    });

    test("Blockmodus bleibt unberührt: switch und do-while sind dort Java-Text", () => {
        const code = lines("do {", "    x++;", "} while (x < 3);", "switch (x) {", "    case 1:", "        break;", "}");
        expect(JavaBlockGenerator.generate(JavaBlockParser.parse(code).state).code).toBe(code);
        expect(JSON.stringify(JavaBlockParser.parse(code).state)).not.toMatch(/s_switch|s_do_while/);
    });

    test("SVG: alle Texte, gültiges XML, Breite passt sich an", () => {
        const diagrams = diagramsFromJava(lines(
            "if (x > 1) {",
            "    println(\"groß\");",
            "} else if (x > 0) {",
            "    println(\"klein\");",
            "}",
            "switch (x) {",
            "    case 1:",
            "        println(1);",
            "        break;",
            "    default:",
            "        println(2);",
            "}",
        ));
        const { svg, width, height } = renderSvg(diagrams);
        expect(svg.startsWith("<svg")).toBe(true);
        for (const t of ["Hauptprogramm", "x &gt; 1", "gib \"groß\" aus", "wahr", "falsch", "x ist gleich", "sonst"]) expect(svg).toContain(t);
        expect(width).toBeGreaterThan(200);
        expect(height).toBeGreaterThan(100);
        const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
        expect(doc.getElementsByTagName("parsererror").length).toBe(0);
    });
});
