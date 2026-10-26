import { describe, expect, test } from "vitest";
import * as Blockly from "blockly/core";
import { registerBlockImageMenu } from "./BlockImage";

type Action = {
    scopeType: string;
    displayText: unknown;
    preconditionFn: (scope: Blockly.ContextMenuRegistry.Scope, e: Event) => string;
};

describe("Blöcke als Bild speichern (Rechtsklick)", () => {
    test("Einträge für Arbeitsfläche und Block, nur einmal angemeldet", () => {
        registerBlockImageMenu(() => "Test.java");
        registerBlockImageMenu(() => "Test.java");   // zweite Blockansicht: keine doppelte Anmeldung
        const registry = Blockly.ContextMenuRegistry.registry;
        const ws = registry.getItem("gsg_save_image_workspace") as unknown as Action;
        const block = registry.getItem("gsg_save_image_block") as unknown as Action;
        expect(ws.scopeType).toBe(Blockly.ContextMenuRegistry.ScopeType.WORKSPACE);
        expect(ws.displayText).toContain("als Bild speichern");
        expect(block.scopeType).toBe(Blockly.ContextMenuRegistry.ScopeType.BLOCK);
        // in der Werkzeugleiste (Flyout) nicht anbieten
        expect(block.preconditionFn({ block: { isInFlyout: true } as never }, new Event("contextmenu"))).toBe("hidden");
        expect(ws.preconditionFn({ workspace: { isFlyout: false, getTopBlocks: () => [] } as never }, new Event("contextmenu"))).toBe("hidden");
    });
});
