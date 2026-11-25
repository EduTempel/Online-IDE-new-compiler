import * as Blockly from "blockly/core";
import { Constants } from "../Constants";
import { hasHandbook } from "../handbook/Handbook";
import { HILFE_FIGUR, HILFE_FIGUREN, HILFE_GLOBALS, hilfeBeispiel, hilfeSchluessel } from "../bloeckly/BloecklyHilfe";
import { BUEHNEN_KLASSE } from "../bloeckly/BloecklyProjekt";

/**
 * GSG (Paket 19j): Hilfe-Karte – Rechtsklick → „Hilfe“ zeigt neben dem Block, was er macht, und ein kleines
 * Beispiel als Blöcke; „Mehr im Handbuch“ öffnet das Handbuch an der passenden Stelle.
 * Blöckly: eigenes Beispiel je Block (BloecklyHilfe.ts). Blöckva: Tooltip des Blocks und das erste
 * Handbuch-Beispiel mit diesem Block.
 */

let offen: { karte: HTMLElement; schliessen: () => void } | undefined;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
}

export function schliesseHilfeKarte() {
    offen?.schliessen();
}

/** Tooltip eines Blocks als Text (kann eine Funktion sein) */
function tooltipVon(block: Blockly.Block): string {
    try {
        return Blockly.Tooltip.getTooltipOfObject(block).trim();
    } catch {
        return "";
    }
}

/** Beispiel zum Block: Satz und ein Bild (SVG), das später kommt */
type Bild = { svg: string; titel?: string; gross?: boolean };
type Inhalt = { satz: string; bild: () => Promise<Bild | undefined> };

async function blockvaBeispiel(block: Blockly.Block, abschnitt: string | undefined, dark: boolean): Promise<Bild | undefined> {
    const [{ BLOCK_HANDBOOK }, { findBlockEntry }] = await Promise.all([import("../handbook/HandbookBlocks"), import("../handbook/HandbookSearch")]);
    const treffer = findBlockEntry(BLOCK_HANDBOOK, block.type, abschnitt);
    const entry = treffer && BLOCK_HANDBOOK.find((s) => s.id === treffer.section)?.entries[treffer.index];
    if (!entry) return undefined;
    const { blocksSvg } = await import("../handbook/HandbookBlockRender");
    return { svg: await blocksSvg(entry.code, dark), titel: `Beispiel aus dem Handbuch: ${entry.title}`, gross: true };
}

function inhaltFuer(block: Blockly.Block, abschnitt: string | undefined, dark: boolean): Inhalt | undefined {
    if (Constants.isBloecklyApp) {
        const b = hilfeBeispiel(hilfeSchluessel(block.type, !!block.getInput("ELSE"), block.getField("MODE") ? String(block.getFieldValue("MODE")) : undefined));
        if (b) {
            return {
                satz: b.satz,
                bild: async () => {
                    const { bloecklySvg } = await import("../handbook/HandbookBlockRender");
                    const svg = await bloecklySvg(b.text, b.ctx, {
                        stage: b.buehne, klasse: b.buehne ? BUEHNEN_KLASSE : HILFE_FIGUR, aussehen: b.buehne ? "" : "Waschbaer",
                        figuren: HILFE_FIGUREN, globals: HILFE_GLOBALS,
                    }, dark);
                    return { svg };
                },
            };
        }
    }
    const satz = tooltipVon(block);
    if (!satz) return undefined;
    // Blöckva: Beispiel aus dem Handbuch (gibt es keins, bleibt es beim Satz)
    return { satz, bild: () => blockvaBeispiel(block, abschnitt, dark) };
}

/** Karte so legen, dass sie neben dem Block und ganz im Fenster liegt */
function platziere(karte: HTMLElement, rect: DOMRect) {
    const rand = 8;
    const w = karte.offsetWidth, h = karte.offsetHeight;
    let left = rect.right + 12;
    if (left + w > window.innerWidth - rand) left = rect.left - w - 12;
    left = Math.max(rand, Math.min(left, window.innerWidth - w - rand));
    const top = Math.max(rand, Math.min(rect.top, window.innerHeight - h - rand));
    karte.style.left = `${left}px`;
    karte.style.top = `${top}px`;
}

/**
 * Hilfe-Karte zum Block zeigen. mehr öffnet das Handbuch; ohne Beispiel oder Satz (oder ohne gezeichneten Block)
 * wird gleich das Handbuch geöffnet.
 */
export function zeigeHilfeKarte(block: Blockly.Block, abschnitt: string | undefined, mehr: () => void) {
    const svg = block as Blockly.BlockSvg;
    if (typeof svg.getSvgRoot !== "function" || !svg.getSvgRoot()?.isConnected) {
        mehr();
        return;
    }
    const dark = (svg.workspace as Blockly.WorkspaceSvg).getTheme?.()?.name === "gsg-dark";
    const inhalt = inhaltFuer(block, abschnitt, dark);
    if (!inhalt) {
        mehr();
        return;
    }
    schliesseHilfeKarte();

    const karte = el("div", "gsg-hilfe-karte" + (dark ? " is-dark" : ""));
    karte.setAttribute("role", "dialog");
    karte.setAttribute("aria-label", "Hilfe zum Block");
    const zu = el("button", "gsg-hilfe-zu", "✕");
    zu.type = "button";
    zu.title = "Schließen (Esc)";
    const satz = el("p", "gsg-hilfe-satz", inhalt.satz);
    karte.append(zu, satz);
    const titel = el("div", "gsg-hilfe-titel");
    const bild = el("div", "gsg-hilfe-bild", "Beispiel wird gezeichnet …");
    karte.append(titel, bild);
    if (hasHandbook()) {
        const unten = el("div", "gsg-hilfe-unten");
        const knopf = el("button", undefined, "📖 Mehr im Handbuch");
        knopf.type = "button";
        knopf.addEventListener("click", () => { schliessen(); mehr(); });
        unten.append(knopf);
        karte.append(unten);
    }
    document.body.append(karte);

    const rect = svg.getSvgRoot().getBoundingClientRect();
    platziere(karte, rect);

    const beiTaste = (e: KeyboardEvent) => {
        if (e.key === "Escape") { e.stopPropagation(); schliessen(); }
    };
    const beiKlick = (e: PointerEvent) => {
        if (!karte.contains(e.target as Node)) schliessen();
    };
    const schliessen = () => {
        karte.remove();
        document.removeEventListener("keydown", beiTaste, true);
        document.removeEventListener("pointerdown", beiKlick, true);
        if (offen?.karte === karte) offen = undefined;
    };
    zu.addEventListener("click", schliessen);
    document.addEventListener("keydown", beiTaste, true);
    // erst nach dem Klick, der das Menü geschlossen hat
    setTimeout(() => { if (karte.isConnected) document.addEventListener("pointerdown", beiKlick, true); }, 0);
    offen = { karte, schliessen };
    zu.focus();

    inhalt.bild().then((ergebnis) => {
        if (!karte.isConnected) return;
        const text = ergebnis?.svg;
        if (!text) {
            bild.remove();
            titel.remove();
        } else {
            if (ergebnis.titel) titel.textContent = ergebnis.titel;
            else titel.remove();
            // große Handbuch-Beispiele: kleiner und in der Höhe begrenzt
            bild.classList.toggle("is-gross", !!ergebnis.gross);
            const img = el("img");
            img.alt = "Beispiel als Blöcke";
            img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(text);
            const w = /width="(\d+(?:\.\d+)?)"/.exec(text)?.[1];
            if (w) img.style.width = `${Math.round(+w * (ergebnis.gross ? 0.65 : 0.8))}px`;
            img.addEventListener("load", () => platziere(karte, rect));
            bild.textContent = "";
            bild.append(img);
        }
        platziere(karte, rect);
    }).catch((err) => {
        console.error(err);
        if (karte.isConnected) bild.textContent = "Das Beispiel konnte nicht gezeichnet werden.";
    });
}
