import { describe, expect, test } from "vitest";
import * as Blockly from "blockly/core";
import { registerBlockCopyMenu } from "./BlockKopieren";

type Action = {
    scopeType: string;
    displayText: unknown;
    weight: number;
    preconditionFn: (scope: Blockly.ContextMenuRegistry.Scope, e: Event) => string;
};

const e = new Event("contextmenu");
const item = (id: string) => Blockly.ContextMenuRegistry.registry.getItem(id) as unknown as Action;
const text = (a: Action, scope: Blockly.ContextMenuRegistry.Scope = {}) => typeof a.displayText === "function" ? a.displayText(scope) : a.displayText;

/** Ersatz für einen Block auf der Fläche (nur, was die Einträge abfragen) */
function block(opts: { next?: unknown; inFlyout?: boolean; readOnly?: boolean } = {}) {
    const ws = { options: { readOnly: !!opts.readOnly }, isCapacityAvailable: () => true };
    return {
        type: "gsg_print", isInFlyout: !!opts.inFlyout, workspace: ws,
        isCopyable: () => true, getNextBlock: () => opts.next ?? null,
        toCopyData: () => ({ paster: "block", blockState: {}, typeCounts: {} }),
    } as never as Blockly.BlockSvg;
}

describe("Rechtsklick: Kopieren, Verdoppeln, Einfügen", () => {
    test("einmal angemeldet; Blocklys „Kopieren“ (das verdoppelte) ist ersetzt", () => {
        registerBlockCopyMenu();
        registerBlockCopyMenu();   // zweite Blockansicht: keine doppelte Anmeldung
        expect(Blockly.ContextMenuRegistry.registry.getItem("blockDuplicate")).toBeNull();
        expect(text(item("gsg_kopieren"), { block: block() })).toMatch(/^Kopieren \((Strg|⌘)\+C\)$/);
        expect(text(item("gsg_verdoppeln"), { block: block() })).toBe("Verdoppeln");
        expect(text(item("gsg_einfuegen"))).toMatch(/^Einfügen/);
        expect(item("gsg_einfuegen").scopeType).toBe(Blockly.ContextMenuRegistry.ScopeType.WORKSPACE);
        // Reihenfolge: Kopieren, ab hier kopieren, Verdoppeln, ab hier verdoppeln
        expect(["gsg_kopieren", "gsg_kopieren_ab_hier", "gsg_verdoppeln", "gsg_verdoppeln_ab_hier"].map((id) => item(id).weight))
            .toEqual([0.1, 0.2, 0.3, 0.4]);
    });

    test("„ab hier“ nur, wenn Blöcke darunter folgen; nichts in der Werkzeugleiste", () => {
        registerBlockCopyMenu();
        const allein = block(), mitFolgendem = block({ next: block() });
        expect(item("gsg_kopieren").preconditionFn({ block: allein }, e)).toBe("enabled");
        expect(item("gsg_kopieren_ab_hier").preconditionFn({ block: allein }, e)).toBe("hidden");
        expect(item("gsg_kopieren_ab_hier").preconditionFn({ block: mitFolgendem }, e)).toBe("enabled");
        expect(item("gsg_verdoppeln_ab_hier").preconditionFn({ block: mitFolgendem }, e)).toBe("enabled");
        expect(item("gsg_kopieren").preconditionFn({ block: block({ inFlyout: true }) }, e)).toBe("hidden");
    });

    test("schreibgeschützt: kopieren ja, verdoppeln und einfügen nein", () => {
        registerBlockCopyMenu();
        const b = block({ readOnly: true });
        expect(item("gsg_kopieren").preconditionFn({ block: b }, e)).toBe("enabled");
        expect(item("gsg_verdoppeln").preconditionFn({ block: b }, e)).toBe("hidden");
        expect(item("gsg_einfuegen").preconditionFn({ workspace: { isFlyout: false, options: { readOnly: true } } as never }, e)).toBe("hidden");
    });
});
