import * as Blockly from "blockly/core";
import { defineBlocks, toolbox, VARIABLES_CATEGORY, variablesFlyout } from "./BlockDefinitions";
import { OPERATIONS_CATEGORY, operationsFlyout } from "./BlockOperations";
import { FIGURES_CATEGORY, figuresFlyout, INPUT_CATEGORY, inputFlyout } from "./BlockFigures";
import { ADT_CATEGORY, adtFlyout, ARRAYS_CATEGORY, arraysFlyout, LISTS_CATEGORY, listsFlyout } from "./BlockCollections";
import { CLASSES_CATEGORY, classesFlyout, OBJECTS_CATEGORY, objectsFlyout } from "./BlockClasses";
import { vereinigeKataloge, type KatalogKategorie, type ToolboxEintrag } from "./BlockMikrowelt";
import { katalogAus } from "./BlockMikroweltKatalog";
import { bloecklyToolbox, defineBloecklyBlocks, fuerFigurUndBuehne, registerBloecklyToolbox } from "../bloeckly/BloecklyBlocks";

/**
 * GSG: Katalog aller Blöcke von Blöckva und Blöckly für die Verwaltung (Freigaben → einzelne Blöcke). Die
 * Verwaltung ist eine eigene Seite ohne Blockly; sie liest den Katalog aus backend/public/verwaltung/bloecke-katalog.json.
 * Diese Datei schreibt BlockFreigabeKatalog.test.ts (GSG_KATALOG_SCHREIBEN=1) und prüft sonst, dass sie aktuell ist.
 */

export type FreigabeKatalog = { bloeckva: KatalogKategorie[]; bloeckly: KatalogKategorie[] };

type Callback = (ws: Blockly.WorkspaceSvg) => unknown;

/** Arbeitsfläche ohne Darstellung, die Inhalte dynamischer Kategorien liefern kann */
function headlessWorkspace(): { ws: Blockly.WorkspaceSvg; callbacks: Map<string, Callback> } {
    const callbacks = new Map<string, Callback>();
    const ws = Object.assign(new Blockly.Workspace(), {
        registerToolboxCategoryCallback: (key: string, f: Callback) => { callbacks.set(key, f); },
        getToolboxCategoryCallback: (key: string) => callbacks.get(key),
        registerButtonCallback: () => { /* Knöpfe braucht der Katalog nicht */ },
    }) as unknown as Blockly.WorkspaceSvg;
    return { ws, callbacks };
}

const ohneKategorien = (items: unknown) => (Array.isArray(items) ? (items as ToolboxEintrag[]).filter((e) => e.kind !== "category") : []);

/** nur, was man in der Verwaltung braucht: Kennung, Name, Tiefe, Blöcke */
const knapp = (k: KatalogKategorie[]) => k.filter((c) => c.bloecke.length).map((c) => ({
    id: c.id, name: c.name, colour: c.colour, tiefe: c.tiefe,
    // „ Hallo “ -> „Hallo“, ( 400 | 300 ) -> (400 | 300)
    bloecke: c.bloecke.map((b) => ({ schluessel: b.schluessel, text: b.text.replace(/([„‚(]) /g, "$1").replace(/ ([“‘)])/g, "$1") })),
}));

export function freigabeKatalog(): FreigabeKatalog {
    defineBlocks();
    defineBloecklyBlocks();

    const bv = headlessWorkspace();
    const flyouts: Record<string, Callback> = {
        [VARIABLES_CATEGORY]: variablesFlyout, [OPERATIONS_CATEGORY]: operationsFlyout, [ARRAYS_CATEGORY]: arraysFlyout,
        [LISTS_CATEGORY]: listsFlyout, [ADT_CATEGORY]: adtFlyout, [FIGURES_CATEGORY]: figuresFlyout, [INPUT_CATEGORY]: inputFlyout,
        [CLASSES_CATEGORY]: classesFlyout, [OBJECTS_CATEGORY]: objectsFlyout,
    };
    for (const [k, f] of Object.entries(flyouts)) bv.callbacks.set(k, f);
    let bloeckva: KatalogKategorie[];
    try {
        bloeckva = katalogAus(toolbox() as { contents?: unknown }, (c) => {
            if (typeof c.custom === "string") return ohneKategorien(bv.callbacks.get(c.custom)?.(bv.ws));
            if (c.toolboxitemid === "variablen") return ohneKategorien(variablesFlyout(bv.ws));
            return ohneKategorien(c.contents);
        }, false);
    } finally {
        bv.ws.dispose();
    }

    const bl = headlessWorkspace();
    let bloeckly: KatalogKategorie[];
    try {
        registerBloecklyToolbox(bl.ws);
        const katalog = () => katalogAus(bloecklyToolbox() as { contents?: unknown },
            (c) => ohneKategorien(typeof c.custom === "string" ? bl.callbacks.get(c.custom)?.(bl.ws) : c.contents), true);
        bloeckly = vereinigeKataloge(...fuerFigurUndBuehne(katalog));
    } finally {
        bl.ws.dispose();
    }
    return { bloeckva: knapp(bloeckva), bloeckly: knapp(bloeckly) };
}
