import * as monaco from "monaco-editor";
import type { MainBase } from "../main/MainBase";
import type { Main } from "../main/Main";
import { Tab, type TabManager } from "../../tools/TabManager";
import { Constants } from "../Constants";
import { markdownToHtml } from "../task/Markdown";
import { createFile, ensureLibraries, freeName } from "../structogram/ProjectFiles";
import { setHandbookOpener, type HandbookEntry, type HandbookKind, type HandbookSection, type OpenOptions } from "./Handbook";
import { BLOCK_HANDBOOK } from "./HandbookBlocks";
import { BLOECKLY_HANDBOOK } from "./HandbookBloeckly";
import { BUEHNEN_DATEI, BUEHNEN_KLASSE, liesFigur, variablenDerKlasse } from "../bloeckly/BloecklyProjekt";
import { beispielProjektOeffnen } from "../bloeckly/BloecklyBeispiel";
import { HELP_SCHEME, parseHelpUri } from "./HelpLinks";
import { JAVA_HANDBOOK } from "./HandbookJava";
import { STRUCTOGRAM_HANDBOOK } from "./HandbookStructogram";
import { KLASSENDIAGRAMM_HANDBOOK } from "./HandbookKlassendiagramm";
import { emptyDoc as leeresKlassendiagramm, newId as neueKdId, serializeDoc as speichereKlassendiagramm, type KlassenDoc } from "../klassendiagramm/KlassenDoc";
import { ordneAn, renderSvg as klassenSvg, STIL as KD_STIL } from "../klassendiagramm/KlassenSvg";
import { definedTypes, exampleFileName, findBlockEntry, structogramShape } from "./HandbookSearch";
import { diagramOfDoc, parseDoc, serializeDoc, withNewIds, type StructogramDoc } from "../structogram/StructogramDoc";
import { renderSvg, STYLE } from "../structogram/StructogramSvg";
import { DATEI_GEWECHSELT, dateiartVon, type Dateiart } from "../main/gui/Dateiart";
import "/assets/css/gsg-handbook.css";

/**
 * Reiter „Handbuch“ (GSG): kleine Beispielprogramme mit kurzen Erklärungen – für die Blöcke
 * (gegliedert wie die Werkzeugleiste, Beispiele als Blockbild), für Struktogramme (als Struktogramm)
 * und für Java (als Text). „Ausprobieren“ legt das Beispiel als neue Datei im Projekt an. Geöffnet
 * über das Menü „Handbuch“, per Rechtsklick „Hilfe“ auf einem Block oder „? Hilfe“ im Struktogramm-Editor.
 */

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
}

const entryKey = (kind: HandbookKind, section: string, index: number) => `${kind}-${section}-${index}`;

export function addHandbookTab(base: MainBase, tabManager: TabManager) {
    const main = base as Main;
    const tab = new Tab("Handbook", "Handbuch", ["gsg-handbook"]);
    tabManager.addTab(tab);

    let chosenKind: HandbookKind | undefined;
    let query = "";
    const opened = new Set<string>();     // aufgeklappte Abschnitte („kind:id“)
    let renderedKey = "";

    const dark = () => main.themeManager?.currentTheme?.name !== "light";
    const javaAvailable = () => {
        if (Constants.isBlocksApp) return !main.blockModeController?.isJavaLocked();
        if (Constants.isStructogramApp || Constants.isKlassendiagrammApp) {
            // wie „In Java umwandeln“: nur mit Java-Freigabe der Lerngruppe (Lehrkräfte immer)
            const u = main.user as { is_teacher?: boolean; is_admin?: boolean; is_schooladmin?: boolean; gsgFreigaben?: { java?: boolean } } | undefined;
            return !u || !!(u.is_teacher || u.is_admin || u.is_schooladmin || u.gsgFreigaben?.java);
        }
        return true;
    };
    // Texva hat keine Blockansicht (13.11.2026): dort auch kein Blöcke-Handbuch
    const blocksAvailable = () => !Constants.isStructogramApp && !Constants.isKlassendiagrammApp && !Constants.isTexvaApp;
    /** Handbücher, zwischen denen umgeschaltet werden kann (Blöckly: keine Struktogramme) */
    const kinds = (): HandbookKind[] => [
        ...(blocksAvailable() ? ["blocks" as const] : []),
        ...(Constants.isBloecklyApp ? [] : ["struktogramm" as const]),
        ...(Constants.isBloecklyApp ? [] : ["klassendiagramm" as const]),
        ...(javaAvailable() ? ["java" as const] : []),
    ];
    /** Art der offenen Datei (undefined: noch kein Editor bzw. keine Datei offen) */
    const editingKind = (): Dateiart | undefined => {
        try {
            const model = main.getMainEditor?.()?.getModel();
            return model ? dateiartVon(model.uri.path) : undefined;
        } catch {
            return undefined;   // beim Start der IDE gibt es den Editor noch nicht
        }
    };
    /** das Handbuch der Anwendung (ohne offene Datei bzw. wenn das passende nicht freigegeben ist) */
    const appKind = (): HandbookKind => Constants.isKlassendiagrammApp ? "klassendiagramm" : Constants.isStructogramApp ? "struktogramm"
        : Constants.isBlocksApp ? "blocks" : "java";
    /** das Handbuch zur offenen Datei: Klassendiagramm, Struktogramm oder – bei Code – Blöcke bzw. Texva wie die Ansicht */
    const fileKind = (): HandbookKind | undefined => {
        const art = editingKind();
        if (!art) return undefined;
        if (art !== "code") return art;
        return Constants.isBlocksApp || main.blockModeController?.getMode() === "blocks" ? "blocks" : "java";
    };
    /** Umschalter oben im Handbuch: gilt, bis eine Datei anderer Art geöffnet wird */
    let chosenFor: HandbookKind | undefined;
    const kind = (): HandbookKind => {
        const zurDatei = fileKind();
        if (chosenKind && chosenFor !== zurDatei) chosenKind = undefined;
        const available = kinds();
        // Code in der Blockansicht, aber kein Blöcke-Handbuch (Struktogramme, Klassendiagramme): dann Texva
        const wanted = [chosenKind, zurDatei, zurDatei === "blocks" ? "java" as const : undefined, appKind()].find((k) => k && available.includes(k));
        return wanted ?? available[0];
    };
    const hiddenCategories = (): string[] => {
        if (!Constants.isBlocksApp) return [];
        const f = (main.user as { gsgFreigaben?: { bloeckeAusgeblendet?: unknown; bloecklyAusgeblendet?: unknown } } | undefined)?.gsgFreigaben;
        const hidden = Constants.isBloecklyApp ? f?.bloecklyAusgeblendet : f?.bloeckeAusgeblendet;
        return Array.isArray(hidden) ? hidden.filter((h): h is string => typeof h === "string") : [];
    };
    const sections = (k: HandbookKind): HandbookSection[] => {
        if (k === "java") return JAVA_HANDBOOK;
        if (k === "struktogramm") return STRUCTOGRAM_HANDBOOK;
        if (k === "klassendiagramm") return KLASSENDIAGRAMM_HANDBOOK;
        const hidden = hiddenCategories();
        if (Constants.isBloecklyApp) return BLOECKLY_HANDBOOK.filter((s) => !hidden.includes(s.id));   // Paket 18h
        return BLOCK_HANDBOOK.filter((s) => !hidden.includes(s.id) && !(s.parent && hidden.includes(s.parent)));
    };

    const matches = (e: HandbookEntry, q: string) =>
        (e.title + " " + e.text + " " + e.code + " " + (e.structogram ? structogramShape(e.structogram) : "")).toLowerCase().includes(q);

    // ------------------------------------------------------------------ Darstellung

    const render = (force = false) => {
        const k = kind();
        const key = `${k}|${dark()}|${query}|${[...opened].join(",")}|${hiddenCategories().join(",")}|${javaAvailable()}`;
        if (!force && key === renderedKey && tab.bodyDiv.childElementCount) return;
        renderedKey = key;
        const scroll = tab.bodyDiv.querySelector(".gsg-hb-content")?.scrollTop ?? 0;
        const body = tab.bodyDiv;
        body.innerHTML = "";
        body.append(header(k));
        const content = el("div", "gsg-hb-content");
        const q = query.trim().toLowerCase();
        const list = sections(k);
        if (!q) content.append(intro(k));
        let found = 0;
        for (const s of list) {
            const entries = s.entries.map((e, i) => ({ e, i })).filter(({ e }) => !q || matches(e, q));
            if (q && !entries.length) continue;
            found += entries.length;
            content.append(section(k, s, entries, !!q));
        }
        if (q && !found) content.append(el("p", "gsg-hb-empty", `Nichts gefunden zu „${query.trim()}“.`));
        body.append(content);
        content.scrollTop = scroll;
    };

    const header = (k: HandbookKind): HTMLElement => {
        const head = el("div", "gsg-hb-head");
        const available = kinds();
        if (available.length > 1) {
            const sw = el("div", "gsg-hb-switch");
            sw.setAttribute("role", "group");
            const labels: Record<HandbookKind, string> = { blocks: "Blöcke", struktogramm: "Struktogramm", klassendiagramm: "Klassendiagramm", java: "Code" };
            for (const value of available) {
                const label = labels[value];
                const b = el("button", value === k ? "active" : "", label);
                b.type = "button";
                b.setAttribute("aria-pressed", String(value === k));
                b.addEventListener("click", () => { chosenKind = value; chosenFor = fileKind(); render(); });
                sw.append(b);
            }
            head.append(sw);
        } else {
            head.append(el("span", "gsg-hb-title", k === "blocks" ? (Constants.isBloecklyApp ? "Handbuch Blocks" : "Handbuch Blöcke") : k === "struktogramm" ? "Handbuch Struktogramme" : k === "klassendiagramm" ? "Handbuch Klassendiagramme" : "Handbuch Code"));
        }
        const search = el("input", "gsg-hb-search");
        search.type = "search";
        search.placeholder = "Suchen …";
        search.value = query;
        search.setAttribute("aria-label", "Im Handbuch suchen");
        let timer: number | undefined;
        search.addEventListener("input", () => {
            clearTimeout(timer);
            timer = window.setTimeout(() => {
                query = search.value;
                render();
                const again = tab.bodyDiv.querySelector<HTMLInputElement>(".gsg-hb-search");
                again?.focus();
                again?.setSelectionRange(again.value.length, again.value.length);
            }, 200);
        });
        head.append(search);
        return head;
    };

    const intro = (k: HandbookKind): HTMLElement => {
        const p = el("p", "gsg-hb-intro");
        p.innerHTML = k === "blocks" && Constants.isBloecklyApp
            ? "Zu jeder Kategorie der Werkzeugleiste gibt es kleine Beispiele, dazu Beispielprojekte zum Weiterbauen. Mit <b>▶ Ausprobieren</b> wird ein Beispiel als eigenes Projekt angelegt – dein Projekt bleibt, wie es ist. Tipp: Rechtsklick auf einen Block → <b>Hilfe</b> führt direkt zum passenden Beispiel."
            : k === "blocks"
            ? "Zu jeder Kategorie der Werkzeugleiste gibt es kleine Beispielprogramme. Mit <b>▶ Ausprobieren</b> wird ein Beispiel als neue Datei in deinem Projekt angelegt. Tipp: Rechtsklick auf einen Block → <b>Hilfe</b> führt direkt zum passenden Beispiel."
            : k === "klassendiagramm"
                ? "Klassendiagramme in der Schreibweise der Ergänzenden Hinweise für das Abitur: wie man den Editor bedient, was die Zeichen bedeuten, wie Beziehungen aussehen und wie aus dem Diagramm Code wird – dazu Übungen zum Modellieren. Mit <b>▶ Ausprobieren</b> wird ein Beispiel als Klassendiagramm-Datei in deinem Projekt angelegt."
            : k === "struktogramm"
                ? "Struktogramme in der Schreibweise der Ergänzenden Hinweise für das Abitur. Mit <b>▶ Ausprobieren</b> wird ein Beispiel als Struktogramm-Datei in deinem Projekt angelegt. Im Editor: Element anklicken, Text oben ändern, mit den Knöpfen unter „Einfügen“ neue Elemente dahinter einfügen. Ein Fragezeichen am Text heißt: Diese Formulierung kennt die Umwandlung in Code noch nicht."
                : "In <b>Code</b> schreibst du Java mit einigen Anpassungen für den Unterricht – was anders ist, steht unter <b>Code und echtes Java</b>. Kleine Beispielprogramme von der ersten Ausgabe bis zur Vererbung. Mit <b>▶ Ausprobieren</b> wird ein Beispiel als neue Datei in deinem Projekt angelegt.";
        return p;
    };

    const section = (k: HandbookKind, s: HandbookSection, entries: { e: HandbookEntry; i: number }[], searching: boolean): HTMLElement => {
        const id = `${k}:${s.id}`;
        const d = el("details", "gsg-hb-section" + (s.parent ? " gsg-hb-sub" : ""));
        d.dataset.section = s.id;
        d.open = searching || opened.has(id);
        const sum = el("summary");
        sum.append(el("span", "gsg-hb-icon", s.icon), el("span", "gsg-hb-stitle", s.title), el("span", "gsg-hb-count", String(entries.length)));
        d.append(sum);
        const fill = () => {
            if (d.querySelector(".gsg-hb-body")) return;
            const inner = el("div", "gsg-hb-body");
            const introText = el("div", "gsg-hb-text gsg-hb-sintro");
            introText.innerHTML = markdownToHtml(s.intro);
            inner.append(introText);
            for (const { e, i } of entries) inner.append(entry(k, s, e, i));
            d.append(inner);
        };
        if (d.open) fill();
        d.addEventListener("toggle", () => {
            if (searching) return;
            if (d.open) { opened.add(id); fill(); } else opened.delete(id);
            renderedKey = "";   // Zustand geändert, beim nächsten Zeigen neu aufbauen
        });
        return d;
    };

    const entry = (k: HandbookKind, s: HandbookSection, e: HandbookEntry, index: number): HTMLElement => {
        const box = el("div", "gsg-hb-entry" + (e.solution ? " is-exercise" : ""));
        box.id = "gsg-hb-" + entryKey(k, s.id, index);
        box.append(el("h4", "gsg-hb-etitle", e.title));
        const text = el("div", "gsg-hb-text");
        text.innerHTML = markdownToHtml(e.text);
        box.append(text);
        if (k === "struktogramm" && e.structogram) {
            box.append(drawStructogram(e.structogram));
            if (javaAvailable()) box.append(javaDetails(e.code));
        } else if (k === "klassendiagramm") {
            // Paket 20: Diagramm wie im Editor; Bedienung ohne Bild, Übung erst mit der Lösung
            if (e.klassendiagramm?.klassen.length) box.append(drawKlassendiagramm(e.klassendiagramm));
            if (e.code && javaAvailable()) box.append(javaDetails(e.code));
        } else if (k === "blocks" && e.bloeckly) {
            // Blöckly (Paket 18h): Skripte je Figur bzw. Bühne
            for (const name of e.bloeckly.show) {
                const file = e.bloeckly.files.find((f) => f.name === name);
                if (!file) continue;
                if (e.bloeckly.show.length > 1 || name === BUEHNEN_DATEI) box.append(el("div", "gsg-hb-figur", name === BUEHNEN_DATEI ? "🎭 Bühne" : "🐾 " + name));
                const pic = el("div", "gsg-hb-blocks", "Blöcke werden gezeichnet …");
                box.append(pic);
                drawBloeckly(pic, e.bloeckly.files, file);
            }
            if (javaAvailable()) box.append(javaDetails(e.code));
        } else if (k === "blocks") {
            const pic = el("div", "gsg-hb-blocks", "Blöcke werden gezeichnet …");
            box.append(pic);
            drawBlocks(pic, e.code);
            if (javaAvailable()) box.append(javaDetails(e.code));
        } else {
            const pre = el("pre", "gsg-hb-java");
            box.append(pre);
            colorize(pre, e.code);
        }
        if (e.solution) box.append(solutionDetails(k, e.solution));
        if (k === "klassendiagramm" && !e.klassendiagramm) return box;   // reine Anleitung: nichts anzulegen
        const actions = el("div", "gsg-hb-actions");
        const tryIt = el("button", "gsg-hb-button gsg-hb-primary", "▶ Ausprobieren");
        tryIt.type = "button";
        tryIt.title = e.bloeckly ? "Beispiel als eigenes Projekt anlegen und öffnen"
            : k === "klassendiagramm" ? (e.solution ? "Leeres Klassendiagramm für die Übung anlegen und öffnen" : "Beispiel als Klassendiagramm-Datei in deinem Projekt anlegen und öffnen")
            : k === "struktogramm" ? "Beispiel als Struktogramm-Datei in deinem Projekt anlegen und öffnen" : "Beispiel als neue Datei in deinem Projekt anlegen und öffnen";
        tryIt.addEventListener("click", () => tryExample(k, e));
        actions.append(tryIt);
        box.append(actions);
        return box;
    };

    /** Lösung einer Übung zum Aufklappen: Erklärung und Programm (Blöcke bzw. Java) */
    const solutionDetails = (k: HandbookKind, solution: { text: string; code: string; klassendiagramm?: KlassenDoc }): HTMLElement => {
        const det = el("details", "gsg-hb-solution");
        det.append(el("summary", undefined, "Lösung zeigen"));
        det.addEventListener("toggle", () => {
            if (!det.open || det.childElementCount > 1) return;
            const text = el("div", "gsg-hb-text");
            text.innerHTML = markdownToHtml(solution.text);
            det.append(text);
            if (k === "blocks") {
                const pic = el("div", "gsg-hb-blocks", "Blöcke werden gezeichnet …");
                det.append(pic);
                drawBlocks(pic, solution.code);
            } else if (k === "klassendiagramm" && solution.klassendiagramm) {
                det.append(drawKlassendiagramm(solution.klassendiagramm));
                if (javaAvailable()) det.append(javaDetails(solution.code));
            } else {
                const pre = el("pre", "gsg-hb-java");
                det.append(pre);
                colorize(pre, solution.code);
            }
        });
        return det;
    };

    /** Java-Code zum Aufklappen (Blöcke, Struktogramme) */
    const javaDetails = (code: string): HTMLElement => {
        const det = el("details", "gsg-hb-javadetails");
        det.append(el("summary", undefined, "Code"));
        const pre = el("pre", "gsg-hb-java");
        det.append(pre);
        det.addEventListener("toggle", () => { if (det.open && !pre.childElementCount) colorize(pre, code); });
        return det;
    };

    const measureCtx = document.createElement("canvas").getContext("2d");
    const measure = (text: string, bold?: boolean) => {
        if (!measureCtx) return [...text].length * (bold ? 7.6 : 7.1);
        measureCtx.font = `${bold ? "bold " : ""}${STYLE.font}px Arial, Helvetica, sans-serif`;
        return measureCtx.measureText(text).width;
    };

    /** Struktogramm wie im Editor (schwarz auf weiß, wie gedruckt) */
    const drawStructogram = (doc: StructogramDoc): HTMLElement => {
        const pic = el("div", "gsg-hb-structogram");
        const { svg, width } = renderSvg([diagramOfDoc(doc)], measure);
        const img = el("img");
        img.alt = "Beispiel als Struktogramm";
        img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
        img.style.width = `clamp(${Math.round(width * 0.7)}px, 100%, ${width}px)`;
        pic.append(img);
        return pic;
    };

    const kdMeasureCtx = document.createElement("canvas").getContext("2d");
    const kdMeasure = (text: string, bold: boolean) => {
        if (!kdMeasureCtx) return [...text].length * (bold ? 7.6 : 7.1);
        kdMeasureCtx.font = `${bold ? "bold " : ""}${KD_STIL.font}px Arial, Helvetica, sans-serif`;
        return kdMeasureCtx.measureText(text).width;
    };
    /** Beispiele ohne Lage (alle Klassen bei 0/0) automatisch anordnen */
    const angeordnet = (doc: KlassenDoc): KlassenDoc => doc.klassen.every((c) => !c.x && !c.y) ? ordneAn(doc, kdMeasure) : doc;

    /** Klassendiagramm wie im Editor (schwarz auf weiß, wie gedruckt) */
    const drawKlassendiagramm = (doc: KlassenDoc): HTMLElement => {
        const pic = el("div", "gsg-hb-structogram gsg-hb-klassendiagramm");
        const { svg, width } = klassenSvg(angeordnet(doc), kdMeasure);
        const img = el("img");
        img.alt = "Beispiel als Klassendiagramm";
        img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
        img.style.width = `clamp(${Math.round(width * 0.6)}px, 100%, ${width}px)`;
        pic.append(img);
        return pic;
    };

    const colorize = async (pre: HTMLElement, code: string) => {
        pre.textContent = code;
        try {
            pre.innerHTML = await monaco.editor.colorize(code.replace(/\n$/, ""), "myJava", { tabSize: 4 });
        } catch {
            // ohne Farben
        }
    };

    const drawBlocks = async (target: HTMLElement, code: string) => {
        try {
            const { blocksSvg } = await import("./HandbookBlockRender");
            const svg = await blocksSvg(code, dark());
            const img = el("img");
            img.alt = "Beispiel als Blöcke";
            img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
            const w = /width="(\d+)"/.exec(svg)?.[1];
            // in den Reiter einpassen, aber höchstens auf 70 % verkleinern (sonst waagerecht scrollen)
            if (w) img.style.width = `clamp(${Math.round(+w * 0.7)}px, 100%, ${w}px)`;
            target.textContent = "";
            target.append(img);
        } catch (err) {
            console.error(err);
            target.textContent = "Die Blöcke konnten nicht gezeichnet werden.";
        }
    };

    /** Blöckly: Skripte einer Datei des Beispiels zeichnen */
    const drawBloeckly = async (target: HTMLElement, files: { name: string; text: string }[], file: { name: string; text: string }) => {
        try {
            const { bloecklySvg } = await import("./HandbookBlockRender");
            const stage = files.find((f) => f.name === BUEHNEN_DATEI);
            const isStage = file === stage;
            const globals = stage ? variablenDerKlasse(stage.text, { stage: BUEHNEN_KLASSE, globals: {} }) : {};
            const figuren = files.map((f) => liesFigur(f.text)).filter((f) => !!f);
            const own = liesFigur(file.text);
            const svg = await bloecklySvg(file.text, { stage: BUEHNEN_KLASSE, globals: isStage ? {} : globals }, {
                stage: isStage, klasse: own?.klasse ?? BUEHNEN_KLASSE, aussehen: own?.figur ?? "", figuren: figuren.map((f) => f!.klasse), globals,
            }, dark());
            const img = el("img");
            img.alt = "Beispiel als Blöcke";
            img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
            const w = /width="(\d+)"/.exec(svg)?.[1];
            if (w) img.style.width = `clamp(${Math.round(+w * 0.7)}px, 100%, ${w}px)`;
            target.textContent = "";
            target.append(img);
        } catch (err) {
            console.error(err);
            target.textContent = "Die Blöcke konnten nicht gezeichnet werden.";
        }
    };

    // ------------------------------------------------------------------ Ausprobieren

    const tryExample = async (k: HandbookKind, e: HandbookEntry) => {
        if (e.bloeckly) {
            await beispielProjektOeffnen(main, e.title, e.bloeckly.files, e.bloeckly.show.find((n) => n !== BUEHNEN_DATEI) ?? e.bloeckly.show[0]);
            return;
        }
        const workspace = main.getCurrentWorkspace();
        if (!workspace) {
            alert("Bitte zuerst ein Projekt auswählen oder anlegen.");
            return;
        }
        if (workspace.readonly && !main.user?.is_teacher) {
            alert("Dieses Projekt ist schreibgeschützt. Bitte wähle ein eigenes Projekt aus.");
            return;
        }
        const files = workspace.getFiles().filter((f) => !f.isFolder);
        if (k === "struktogramm" && e.structogram) {
            // schon als Datei da? Dann diese öffnen
            const shape = structogramShape(e.structogram);
            const existing = files.find((f) => /\.struktogramm$/i.test(f.name) && structogramShape(parseDoc(f.getText())) === shape);
            if (existing) {
                main.projectExplorer.setFileActive(existing);
                return;
            }
            const doc: StructogramDoc = { ...e.structogram, body: e.structogram.body.map(withNewIds) };
            await createFile(main, freeName(main, exampleFileName(e.title, ".struktogramm")), serializeDoc(doc));
            return;
        }
        if (k === "klassendiagramm") {
            // neue Kennungen, damit Beispiel und Datei unabhängig sind
            const quelle = angeordnet(e.klassendiagramm ?? leeresKlassendiagramm());
            const ids = new Map(quelle.klassen.map((c) => [c.id, neueKdId()]));
            const doc: KlassenDoc = {
                ...quelle,
                klassen: quelle.klassen.map((c) => ({
                    ...c, id: ids.get(c.id)!,
                    attribute: c.attribute.map((a) => ({ ...a, id: neueKdId() })),
                    operationen: c.operationen.map((o) => ({ ...o, id: neueKdId(), parameter: o.parameter.map((p) => ({ ...p })) })),
                })),
                beziehungen: quelle.beziehungen.map((b) => ({ ...b, id: neueKdId(), von: ids.get(b.von) ?? b.von, nach: ids.get(b.nach) ?? b.nach })),
            };
            await createFile(main, freeName(main, exampleFileName(e.title.replace(/^Übung:\s*/, ""), ".klassendiagramm")), speichereKlassendiagramm(doc));
            return;
        }
        const same = files.find((f) => f.getText().replace(/\r\n/g, "\n") === e.code);
        if (same) {
            main.projectExplorer.setFileActive(same);
            if (k === "blocks") main.blockModeController?.useMode(same, "blocks");
            return;
        }
        const mine = definedTypes(e.code);
        if (mine.length) {
            const clashes = files.flatMap((f) => definedTypes(f.getText()).filter((t) => mine.includes(t)).map((t) => `${t} (in „${f.name}“)`));
            if (clashes.length && !confirm(`In deinem Projekt gibt es schon: ${clashes.join(", ")}.\n\nZwei Klassen mit demselben Namen vertragen sich nicht – dann zeigt die IDE Fehler an. Du kannst die andere Datei danach löschen oder umbenennen.\n\nBeispiel trotzdem anlegen?`)) {
                return;
            }
        }
        if (e.libs?.length) ensureLibraries(main, e.libs);
        const file = await createFile(main, freeName(main, exampleFileName(e.title)), e.code);
        if (file && k === "blocks") main.blockModeController?.useMode(file, "blocks");
    };

    // ------------------------------------------------------------------ Öffnen von außen

    const openAt = (o: OpenOptions) => {
        if (o.kind) { chosenKind = o.kind; chosenFor = fileKind(); }
        query = "";
        const k = kind();
        const list = sections(k);
        let target: { section: string; index?: number } | undefined;
        if (o.entry && o.section) {
            const index = list.find((s) => s.id === o.section)?.entries.findIndex((e) => e.title === o.entry) ?? -1;
            if (index >= 0) target = { section: o.section, index };
        }
        if (!target && o.blockType && k === "blocks") target = findBlockEntry(list, o.blockType, o.section);
        if (!target && o.section && list.some((s) => s.id === o.section)) target = { section: o.section };
        if (target) opened.add(`${k}:${target.section}`);
        tab.show();
        render(true);
        if (!target) return;
        const content = tab.bodyDiv.querySelector<HTMLElement>(".gsg-hb-content");
        const el2 = target.index !== undefined
            ? tab.bodyDiv.querySelector<HTMLElement>("#gsg-hb-" + entryKey(k, target.section, target.index))
            : tab.bodyDiv.querySelector<HTMLElement>(`.gsg-hb-section[data-section="${target.section}"]`);
        if (!content || !el2) return;
        // Blockbilder darüber werden nach und nach gezeichnet und schieben das Ziel nach unten:
        // ausrichten, bis jemand selbst scrollt (höchstens ein paar Sekunden lang)
        const align = () => { content.scrollTop += el2.getBoundingClientRect().top - content.getBoundingClientRect().top - 6; };
        const stop = () => {
            content.removeEventListener("load", align, true);
            content.removeEventListener("wheel", stop);
            content.removeEventListener("pointerdown", stop);
        };
        content.addEventListener("load", align, true);
        content.addEventListener("wheel", stop, { passive: true });
        content.addEventListener("pointerdown", stop);
        setTimeout(stop, 4000);
        requestAnimationFrame(align);
        el2.classList.add("gsg-hb-flash");
        setTimeout(() => el2.classList.remove("gsg-hb-flash"), 1800);
    };

    setHandbookOpener(openAt);
    tab.onShow = () => render();
    // GSG: andere Datei geöffnet bzw. Blöcke/Texva umgeschaltet – das Handbuch folgt, wenn es gerade zu sehen ist
    document.addEventListener(DATEI_GEWECHSELT, () => { if (tab.isActive()) render(); });

    // Paket 17b: Link „📖 Mehr dazu im Handbuch“ im Hover einer Java-Meldung
    monaco.editor.registerLinkOpener({
        open(resource: monaco.Uri) {
            if (resource.scheme !== HELP_SCHEME) return false;
            const help = parseHelpUri(resource.toString(true));
            if (!help) return false;
            openAt({ kind: help.kind, section: help.target.section, entry: help.target.entry });
            return true;
        },
    });
}
