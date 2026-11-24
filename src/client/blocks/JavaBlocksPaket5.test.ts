import { describe, expect, test } from "vitest";
// Ladereihenfolge der Compiler-Module wie in der IDE (sonst zyklische Importe)
import "../../compiler/common/interpreter/Interpreter";
import "../../compiler/java/JavaCompiler";
import { JavaBlockParser } from "./JavaBlockParser";
import { JavaBlockGenerator } from "./JavaBlockGenerator";
import { B, type BlockState } from "./BlockTypes";
import { runJava } from "./RunJava";

const NL = String.fromCharCode(10);
const lines = (...l: string[]) => l.join(NL) + NL;
const roundTrip = (code: string) => JavaBlockGenerator.generate(JavaBlockParser.parse(code).state).code;
const noJavaText = (code: string) => expect(JSON.stringify(JavaBlockParser.parse(code).state)).not.toMatch(/j_java_(expr|stmt|raw)/);
const types = (code: string) => {
    const result: string[] = [];
    const visit = (b: BlockState | undefined) => {
        for (; b; b = b.next?.block) {
            result.push(b.type);
            for (const i of Object.values(b.inputs ?? {})) visit(i.block);
        }
    };
    for (const top of JavaBlockParser.parse(code).state.blocks.blocks) visit(top);
    return new Set(result);
};

export const ARRAYS = lines(
    "int[] zahlen = new int[5];",
    "String[] namen = {\"Ada\", \"Bo\", \"Cem\"};",
    "zahlen[0] = 3;",
    "zahlen[zahlen.length - 1] = zahlen[0] * 2;",
    "println(zahlen.length + \" \" + zahlen[4] + \" \" + namen[1].length());",
    "for (String name : namen) {",
    "    print(name);",
    "}",
    "println(\"!\");",
    "int[][] feld = new int[3][4];",
    "feld[1][2] = 7;",
    "println(feld.length + \" \" + feld[0].length + \" \" + feld[1][2]);",
    "for (int[] zeile : feld) {",
    "    for (int wert : zeile) {",
    "        print(wert);",
    "    }",
    "}",
    "println(\"!\");",
);

export const LISTS = lines(
    "Liste<Integer> liste = new Liste<>();",
    "liste.add(3);",
    "liste.add(0, 9);",
    "liste.set(1, 4);",
    "println(liste.get(0) + liste.get(1));",
    "println(liste.size() + \" \" + liste.contains(4) + \" \" + liste.isEmpty());",
    "liste.remove(0);",
    "int i = 0;",
    "while (i < liste.size()) {",
    "    println(liste.get(i));",
    "    i++;",
    "}",
    "Liste<String> woerter = new Liste<>();",
    "woerter.add(\"Hallo\");",
    "println(woerter.get(0).length());",
);

export const DYN = lines(
    "DynArray<Integer> d = new DynArray<>();",
    "d.append(3);",
    "d.append(4);",
    "d.insertAt(0, 5);",
    "d.setItem(1, 7);",
    "println(d.getItem(0) + \" \" + d.getLength() + \" \" + d.isEmpty());",
    "int x = d.getItem(0);",
    "println(x + 1);",
    "d.delete(0);",
    "for (Integer o : d) {",
    "    println(o);",
    "}",
);

describe("Paket 5: Reihungen und Listen", () => {

    test("Reihungen (auch zweidimensional): Blöcke, unverändert zurück, läuft", async () => {
        expect(roundTrip(ARRAYS)).toBe(ARRAYS);
        noJavaText(ARRAYS);
        const t = types(ARRAYS);
        for (const b of [B.arrayNew, B.arrayValues, B.arraySet, B.arrayGet, B.arrayLength, B.array2dNew, B.array2dSet, B.array2dGet, B.array2dSize, B.forEach]) {
            expect(t.has(b), b).toBe(true);
        }
        const r = await runJava(ARRAYS);
        expect(r.errors).toEqual([]);
        expect(r.output).toBe(lines("5 6 2", "AdaBoCem!", "3 4 7", "000000700000!"));
    });

    test("Liste: Blöcke, unverändert zurück, läuft", async () => {
        expect(roundTrip(LISTS)).toBe(LISTS);
        noJavaText(LISTS);
        const t = types(LISTS);
        for (const b of [B.listNew, B.listAdd, B.listInsert, B.listSet, B.listGet, B.listSize, B.listContains, B.collIsEmpty, B.listRemove]) {
            expect(t.has(b), b).toBe(true);
        }
        const r = await runJava(LISTS);
        expect(r.errors).toEqual([]);
        expect(r.output).toBe(lines("13", "2 true false", "4", "5"));
    });

    test("24.11.2026: kein „für jedes Element“ über Listen – bleibt Java-Text, unverändert, läuft; im Struktogramm weiter", async () => {
        const code = lines(
            "Liste<Integer> zahlen = new Liste<>();",
            "zahlen.add(3);",
            "zahlen.add(5);",
            "for (Integer z : zahlen) {",
            "    println(z);",
            "}",
        );
        const t = types(code);
        expect(t.has(B.forEach)).toBe(false);
        expect(t.has(B.javaRaw) || t.has(B.javaStatement)).toBe(true);
        expect(roundTrip(code)).toBe(code);
        expect((await runJava(code)).output).toBe(lines("3", "5"));
        expect(JSON.stringify(JavaBlockParser.parse(code, { structogram: true }).state)).toContain(B.forEach);
        // für Reihungen und dynamische Reihungen bleibt der Block
        expect(types(lines("int[] a = {1, 2};", "for (int x : a) {", "    println(x);", "}")).has(B.forEach)).toBe(true);
    });

    test("DynArray (Abitur Niedersachsen): Blöcke, unverändert zurück, läuft", async () => {
        expect(roundTrip(DYN)).toBe(DYN);
        noJavaText(DYN);
        const t = types(DYN);
        for (const b of [B.dynNew, B.dynAppend, B.dynInsert, B.dynSet, B.dynGet, B.dynLength, B.dynIsEmpty, B.dynDelete, B.forEach]) {
            expect(t.has(b), b).toBe(true);
        }
        const r = await runJava(DYN, ["niedersachsen"]);
        expect(r.errors).toEqual([]);
        expect(r.output).toBe(lines("5 3 false", "6", "7", "4"));
    });

    test("Listen und dynamische Reihungen sind getrennte Blöcke (auch bei isEmpty)", () => {
        const t = types(lines("Liste<Integer> l = new Liste<>();", "DynArray<String> d = new DynArray<>();", "println(l.isEmpty() + \" \" + d.isEmpty());"));
        expect(t.has(B.collIsEmpty)).toBe(true);
        expect(t.has(B.dynIsEmpty)).toBe(true);
    });

    test("Liste braucht einen Inhaltstyp; ältere Programme mit ArrayList werden zur Liste (22.11.2026)", async () => {
        const roh = await runJava("Liste l = new Liste<>();");
        expect(roh.errors.join(" ")).toContain("Gib den Inhaltstyp an: Liste<…>");
        const alt = lines(
            "ArrayList<Integer> l = new ArrayList<Integer>();",
            "l.add(4);",
            "l.add(5);",
            "println(summe(l));",
            "",
            "int summe(ArrayList<Integer> z) {",
            "    int s = 0;",
            "    for (Integer x : z) {",
            "        s += x;",
            "    }",
            "    return s;",
            "}",
        );
        const neu = roundTrip(alt);
        expect(neu).toBe(alt.replace("ArrayList<Integer> l = new ArrayList<Integer>();", "Liste<Integer> l = new Liste<>();").replace("summe(ArrayList<Integer> z)", "summe(Liste<Integer> z)"));
        const r = await runJava(neu);
        expect(r.errors).toEqual([]);
        expect(r.output).toBe(lines("9"));
    });

    test("eine eigene Klasse Liste überdeckt die Liste aus der Bibliothek", async () => {
        const code = lines(
            "Liste l = new Liste();",
            "l.anhaengen(3);",
            "println(l.anzahl);",
            "",
            "class Liste {",
            "    int anzahl = 0;",
            "",
            "    void anhaengen(int x) {",
            "        anzahl++;",
            "    }",
            "}",
        );
        const r = await runJava(code);
        expect(r.errors).toEqual([]);
        expect(r.output).toBe(lines("1"));
        expect(roundTrip(code)).toBe(code);
        expect(types(code).has(B.listNew)).toBe(false);
        const generisch = await runJava(lines("Liste<String> l = new Liste<>();", "l.add(\"x\");", "println(l.get(0));", "", "class Liste<T> {", "    T e;", "    void add(T x) { e = x; }", "    T get(int i) { return e; }", "}"));
        expect(generisch.errors).toEqual([]);
        expect(generisch.output).toBe(lines("x"));
    });

    test("Schreibweisen werden vereinheitlicht", () => {
        expect(roundTrip(lines("int[] a = new int[]{1, 2};", "ArrayList<Double> l = new ArrayList<>();")))
            .toBe(lines("int[] a = {1, 2};", "Liste<Double> l = new Liste<>();"));
    });

    test("Reihungen in Operationen sind dort bekannt, nicht im Hauptprogramm", () => {
        const code = lines(
            "println(a[0]);",
            "",
            "void f() {",
            "    int[] a = {1};",
            "    println(a[0]);",
            "}",
        );
        expect(roundTrip(code)).toBe(code);
        const main = JavaBlockParser.parse(code).state.blocks.blocks[0].inputs!.BODY.block;
        expect(main.inputs!.VALUE.block.type).toBe(B.javaExpression);   // a ist im Hauptprogramm unbekannt
    });

    test("Nicht darstellbares bleibt Java-Text", () => {
        const code = lines(
            "int[][] m = {{1, 2}, {3, 4}};",
            "ArrayList<int[]> x = new ArrayList<>();",
            "for (double z : zahlen) {",
            "}",
        );
        expect(roundTrip(code)).toBe(code);
        expect([...types(code)].every((t) => t === B.start || t.startsWith("j_java"))).toBe(true);
    });
});
