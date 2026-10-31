import * as Blockly from "blockly/core";
import { B, isPartHat } from "./BlockTypes";
import { declarationOf, enclosingClass, mainWorkspace, methodParamsOf, scopeRoot } from "./BlockTypeSystem";

/**
 * Paket 16c: Gültigkeitsbereich einer Variablen anzeigen. Wählt man einen Variablenblock („setze …“,
 * „ändere …“, den Wert einer Variablen) oder „erstelle neue Variable …“ aus, umrahmt ein gestrichelter
 * Kasten den Bereich, in dem die Variable gilt; die Deklaration und alle Verwendungen darin sind markiert.
 */

/** Blöcke, deren Auswahl den Gültigkeitsbereich zeigt (Variablen-Kategorie) */
const VARIABLE_BLOCKS = new Set<string>([B.varGet, B.varSet, B.varChange, B.varSub, B.varInc, B.varDec]);

/**
 * Wo die Variable angelegt ist:
 *  local: Deklaration (gilt ab dort bis zum Ende der Klammer), loop: Zähl- bzw. Elementvariable einer
 *  Schleife, param: Parameter (ganze Operation), attribute: Attribut (ganze Klasse), main: äußerste
 *  Variable des Hauptprogramms (auch in allen Programmteilen)
 */
export type Declaration = { kind: "local" | "loop" | "param" | "attribute" | "main"; block: Blockly.Block };

/** Der Gültigkeitsbereich: Bereiche (je ein Kasten), Deklaration, Verwendungen */
export type Scope = { name: string; declaration: Declaration; regions: Region[]; uses: Blockly.Block[] };

/** Ein Kasten: der Block allein (whole: samt folgender Blöcke) bzw. ohne folgende, aber mit innerem Stapel */
export type Region = { block: Blockly.Block; withFollowing: boolean };

function declares(b: Blockly.Block, name: string): boolean {
    return declarationOf(b)?.[0] === name;
}

/** die Deklaration, die an der Stelle von b für name gilt (innerste zuerst, wie in Java) */
export function findDeclaration(b: Blockly.Block, name: string): Declaration | undefined {
    const root = scopeRoot(b);
    if (!root) return undefined;
    for (let x: Blockly.Block = b; x !== root;) {
        const p = x.getParent();
        if (!p) return undefined;
        if (p.getNextBlock() === x) {
            if (declares(p, name)) return { kind: root.type === B.class ? "attribute" : root.type === B.start && p.getSurroundParent() === root ? "main" : "local", block: p };
        } else if ((p.type === B.for || (p.type === B.forEach && p.getInputTargetBlock("DO") === x)) && String(p.getFieldValue("VAR") ?? "") === name) {
            return { kind: "loop", block: p };
        }
        x = p;
    }
    if ((root.type === B.method || root.type === B.ctor || root.type === B.classMethod) && methodParamsOf(root).some((p) => p.name === name)) {
        return { kind: "param", block: root };
    }
    const cls = enclosingClass(root);
    if (cls) {
        for (let a = cls.getInputTargetBlock("MEMBERS"); a; a = a.getNextBlock()) if (a.type === B.attribute && declares(a, name)) return { kind: "attribute", block: a };
    }
    if (isPartHat(root.type)) {
        const start = mainWorkspace(root.workspace).getTopBlocks(false).find((t) => t.type === B.start);
        for (let d = start?.getInputTargetBlock("BODY") ?? null; d; d = d.getNextBlock()) if (declares(d, name)) return { kind: "main", block: d };
    }
    return undefined;
}

/** Name der Variablen, um die es beim ausgewählten Block geht (undefined: kein Variablenblock) */
export function variableOfBlock(b: Blockly.Block): string | undefined {
    if (b.type === B.varDeclare) return String(b.getFieldValue("NAME") ?? "") || undefined;
    if (VARIABLE_BLOCKS.has(b.type)) return String(b.getFieldValue("NAME") ?? "") || undefined;
    return undefined;
}

/** Gültigkeitsbereich der Variablen des Blocks (undefined: kein Variablenblock oder nicht angelegt) */
export function scopeOf(b: Blockly.Block): Scope | undefined {
    const name = variableOfBlock(b);
    if (!name || !scopeRoot(b)) return undefined;
    const declaration: Declaration | undefined = b.type === B.varDeclare
        ? { kind: scopeRoot(b)?.type === B.start && b.getSurroundParent() === scopeRoot(b) ? "main" : "local", block: b }
        : findDeclaration(b, name);
    if (!declaration) return undefined;
    const d = declaration.block;
    const regions: Region[] = [];
    switch (declaration.kind) {
        case "local": regions.push({ block: d, withFollowing: true }); break;
        case "loop": regions.push({ block: d, withFollowing: false }); break;
        case "param": regions.push({ block: d, withFollowing: false }); break;
        case "attribute": regions.push({ block: enclosingClass(d) ?? d, withFollowing: false }); break;
        case "main": {
            regions.push({ block: d, withFollowing: true });
            for (const t of mainWorkspace(d.workspace).getTopBlocks(true)) if (isPartHat(t.type)) regions.push({ block: t, withFollowing: false });
            break;
        }
    }
    // Verwendungen: Blöcke in den Bereichen, für die genau diese Deklaration gilt
    const uses: Blockly.Block[] = [];
    const seen = new Set<Blockly.Block>();
    for (const r of regions) {
        for (const x of blocksIn(r)) {
            if (seen.has(x) || x === d) continue;
            seen.add(x);
            const refersTo = x.inputList.some((i) => i.fieldRow.some((f) => (f as Blockly.Field & { variableRef?(): string | undefined }).variableRef?.() === name));
            if (refersTo && findDeclaration(x, name)?.block === d) uses.push(x);
        }
    }
    return { name, declaration, regions, uses };
}

/** alle Blöcke eines Bereichs */
function blocksIn(r: Region): Blockly.Block[] {
    if (r.withFollowing) return r.block.getDescendants(false);
    const result = [r.block];
    for (const input of r.block.inputList) {
        const t = input.connection?.targetBlock();
        if (t) result.push(...t.getDescendants(false));
    }
    return result;
}

// ------------------------------------------------------------------ Anzeige

const SVG_NS = "http://www.w3.org/2000/svg";
const PAD = 5;

type Box = { left: number; top: number; right: number; bottom: number };

function union(a: Box | undefined, b: Box): Box {
    return a ? { left: Math.min(a.left, b.left), top: Math.min(a.top, b.top), right: Math.max(a.right, b.right), bottom: Math.max(a.bottom, b.bottom) } : { ...b };
}

/** Kasten eines Bereichs in Koordinaten der Arbeitsfläche */
function regionBox(r: Region): Box {
    const b = r.block as Blockly.BlockSvg;
    if (r.withFollowing) return b.getBoundingRectangle();
    let box: Box = b.getBoundingRectangleWithoutChildren();
    for (const input of b.inputList) {
        const t = input.connection?.targetBlock() as Blockly.BlockSvg | null;
        if (t) box = union(box, t.getBoundingRectangle());
    }
    return box;
}

/** Zeichnet den Gültigkeitsbereich des ausgewählten Blocks über die Blöcke (nicht anklickbar) */
export class ScopeHighlight {
    private layer: SVGGElement | null = null;
    private pending = false;
    private dragging = false;
    /** kurz gezeigter Bereich aus dem Reiter „Variablen“ (bis zum nächsten Ereignis bzw. ein paar Sekunden) */
    private flashed: { block: Blockly.BlockSvg; title: string; until: number } | null = null;

    /**
     * @param onSelect Kasten beim Auswählen einer Variable zeigen (Freigabe „Gültigkeitsbereich“ der Lerngruppe);
     *   der kurz gezeigte Bereich aus dem Reiter „Variablen“ (flash) geht immer
     */
    constructor(private ws: Blockly.WorkspaceSvg, private onSelect = true) {
        ws.addChangeListener((e) => this.onEvent(e));
    }

    private onEvent(e: Blockly.Events.Abstract) {
        if (e.type === Blockly.Events.BLOCK_DRAG) {
            this.dragging = !!(e as Blockly.Events.BlockDrag).isStart;
            if (this.dragging) this.clear();
        }
        if (e.type === Blockly.Events.VIEWPORT_CHANGE) return;
        if (e.type === Blockly.Events.CLICK) {
            if (this.flashed) { this.flashed = null; this.schedule(); }
            return;
        }
        if (e.type === Blockly.Events.SELECTED && this.flashed) this.flashed = null;
        this.schedule();
    }

    /** nach allen Ereignissen eines Schritts einmal neu zeichnen */
    private schedule() {
        if (this.pending) return;
        this.pending = true;
        setTimeout(() => { this.pending = false; this.update(); }, 0);
    }

    clear() {
        this.layer?.remove();
        this.layer = null;
    }

    /** Paket 16: Bereich eines Kastens aus dem Reiter „Variablen“ zeigen (Block samt Inhalt, mit Schild) */
    flash(block: Blockly.BlockSvg, title: string) {
        this.flashed = { block, title, until: Date.now() + 4000 };
        this.update();
        setTimeout(() => {
            if (this.flashed && Date.now() >= this.flashed.until) { this.flashed = null; this.update(); }
        }, 4100);
    }

    update() {
        this.clear();
        if (this.dragging || !this.ws.getCanvas()?.isConnected) return;
        if (this.flashed && !this.flashed.block.isDisposed()) {
            this.draw([{ block: this.flashed.block, withFollowing: false }], this.flashed.title, () => { });
            return;
        }
        if (!this.onSelect) return;
        const selected = Blockly.getSelected();
        if (!(selected instanceof Blockly.BlockSvg) || selected.workspace !== this.ws || selected.isInFlyout) return;
        let scope: Scope | undefined;
        try {
            scope = scopeOf(selected);
        } catch {
            return;
        }
        if (!scope) return;
        const s = scope;
        this.draw(s.regions, `Gültigkeitsbereich von ${s.name}`, (mark) => {
            if (s.declaration.kind !== "param" && s.declaration.kind !== "loop") mark(s.declaration.block, "gsg-scope-declaration");
            for (const u of s.uses) mark(u, "gsg-scope-use");
        });
    }

    /** Kästen der Bereiche, Markierungen und Schild zeichnen */
    private draw(regions: Region[], title: string, marks: (mark: (b: Blockly.Block, cls: string) => void) => void) {
        const layer = document.createElementNS(SVG_NS, "g");
        layer.setAttribute("class", "gsg-scope");
        layer.setAttribute("pointer-events", "none");
        let labelAt: Box | undefined;
        regions.forEach((r, i) => {
            const box = regionBox(r);
            const rect = document.createElementNS(SVG_NS, "rect");
            rect.setAttribute("class", "gsg-scope-region");
            rect.setAttribute("x", String(box.left - PAD));
            rect.setAttribute("y", String(box.top - PAD));
            rect.setAttribute("width", String(box.right - box.left + 2 * PAD));
            rect.setAttribute("height", String(box.bottom - box.top + 2 * PAD));
            rect.setAttribute("rx", "8");
            layer.appendChild(rect);
            if (i === 0) labelAt = box;
        });
        const mark = (b: Blockly.Block, cls: string) => {
            const box = (b as Blockly.BlockSvg).getBoundingRectangleWithoutChildren();
            const rect = document.createElementNS(SVG_NS, "rect");
            rect.setAttribute("class", cls);
            rect.setAttribute("x", String(box.left - 2));
            rect.setAttribute("y", String(box.top - 2));
            rect.setAttribute("width", String(box.right - box.left + 4));
            rect.setAttribute("height", String(Math.min(box.bottom - box.top, 40) + 4));
            rect.setAttribute("rx", "5");
            layer.appendChild(rect);
        };
        marks(mark);
        this.ws.getCanvas().appendChild(layer);
        this.layer = layer;
        // Schild „Gültigkeitsbereich von …“ oben links am ersten Kasten (erst im Dokument messbar)
        if (labelAt) {
            const label = document.createElementNS(SVG_NS, "g");
            label.setAttribute("class", "gsg-scope-label");
            const text = document.createElementNS(SVG_NS, "text");
            text.textContent = title;
            label.appendChild(text);
            layer.appendChild(label);
            let width = 160;
            try { width = text.getComputedTextLength() || width; } catch { /* ohne Layout: Schätzwert */ }
            const bg = document.createElementNS(SVG_NS, "rect");
            bg.setAttribute("x", "-6");
            bg.setAttribute("y", "-13");
            bg.setAttribute("width", String(width + 12));
            bg.setAttribute("height", "18");
            bg.setAttribute("rx", "9");
            label.insertBefore(bg, text);
            label.setAttribute("transform", `translate(${labelAt.left - PAD + 10}, ${labelAt.top - PAD - 6})`);
        }
    }
}
