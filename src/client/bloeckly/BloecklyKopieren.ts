import * as Blockly from "blockly/core";
import { B, type BlockState } from "../blocks/BlockTypes";
import { JavaBlockGenerator } from "../blocks/JavaBlockGenerator";
import { JavaBlockParser } from "../blocks/JavaBlockParser";
import type { Main } from "../main/Main";
import type { GUIFile } from "../workspace/File";
import { dialog, el, knopf } from "./BloecklyDialog";
import { BUEHNEN_KLASSE, liesProjekt, variablenDerKlasse } from "./BloecklyProjekt";
import { alleVariablenBloecke, availableFor, blBlock, blHat, skriptVariablen, type BloecklyContext } from "./BloecklySpec";

/**
 * Blöckly: Skripte und eigene Blöcke in eine andere Figur oder die Bühne kopieren – wie in Scratch.
 *
 *  - Ziehen auf eine Figur bzw. die Bühne im Reiter „Figuren“ (die Kachel leuchtet auf); der Block springt zurück.
 *  - Rechtsklick → „Kopieren nach …“.
 *
 * Mit dem Skript kommen die Variablen dieser Figur, die es benutzt (mit Startwert, oben ins kopierte Skript), und die
 * eigenen Blöcke, die es aufruft. Ein Skript mit „Wenn 🚩 angeklickt“ gibt es nur einmal im Projekt; davon (und von losen Blöcken ohne
 * Startblock) kommen die Blöcke als lose Blöcke in die andere Figur, die dazu geöffnet wird.
 */

/** was kopiert wird und woher */
export type KopierQuelle = {
    /** Skript (Startblock) oder eigener Block, jeweils mit allem darin */
    stapel: BlockState;
    /** eigene Blöcke der Quelle (für Aufrufe im Skript) */
    eigeneBloecke: BlockState[];
    /** alle „erstelle Variable …“ der Quelle (Variablen nur für diese Figur; von der Bühne: keine) */
    figurVariablen: BlockState[];
};

export type KopierZiel = { name: string; text: string; ctx: BloecklyContext; istBuehne: boolean };

export type KopierErgebnis = { text: string; mit: string[] } | { fehler: string; lose?: boolean };

const VAR_TYPEN = new Set<string>([B.varGet, B.varSet, B.varChange, B.listAdd, B.listRemove, B.listClear, B.listInsert, B.listSet, B.listGet,
    B.listIndexOf, B.listSize, B.listContains]);

function* alle(b: BlockState | undefined): Generator<BlockState> {
    if (!b) return;
    yield b;
    for (const i of Object.values(b.inputs ?? {})) yield* alle(i.block);
    yield* alle(b.next?.block);
}

/** Kopie ohne ids (Blockly vergibt neue) */
function ohneIds(b: BlockState): BlockState {
    const kopie = JSON.parse(JSON.stringify(b)) as BlockState;
    for (const x of alle(kopie)) delete x.id;
    return kopie;
}

const nameVon = (v: BlockState) => String(v.fields?.NAME ?? "");

/** lesbarer Name eines Blocks für Hinweise: „gehe … Schritte“ */
function blockName(type: string): string {
    const hat = blHat(type);
    if (hat?.type === B.blClone) return "Wenn ich als Klon entstehe";
    const b = blBlock(type);
    return b ? b.text.replace(/\{[^}]*\}/g, "…") : type;
}

/** Skript bzw. eigenen Block in den Text der Ziel-Datei einfügen (ohne Oberfläche, damit testbar) */
export function kopiere(q: KopierQuelle, z: KopierZiel): KopierErgebnis {
    const s = q.stapel;
    const istMethode = s.type === B.method;
    if (!istMethode && !blHat(s.type)) return { fehler: s.type === B.start ? "flagge" : "lose", lose: true };
    if (s.type === B.blFlag) return { fehler: "flagge", lose: true };

    const { state } = JavaBlockParser.parse(z.text, { bloeckly: z.ctx });
    const oben = state.blocks.blocks;
    const kopf = oben.find((b) => b.type === B.blFigure);
    if (!kopf) return { fehler: `${z.name} ist keine Figur und nicht die Bühne.` };
    const methoden = new Set(oben.filter((b) => b.type === B.method).map((b) => String(b.fields?.NAME ?? "")));
    if (istMethode && methoden.has(String(s.fields?.NAME ?? ""))) {
        return { fehler: `${z.name} hat schon einen eigenen Block „${s.fields?.NAME}“.` };
    }

    // eigene Blöcke, die das Skript (auch über andere eigene Blöcke) aufruft und die das Ziel nicht hat
    const neu: BlockState[] = [s];
    const mit: string[] = [];
    for (let i = 0; i < neu.length; i++) {
        for (const b of alle(neu[i])) {
            if (b.type !== B.call && b.type !== B.callExpr) continue;
            const name = String(b.fields?.NAME ?? "");
            if (methoden.has(name) || neu.some((n) => n.type === B.method && n.fields?.NAME === name)) continue;
            const def = q.eigeneBloecke.find((m) => m.fields?.NAME === name);
            if (def) {
                neu.push(def);
                mit.push(`eigener Block „${name}“`);
            }
        }
    }

    // Blöcke, die es nur bei Figuren gibt (bzw. nur auf der Bühne)
    const fehlt = new Set<string>();
    for (const n of neu) {
        for (const b of alle(n)) {
            const hat = blHat(b.type);
            const spec = hat ?? blBlock(b.type);
            if (spec && !availableFor(spec, z.istBuehne)) fehlt.add(blockName(b.type));
        }
    }
    if (fehlt.size) {
        const liste = [...fehlt].map((f) => `„${f}“`).join(", ");
        return { fehler: z.istBuehne ? `Die Bühne kann das nicht: ${liste} gibt es nur bei Figuren.` : `${z.name} kann das nicht: ${liste} gibt es nur auf der Bühne.` };
    }

    // Variablen: Was das Ziel schon hat (auch für alle Figuren), legt die Kopie nicht noch einmal an
    const vorhanden = new Set(alleVariablenBloecke(oben).map(nameVon));
    const gibtEs = (n: string) => vorhanden.has(n) || Object.prototype.hasOwnProperty.call(z.ctx.globals, n);
    const kopien = neu.map(ohneIds);
    const eigene = istMethode ? { variablen: [] as BlockState[], rest: undefined } : skriptVariablen(kopien[0]);
    const bleiben = eigene.variablen.filter((v) => !gibtEs(nameVon(v)));
    // Variablen nur für die Quell-Figur, die das Skript benutzt, kommen mit (die Bühne hat keine eigenen)
    const benutzt = new Set<string>();
    for (const n of neu) for (const b of alle(n)) if (VAR_TYPEN.has(b.type) && b.fields?.NAME) benutzt.add(b.fields.NAME);
    const imSkript = new Set(eigene.variablen.map(nameVon));
    const fehlende = q.figurVariablen.filter((v) => benutzt.has(nameVon(v)) && !imSkript.has(nameVon(v)) && !gibtEs(nameVon(v)));
    if ((fehlende.length || bleiben.length) && z.istBuehne) {
        const namen = [...bleiben, ...fehlende].map((v) => `„${nameVon(v)}“`).join(", ");
        return { fehler: `Das Skript benutzt Variablen nur für diese Figur (${namen}) – die gibt es auf der Bühne nicht.` };
    }
    const dazu = fehlende.map((v) => ohneIds({ ...v, next: undefined }));
    for (const v of dazu) mit.push(`Variable „${nameVon(v)}“`);
    if (istMethode) {
        // eigener Block: Variablen in den (unsichtbaren) Kopf – beim Öffnen wandern sie oben in ein Skript
        let letzte = kopf.inputs?.VARS?.block;
        while (letzte?.next) letzte = letzte.next.block;
        for (const v of dazu) {
            if (letzte) letzte.next = { block: v };
            else kopf.inputs = { ...(kopf.inputs ?? {}), VARS: { block: v } };
            letzte = v;
        }
    } else {
        // Skript: oben die Variablen (eigene, die das Ziel noch nicht hat, und mitgebrachte), dann der Rest
        const kette = [...bleiben, ...dazu];
        for (let i = 0; i < kette.length; i++) {
            if (i + 1 < kette.length) kette[i].next = { block: kette[i + 1] };
            else if (eigene.rest) kette[i].next = { block: eigene.rest };
            else delete kette[i].next;
        }
        const start = kette[0] ?? eigene.rest;
        kopien[0].inputs = { ...(kopien[0].inputs ?? {}) };
        if (start) kopien[0].inputs.BODY = { block: start };
        else delete kopien[0].inputs.BODY;
    }

    // ans Ende: Skripte stehen in der Reihenfolge ihrer Höhe
    let y = Math.max(0, ...oben.map((b) => b.y ?? 0));
    for (const n of kopien) {
        y += 100;
        oben.push({ ...n, x: 0, y });
    }
    return { text: JavaBlockGenerator.generate(state, { bloeckly: z.ctx }).code, mit };
}

// —— Oberfläche ——

type Anbindung = {
    main: Main;
    ws: Blockly.WorkspaceSvg;
    /** Datei der Blöcke (Quelle) */
    datei: () => GUIFile | undefined;
    /** Blöcke in die Datei schreiben (vor dem Lesen ihres Textes) */
    schreiben: () => void;
};

let aktuell: Anbindung | undefined;
let zeiger = { x: -1, y: -1 };

/** Kacheln der Figuren und der Bühne im Reiter „Figuren“ */
function kacheln(): HTMLElement[] {
    return Array.from(document.querySelectorAll<HTMLElement>(".jo_tab.gsg-bl .gsg-bl-figurenspalte > .gsg-bl-liste .gsg-bl-kachel, .jo_tab.gsg-bl .gsg-bl-buehnenkachel"));
}

function kachelBei(x: number, y: number): HTMLElement | undefined {
    return kacheln().find((k) => {
        const r = k.getBoundingClientRect();
        return r.width > 0 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    });
}

function zieleUndDateien(a: Anbindung): { datei: GUIFile; name: string; istBuehne: boolean }[] {
    const p = liesProjekt((a.main.getCurrentWorkspace()?.getFiles() ?? []).filter((f) => !f.isFolder));
    const quelle = a.datei();
    return [
        ...p.figuren.map((f) => ({ datei: f.datei, name: f.info.klasse, istBuehne: false })),
        ...(p.buehne ? [{ datei: p.buehne.datei, name: "Bühne", istBuehne: true }] : []),
    ].filter((z) => z.datei !== quelle);
}

/** Meldung unten über der Seite, verschwindet von selbst */
function melde(text: string, fehler = false) {
    document.querySelector(".gsg-bl-meldung")?.remove();
    const m = el("div", "gsg-bl-meldung" + (fehler ? " gsg-bl-meldung-fehler" : ""), text);
    m.setAttribute("role", "status");
    document.body.append(m);
    setTimeout(() => m.remove(), fehler ? 6000 : 3500);
}

/** Block (mit allem darunter) nach ziel kopieren */
function kopiereNach(a: Anbindung, block: Blockly.BlockSvg, ziel: { datei: GUIFile; name: string; istBuehne: boolean }) {
    const quelle = a.datei();
    if (!quelle || quelle === ziel.datei) return;
    a.schreiben();
    const files = (a.main.getCurrentWorkspace()?.getFiles() ?? []).filter((f) => !f.isFolder);
    const p = liesProjekt(files);
    const stage = p.buehne?.info.klasse ?? BUEHNEN_KLASSE;
    const globals = p.buehne ? variablenDerKlasse(p.buehne.datei.getText(), { stage, globals: {} }) : {};
    const ctx = (buehne: boolean): BloecklyContext => ({ stage, globals: buehne ? {} : globals });
    const quelleIstBuehne = p.buehne?.datei === quelle;

    const speichern = (b: Blockly.Block) => Blockly.serialization.blocks.save(b, { addCoordinates: false, addNextBlocks: true }) as unknown as BlockState;
    const quellBloecke = JavaBlockParser.parse(quelle.getText(), { bloeckly: ctx(quelleIstBuehne) }).state.blocks.blocks;
    const ergebnis = kopiere({
        stapel: speichern(block),
        eigeneBloecke: a.ws.getTopBlocks(false).filter((b) => b.type === B.method).map(speichern),
        figurVariablen: quelleIstBuehne ? [] : alleVariablenBloecke(quellBloecke),
    }, { name: ziel.name, text: ziel.datei.getText(), ctx: ctx(ziel.istBuehne), istBuehne: ziel.istBuehne });

    if ("fehler" in ergebnis) {
        if (ergebnis.lose) return loseKopieren(a, block, ziel, ergebnis.fehler === "flagge");
        melde(ergebnis.fehler, true);
        return;
    }
    ziel.datei.getMonacoModel();
    ziel.datei.setText(ergebnis.text);
    ziel.datei.setSaved(false);
    a.main.getCompiler()?.triggerCompile();
    const was = block.type === B.method ? `Eigener Block „${block.getFieldValue("NAME")}“` : "Skript";
    melde(`${was} zu ${ziel.name === "Bühne" ? "der Bühne" : ziel.name} kopiert${ergebnis.mit.length ? " (mit " + ergebnis.mit.join(", ") + ")" : ""}.`);
    const kachel = kacheln().find((k) => k.dataset.datei === ziel.datei.name);
    if (kachel) {
        kachel.classList.remove("gsg-bl-kopiert");
        void kachel.offsetWidth;
        kachel.classList.add("gsg-bl-kopiert");
    }
}

/**
 * Lose Blöcke (oder die Blöcke unter „Wenn 🚩 angeklickt“): Sie gehören erst zum Programm, wenn sie an einem Startblock
 * hängen. Darum die andere Figur öffnen und sie dort ablegen – zum Anhängen.
 */
function loseKopieren(a: Anbindung, block: Blockly.BlockSvg, ziel: { datei: GUIFile; name: string }, flagge: boolean) {
    // „Wenn 🚩 angeklickt“ (bzw. „Hauptprogramm“ in einem alten versteckten Hauptprogramm): nur die Blöcke darin
    const erster = flagge ? block.getInputTargetBlock("BODY") as Blockly.BlockSvg | null : block;
    if (!erster) {
        melde(block.type === B.blFlag ? "„Wenn 🚩 angeklickt“ gibt es nur einmal im Projekt – und darunter hängen keine Blöcke." : "Darin hängen keine Blöcke.", true);
        return;
    }
    const daten = Blockly.serialization.blocks.save(erster, { addCoordinates: false, addNextBlocks: true });
    if (!daten) return;
    a.main.projectExplorer.setFileActive(ziel.datei);
    // die Blockansicht lädt die andere Figur; danach oben links in den sichtbaren Bereich legen
    setTimeout(() => {
        const ws = aktuell?.ws;
        if (!ws || aktuell?.datei() !== ziel.datei) return;
        // unter die vorhandenen Blöcke legen und dorthin blättern
        const rahmen = ws.getBlocksBoundingBox();
        const b = Blockly.serialization.blocks.append(daten, ws) as Blockly.BlockSvg;
        b.moveTo(new Blockly.utils.Coordinate(rahmen.left, rahmen.bottom + 40));
        ws.scrollBoundsIntoView(b.getBoundingRectangle());
        b.select();
        melde(flagge && block.type === B.blFlag
            ? `„Wenn 🚩 angeklickt“ gibt es nur einmal im Projekt. Die Blöcke darunter liegen jetzt bei ${ziel.name} – häng sie an einen Startblock.`
            : `Die Blöcke liegen jetzt bei ${ziel.name} – häng sie an einen Startblock, sonst gehen sie verloren.`);
    }, 50);
}

/** „Kopieren nach …“: Figur oder Bühne wählen */
function kopierenNachFragen(a: Anbindung, block: Blockly.BlockSvg) {
    const ziele = zieleUndDateien(a);
    const inhalt = el("div", "gsg-bl-kopierziele");
    if (ziele.length === 0) inhalt.append(el("p", undefined, "Es gibt noch keine andere Figur."));
    let schliessen = () => { };
    for (const z of ziele) {
        const b = knopf(z.name, `Nach ${z.name} kopieren`, "gsg-bl-knopf gsg-bl-karte");
        b.addEventListener("click", () => {
            schliessen();
            kopiereNach(a, block, z);
        });
        inhalt.append(b);
    }
    schliessen = dialog("Kopieren nach …", inhalt);
}

/** Ziel beim Ziehen: der Reiter „Figuren“ (Rechteck beim Start des Ziehens) */
class FigurenZiel extends Blockly.DragTarget {
    override id = "gsg_bl_figuren_ziel";
    private markiert?: HTMLElement;

    override getClientRect(): Blockly.utils.Rect | null {
        const reiter = document.querySelector<HTMLElement>(".jo_tab.gsg-bl");
        const r = reiter?.getBoundingClientRect();
        if (!r || r.width === 0 || reiter!.classList.contains("gsg-bl-kein-projekt")) return null;
        return new Blockly.utils.Rect(r.top, r.bottom, r.left, r.right);
    }

    private markiere(k: HTMLElement | undefined) {
        if (k === this.markiert) return;
        this.markiert?.classList.remove("gsg-bl-ziel");
        this.markiert = k;
        k?.classList.add("gsg-bl-ziel");
    }

    override onDragEnter(): void { this.onDragOver(); }
    override onDragOver(): void {
        const k = kachelBei(zeiger.x, zeiger.y);
        this.markiere(k && k.dataset.datei !== aktuell?.datei()?.name ? k : undefined);
    }
    override onDragExit(): void { this.markiere(undefined); }

    override onDrop(element: Blockly.IDraggable): void {
        const k = this.markiert;
        this.markiere(undefined);
        const a = aktuell;
        if (!k || !a || !(element instanceof Blockly.BlockSvg)) return;
        const ziel = zieleUndDateien(a).find((z) => z.datei.name === k.dataset.datei);
        // erst nach dem Zurückspringen des Blocks kopieren
        if (ziel) setTimeout(() => kopiereNach(a, element, ziel), 0);
    }

    /** Was im Reiter „Figuren“ landet, springt zurück an seinen Platz */
    override shouldPreventMove(): boolean { return true; }
}

let menueAngemeldet = false;

/** In BlockView nach dem Anlegen der Blockfläche (nur Blöckly) */
export function bloecklyKopierenAnmelden(main: Main, ws: Blockly.WorkspaceSvg, datei: () => GUIFile | undefined, schreiben: () => void) {
    aktuell = { main, ws, datei, schreiben };
    if (!ws.options.readOnly) {
        ws.getComponentManager().addComponent({ component: new FigurenZiel(), weight: 1, capabilities: [Blockly.ComponentManager.Capability.DRAG_TARGET] });
    }
    if (menueAngemeldet) return;
    menueAngemeldet = true;
    document.addEventListener("pointermove", (e) => { zeiger = { x: e.clientX, y: e.clientY }; }, true);
    Blockly.ContextMenuRegistry.registry.register({
        id: "gsg_bl_kopieren_nach",
        scopeType: Blockly.ContextMenuRegistry.ScopeType.BLOCK,
        displayText: (scope) => {
            const t = (scope.block as Blockly.BlockSvg | undefined)?.type;
            return t === B.method ? "Eigenen Block kopieren nach …" : t && blHat(t) ? "Skript kopieren nach …" : "Blöcke ab hier kopieren nach …";
        },
        weight: 1,
        preconditionFn: (scope) => {
            const b = scope.block as Blockly.BlockSvg | undefined;
            const a = aktuell;
            if (!b || !a || b.workspace !== a.ws || b.isInFlyout || a.ws.options.readOnly || b.type === B.blFigure) return "hidden";
            return zieleUndDateien(a).length ? "enabled" : "disabled";
        },
        callback: (scope) => {
            const b = scope.block as Blockly.BlockSvg | undefined;
            if (b && aktuell) kopierenNachFragen(aktuell, b);
        },
    });
}
