import { describe, expect, test } from "vitest";
import "../../compiler/common/interpreter/Interpreter";
import "../../compiler/java/JavaCompiler";
import * as Blockly from "blockly/core";
import { defineBlocks } from "./BlockDefinitions";
import { withoutJavaHints } from "./BlockMutators";
import { JavaBlockParser } from "./JavaBlockParser";
import { B } from "./BlockTypes";
import { GAME } from "./JavaBlocksPaket8.test";
import { ADT } from "./JavaBlocksAdt.test";

defineBlocks();

describe("Aussehen der Blöcke", () => {
    test("Java-Schnipsel: aus der Beschriftung entfernt, im Tooltip", () => {
        const [d] = withoutJavaHints([{
            type: "x", message0: "bewege %1 um ( %2 | %3 ) %4",
            args0: [{ type: "field_input", name: "N" }, { type: "input_value", name: "A" }, { type: "input_value", name: "B" },
                { type: "field_label", text: ".move", class: "gsg-java-hint" }],
            tooltip: "Verschiebt die Figur.",
        }]);
        expect(d.message0).toBe("bewege %1 um ( %2 | %3 )");
        expect((d.args0 as unknown[]).length).toBe(3);
        expect(d.tooltip).toBe("Verschiebt die Figur.\nJava: .move");

        const [only] = withoutJavaHints<Record<string, unknown>>([{ type: "y", message0: "dieses Objekt %1", args0: [{ type: "field_label", text: "this", class: "gsg-java-hint" }] }]);
        expect(only.message0).toBe("dieses Objekt");
        expect(only.args0).toBeUndefined();
        expect(only.tooltip).toBe("Java: this");
    });

    test("in echten Blöcken ist kein Java-Schnipsel sichtbar", () => {
        const ws = new Blockly.Workspace();
        const code = GAME + ADT + "if (true) {\n    println(1);\n} else {\n    println(2);\n}\n";
        Blockly.serialization.workspaces.load(JavaBlockParser.parse(code).state, ws);
        const visibleTexts = ws.getAllBlocks(false).flatMap((b) => b.inputList.filter((i) => i.isVisible())
            .flatMap((i) => i.fieldRow.filter((f) => f.isVisible()).map((f) => f.getText())));
        for (const java of [".move", "new Circle", "Input.isKeyDown", ".push", "if", "else", "main", ".setFillColor"]) {
            expect(visibleTexts, java).not.toContain(java);
        }
        const move = ws.getAllBlocks(false).find((b) => b.type === B.figMove)!;
        expect(String(move.getTooltip())).toContain("Java: .move");
    });
});
