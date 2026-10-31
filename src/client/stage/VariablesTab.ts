import type { MainBase } from "../main/MainBase";
import { Tab, type TabManager } from "../../tools/TabManager";
import { StageVariableTracker, type Monitor } from "./StageVariableTracker";
import type { ScopeStyle } from "../objects/ScopeTitles";
import { Constants } from "../Constants";
import { bloecklyVariablen } from "../bloeckly/BloecklyVariablen";
import "/assets/css/gsg-variables.css";

/**
 * Reiter „Variablen“ im rechten Bereich (neben Ausgabe, Klassen, Struktogramm …): Kästchen „name: wert“
 * wie die Variablenanzeigen in Scratch, die sich während des Programmlaufs aktualisieren. Gezeigt werden
 * die Variablen des Hauptprogramms (auch während eine Operation läuft), nach Gültigkeitsbereichen in
 * Kästen (Paket 16g): Hauptprogramm, gerade laufende Operationen, Schleifen und Zweige darin. Nach dem
 * Programmende bleiben die Endwerte stehen. „Auswahl“ hakt einzelne Variablen ab und an (bleibt im Browser gespeichert).
 * Abgefragt wird nur, solange der Reiter vorn ist; Start und Ende bekommt die Anzeige immer mit.
 */

const KEY_HIDDEN = "gsg-stage-variables-hidden";
const INTERVAL_MS = 200;

function loadHidden(): string[] {
    try {
        const v = localStorage.getItem(KEY_HIDDEN);
        return v === null ? [] : JSON.parse(v) as string[];
    } catch {
        return [];
    }
}

function storeHidden(names: string[]) {
    try { localStorage.setItem(KEY_HIDDEN, JSON.stringify(names)); } catch { /* egal */ }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
}

/** Wörter für die Bereiche: wie im Struktogramm, wie die Blöcke oder wie in Java (mit Zeilen) */
function scopeStyle(main: MainBase): ScopeStyle {
    if (Constants.isStructogramApp) return "structogram";
    const mode = (main as { blockModeController?: { getMode?: () => string } }).blockModeController?.getMode?.();
    return mode === "blocks" ? "blocks" : "java";
}

let flashDecorations: { clear(): void } | undefined;
let flashTimer: ReturnType<typeof setTimeout> | undefined;

/** Paket 16: Bereich eines Kastens im Programm zeigen – in den Blöcken umrahmt, in Java am Rand markiert */
function showInProgram(main: MainBase, lines: { from: number; to: number }, title: string) {
    const blocks = (main as { blockModeController?: { showLinesInBlocks?: (from: number, title: string) => boolean } }).blockModeController;
    if (blocks?.showLinesInBlocks?.(lines.from, title)) return;
    const editor = main.getMainEditor?.();
    if (!editor?.getModel()) return;
    flashDecorations?.clear();
    if (flashTimer) clearTimeout(flashTimer);
    flashDecorations = editor.createDecorationsCollection([{
        range: { startLineNumber: lines.from, startColumn: 1, endLineNumber: lines.to, endColumn: 1 },
        options: { isWholeLine: true, className: "gsg-scope-flash", linesDecorationsClassName: "gsg-scope-gutter", linesDecorationsTooltip: title },
    }]);
    editor.revealLinesInCenterIfOutsideViewport(lines.from, lines.to);
    flashTimer = setTimeout(() => flashDecorations?.clear(), 4000);
}

export function addVariablesTab(main: MainBase, tabManager: TabManager): Tab {
    const tab = new Tab("Variables", "Variablen", ["gsg-vars"]);
    tabManager.addTab(tab);

    const hidden = new Set<string>(loadHidden());
    let known: string[] = [];
    let chooserOpen = false;

    const toolbar = el("div", "gsg-vars-toolbar");
    toolbar.append(el("span", "gsg-vars-hint", Constants.isBloecklyApp
        ? "Oben die Variablen für alle Figuren, darunter die Variablen jedes laufenden Skripts – jeder Klon hat seine eigenen Werte."
        : "Jeder Kasten ist ein Gültigkeitsbereich: Variablen erscheinen, sobald sie angelegt sind, und verschwinden am Ende ihres Bereichs."));
    const chooseButton = el("button", "gsg-vars-choose", "Auswahl ▾");
    chooseButton.type = "button";
    chooseButton.title = "Variablen ab- oder anhaken";
    toolbar.append(chooseButton);
    const chooser = el("div", "gsg-vars-chooser");
    const list = el("div", "gsg-vars-list");
    tab.bodyDiv.append(toolbar, chooser, list);

    function renderChooser() {
        chooser.replaceChildren();
        chooser.hidden = !chooserOpen;
        chooseButton.textContent = chooserOpen ? "Auswahl ▴" : "Auswahl ▾";
        if (!chooserOpen) return;
        if (known.length === 0) {
            chooser.append(el("div", "gsg-vars-empty", "Noch keine Variablen – Programm starten."));
            return;
        }
        for (const name of known) {
            const label = el("label");
            const box = el("input");
            box.type = "checkbox";
            box.checked = !hidden.has(name);
            box.addEventListener("change", () => {
                if (box.checked) hidden.delete(name); else hidden.add(name);
                storeHidden([...hidden]);
                renderList();
            });
            label.append(box, document.createTextNode(" " + name));
            chooser.append(label);
        }
    }

    /** Reihung bzw. Liste wie in Scratch: Name oben, darunter je Element eine Zeile mit Position (ab 0), unten die Länge */
    function listBox(name: string, data: { items: string[]; length: number }): HTMLElement {
        const box = el("div", "gsg-vars-listmon");
        box.append(el("div", "gsg-vars-listhead", name));
        const rows = el("ol", "gsg-vars-rows");
        rows.dataset.name = name;
        data.items.forEach((text, i) => {
            const row = el("li");
            row.append(el("span", "gsg-vars-index", String(i)), el("span", "gsg-vars-cell", text));
            rows.append(row);
        });
        if (data.length === 0) rows.append(el("li", "gsg-vars-listempty", "(leer)"));
        else if (data.length > data.items.length) rows.append(el("li", "gsg-vars-listempty", `… und ${data.length - data.items.length} weitere`));
        box.append(rows, el("div", "gsg-vars-listfoot", `Länge: ${data.length}`));
        box.title = data.length === 0 ? `${name} ist leer`
            : data.length === 1 ? `${name}: 1 Element an Position 0`
            : `${name}: ${data.length} Elemente an den Positionen 0 bis ${data.length - 1}`;
        return box;
    }

    function renderList() {
        const monitors = tracker.monitors;
        const shown = monitors.filter((m) => !hidden.has(m.name));
        const scrollTops = new Map<string, number>();
        for (const rows of Array.from(list.querySelectorAll<HTMLElement>(".gsg-vars-rows"))) scrollTops.set(rows.dataset.name ?? "", rows.scrollTop);
        // je Gültigkeitsbereich ein Kasten mit Überschrift, in der Reihenfolge des Auftretens
        const groups = new Map<string, Monitor[]>();
        for (const m of shown) {
            const key = m.scope?.key ?? "main";
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(m);
        }
        list.replaceChildren(...[...groups.entries()].map(([key, members]) => {
            const scope = members[0].scope;
            const kind = key.startsWith("main") || key === "bl-alle" ? "main" : key.startsWith("part") || key.startsWith("bl-") ? "part" : "call";
            const group = el("section", "gsg-vars-group" + (" is-" + kind + (scope?.inner ? " is-inner" : "")));
            const head = el("div", "gsg-vars-grouphead", scope?.title ?? "Hauptprogramm");
            group.append(head);
            // Klick: Bereich im Programm zeigen (Java: Zeilen markieren, Blöcke: Block umrahmen)
            const lines = scope?.lines;
            if (lines) {
                group.classList.add("is-clickable");
                group.title = "Klicken: diesen Bereich im Programm zeigen";
                group.addEventListener("click", () => showInProgram(main, lines, scope!.title));
            }
            const body = el("div", "gsg-vars-groupbody");
            body.append(...members.map((m) => {
                if (m.list) {
                    const box = listBox(m.name, m.list);
                    box.querySelector<HTMLElement>(".gsg-vars-rows")!.dataset.name = key + "|" + m.name;
                    return box;
                }
                const box = el("div", "gsg-vars-monitor");
                box.append(el("span", "gsg-vars-name", m.name), el("span", "gsg-vars-value", m.text));
                return box;
            }));
            group.append(body);
            return group;
        }));
        // Scrollstand der Listenanzeigen bleibt beim Neuzeichnen erhalten
        for (const rows of Array.from(list.querySelectorAll<HTMLElement>(".gsg-vars-rows"))) {
            const top = scrollTops.get(rows.dataset.name ?? "");
            if (top) rows.scrollTop = top;
        }
        if (shown.length === 0) {
            list.append(el("div", "gsg-vars-empty", monitors.length ? "Alle Variablen abgewählt (Auswahl ▾)." : "Variablen erscheinen, sobald das Programm läuft."));
        }
    }

    // neue Werte: Liste neu zeichnen, bei neuen Namen auch die Auswahl (behält die Namen des letzten Laufs)
    const tracker = new StageVariableTracker(() => {
        const names = [...new Set(tracker.monitors.map((m) => m.name))];
        if (names.length && names.join("|") !== known.join("|")) {
            known = names;
            renderChooser();
        }
        renderList();
    }, () => (main as { getCurrentWorkspace?: () => { getCurrentlyEditedModule?: () => unknown } | undefined }).getCurrentWorkspace?.()?.getCurrentlyEditedModule?.(),
    () => scopeStyle(main),
    // Blöckly: Variablen für alle Figuren und je Figur (das Hauptprogramm hat dort keine)
    (interpreter) => (Constants.isBloecklyApp ? bloecklyVariablen(interpreter) : []),
    () => !Constants.isBloecklyApp);

    function update() {
        const interpreter = main.getInterpreter?.();
        if (!interpreter) return;
        tracker.attach(interpreter);   // Start und Ende des Programms kommen als Ereignis
        if (tab.isActive()) tracker.poll(interpreter);
    }

    chooseButton.addEventListener("click", () => {
        chooserOpen = !chooserOpen;
        renderChooser();
    });
    tab.onShow = () => {
        update();
        renderList();
    };

    renderList();
    renderChooser();
    update();
    setInterval(update, INTERVAL_MS);
    return tab;
}
