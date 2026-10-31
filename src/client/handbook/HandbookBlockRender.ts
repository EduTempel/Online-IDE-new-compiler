import * as Blockly from "blockly/core";
import * as De from "blockly/msg/de";
import { defineBlocks, theme } from "../blocks/BlockDefinitions";
import { registerRenderer } from "../blocks/BlockRenderer";
import { applyTypes } from "../blocks/BlockTypeSystem";
import { JavaBlockParser } from "../blocks/JavaBlockParser";
import { blocksToSvg } from "../blocks/BlockImage";
import { B } from "../blocks/BlockTypes";
import { bloecklyUi, defineBloecklyBlocks, setBloecklyUi, type BloecklyUi } from "../bloeckly/BloecklyBlocks";
import type { BloecklyContext } from "../bloeckly/BloecklySpec";

/**
 * Beispiele des Blöcke-Handbuchs als Bild: Der Java-Code wird in einer unsichtbaren, nur lesbaren
 * Blockfläche aufgebaut und als SVG übernommen (wie „Als Bild speichern“). Wird erst geladen, wenn
 * das Handbuch Blöcke zeigt; die Bilder werden je Farbschema zwischengespeichert.
 */

const GAP = 24;
const cache = new Map<string, string>();
let host: HTMLDivElement | undefined;
let ws: Blockly.WorkspaceSvg | undefined;
let wsDark: boolean | undefined;
let queue: Promise<unknown> = Promise.resolve();

function workspace(dark: boolean): Blockly.WorkspaceSvg {
    if (ws && wsDark === dark) return ws;
    ws?.dispose();
    Blockly.setLocale(De as unknown as { [key: string]: string });
    defineBlocks();
    registerRenderer();
    if (!host) {
        // sichtbar im Sinne von CSS (für berechnete Stile), aber außerhalb des Fensters
        host = document.createElement("div");
        host.className = "gsg-handbook-offscreen";
        host.style.cssText = "position:fixed;left:-20000px;top:0;width:1600px;height:1200px;pointer-events:none;";
        document.body.append(host);
    }
    // inject macht die neue Fläche zur Hauptfläche – die Blockfläche der IDE muss es bleiben
    // (dort hängt Blockly Auswahllisten und Menüs ein)
    const main = Blockly.getMainWorkspace() as Blockly.WorkspaceSvg | null;
    ws = Blockly.inject(host, { readOnly: true, theme: theme(dark), renderer: "gsg", sounds: false, scrollbars: false, zoom: { startScale: 1 } });
    if (main && main !== ws && main.rendered && main.getInjectionDiv()?.isConnected) Blockly.common.setMainWorkspace(main);
    wsDark = dark;
    return ws;
}

async function render(code: string, dark: boolean): Promise<string> {
    const w = workspace(dark);
    Blockly.Events.disable();
    try {
        w.clear();
        Blockly.serialization.workspaces.load(JavaBlockParser.parse(code).state, w, { recordUndo: false });
    } finally {
        Blockly.Events.enable();
    }
    applyTypes(w);
    Blockly.renderManagement.triggerQueuedRenders(w);
    // Hauptprogramm, Operationen und Klassen untereinander
    let y = 0;
    for (const b of w.getTopBlocks(true)) {
        const xy = b.getRelativeToSurfaceXY();
        b.moveBy(-xy.x, y - xy.y);
        y += b.getHeightWidth().height + GAP;
    }
    // ausgegraute Blöcke gibt es im Handbuch nicht (alles hängt am Hauptprogramm)
    const { svg } = await blocksToSvg(w, null);
    w.clear();
    return svg;
}

/** SVG-Text der Blöcke zu einem Beispiel (nacheinander erzeugt, damit sich die Aufträge nicht stören) */
export function blocksSvg(code: string, dark: boolean): Promise<string> {
    const key = (dark ? "d:" : "l:") + code;
    const hit = cache.get(key);
    if (hit) return Promise.resolve(hit);
    const job = queue.then(() => cache.get(key) ?? render(code, dark).then((svg) => { cache.set(key, svg); return svg; }));
    queue = job.catch(() => undefined);
    return job;
}

// ------------------------------------------------------------------ Blöckly (Paket 18h)

/**
 * Skripte einer Blöckly-Datei (Figur oder Bühne) als Bild: wie in der Blockansicht ohne den unsichtbaren Kopf.
 * Die Auswahllisten (Figuren, Kostüme) kennen dabei die Figuren des Beispiels.
 */
export function bloecklySvg(text: string, ctx: BloecklyContext, ui: BloecklyUi, dark: boolean): Promise<string> {
    const key = (dark ? "bd:" : "bl:") + text;
    const hit = cache.get(key);
    if (hit) return Promise.resolve(hit);
    const job = queue.then(() => cache.get(key) ?? renderBloeckly(text, ctx, ui, dark).then((svg) => { cache.set(key, svg); return svg; }));
    queue = job.catch(() => undefined);
    return job;
}

async function renderBloeckly(text: string, ctx: BloecklyContext, ui: BloecklyUi, dark: boolean): Promise<string> {
    defineBloecklyBlocks();
    const w = workspace(dark);
    const before = bloecklyUi();
    setBloecklyUi(ui);
    try {
        const { state } = JavaBlockParser.parse(text, { bloeckly: ctx });
        state.blocks.blocks = (state.blocks.blocks ?? []).filter((b) => b.type !== B.blFigure);
        Blockly.Events.disable();
        try {
            w.clear();
            Blockly.serialization.workspaces.load(state, w, { recordUndo: false });
        } finally {
            Blockly.Events.enable();
        }
        applyTypes(w);
        Blockly.renderManagement.triggerQueuedRenders(w);
        let y = 0;
        for (const b of w.getTopBlocks(true)) {
            const xy = b.getRelativeToSurfaceXY();
            b.moveBy(-xy.x, y - xy.y);
            y += b.getHeightWidth().height + GAP;
        }
        const { svg } = await blocksToSvg(w, null);
        w.clear();
        return svg;
    } finally {
        setBloecklyUi(before);
    }
}
