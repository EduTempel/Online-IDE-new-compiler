import * as monaco from "monaco-editor";
import type { MainBase } from "../main/MainBase";
import type { Main } from "../main/Main";
import { Tab, type TabManager } from "../../tools/TabManager";
import { Constants } from "../Constants";
import { markdownToHtml } from "../task/Markdown";
import { createFile, ensureLibraries, freeName } from "../structogram/ProjectFiles";
import { setHandbookOpener, type HandbookEntry, type HandbookKind, type HandbookSection, type OpenOptions } from "./Handbook";
import { BLOCK_HANDBOOK } from "./HandbookBlocks";
import { JAVA_HANDBOOK } from "./HandbookJava";
import { definedTypes, exampleFileName, findBlockEntry } from "./HandbookSearch";
import "/assets/css/gsg-handbook.css";

/**
 * Reiter „Handbuch“ (GSG): kleine Beispielprogramme mit kurzen Erklärungen – für die Blöcke
 * (gegliedert wie die Werkzeugleiste, Beispiele als Blockbild) und für Java (als Text).
 * „Ausprobieren“ legt das Beispiel als neue Datei im Projekt an. Geöffnet über das Menü „Handbuch“
 * oder per Rechtsklick „Hilfe“ auf einem Block.
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
    const javaAvailable = () => !(Constants.isBlocksApp && main.blockModeController?.isJavaLocked());
    const blocksAvailable = () => !Constants.isStructogramApp;
    const kind = (): HandbookKind => {
        const wanted = chosenKind ?? (Constants.isBlocksApp || main.blockModeController?.getMode() === "blocks" ? "blocks" : "java");
        if (wanted === "java" && !javaAvailable()) return "blocks";
        if (wanted === "blocks" && !blocksAvailable()) return "java";
        return wanted;
    };
    const hiddenCategories = (): string[] => {
        if (!Constants.isBlocksApp) return [];
        const hidden = (main.user as { gsgFreigaben?: { bloeckeAusgeblendet?: unknown } } | undefined)?.gsgFreigaben?.bloeckeAusgeblendet;
        return Array.isArray(hidden) ? hidden.filter((h): h is string => typeof h === "string") : [];
    };
    const sections = (k: HandbookKind): HandbookSection[] => {
        if (k === "java") return JAVA_HANDBOOK;
        const hidden = hiddenCategories();
        return BLOCK_HANDBOOK.filter((s) => !hidden.includes(s.id) && !(s.parent && hidden.includes(s.parent)));
    };

    const matches = (e: HandbookEntry, q: string) => (e.title + " " + e.text + " " + e.code).toLowerCase().includes(q);

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
        if (javaAvailable() && blocksAvailable()) {
            const sw = el("div", "gsg-hb-switch");
            sw.setAttribute("role", "group");
            for (const [value, label] of [["blocks", "Blöcke"], ["java", "Java"]] as const) {
                const b = el("button", value === k ? "active" : "", label);
                b.type = "button";
                b.setAttribute("aria-pressed", String(value === k));
                b.addEventListener("click", () => { chosenKind = value; render(); });
                sw.append(b);
            }
            head.append(sw);
        } else {
            head.append(el("span", "gsg-hb-title", k === "blocks" ? "Handbuch Blöcke" : "Handbuch Java"));
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
        p.innerHTML = k === "blocks"
            ? "Zu jeder Kategorie der Werkzeugleiste gibt es kleine Beispielprogramme. Mit <b>▶ Ausprobieren</b> wird ein Beispiel als neue Datei in deinem Projekt angelegt. Tipp: Rechtsklick auf einen Block → <b>Hilfe</b> führt direkt zum passenden Beispiel."
            : "Kleine Beispielprogramme von der ersten Ausgabe bis zur Vererbung. Mit <b>▶ Ausprobieren</b> wird ein Beispiel als neue Datei in deinem Projekt angelegt.";
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
        const box = el("div", "gsg-hb-entry");
        box.id = "gsg-hb-" + entryKey(k, s.id, index);
        box.append(el("h4", "gsg-hb-etitle", e.title));
        const text = el("div", "gsg-hb-text");
        text.innerHTML = markdownToHtml(e.text);
        box.append(text);
        if (k === "blocks") {
            const pic = el("div", "gsg-hb-blocks", "Blöcke werden gezeichnet …");
            box.append(pic);
            drawBlocks(pic, e.code);
            if (javaAvailable()) {
                const det = el("details", "gsg-hb-javadetails");
                det.append(el("summary", undefined, "Java-Code"));
                const pre = el("pre", "gsg-hb-java");
                det.append(pre);
                det.addEventListener("toggle", () => { if (det.open && !pre.childElementCount) colorize(pre, e.code); }, { once: false });
                box.append(det);
            }
        } else {
            const pre = el("pre", "gsg-hb-java");
            box.append(pre);
            colorize(pre, e.code);
        }
        const actions = el("div", "gsg-hb-actions");
        const tryIt = el("button", "gsg-hb-button gsg-hb-primary", "▶ Ausprobieren");
        tryIt.type = "button";
        tryIt.title = "Beispiel als neue Datei in deinem Projekt anlegen und öffnen";
        tryIt.addEventListener("click", () => tryExample(k, e));
        actions.append(tryIt);
        box.append(actions);
        return box;
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

    // ------------------------------------------------------------------ Ausprobieren

    const tryExample = async (k: HandbookKind, e: HandbookEntry) => {
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
        if (o.kind) chosenKind = o.kind;
        query = "";
        const k = kind();
        const list = sections(k);
        let target: { section: string; index?: number } | undefined;
        if (o.blockType && k === "blocks") target = findBlockEntry(list, o.blockType, o.section);
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
}
