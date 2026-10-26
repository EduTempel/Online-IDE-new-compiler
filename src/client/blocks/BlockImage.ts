import * as Blockly from "blockly/core";

/**
 * Blöcke als Bild speichern (Rechtsklick): PNG mit durchsichtigem Hintergrund, z. B. für Arbeitsblätter.
 *  - Rechtsklick auf die Arbeitsfläche: alle Blöcke
 *  - Rechtsklick auf einen Block: dieser Block mit allem, was darin und darunter hängt
 *    (auf „Hauptprogramm“ also das ganze Programm)
 *
 * Vorgehen: SVG-Gruppe der Blöcke klonen, die berechneten Stile (Farben, Schrift) direkt an jedes Element
 * schreiben (damit das Bild ohne die Stylesheets der Seite gleich aussieht), Bilder in Blöcken als data:-Adresse
 * einbetten, als eigenständiges SVG in ein Canvas zeichnen (doppelte Auflösung) und als PNG herunterladen.
 */

const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";
const PADDING = 8;
const SCALE = 2;

/** Stile, die für das Aussehen der Blöcke nötig sind */
const STYLE_PROPS = [
    "fill", "fill-opacity", "fill-rule", "stroke", "stroke-width", "stroke-opacity", "stroke-dasharray", "stroke-linejoin",
    "stroke-linecap", "opacity", "display", "visibility", "font-family", "font-size", "font-weight", "font-style",
    "text-anchor", "dominant-baseline", "alignment-baseline", "letter-spacing", "white-space", "text-decoration",
] as const;

const ID_WORKSPACE = "gsg_save_image_workspace";
const ID_BLOCK = "gsg_save_image_block";

/** Kontextmenüs einmal anmelden; fileName liefert den Namen der geöffneten Datei (für den Dateinamen) */
export function registerBlockImageMenu(fileName: () => string | undefined) {
    const registry = Blockly.ContextMenuRegistry.registry;
    if (!registry.getItem(ID_WORKSPACE)) {
        registry.register({
            id: ID_WORKSPACE,
            scopeType: Blockly.ContextMenuRegistry.ScopeType.WORKSPACE,
            displayText: "Alle Blöcke als Bild speichern (PNG)",
            preconditionFn: (scope) => (scope.workspace && !scope.workspace.isFlyout && scope.workspace.getTopBlocks(false).length > 0 ? "enabled" : "hidden"),
            callback: (scope) => { if (scope.workspace) void saveAsPng(scope.workspace, null, fileName()); },
            weight: 100,
        });
    }
    if (!registry.getItem(ID_BLOCK)) {
        registry.register({
            id: ID_BLOCK,
            scopeType: Blockly.ContextMenuRegistry.ScopeType.BLOCK,
            displayText: (scope) => (scope.block && !scope.block.previousConnection && !scope.block.outputConnection
                ? "Programm als Bild speichern (PNG)" : "Als Bild speichern (PNG, mit allem darunter)"),
            preconditionFn: (scope) => (scope.block && !scope.block.isInFlyout ? "enabled" : "hidden"),
            callback: (scope) => { if (scope.block) void saveAsPng(scope.block.workspace as Blockly.WorkspaceSvg, scope.block, fileName()); },
            weight: 100,
        });
    }
}

async function saveAsPng(ws: Blockly.WorkspaceSvg, block: Blockly.BlockSvg | null, fileName: string | undefined) {
    try {
        const blob = await blocksToPng(ws, block);
        const base = (fileName ?? "Bloecke").replace(/\.[^.]*$/, "").replace(/[\\/:*?"<>|]+/g, "_") || "Bloecke";
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${base}${block ? "-Block" : ""}.png`;
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    } catch (e) {
        console.error(e);
        alert("Das Bild konnte nicht erzeugt werden: " + (e instanceof Error ? e.message : String(e)));
    }
}

/** Eigenständiges SVG der Blöcke (Stile direkt an den Elementen) */
export async function blocksToSvg(ws: Blockly.WorkspaceSvg, block: Blockly.BlockSvg | null): Promise<{ svg: string; width: number; height: number }> {
    const source = (block ? block.getSvgRoot() : ws.getCanvas()) as SVGGElement;
    const box = blocksBox(ws, block);
    if (!box || !box.width || !box.height) throw new Error("Es gibt keine Blöcke.");

    const clone = source.cloneNode(true) as SVGGElement;
    // berechnete Stile übertragen (gleiche Reihenfolge der Elemente in Original und Klon)
    const originals = [source, ...Array.from(source.querySelectorAll("*"))];
    const copies = [clone, ...Array.from(clone.querySelectorAll("*"))];
    originals.forEach((el, i) => {
        const copy = copies[i] as SVGElement;
        const cs = getComputedStyle(el);
        const style = STYLE_PROPS.map((p) => [p, cs.getPropertyValue(p)] as const).filter(([, v]) => v !== "" && v !== "normal" && v !== "auto")
            .map(([p, v]) => `${p}:${v}`).join(";");
        copy.setAttribute("style", style);
    });
    clone.removeAttribute("transform");
    // Auswahl, Cursor, Hervorhebungen und nicht sichtbare Teile entfernen
    clone.querySelectorAll(".blocklyPathSelected, .blocklyCursor, .blocklyMarker, .blocklyInsertionMarker, .blocklyBlockDragSurface, .blocklyDraggable > .blocklyPathSelected")
        .forEach((e) => e.remove());
    clone.querySelectorAll("[style*='display:none'], [style*='visibility:hidden']").forEach((e) => e.remove());
    clone.querySelectorAll(".blocklySelected").forEach((e) => e.classList.remove("blocklySelected"));
    await inlineImages(clone);

    const width = Math.ceil(box.width + 2 * PADDING);
    const height = Math.ceil(box.height + 2 * PADDING);
    const out = document.createElementNS(SVG_NS, "svg");
    out.setAttribute("xmlns", SVG_NS);
    out.setAttribute("xmlns:xlink", XLINK_NS);
    out.setAttribute("width", String(width));
    out.setAttribute("height", String(height));
    out.setAttribute("viewBox", `0 0 ${width} ${height}`);
    // Muster und Filter (z. B. für ausgegraute Blöcke)
    for (const defs of Array.from(ws.getParentSvg().querySelectorAll("defs"))) out.append(defs.cloneNode(true));
    const g = document.createElementNS(SVG_NS, "g");
    g.setAttribute("transform", `translate(${PADDING - box.x}, ${PADDING - box.y})`);
    g.append(clone);
    out.append(g);
    return { svg: new XMLSerializer().serializeToString(out), width, height };
}

/**
 * Umriss der Blöcke in den Koordinaten des geklonten Elements: Arbeitsfläche = Koordinaten der Arbeitsfläche,
 * Block = relativ zum Block. Aus den Maßen der Blöcke (nicht getBBox der Zeichenebene, die auch unsichtbare
 * Hilfselemente mitzählt).
 */
function blocksBox(ws: Blockly.WorkspaceSvg, block: Blockly.BlockSvg | null): { x: number; y: number; width: number; height: number } | null {
    const rects = (block ? [block] : ws.getTopBlocks(false)).map((b) => b.getBoundingRectangle());
    if (rects.length === 0) return null;
    const left = Math.min(...rects.map((r) => r.left));
    const top = Math.min(...rects.map((r) => r.top));
    const right = Math.max(...rects.map((r) => r.right));
    const bottom = Math.max(...rects.map((r) => r.bottom));
    if (block) {
        const xy = block.getRelativeToSurfaceXY();
        return { x: left - xy.x, y: top - xy.y, width: right - left, height: bottom - top };
    }
    return { x: left, y: top, width: right - left, height: bottom - top };
}

/** PNG mit durchsichtigem Hintergrund (doppelte Auflösung) */
export async function blocksToPng(ws: Blockly.WorkspaceSvg, block: Blockly.BlockSvg | null): Promise<Blob> {
    const { svg, width, height } = await blocksToSvg(ws, block);
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Das SVG konnte nicht gezeichnet werden."));
        img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    });
    const canvas = document.createElement("canvas");
    canvas.width = width * SCALE;
    canvas.height = height * SCALE;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(SCALE, SCALE);
    ctx.drawImage(img, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG fehlgeschlagen."))), "image/png"));
}

/** Bilder in Blöcken (z. B. Sprite-Vorschau) als data:-Adresse einbetten – ein SVG als Bild lädt keine Dateien nach */
async function inlineImages(root: SVGElement) {
    const images = Array.from(root.querySelectorAll("image"));
    await Promise.all(images.map(async (img) => {
        const href = img.getAttribute("href") ?? img.getAttributeNS(XLINK_NS, "href") ?? "";
        if (!href || href.startsWith("data:")) return;
        try {
            const blob = await (await fetch(href)).blob();
            const data = await new Promise<string>((resolve) => {
                const r = new FileReader();
                r.onload = () => resolve(String(r.result));
                r.readAsDataURL(blob);
            });
            img.setAttribute("href", data);
            img.removeAttributeNS(XLINK_NS, "href");
        } catch {
            img.remove();
        }
    }));
}
