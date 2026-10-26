import { describe, expect, test } from "vitest";
import * as Blockly from "blockly/core";
import { canCopyImage, registerBlockImageMenu } from "./BlockImage";

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

    test("Als Bild kopieren (Zwischenablage): Einträge für Arbeitsfläche und Block", () => {
        registerBlockImageMenu(() => "Test.java");
        const registry = Blockly.ContextMenuRegistry.registry;
        const ws = registry.getItem("gsg_copy_image_workspace") as unknown as Action;
        const block = registry.getItem("gsg_copy_image_block") as unknown as Action;
        expect(ws.scopeType).toBe(Blockly.ContextMenuRegistry.ScopeType.WORKSPACE);
        expect(ws.displayText).toBe("Alle Blöcke als Bild kopieren");
        expect(block.scopeType).toBe(Blockly.ContextMenuRegistry.ScopeType.BLOCK);
        expect(block.preconditionFn({ block: { isInFlyout: true } as never }, new Event("contextmenu"))).toBe("hidden");
    });

    test("ohne Zwischenablage für Bilder (z. B. ohne https) wird „kopieren“ nicht angeboten", () => {
        const block = Blockly.ContextMenuRegistry.registry.getItem("gsg_copy_image_block") as unknown as Action;
        // die Testumgebung kennt kein ClipboardItem
        expect(canCopyImage()).toBe(false);
        expect(block.preconditionFn({ block: { isInFlyout: false } as never }, new Event("contextmenu"))).toBe("hidden");
    });
});
