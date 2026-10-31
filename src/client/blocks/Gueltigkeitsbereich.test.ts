import { describe, expect, test } from "vitest";
import "../../compiler/common/interpreter/Interpreter";
import "../../compiler/java/JavaCompiler";
import * as Blockly from "blockly/core";
import { defineBlocks } from "./BlockDefinitions";
import { JavaBlockParser } from "./JavaBlockParser";
import { applyTypes, mainProgramVariables, scopeProblem, shadowProblem, visibleVariables } from "./BlockTypeSystem";
import { B } from "./BlockTypes";
import { BLOCK_HANDBOOK } from "../handbook/HandbookBlocks";
import { findDeclaration, scopeOf } from "./BlockScope";

/** Paket 16a/16b: Variablen gelten wie in Java nur in ihrem Gültigkeitsbereich */

defineBlocks();

const lines = (...l: string[]) => l.join("\n") + "\n";

function load(code: string) {
    const ws = new Blockly.Workspace();
    Blockly.serialization.workspaces.load(JavaBlockParser.parse(code).state, ws);
    applyTypes(ws);
    return ws;
}
const warning = (b: Blockly.Block) => (b as Blockly.Block & { gsgTypeWarning?: string }).gsgTypeWarning ?? "";
const options = (b: Blockly.Block, field: string) => (b.getField(field) as Blockly.FieldDropdown).getOptions(false).map((o) => o[1]);
const gets = (ws: Blockly.Workspace, name: string) => ws.getAllBlocks(true).filter((b) => b.type === B.varGet && b.getFieldValue("NAME") === name);
/** Meldungen zum Gültigkeitsbereich (andere Warnungen bleiben außen vor) */
const SCOPE_TEXT = /angelegt|gilt nur|kennt|verdeckt|schon ein Parameter/;

const LOOP = lines(
    "int summe = 0;",
    "for (int i = 1; i <= 3; i++) {",
    "    int quadrat = i * i;",
    "    summe += quadrat;",
    "}",
    "println(summe);",
    "println(quadrat);",
    "println(i);",
);

describe("Variablen gelten ab ihrer Deklaration bis zum Ende der Klammer", () => {
    test("in der Schleife: alle; nach der Schleife: nur die äußeren", () => {
        const ws = load(LOOP);
        const change = ws.getAllBlocks(true).find((b) => b.type === B.varChange)!;
        expect([...visibleVariables(change).keys()].sort()).toEqual(["i", "quadrat", "summe"]);
        expect(options(change, "NAME")).toEqual(["i", "quadrat", "summe"]);
        const after = gets(ws, "summe").at(-1)!;
        expect([...visibleVariables(after).keys()]).toEqual(["summe"]);
        expect(options(after, "NAME")).toEqual(["summe"]);
    });

    test("Warnung mit Erklärung, wo die Variable angelegt wurde", () => {
        const ws = load(LOOP);
        expect(warning(gets(ws, "quadrat").at(-1)!)).toContain("„quadrat“ wurde in „wiederhole für …“ angelegt und gilt nur bis zum Ende dieser Klammer");
        expect(warning(gets(ws, "i").at(-1)!)).toContain("„i“ ist die Variable der Schleife");
        // innerhalb der Schleife keine Warnungen
        for (const b of gets(ws, "i").slice(0, -1)) expect(warning(b)).toBe("");
        expect(warning(gets(ws, "quadrat")[0])).toBe("");
        expect(warning(gets(ws, "summe").at(-1)!)).toBe("");
    });

    test("vor der Deklaration und im eigenen Startwert", () => {
        const ws = load(lines("println(x);", "int x = 1;", "int y = y + 1;"));
        expect(warning(gets(ws, "x")[0])).toContain("„x“ wird erst weiter unten angelegt");
        expect(warning(gets(ws, "y")[0])).toContain("im Startwert kann sie noch nicht vorkommen");
        expect(scopeProblem(gets(ws, "x")[0], "x")).toBeDefined();
    });

    test("in einem „falls“-Zweig angelegt", () => {
        const ws = load(lines("int a = 3;", "if (a > 2) {", "    int b = 4;", "}", "println(b);"));
        expect(warning(gets(ws, "b")[0])).toContain("in „falls …“ angelegt");
    });

    test("innere Variable mit gleichem Namen in getrennten Schleifen: kein Konflikt", () => {
        const ws = load(lines(
            "for (int i = 0; i < 2; i++) {", "    String t = \"a\";", "    println(t);", "}",
            "for (int i = 0; i < 2; i++) {", "    int t = 1;", "    println(t);", "}"));
        const [first, second] = gets(ws, "t");
        expect(visibleVariables(first).get("t")).toBe("String");
        expect(visibleVariables(second).get("t")).toBe("int");
        expect(ws.getAllBlocks(false).map(warning).filter((w) => SCOPE_TEXT.test(w))).toEqual([]);
    });

    test("nirgends angelegt", () => {
        const ws = load(lines("println(gibtsnicht);"));
        expect(warning(gets(ws, "gibtsnicht")[0])).toContain("ist nirgends angelegt");
    });
});

describe("Operationen und Programmteile", () => {
    const PROGRAM = lines(
        "int punkte = 0;",
        "while (punkte < 10) {",
        "    int schritt = 1;",
        "    punkte += schritt;",
        "}",
        "",
        "void zeige(int wert) {",
        "    println(wert);",
        "    println(punkte);",
        "}",
        "",
        "@WennTaste(\"a\")",
        "void taste() {",
        "    punkte++;",
        "    println(schritt);",
        "}",
    );

    test("Parameter gelten in der ganzen Operation; Programmteile sehen die äußersten Variablen des Hauptprogramms", () => {
        const ws = load(PROGRAM);
        expect([...mainProgramVariables(ws).keys()]).toEqual(["punkte"]);
        expect(warning(gets(ws, "wert")[0])).toBe("");
        const inc = ws.getAllBlocks(true).find((b) => b.getRootBlock().type === B.keyStart && b.getFieldValue("NAME") === "punkte")!;
        expect(warning(inc)).toBe("");
        expect(options(inc, "NAME")).toEqual(["punkte"]);
    });

    test("Operation kennt die Variablen des Hauptprogramms nicht; Programmteil keine verschachtelten", () => {
        const ws = load(PROGRAM);
        const inMethod = gets(ws, "punkte").find((b) => b.getRootBlock().type === B.method)!;
        expect(warning(inMethod)).toContain("„punkte“ ist eine Variable des Hauptprogramms. In Java kennt diese Operation sie nicht");
        expect(warning(inMethod)).toContain("Übergib den Wert als Parameter");
        const inPart = gets(ws, "schritt").find((b) => b.getRootBlock().type === B.keyStart)!;
        expect(warning(inPart)).toContain("Programmteile kennen nur Variablen, die im Hauptprogramm ganz außen");
    });
});

describe("Handbuch-Beispiele", () => {
    const entries = BLOCK_HANDBOOK.flatMap((s) => s.entries.map((e) => ({ section: s.id, ...e })));
    test.each(entries.map((e) => [`${e.section}: ${e.title}`, e] as const))("%s: keine Warnung zum Gültigkeitsbereich", (_, e) => {
        // Übung „Finde den Fehler“: die Lösung ohne Warnung, das fehlerhafte Programm mit
        const ws = load(e.solution?.code ?? e.code);
        const problems = ws.getAllBlocks(false).map(warning).filter((w) => SCOPE_TEXT.test(w));
        expect(problems).toEqual([]);
        if (e.solution) expect(load(e.code).getAllBlocks(false).map(warning).filter((w) => SCOPE_TEXT.test(w)).length).toBeGreaterThan(0);
    });

    test("es gibt Übungen „Finde den Fehler“", () => {
        expect(entries.filter((e) => e.solution).length).toBeGreaterThanOrEqual(2);
    });
});

describe("Gültigkeitsbereich anzeigen (16c)", () => {
    test("lokale Variable in der Schleife: ab der Deklaration, Verwendungen nur darin", () => {
        const ws = load(LOOP);
        const scope = scopeOf(gets(ws, "quadrat")[0])!;
        expect(scope.declaration.kind).toBe("local");
        expect(scope.declaration.block.type).toBe(B.varDeclare);
        expect(scope.regions).toHaveLength(1);
        expect(scope.regions[0]).toMatchObject({ block: scope.declaration.block, withFollowing: true });
        // die Verwendung nach der Schleife gehört nicht dazu
        expect(scope.uses).toEqual([gets(ws, "quadrat")[0]]);
    });

    test("Zählvariable: die Schleife; äußere Variable des Hauptprogramms: auch alle Programmteile", () => {
        const ws = load(LOOP);
        const i = scopeOf(gets(ws, "i")[0])!;
        expect(i.declaration.kind).toBe("loop");
        expect(i.regions[0]).toMatchObject({ block: i.declaration.block, withFollowing: false });
        const ws2 = load(lines("int punkte = 0;", "println(punkte);", "", "@WennTaste(\"a\")", "void taste() {", "    punkte++;", "}"));
        const decl = ws2.getAllBlocks(true).find((b) => b.type === B.varDeclare)!;
        const scope = scopeOf(decl)!;
        expect(scope.declaration.kind).toBe("main");
        expect(scope.regions.map((r) => r.block.type)).toEqual([B.varDeclare, B.keyStart]);
        expect(scope.uses).toHaveLength(2);
    });

    test("Parameter: die ganze Operation; innere Variable verdeckt äußere", () => {
        const ws = load(lines("void zeige(int wert) {", "    println(wert);", "}", "", "int x = 1;", "for (int k = 0; k < 2; k++) {", "    println(x);", "}"));
        const p = scopeOf(gets(ws, "wert")[0])!;
        expect(p.declaration.kind).toBe("param");
        expect(p.declaration.block.type).toBe(B.method);
        expect(findDeclaration(gets(ws, "x")[0], "x")?.block.type).toBe(B.varDeclare);
        expect(scopeOf(ws.getAllBlocks(true).find((b) => b.type === B.print)!)).toBeUndefined();   // kein Variablenblock
    });
});

describe("Gleicher Name noch einmal angelegt (wie in Java)", () => {
    const decls = (ws: Blockly.Workspace) => ws.getAllBlocks(true).filter((b) => b.type === B.varDeclare);

    test("in derselben Klammer, weiter außen, Parameter und Attribut", () => {
        const ws = load(lines(
            "int x = 1;",
            "int x = 2;",
            "for (int k = 0; k < 2; k++) {",
            "    int x = 3;",
            "}",
            "",
            "void zeige(int wert) {",
            "    int wert = 2;",
            "}",
            "",
            "class Konto {",
            "    int stand;",
            "    void f() {",
            "        int stand = 1;",
            "    }",
            "}"));
        const texts = decls(ws).map((d) => shadowProblem(d) ?? "");
        expect(texts[0]).toBe("");
        expect(texts[1]).toContain("„x“ gibt es hier schon");
        expect(texts.find((t) => t.includes("von weiter außen"))).toContain("Die Variable „x“ verdeckt");
        expect(texts.some((t) => t.includes("„wert“ ist schon ein Parameter"))).toBe(true);
        expect(texts.some((t) => t.includes("verdeckt das Attribut „stand“"))).toBe(true);
    });

    test("getrennte Schleifen mit derselben Variablen: keine Warnung", () => {
        const ws = load(lines(
            "for (int i = 0; i < 2; i++) {", "    int t = 1;", "}",
            "for (int i = 0; i < 2; i++) {", "    int t = 2;", "}"));
        expect(ws.getAllBlocks(false).map((b) => shadowProblem(b)).filter(Boolean)).toEqual([]);
    });
});

describe("Attribute: Gültigkeitsbereich ist die ganze Klasse", () => {
    test("Kasten um die Klasse", () => {
        const ws = load(lines("Konto k = new Konto();", "class Konto {", "    int stand;", "    void f() {", "        println(stand);", "    }", "}"));
        const use = gets(ws, "stand")[0];
        const scope = scopeOf(use)!;
        expect(scope.declaration.kind).toBe("attribute");
        expect(scope.regions[0].block.type).toBe(B.class);
        expect(scope.uses).toEqual([use]);
    });
});

describe("Meldung nennt, wohin die Variable gehört", () => {
    test("Variable einer anderen Operation bzw. eines Konstruktors", () => {
        const ws = load(lines(
            "zeige();",
            "",
            "void zeige() {",
            "    int doppelt = 2;",
            "}",
            "",
            "void rechne() {",
            "    println(doppelt);",
            "}",
            "",
            "class Konto {",
            "    Konto() {",
            "        int start = 1;",
            "    }",
            "    void f() {",
            "        println(start);",
            "    }",
            "}"));
        expect(warning(gets(ws, "doppelt")[0])).toBe("„doppelt“ gehört zur Operation „zeige“. Jede Operation hat ihre eigenen Variablen – diese Operation kennt „doppelt“ nicht. Übergib den Wert als Parameter oder lege hier eine eigene Variable an.");
        expect(warning(gets(ws, "start")[0])).toContain("„start“ gehört zum Konstruktor der Klasse „Konto“.");
    });
});
