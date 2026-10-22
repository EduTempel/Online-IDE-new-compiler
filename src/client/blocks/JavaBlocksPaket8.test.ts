import { describe, expect, test } from "vitest";
// Ladereihenfolge der Compiler-Module wie in der IDE (sonst zyklische Importe)
import "../../compiler/common/interpreter/Interpreter";
import "../../compiler/java/JavaCompiler";
import { JavaBlockParser } from "./JavaBlockParser";
import { JavaBlockGenerator } from "./JavaBlockGenerator";
import { B, type BlockState } from "./BlockTypes";
import { compileJava } from "./RunJava";

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

/** Spielschleife: Figuren, Tasten, Maus */
export const GAME = lines(
    "new World(800, 600).setBackgroundColor(\"black\");",
    "Circle ball = new Circle(400, 300, 30);",
    "Rectangle wand = new Rectangle(0, 550, 800, 20);",
    "Text anzeige = new Text(10, 10, 24, \"Punkte: 0\");",
    "Sprite figur = new Sprite(100, 100, SpriteLibrary.Ship_1, 0);",
    "ball.setFillColor(\"red\");",
    "wand.setFillColor(Color.randomColor());",
    "int punkte = 0;",
    "while (true) {",
    "    if (Input.isKeyDown(\"ArrowRight\")) {",
    "        ball.move(5, 0);",
    "    }",
    "    if (Input.isKeyDown(\" \")) {",
    "        figur.rotate(10);",
    "        figur.forward(3);",
    "    }",
    "    if (Mouse.wasClicked(ball) || Mouse.isOver(wand) && Mouse.wasClicked()) {",
    "        punkte++;",
    "        anzeige.setText(\"Punkte: \" + punkte);",
    "        ball.moveTo(Mouse.getX(), Mouse.getY());",
    "    }",
    "    if (ball.collidesWith(wand) || ball.isOutsideView()) {",
    "        ball.destroy();",
    "    }",
    "    if (Mouse.isDown()) {",
    "        figur.setImageIndex(1);",
    "        ball.scale(1.1);",
    "    }",
    "    if (ball.getCenterX() > 700) {",
    "        ball.setVisible(false);",
    "    }",
    "    Thread.sleep(20);",
    "}",
);

describe("Paket 8: Figuren, Tasten und Maus", () => {
    test("Spielschleife wird vollständig zu Blöcken und wieder zu demselben Java", () => {
        noJavaText(GAME);
        expect(roundTrip(GAME)).toBe(GAME);
        const t = types(GAME);
        for (const b of [B.worldNew, B.figCircle, B.figRect, B.figText, B.figSprite, B.figColor, B.keyDown, B.figMove, B.figRotate,
            B.figForward, B.mouseOver, B.mouseDown, B.figSetText, B.figMoveTo, B.mouseXY, B.figTouches, B.figOutside, B.figAction,
            B.figSetImage, B.figScale, B.figProp]) {
            expect(t.has(b), b).toBe(true);
        }
    });

    test("übersetzt ohne Fehler (auch die Klasse Mouse)", async () => {
        expect(await compileJava(GAME)).toEqual([]);
    });

    test("Unbekanntes bleibt erhalten", () => {
        const code = lines(
            "Circle c = new Circle(1, 2, 3);",
            "c.setBorderColor(\"blue\");",
            "c.setFillColor(\"#ff8800\");",
            "Rectangle r = new Rectangle(1, 2, 3);",
            "Circle d = new Circle(4, 5, 6) ;",
        );
        expect(roundTrip(code)).toBe(code.replace("6) ;", "6);"));
        const state = JSON.stringify(JavaBlockParser.parse(code).state);
        expect(state).toContain("#ff8800");   // eigene Farbe bleibt im Farbfeld
    });

    test("eigene Methode mit gleichem Namen auf eigener Klasse ist kein Figuren-Block", () => {
        const code = lines(
            "Auto a = new Auto();",
            "a.move(1, 2);",
            "",
            "class Auto {",
            "    void move(int x, int y) {",
            "    }",
            "}",
        );
        expect(types(code).has(B.figMove)).toBe(false);
        expect(roundTrip(code)).toBe(code);
    });
});

describe("Paket 8 im Struktogramm", () => {
    test("Figuren, Tasten und Maus werden verständlich beschrieben", async () => {
        const { diagramsFromJava } = await import("../structogram/StructogramModel");
        const text = JSON.stringify(diagramsFromJava(GAME));
        for (const phrase of ["Grafikfenster 800 × 600, Hintergrund schwarz", "ball ← neuer Kreis, Mittelpunkt (400 | 300), Radius 30",
            "Taste „Pfeil rechts →“ gedrückt", "bewege ball um (5 | 0)", "Mausklick auf ball", "ball berührt wand",
            "entferne ball", "verstecke ball", "x-Position (Mitte) von ball", "färbe ball rot"]) {
            expect(text, phrase).toContain(phrase);
        }
    });
});
