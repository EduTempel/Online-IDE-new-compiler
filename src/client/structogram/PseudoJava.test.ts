import { describe, expect, test } from "vitest";
import "../../compiler/common/interpreter/Interpreter";
import "../../compiler/java/JavaCompiler";
import { docToJava, isRecognized, javaType, parseSignature, translateExpr } from "./PseudoJava";
import { docFromDiagram, emptyDoc, newId, type ENode, type StructogramDoc } from "./StructogramDoc";
import { diagramsFromJava } from "./StructogramModel";
import { runJava } from "../blocks/RunJava";

const NL = String.fromCharCode(10);
const lines = (...l: string[]) => l.join(NL) + NL;
const stmt = (text: string): ENode => ({ id: newId(), kind: "stmt", text });
const doc = (title: string, body: ENode[]): StructogramDoc => ({ ...emptyDoc(title), body });
const ex = (text: string, vars: [string, string][] = []) => translateExpr(text, new Map(vars))?.code;

describe("Struktogramm -> Java", () => {

    test("Datentypen und Signatur", () => {
        expect(javaType("Ganzzahl")).toBe("int");
        expect(javaType("stat. Reihung vom Inhaltstyp Zeichenkette")).toBe("String[]");
        expect(javaType("Liste vom Inhaltstyp Ganzzahl")).toBe("ArrayList<Integer>");
        expect(javaType("dynamische Reihung vom Inhaltstyp Pixel")).toBe("DynArray");
        expect(javaType("statische Reihung vom Inhaltstyp Hund")).toBe("Hund[]");
        expect(javaType("statische zweidimensionale Reihung vom Inhaltstyp Zeichen")).toBe("char[][]");
        expect(javaType("Stapel vom Inhaltstyp Objekt")).toBe("Stack");
        expect(ex("statische Reihung der Länge 5 vom Inhaltstyp Fließkommazahl")).toBe("new double[5]");
        expect(ex("statische zweidimensionale Reihung mit 2 Zeilen und 3 Spalten vom Inhaltstyp Ganzzahl")).toBe("new int[2][3]");
        expect(parseSignature("minimum(a, b: Fließkommazahl): Fließkommazahl"))
            .toEqual({ kind: "method", name: "minimum", params: [{ name: "a", type: "double" }, { name: "b", type: "double" }], ret: "double" });
        expect(parseSignature("Hauptprogramm")).toEqual({ kind: "main" });
    });

    test("Ausdrücke: Formulierungen der Hinweise", () => {
        expect(ex("ganzzahlige Zufallszahl zwischen 1 und 4")).toBe("Random.randint(1, 4)");
        expect(ex("w = 32 UND nicht fertig ODER x ≥ 2")).toBe("w == 32 && !fertig || x >= 2");
        expect(ex("f nicht leer")).toBe("!f.isEmpty()");
        expect(ex("Länge von s - 1", [["s", "String"]])).toBe("s.length() - 1");
        expect(ex("Länge von zahlen", [["zahlen", "int[]"]])).toBe("zahlen.length");
        expect(ex("Element an Position i + 1 von liste", [["liste", "ArrayList<String>"]])).toBe("liste.get(i + 1)");
        expect(ex("Element an Position 0 von d", [["d", "DynArray"]])).toBe("d.getItem(0)");
        expect(ex("ASCII-Wert von v")).toBe("(int) v");
        expect(ex("erzeuge Pixel(255, 0, 0)")).toBe("new Pixel(255, 0, 0)");
        expect(ex("name = \"Ada\"", [["name", "String"]])).toBe("name.equals(\"Ada\")");
        expect(ex("aktuell.getNachname() = n")).toBe("aktuell.getNachname() == n");
        expect(ex("a mod 2 · 3")).toBe("a % 2 * 3");
        expect(ex("entnimm Element aus s", [["s", "Stack"], ["s#elem", "char"]])).toBe("(char) s.pop()");
        expect(ex("erstes Element von q", [["q", "Queue"]])).toBe("q.head()");
        expect(ex("Element an Position 0 von f", [["f", "DynArray"], ["f#elem", "Pixel"]])).toBe("(Pixel) f.getItem(0)");
        expect(ex("nimm irgendwas")).toBeUndefined();
        expect(javaType("Stapel vom Inhaltstyp Zeichen")).toBe("Stack");
    });

    test("Beispiel 2 der Hinweise: Stapel, ASCII-Wert, Kommentar in der Bedingung", () => {
        const d = doc("anzahlZeichen(s: Stapel vom Inhaltstyp Zeichen): stat. Reihung vom Inhaltstyp Ganzzahl", [
            stmt("anzahl ← stat. Reihung der Länge 27 vom Inhaltstyp Ganzzahl"),
            {
                id: newId(), kind: "loop", head: "solange s nicht leer", body: [
                    stmt("v ← entnimm Element aus s"),
                    stmt("w ← ASCII-Wert von v"),
                    { id: newId(), kind: "if", cond: "w = 32  // v ist ein Leerzeichen", yes: [stmt("erhöhe anzahl[0] um 1")], no: [stmt("erhöhe anzahl[w-64] um 1")] },
                ],
            },
            stmt("gib anzahl zurück"),
        ]);
        const out = docToJava(d);
        expect(out.code).toBe(lines(
            "int[] anzahlZeichen(Stack s) {",
            "    int[] anzahl = new int[27];",
            "    while (!s.isEmpty()) {",
            "        char v = (char) s.pop();",
            "        int w = (int) v;",
            "        if (w == 32) { // v ist ein Leerzeichen",
            "            anzahl[0]++;",
            "        } else {",
            "            anzahl[w - 64]++;",
            "        }",
            "    }",
            "    return anzahl;",
            "}",
        ));
        expect(out.todos).toBe(0);
    });

    test("Beispiel 3: dynamische Reihung, wiederhole, ist gleich, wiederhole bis", () => {
        const d = doc("erzeugePixel(): dynamische Reihung vom Inhaltstyp Pixel", [
            stmt("f ← leere dynamische Reihung vom Inhaltstyp Pixel"),
            { id: newId(), kind: "loop", head: "solange f nicht leer", body: [stmt("lösche Element an Position 0 von f")] },
            stmt("anzahlRot ← 0"),
            {
                id: newId(), kind: "footloop", foot: "wiederhole bis anzahlRot > 30", body: [
                    stmt("z ← ganzzahlige Zufallszahl zwischen 1 und 4"),
                    {
                        id: newId(), kind: "switch", subject: "z ist gleich",
                        cases: [{ label: "1", body: [stmt("p ← erzeuge Pixel(255,0,0)"), stmt("anzahlRot ← anzahlRot + 1")] }, { label: "2", body: [stmt("p ← erzeuge Pixel(0,255,0)")] }],
                        other: [],
                    },
                    stmt("füge p zu f hinzu"),
                ],
            },
            stmt("gib f zurück"),
        ]);
        expect(docToJava(d).code).toBe(lines(
            "DynArray erzeugePixel() {",
            "    DynArray f = new DynArray();",
            "    while (!f.isEmpty()) {",
            "        f.delete(0);",
            "    }",
            "    int anzahlRot = 0;",
            "    do {",
            "        int z = Random.randint(1, 4);",
            "        switch (z) {",
            "            case 1:",
            "                Pixel p = new Pixel(255, 0, 0);",
            "                anzahlRot = anzahlRot + 1;",
            "                break;",
            "            case 2:",
            "                p = new Pixel(0, 255, 0);",
            "                break;",
            "            default:",
            "        }",
            "        f.append(p);",
            "    } while (anzahlRot <= 30);",
            "    return f;",
            "}",
        ));
    });

    test("hin und zurück: Java -> Struktogramm -> Java (gleicher Code, gleiche Ausgabe)", async () => {
        const java = lines(
            "boolean istEnthalten(ArrayList<Integer> d, int v) {",
            "    for (Integer e : d) {",
            "        if (e == v) {",
            "            return true;",
            "        }",
            "    }",
            "    return false;",
            "}",
        );
        expect(docToJava(docFromDiagram(diagramsFromJava(java)[0])).code).toBe(java);

        const main = lines(
            "int summe = 0;",
            "String text = \"Hallo\";",
            "for (int i = 0; i < text.length(); i++) {",
            "    summe += (int) text.charAt(i);",
            "}",
            "ArrayList<String> namen = new ArrayList<String>();",
            "namen.add(\"Ada\");",
            "namen.add(0, \"Bo\");",
            "int k = 10;",
            "while (k > 0 && !namen.isEmpty()) {",
            "    k -= 3;",
            "}",
            "for (int durchlauf = 1; durchlauf <= 3; durchlauf++) {",
            "    if (k % 2 == 0) {",
            "        println(\"gerade\");",
            "    } else if (k > 5) {",
            "        println(\"groß\");",
            "    } else {",
            "        println(k + \" \" + summe);",
            "    }",
            "    k++;",
            "}",
            "println(namen.get(0) + \" \" + namen.size());",
        );
        const back = docToJava(docFromDiagram(diagramsFromJava(main)[0]));
        expect(back.todos).toBe(0);
        const [a, b] = [await runJava(main), await runJava(back.code)];
        expect(b.errors).toEqual([]);
        expect(b.output).toBe(a.output);
    });

    test("Hinweis: wird erkannt oder wird TODO", () => {
        expect(isRecognized("stmt", "x ← 0")).toBe(true);
        expect(isRecognized("stmt", "v ← nimm irgendwas")).toBe(false);
        expect(isRecognized("loop", "für i von 1 bis 10")).toBe(true);
        expect(isRecognized("loop", "solange es regnet")).toBe(false);
        expect(isRecognized("if", "e = v")).toBe(true);
        expect(isRecognized("stmt", "// nur ein Kommentar")).toBe(true);
    });
});
