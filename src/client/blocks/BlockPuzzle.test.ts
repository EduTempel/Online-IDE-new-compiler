import { expect, test } from "vitest";
import "../../compiler/common/interpreter/Interpreter";
import "../../compiler/java/JavaCompiler";
import { checkPuzzle, puzzleLines, puzzleMessage, puzzleSolution, scramble, setPuzzleSolution } from "./BlockPuzzle";
import { JavaBlockParser } from "./JavaBlockParser";
import { JavaBlockGenerator } from "./JavaBlockGenerator";

const SOLUTION = [
    "int summe = 0;",
    "for (int i = 1; i <= 10; i++) {",
    "    if (i % 2 == 0) {",
    "        summe += i;",
    "    } else {",
    "        println(\"ungerade: \" + i);",
    "    }",
    "}",
    "println(\"Summe: \" + summe);",
    "",
    "int quadrat(int x) {",
    "    int q = x * x;",
    "    return q;",
    "}",
    "",
].join("\n");

/** gleichbleibende „Zufallszahlen“ für reproduzierbare Tests */
function seeded(seed: number) {
    return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}

test("Puzzle: Anweisungen gemischt, Schleifen und Verzweigungen leer, Code bleibt gültig", () => {
    const parsed = JavaBlockParser.parse(SOLUTION).state;
    const code = JavaBlockGenerator.generate(scramble(parsed, seeded(42))).code;
    expect(code).not.toBe(SOLUTION);
    // jede Anweisung steht noch da (ohne Einrückung), Schleife und Verzweigung sind leer
    const trimmed = (c: string) => puzzleLines(c).map((l) => l.trim().replace(/\{$/, "").trim()).sort();
    expect(trimmed(code)).toEqual(trimmed(SOLUTION));
    expect(code).toMatch(/for \(int i = 1; i <= 10; i\+\+\) \{\s*\}/);
    // gemischter Code lässt sich wieder als Blöcke lesen (nichts fällt als Java-Text heraus)
    const again = JavaBlockParser.parse(code).state;
    expect(JSON.stringify(again)).not.toContain("j_java_stmt");
    expect(JavaBlockGenerator.generate(again).code).toBe(code);
    // die Operation behält ihre Anweisungen
    expect(code).toMatch(/int quadrat\(int x\) \{\n( {4}.*\n){2}\}/);
});

test("Puzzle prüfen: richtig nur in Reihenfolge und Einrückung der Lösung", () => {
    expect(checkPuzzle(SOLUTION, SOLUTION)).toEqual({ correct: true, right: 9, total: 9 });
    const code = JavaBlockGenerator.generate(scramble(JavaBlockParser.parse(SOLUTION).state, seeded(7))).code;
    const r = checkPuzzle(code, SOLUTION);
    expect(r.correct).toBe(false);
    expect(r.right).toBeLessThan(r.total);
    expect(puzzleMessage(r)).toMatch(/von 9 Blöcken stehen schon richtig/);
    // eine Anweisung zu wenig eingerückt (außerhalb der Schleife): nicht richtig
    const wrong = SOLUTION.replace("        summe += i;", "summe += i;");
    expect(checkPuzzle(wrong, SOLUTION)).toMatchObject({ correct: false, right: 8 });
    expect(puzzleMessage(checkPuzzle(SOLUTION, SOLUTION))).toMatch(/Richtig/);
});

test("Lösung in den Projekteinstellungen (auch mit Umlauten), Aufheben entfernt sie", () => {
    const settings: Record<string, unknown> = { libraries: [] };
    setPuzzleSolution(settings, "Würfel.java", "println(\"größer\");\n");
    expect(JSON.stringify(settings)).not.toContain("größer");
    expect(puzzleSolution(settings, "Würfel.java")).toBe("println(\"größer\");\n");
    expect(puzzleSolution(settings, "Andere.java")).toBeUndefined();
    setPuzzleSolution(settings, "Würfel.java", undefined);
    expect(settings).toEqual({ libraries: [] });
});
