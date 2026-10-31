import { describe, expect, test } from "vitest";
import { evalPlan, needsProgram, problemText, typeName, valueText } from "./BlockValueBubble";
import type { BlockState } from "./BlockTypes";

/** Paket 17a: Werte-Block anklicken */

const num = (n: string): BlockState => ({ type: "j_number", fields: { NUM: n } });
const arith = (op: string, a: BlockState, b: BlockState): BlockState => ({ type: "j_arith", fields: { OP: op }, inputs: { A: { block: a }, B: { block: b } } });

describe("Was wird ausgewertet?", () => {
    test("Rechnung mit Vorrang: Klammern wie in Java", () => {
        const b = arith("*", arith("+", num("3"), num("4")), num("2"));
        expect(evalPlan(b, 4, 4)).toEqual({ code: "(3 + 4) * 2" });
    });

    test("Lücke im Block", () => {
        expect(evalPlan(arith("+", num("3"), num("4")), 2, 1)).toEqual({ problem: expect.stringContaining("fehlt noch ein Wert") });
    });

    test("Eingabe wird nicht abgefragt", () => {
        const b: BlockState = { type: "j_input", fields: { METHOD: "readInt" } };
        expect(evalPlan(b, 1, 1)).toEqual({ problem: expect.stringContaining("Eingaben") });
    });

    test("Variablen und Figuren brauchen das laufende Programm", () => {
        expect(needsProgram(arith("+", { type: "j_var_get", fields: { NAME: "x" } }, num("1")))).toBe(true);
        expect(needsProgram({ type: "j_fig_prop", fields: { FIG: "ball", PROP: "x" } })).toBe(true);
        expect(needsProgram(arith("/", num("7"), num("2")))).toBe(false);
        expect(needsProgram({ type: "j_random", inputs: { FROM: { block: num("1") }, TO: { block: num("6") } } })).toBe(false);
    });
});

describe("Anzeige", () => {
    test("Datentypen deutsch", () => {
        expect(typeName("int")).toBe("Ganzzahl");
        expect(typeName("double")).toBe("Kommazahl");
        expect(typeName("String")).toBe("Text");
        expect(typeName("Integer")).toBe("Ganzzahl");
        expect(typeName("Konto")).toBe("Konto");
    });

    test("Werte", () => {
        expect(valueText("true", "boolean")).toBe("wahr (true)");
        expect(valueText("\"Hallo\"", "String")).toBe("„Hallo“");
        expect(valueText("Hallo", "String")).toBe("„Hallo“");
        expect(valueText("3", "int")).toBe("3");
    });

    test("Division durch 0", () => {
        expect(problemText("ArithmeticException: / by zero")).toBe("Durch 0 kann man nicht teilen.");
    });
});
