import * as Blockly from "blockly/core";
import { helpFor, type HelpTarget } from "../handbook/HelpLinks";

/**
 * Paket 17b: Warnungen an Blöcken bekommen einen Hinweis auf das Handbuch. Unter der Meldung steht
 * „📖 Mehr dazu: Rechtsklick → Hilfe zur Meldung“; der Rechtsklick öffnet den passenden Eintrag.
 */

const HINT_ID = "hilfe";
export const HELP_HINT = "📖 Mehr dazu: Rechtsklick auf den Block → „Hilfe zur Meldung“";

/** Text der Warnung ohne den eigenen Hinweis */
export function warningText(block: Blockly.Block): string {
    const icon = block.getIcon?.(Blockly.icons.IconType.WARNING) as (Blockly.icons.WarningIcon & { getText(): string }) | undefined;
    return (icon?.getText() ?? "").split("\n").filter((l) => l !== HELP_HINT).join("\n");
}

/** Handbuch-Eintrag zur Warnung eines Blocks */
export function warningHelp(block: Blockly.Block): HelpTarget | undefined {
    const text = warningText(block);
    return text ? helpFor(text, "blocks") : undefined;
}

/** nach jeder Änderung der Warnungen aufrufen: Hinweis zeigen bzw. entfernen */
export function updateHelpHint(block: Blockly.Block) {
    if (!(block as Blockly.BlockSvg).rendered) return;
    const wanted = warningHelp(block) ? HELP_HINT : null;
    const icon = block.getIcon?.(Blockly.icons.IconType.WARNING) as (Blockly.icons.WarningIcon & { getText(): string }) | undefined;
    const has = !!icon && icon.getText().split("\n").includes(HELP_HINT);
    if ((wanted !== null) !== has) block.setWarningText(wanted, HINT_ID);
}
