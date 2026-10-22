import type { MainBase } from "../main/MainBase";
import type { Main } from "../main/Main";
import type { Workspace } from "../workspace/Workspace";
import { Tab, type TabManager } from "../../tools/TabManager";
import { Thread } from "../../compiler/common/interpreter/Thread";
import { cell, makeRow, toTable, variableNames, type TraceRow } from "./TraceData";
import "/assets/css/gsg-trace.css";

/**
 * Reiter "Tracetabelle" (GSG, Paket 10). trace(); bzw. trace("Bemerkung") im Programm (im Blockmodus
 * der Block „trage in die Tracetabelle ein“) schreibt eine Zeile mit den aktuellen Werten. Spalten sind
 * frei wählbar (Variablen oder Ausdrücke wie zahlen[i]); ohne Auswahl erscheinen alle Variablen.
 * Die Spaltenauswahl gehört zum Projekt (settings.gsgTrace) und geht beim Austeilen mit.
 */

const MAX_ROWS = 2000;

type TraceSettings = { columns?: string[] };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
}

function button(text: string, title: string, onClick: () => void, cls = "gsg-trace-button"): HTMLButtonElement {
    const b = el("button", cls, text);
    b.type = "button";
    b.title = title;
    b.addEventListener("click", onClick);
    return b;
}

export function addTraceTab(base: MainBase, tabManager: TabManager) {
    const main = base as Main;
    const tab = new Tab("Trace", "Tracetabelle", ["gsg-trace"]);
    tabManager.addTab(tab);
    tab.setVisible(false);

    let rows: TraceRow[] = [];
    let truncated = false;
    let onlyChanges = false;
    let renderPending = false;
    let shownOnce = false;
    let workspace: Workspace | undefined;
    let subscribedInterpreter: unknown;

    const settingsOf = (w: Workspace | undefined): TraceSettings =>
        ((w?.settings as { gsgTrace?: TraceSettings } | undefined)?.gsgTrace) ?? {};
    const columns = (): string[] => settingsOf(workspace).columns ?? [];
    const setColumns = (cols: string[]) => {
        if (!workspace) return;
        const settings = workspace.settings as { gsgTrace?: TraceSettings };
        if (cols.length) settings.gsgTrace = { columns: cols };
        else delete settings.gsgTrace;
        if (!workspace.readonly) {
            workspace.saved = false;
            main.networkManager.sendUpdatesAsync(true);
        }
        render();
    };
    const shownColumns = () => columns().length ? columns() : variableNames(rows);

    // --- Aufbau
    const toolbar = el("div", "gsg-trace-toolbar");
    const chips = el("div", "gsg-trace-chips");
    const input = el("input", "gsg-trace-input");
    input.placeholder = "Spalte, z. B. i oder zahlen[i]";
    input.title = "Variable oder Ausdruck (z. B. zahlen[i], liste.size(), p.name, i + 1) – Eingabetaste fügt hinzu";
    const datalist = el("datalist");
    datalist.id = "gsg-trace-names";
    input.setAttribute("list", datalist.id);
    const addColumn = () => {
        const v = input.value.trim();
        if (!v) return;
        const cols = columns().length ? columns().slice() : [];
        if (!cols.includes(v)) cols.push(v);
        input.value = "";
        setColumns(cols);
    };
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addColumn(); } });
    const addButton = button("＋", "Spalte hinzufügen", addColumn);
    const columnBox = el("div", "gsg-trace-columns");
    columnBox.append(el("span", "gsg-trace-label", "Spalten:"), chips, input, addButton, datalist);

    const changesBox = el("label", "gsg-trace-check");
    const changes = el("input");
    changes.type = "checkbox";
    changes.addEventListener("change", () => { onlyChanges = changes.checked; render(); });
    changesBox.append(changes, document.createTextNode(" nur Änderungen"));
    changesBox.title = "Unveränderte Werte nicht wiederholen (wie in einer Tracetabelle auf Papier)";

    const actions = el("div", "gsg-trace-actions");
    actions.append(changesBox,
        button("Leeren", "Tabelle leeren (geschieht auch bei jedem Programmstart)", () => { rows = []; truncated = false; render(); }),
        button("Kopieren", "Als Tabelle in die Zwischenablage (zum Einfügen in Tabellenkalkulation oder Textverarbeitung)", () => {
            navigator.clipboard?.writeText(toTable(rows, shownColumns(), "\t"));
        }),
        button("CSV", "Als CSV-Datei speichern", () => {
            const blob = new Blob(["﻿" + toTable(rows, shownColumns(), ";")], { type: "text/csv;charset=utf-8" });
            const a = el("a");
            a.href = URL.createObjectURL(blob);
            a.download = "Tracetabelle.csv";
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        }),
        button("Drucken", "Tabelle drucken", () => print()));
    toolbar.append(columnBox, actions);

    const tableBox = el("div", "gsg-trace-tablebox");
    tab.bodyDiv.append(toolbar, tableBox);

    // --- Darstellung
    const tableElement = (forPrint = false): HTMLTableElement => {
        const cols = shownColumns();
        const withComment = rows.some((r) => r.comment);
        const table = el("table", "gsg-trace-table");
        const head = el("tr");
        head.append(el("th", "gsg-trace-nr", "Nr."), el("th", "gsg-trace-line", "Zeile"));
        if (withComment) head.append(el("th", undefined, "Bemerkung"));
        cols.forEach((c) => head.append(el("th", "gsg-trace-code", c)));
        const thead = el("thead");
        thead.append(head);
        const tbody = el("tbody");
        let previous: string[] = [];
        rows.forEach((r, i) => {
            const tr = el("tr");
            tr.append(el("td", "gsg-trace-nr", String(i + 1)), el("td", "gsg-trace-line", String(r.line)));
            if (withComment) tr.append(el("td", "gsg-trace-comment", r.comment ?? ""));
            const texts: string[] = [];
            cols.forEach((c, j) => {
                const v = cell(c, r);
                const td = el("td", "gsg-trace-code");
                texts.push(v.error ? "" : v.text);
                const changed = i > 0 && texts[j] !== previous[j];
                if (v.error) {
                    td.textContent = forPrint ? "" : "–";
                    td.title = v.error;
                    td.classList.add("gsg-trace-missing");
                } else if (onlyChanges && i > 0 && !changed) {
                    td.textContent = "";
                } else {
                    td.textContent = v.text;
                    if (changed && !forPrint) td.classList.add("gsg-trace-changed");
                }
                tr.append(td);
            });
            previous = texts;
            tbody.append(tr);
        });
        table.append(thead, tbody);
        return table;
    };

    const render = () => {
        renderPending = false;
        // Spalten-Chips
        chips.innerHTML = "";
        if (!columns().length) chips.append(el("span", "gsg-trace-auto", "alle Variablen"));
        columns().forEach((c, i) => {
            const chip = el("span", "gsg-trace-chip");
            chip.append(el("code", undefined, c));
            chip.append(button("✕", "Spalte entfernen", () => setColumns(columns().filter((_, j) => j !== i)), "gsg-trace-chip-x"));
            chips.append(chip);
        });
        // Vorschläge: Variablen aus der Tabelle und aus dem Quelltext
        const names = new Set(variableNames(rows));
        declaredNames().forEach((n) => names.add(n));
        datalist.innerHTML = "";
        [...names].filter((n) => !columns().includes(n)).forEach((n) => { const o = el("option"); o.value = n; datalist.append(o); });

        tableBox.innerHTML = "";
        if (!rows.length) {
            const help = el("div", "gsg-trace-help");
            help.innerHTML = "<p>Noch keine Einträge.</p><p>Schreibe <code>trace();</code> an die Stelle im Programm, an der die aktuellen Werte "
                + "in die Tabelle eingetragen werden sollen – im Blockmodus gibt es dafür den Block <b>„trage in die Tracetabelle ein“</b>. "
                + "Mit Bemerkung: <code>trace(\"nach dem Tausch\");</code></p>"
                + "<p>Oben wählst du die Spalten: Variablen oder Ausdrücke wie <code>zahlen[i]</code>, <code>liste.size()</code> oder <code>p.name</code>. "
                + "Ohne Auswahl erscheinen alle Variablen. Bei jedem Programmstart beginnt die Tabelle neu.</p>";
            tableBox.append(help);
            return;
        }
        tableBox.append(tableElement());
        if (truncated) tableBox.append(el("p", "gsg-trace-note", `Nur die ersten ${MAX_ROWS} Einträge werden gezeigt.`));
        tableBox.scrollTop = tableBox.scrollHeight;
    };
    const scheduleRender = () => {
        if (renderPending) return;
        renderPending = true;
        requestAnimationFrame(render);
    };

    /** Variablennamen aus den Deklarationen im Quelltext (für Vorschläge vor dem ersten Lauf) */
    const declaredNames = (): string[] => {
        const names: string[] = [];
        const re = /\b(?:int|long|short|byte|double|float|boolean|char|String|var|[A-Z]\w*(?:<[^<>;()]*>)?)(?:\s*\[\s*\])*\s+([a-zäöüß_]\w*)\s*(?=[=;,)])/g;
        for (const f of workspace?.getFiles?.() ?? []) {
            if (f.isFolder || !/\.java$/.test(f.name)) continue;
            const text = f.getText?.() ?? "";
            for (const m of text.matchAll(re)) if (!names.includes(m[1])) names.push(m[1]);
        }
        return names.slice(0, 80);
    };

    const print = () => {
        const w = window.open("", "_blank");
        if (!w) return;
        const doc = w.document;
        doc.title = "Tracetabelle";
        const style = doc.createElement("style");
        style.textContent = "body{font:12pt sans-serif;margin:1.5cm}h1{font-size:16pt}table{border-collapse:collapse}"
            + "th,td{border:1px solid #444;padding:3px 8px;text-align:left}th{background:#eee}"
            + ".gsg-trace-code{font-family:Consolas,monospace}";
        doc.head.append(style);
        const h = doc.createElement("h1");
        h.textContent = "Tracetabelle" + (workspace?.name ? " – " + workspace.name : "");
        doc.body.append(h, doc.importNode(tableElement(true), true));
        w.focus();
        w.print();
    };

    // --- Laufzeit: trace()-Aufrufe annehmen
    Thread.gsgTraceListener = (_thread, line, comment, names, values, thisObject, floats) => {
        if (rows.length >= MAX_ROWS) { truncated = true; return; }
        rows.push(makeRow(line, comment, names, values, thisObject, floats));
        if (!shownOnce) {
            shownOnce = true;
            tab.setVisible(true);
            tab.show();
        }
        scheduleRender();
    };

    const check = () => {
        const w = main.getCurrentWorkspace?.();
        if (w !== workspace) {
            workspace = w;
            rows = [];
            truncated = false;
            render();
        }
        const interpreter = main.getInterpreter?.();
        if (interpreter && interpreter !== subscribedInterpreter) {
            subscribedInterpreter = interpreter;
            interpreter.eventManager.on("start", () => { rows = []; truncated = false; scheduleRender(); });
        }
        // nur zeigen, wenn das Programm trace() verwendet, Spalten gewählt sind oder Einträge da sind
        const uses = rows.length > 0 || columns().length > 0 || (workspace?.getFiles?.() ?? [])
            .some((f) => !f.isFolder && /\.java$/.test(f.name) && /\btrace\s*\(/.test(f.getText?.() ?? ""));
        if (uses !== tab.visible) {
            tab.setVisible(uses);
            if (uses && !tab.isActive()) tab.bodyDiv.style.display = "none";
        }
    };
    tab.onShow = () => render();
    render();
    setInterval(check, 1000);
}
