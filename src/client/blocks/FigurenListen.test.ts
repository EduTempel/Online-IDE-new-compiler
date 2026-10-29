import { describe, expect, test } from "vitest";
// Ladereihenfolge der Compiler-Module wie in der IDE (sonst zyklische Importe)
import "../../compiler/common/interpreter/Interpreter";
import "../../compiler/java/JavaCompiler";
import { JavaBlockParser } from "./JavaBlockParser";
import { JavaBlockGenerator } from "./JavaBlockGenerator";
import { B, type BlockState } from "./BlockTypes";
import { compileJava } from "./RunJava";
import { diagramsFromJava } from "../structogram/StructogramModel";
import { figureText, listMonitor } from "../stage/StageVariableTracker";

const NL = String.fromCharCode(10);
const lines = (...l: string[]) => l.join(NL) + NL;
const roundTrip = (code: string) => JavaBlockGenerator.generate(JavaBlockParser.parse(code).state).code;

function blocks(code: string): BlockState[] {
    const result: BlockState[] = [];
    const visit = (b: BlockState | undefined) => {
        for (; b; b = b.next?.block) {
            result.push(b);
            for (const i of Object.values(b.inputs ?? {})) visit(i.block);
        }
    };
    for (const top of JavaBlockParser.parse(code).state.blocks.blocks) visit(top);
    return result;
}

const CODE = lines(
    "ArrayList<Circle> münzen = new ArrayList<Circle>();",
    "Sprite figur = new Sprite(400, 300, SpriteLibrary.Ship_1, 0);",
    "for (int durchlauf = 1; durchlauf <= 10; durchlauf++) {",
    "    Circle münze = new Circle(Random.randint(20, 780), Random.randint(20, 580), 10);",
    "    münzen.add(münze);",
    "}",
    "int punkte = 0;",
    "while (punkte < 10) {",
    "    if (figur.collidesWithAnyOf(münzen)) {",
    "        for (Circle m : münzen) {",
    "            if (figur.collidesWith(m)) {",
    "                m.setVisible(false);",
    "                punkte++;",
    "            }",
    "        }",
    "    }",
    "    Thread.sleep(20);",
    "}",
);

describe("Paket 15e: viele Figuren in Listen", () => {
    test("Java -> Blöcke -> Java ohne Verlust, alles als echte Blöcke", async () => {
        const all = blocks(CODE);
        expect(JSON.stringify(all)).not.toMatch(/j_java_(expr|stmt|raw)/);
        expect(all.find((b) => b.type === B.listNew)?.fields).toEqual({ NAME: "münzen", TYPE: "Circle" });
        expect(all.find((b) => b.type === B.figTouchesList)?.fields).toEqual({ NAME: "figur", LIST: "münzen" });
        expect(all.some((b) => b.type === B.figTouches && b.fields?.OTHER === "m")).toBe(true);
        expect(roundTrip(CODE)).toBe(CODE);
        expect(await compileJava(CODE)).toEqual([]);
    });

    test("Struktogramm", () => {
        const text = JSON.stringify(diagramsFromJava(CODE)[0].body);
        expect(text).toContain("figur berührt eine Figur aus münzen");
        expect(text).toContain("für alle Elemente m aus münzen");
    });

    test("Variablen-Reiter: Figuren in Listen kurz mit Position und Zustand", () => {
        const fig = (cls: string, x: number, y: number, extra: object = {}) => ({
            getType: () => ({ identifier: cls }), _getCenterX: () => x, _getCenterY: () => y, container: { visible: true }, ...extra,
        });
        expect(figureText(fig("Circle", 120.4, 299.6))).toBe("Kreis bei (120 | 300)");
        expect(figureText(fig("Sprite", 1, 2, { container: { visible: false } }))).toBe("Sprite bei (1 | 2) – versteckt");
        expect(figureText(fig("Rectangle", 1, 2, { isDestroyed: true }))).toBe("Rechteck bei (1 | 2) – entfernt");
        expect(figureText(5)).toBeUndefined();
        const list = { getType: () => ({ identifier: "ArrayList" }), getElements: () => [fig("Circle", 10, 20), fig("Circle", 30, 40)] };
        expect(listMonitor(list)).toEqual({ items: ["Kreis bei (10 | 20)", "Kreis bei (30 | 40)"], length: 2 });
    });
});
