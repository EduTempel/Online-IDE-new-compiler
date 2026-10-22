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
    "ArrayList<Integer> liste = new ArrayList<Integer>();",
    "liste.add(3);",
    "liste.add(0, 9);",
    "liste.set(1, 4);",
    "println(liste.get(0) + liste.get(1));",
    "println(liste.size() + \" \" + liste.contains(4) + \" \" + liste.isEmpty());",
    "liste.remove(0);",
    "for (Integer z : liste) {",
    "    println(z);",
    "}",
    "ArrayList<String> woerter = new ArrayList<String>();",
    "woerter.add(\"Hallo\");",
    "println(woerter.get(0).length());",
);

export const DYN = lines(
    "DynArray d = new DynArray();",
    "d.append(3);",
    "d.append(\"Ada\");",
    "d.insertAt(0, 5);",
    "d.setItem(1, 7);",
    "println(d.getItem(0) + \" \" + d.getLength() + \" \" + d.isEmpty());",
    "int x = (int) d.getItem(0);",
    "println(x + 1);",
    "println(((String) d.getItem(2)).length());",
    "d.delete(0);",
    "for (Object o : d) {",
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

    test("ArrayList: Blöcke, unverändert zurück, läuft", async () => {
        expect(roundTrip(LISTS)).toBe(LISTS);
        noJavaText(LISTS);
        const t = types(LISTS);
        for (const b of [B.listNew, B.listAdd, B.listInsert, B.listSet, B.listGet, B.listSize, B.listContains, B.collIsEmpty, B.listRemove, B.forEach]) {
            expect(t.has(b), b).toBe(true);
        }
        const r = await runJava(LISTS);
        expect(r.errors).toEqual([]);
        expect(r.output).toBe(lines("13", "2 true false", "4", "5"));
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
        expect(r.output).toBe(lines("5 3 false", "6", "3", "7", "Ada"));
    });

    test("Listen und dynamische Reihungen sind getrennte Blöcke (auch bei isEmpty)", () => {
        const t = types(lines("ArrayList<Integer> l = new ArrayList<Integer>();", "DynArray d = new DynArray();", "println(l.isEmpty() + \" \" + d.isEmpty());"));
        expect(t.has(B.collIsEmpty)).toBe(true);
        expect(t.has(B.dynIsEmpty)).toBe(true);
    });

    test("Schreibweisen werden vereinheitlicht", () => {
        expect(roundTrip(lines("int[] a = new int[]{1, 2};", "ArrayList<Double> l = new ArrayList<>();")))
            .toBe(lines("int[] a = {1, 2};", "ArrayList<Double> l = new ArrayList<Double>();"));
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
