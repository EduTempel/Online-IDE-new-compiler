import * as Blockly from "blockly/core";
import { Constants } from "../Constants";
import { B } from "./BlockTypes";

/**
 * Rechtsklick auf Blöcke (Blöckly, Blöckva, Texva in der Blockansicht): Kopieren und Verdoppeln – auch ab hier mit den
 * Blöcken darunter – und Rechtsklick auf die Fläche: Einfügen. Blocklys eigener Eintrag „Kopieren“ (blockDuplicate)
 * verdoppelte in Wahrheit; er wird durch „Verdoppeln“ ersetzt.
 *
 * Kopiert wird in die Zwischenablage der Blöcke (wie mit Strg+C) – Einfügen mit Strg+V oder Rechtsklick → „Einfügen“,
 * in Blöckly auch bei einer anderen Figur oder der Bühne.
 *
 * „Wenn 🚩 angeklickt“ (Blöckly) gibt es nur einmal im Projekt: davon werden nur die Blöcke darin kopiert bzw. verdoppelt.
 */

type Kopie = Blockly.clipboard.BlockCopyData;

const mac = () => /Mac|iPhone|iPad/.test(navigator.platform);
/** Tastenkürzel auf Deutsch (Blockly zeigt „Control + C“ und legt die Namen schon beim Laden fest) */
const taste = (t: string) => (mac() ? "⌘+" : "Strg+") + t;
const einfuegenTaste = () => taste("V");

/** Startblock, den es nur einmal gibt: dann nur die Blöcke darin */
const nurInhalt = (b: Blockly.BlockSvg) => Constants.isBloecklyApp && b.type === B.blFlag;

/** Block, ab dem kopiert wird, und ob die Blöcke darunter mitkommen */
function quelle(b: Blockly.BlockSvg, abHier: boolean): { block: Blockly.BlockSvg; mitFolgenden: boolean } | undefined {
    if (nurInhalt(b)) {
        const erster = b.getInputTargetBlock("BODY") as Blockly.BlockSvg | null;
        return erster ? { block: erster, mitFolgenden: true } : undefined;
    }
    return { block: b, mitFolgenden: abHier };
}

function kopie(b: Blockly.BlockSvg, abHier: boolean): Kopie | null {
    const q = quelle(b, abHier);
    return q ? q.block.toCopyData(q.mitFolgenden) : null;
}

/** darf der Block (bzw. der Bereich ab hier) kopiert werden? */
function kopierbar(b: Blockly.BlockSvg, abHier: boolean): boolean {
    if (b.isInFlyout || b.type === B.blFigure) return false;
    const q = quelle(b, abHier);
    if (!q) return false;
    if (!q.mitFolgenden) return q.block.isCopyable();
    for (let x: Blockly.BlockSvg | null = q.block; x; x = x.getNextBlock()) if (!x.isCopyable()) return false;
    return true;
}

/** Folgen weitere Blöcke? (sonst ist „ab hier“ dasselbe wie der Block allein) */
const hatFolgende = (b: Blockly.BlockSvg) => !nurInhalt(b) && !!b.getNextBlock();

function hinweis(ws: Blockly.WorkspaceSvg, text: string) {
    try {
        Blockly.Toast.show(ws, { message: text, id: "gsg_kopiert" });
    } catch {
        // ohne Hinweis geht es auch
    }
}

function kopieren(b: Blockly.BlockSvg, abHier: boolean) {
    const daten = kopie(b, abHier);
    if (!daten) return;
    const ws = b.workspace;
    Blockly.clipboard.setLastCopiedData(daten);
    Blockly.clipboard.setLastCopiedWorkspace(ws);
    Blockly.clipboard.setLastCopiedLocation(quelle(b, abHier)!.block.getRelativeToSurfaceXY());
    hinweis(ws, `Kopiert. Mit ${einfuegenTaste()} oder Rechtsklick → „Einfügen“ fügst du die Blöcke ein`
        + (Constants.isBloecklyApp ? " – auch bei einer anderen Figur oder der Bühne." : "."));
}

function verdoppeln(b: Blockly.BlockSvg, abHier: boolean) {
    const daten = kopie(b, abHier);
    if (!daten) return;
    const ws = b.workspace;
    const q = quelle(b, abHier)!.block;
    // rechts neben das ganze Skript, auf Höhe des kopierten Blocks – sonst läge die Kopie fast genau darauf
    const rahmen = q.getRootBlock().getBoundingRectangle();
    const stelle = new Blockly.utils.Coordinate(rahmen.right + 30, q.getRelativeToSurfaceXY().y);
    const neu = Blockly.clipboard.paste(daten, ws, stelle) as Blockly.BlockSvg | null;
    neu?.select();
}

/** Kopie passt noch auf die Fläche (Höchstzahl je Blockart)? */
const platzFuer = (ws: Blockly.WorkspaceSvg, daten: Kopie | null) => !!daten && ws.isCapacityAvailable(daten.typeCounts);

export function registerBlockCopyMenu() {
    const registry = Blockly.ContextMenuRegistry.registry;
    if (registry.getItem("gsg_kopieren")) return;
    if (registry.getItem("blockDuplicate")) registry.unregister("blockDuplicate");   // hieß auf Deutsch „Kopieren“, verdoppelt aber
    const BLOCK = Blockly.ContextMenuRegistry.ScopeType.BLOCK;

    const kopierEintrag = (abHier: boolean, weight: number): Blockly.ContextMenuRegistry.RegistryItem => ({
        id: abHier ? "gsg_kopieren_ab_hier" : "gsg_kopieren",
        scopeType: BLOCK,
        weight,
        displayText: (scope) => !abHier && scope.block && nurInhalt(scope.block) ? "Blöcke darin kopieren"
            : abHier ? "Ab hier kopieren (mit den Blöcken darunter)" : `Kopieren (${taste("C")})`,
        preconditionFn: (scope) => {
            const b = scope.block;
            if (!b || (abHier && !hatFolgende(b))) return "hidden";
            return kopierbar(b, abHier) ? "enabled" : "hidden";
        },
        callback: (scope) => { if (scope.block) kopieren(scope.block, abHier); },
    });

    const verdoppelEintrag = (abHier: boolean, weight: number): Blockly.ContextMenuRegistry.RegistryItem => ({
        id: abHier ? "gsg_verdoppeln_ab_hier" : "gsg_verdoppeln",
        scopeType: BLOCK,
        weight,
        displayText: (scope) => !abHier && scope.block && nurInhalt(scope.block) ? "Blöcke darin verdoppeln"
            : abHier ? "Ab hier verdoppeln (mit den Blöcken darunter)" : "Verdoppeln",
        preconditionFn: (scope) => {
            const b = scope.block;
            if (!b || b.workspace.options.readOnly || (abHier && !hatFolgende(b))) return "hidden";
            if (!kopierbar(b, abHier)) return "hidden";
            return platzFuer(b.workspace, kopie(b, abHier)) ? "enabled" : "disabled";
        },
        callback: (scope) => { if (scope.block) verdoppeln(scope.block, abHier); },
    });

    registry.register(kopierEintrag(false, 0.1));
    registry.register(kopierEintrag(true, 0.2));
    registry.register(verdoppelEintrag(false, 0.3));
    registry.register(verdoppelEintrag(true, 0.4));

    // Rechtsklick auf die freie Fläche: Einfügen an der Stelle des Klicks
    registry.register({
        id: "gsg_einfuegen",
        scopeType: Blockly.ContextMenuRegistry.ScopeType.WORKSPACE,
        weight: 0.1,
        displayText: () => `Einfügen (${einfuegenTaste()})`,
        preconditionFn: (scope) => {
            const ws = scope.workspace;
            if (!ws || ws.isFlyout || ws.options.readOnly) return "hidden";
            const daten = Blockly.clipboard.getLastCopiedData() as Kopie | null;
            return daten && "blockState" in daten && platzFuer(ws, daten) ? "enabled" : "disabled";
        },
        callback: (scope, menuOpenEvent) => {
            const ws = scope.workspace;
            const daten = Blockly.clipboard.getLastCopiedData() as Kopie | null;
            if (!ws || !daten) return;
            const e = menuOpenEvent as PointerEvent;
            const stelle = typeof e?.clientX === "number"
                ? Blockly.utils.svgMath.screenToWsCoordinates(ws, new Blockly.utils.Coordinate(e.clientX, e.clientY))
                : undefined;
            const neu = Blockly.clipboard.paste(daten, ws, stelle) as Blockly.BlockSvg | null;
            neu?.select();
        },
    });
}
