import type { Main } from "../main/Main";
import { ajaxAsync } from "../communication/AjaxHelper";
import {
    ANSWERS_KEY, answersOf, predictionText, progress, tallyChoices, tallyTexts, type PrimmAnswers, type PrimmTask, type Tally,
} from "./Primm";

/**
 * PRIMM-Übersicht für Lehrkräfte: Antworten aller Schüler/innen einer Lerngruppe zu einer Aufgabe.
 * Oben die Verteilung (Vermutungen, „Was war anders?“ oder eine Untersuchen-Frage) – gleiche Antworten
 * zusammengefasst –, darunter die Tabelle mit Namen. „Beamer“ blendet Namen und Tabelle aus (anonym, große Schrift).
 */

type StudentRow = {
    userId: number;
    name: string;
    workspaceId: number | null;
    workspaceName: string | null;
    updatedAt: string | null;
    answers: unknown;
};

type Entry = { row: StudentRow; a: PrimmAnswers };

const GROUP_KEY = "gsg.primm.group";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
}

function button(text: string, title: string, click: () => void): HTMLButtonElement {
    const b = el("button", "gsg-task-button", text);
    b.type = "button";
    b.title = title;
    b.addEventListener("click", click);
    return b;
}

function bars(tallies: Tally[], total: number, letters: boolean): HTMLElement {
    const box = el("div", "gsg-primm-bars");
    const max = Math.max(1, ...tallies.map((t) => t.count));
    tallies.forEach((t, i) => {
        const row = el("div", "gsg-primm-bar-row");
        const label = el("div", "gsg-primm-bar-label", (letters ? String.fromCharCode(65 + i) + ") " : "") + t.label);
        const track = el("div", "gsg-primm-bar-track");
        const bar = el("div", "gsg-primm-bar");
        bar.style.width = `${(100 * t.count) / max}%`;
        track.append(bar);
        const pct = total ? Math.round((100 * t.count) / total) : 0;
        row.append(label, track, el("div", "gsg-primm-bar-count", `${t.count}${total ? ` (${pct} %)` : ""}`));
        box.append(row);
    });
    return box;
}

function texts(tallies: Tally[]): HTMLElement {
    if (!tallies.length) return el("p", "gsg-task-empty", "Noch keine Antworten.");
    const list = el("ul", "gsg-primm-texts");
    for (const t of tallies) {
        const li = el("li", undefined, t.label);
        if (t.count > 1) li.append(el("span", "gsg-primm-times", `${t.count}×`));
        list.append(li);
    }
    return list;
}

export function openPrimmOverview(main: Main, task: PrimmTask, title: string) {
    const groups = (main.teacherExplorer?.classData ?? []).filter((g) => g && g.id != null);
    if (!groups.length) {
        alert("Du hast noch keine Lerngruppe. Die Übersicht zeigt die Antworten der Schüler/innen einer Lerngruppe.");
        return;
    }
    let groupId = groups[0].id;
    try {
        const saved = Number(localStorage.getItem(GROUP_KEY));
        if (groups.some((g) => g.id === saved)) groupId = saved;
    } catch { /* ohne Speicher */ }

    let entries: Entry[] = [];
    let beamer = false;
    let topic = "predict";
    let error = "";

    const overlay = el("div", "gsg-primm-overlay");
    const dialog = el("div", "gsg-primm-dialog");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-label", "Antworten der Lerngruppe");
    overlay.append(dialog);

    const head = el("div", "gsg-primm-dialog-head");
    head.append(el("span", "gsg-primm-dialog-title", `📊 ${title || "Erst vermuten, dann ausführen"}`));
    const groupSelect = el("select");
    groupSelect.title = "Lerngruppe";
    for (const g of groups) {
        const o = el("option", undefined, g.name);
        o.value = String(g.id);
        groupSelect.append(o);
    }
    groupSelect.value = String(groupId);
    groupSelect.addEventListener("change", () => {
        groupId = Number(groupSelect.value);
        try { localStorage.setItem(GROUP_KEY, String(groupId)); } catch { /* egal */ }
        load();
    });
    const topicSelect = el("select");
    topicSelect.title = "Was oben zusammengefasst wird";
    const topics: [string, string][] = [["predict", "Vermutungen"], ["reflect", "Was war anders?"],
        ...task.investigate.map((q, i): [string, string] => [`q${i}`, `Frage ${i + 1}: ${q.length > 40 ? q.slice(0, 40) + " …" : q}`])];
    for (const [value, label] of topics) {
        const o = el("option", undefined, label);
        o.value = value;
        topicSelect.append(o);
    }
    topicSelect.addEventListener("change", () => { topic = topicSelect.value; draw(); });
    const beamerButton = button("🖥 Beamer", "Anonym und groß: ohne Namen und ohne Tabelle – für das Gespräch in der Klasse", () => {
        beamer = !beamer;
        draw();
    });
    const close = () => { overlay.remove(); document.removeEventListener("keydown", onKey); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) close(); });
    head.append(groupSelect, topicSelect, button("↻", "Neu laden", () => load()), beamerButton, button("✕", "Schließen (Esc)", close));

    const main_ = el("div", "gsg-primm-dialog-body");
    dialog.append(head, main_);
    document.body.append(overlay);

    function summary(): HTMLElement {
        const box = el("div", "gsg-primm-summary");
        const all = entries.map((e) => e.a);
        if (topic === "predict") {
            box.append(el("div", "gsg-primm-question", task.predict));
            const predicted = all.filter((a) => a.predictedAt);
            if (task.choices.length) {
                box.append(bars(tallyChoices(task, all), predicted.length, true));
                const reasons = tallyTexts(predicted.map((a) => a.predict));
                if (reasons.length) {
                    box.append(el("div", "gsg-primm-subhead", "Begründungen"), texts(reasons));
                }
            } else {
                box.append(texts(tallyTexts(predicted.map((a) => a.predict))));
            }
        } else if (topic === "reflect") {
            box.append(el("div", "gsg-primm-question", "Stimmt deine Vermutung? Was war anders als gedacht?"));
            box.append(texts(tallyTexts(all.filter((a) => a.ranAt).map((a) => a.reflect))));
        } else {
            const i = Number(topic.slice(1));
            box.append(el("div", "gsg-primm-question", task.investigate[i] ?? ""));
            box.append(texts(tallyTexts(all.map((a) => a.investigate[i] ?? ""))));
        }
        return box;
    }

    function table(): HTMLElement {
        const wrap = el("div", "gsg-primm-table-wrap");
        const t = el("table", "gsg-primm-table");
        const hr = el("tr");
        const cols = ["Name", "Vermutung", "Ausgeführt", "Was war anders?",
            ...task.investigate.map((_, i) => `Frage ${i + 1}`),
            ...(task.modify.length ? ["Verändert"] : []), ...(task.make.trim() ? ["Selbst"] : [])];
        cols.forEach((c, i) => {
            const th = el("th", undefined, c);
            if (i >= 4 && i < 4 + task.investigate.length) th.title = task.investigate[i - 4];
            hr.append(th);
        });
        const thead = el("thead");
        thead.append(hr);
        const tbody = el("tbody");
        for (const { row, a } of entries) {
            const tr = el("tr");
            const p = progress(task, a);
            const name = el("td", "gsg-primm-name", row.name);
            if (row.workspaceId == null) name.append(el("div", "gsg-task-note", "kein Projekt mit dieser Aufgabe"));
            const cells: (string | HTMLElement)[] = [
                name,
                predictionText(task, a) || "–",
                p.ran ? "✓" : "–",
                a.reflect.trim() || "–",
                ...a.investigate.map((x) => x.trim() || "–"),
                ...(task.modify.length ? [`${p.modified} / ${p.total.modify}`] : []),
                ...(task.make.trim() ? [a.made ? "✓" : "–"] : []),
            ];
            for (const c of cells) {
                if (typeof c === "string") tr.append(el("td", undefined, c));
                else tr.append(c);
            }
            if (!p.predicted) tr.classList.add("gsg-primm-pending");
            tbody.append(tr);
        }
        t.append(thead, tbody);
        wrap.append(t);
        return wrap;
    }

    function draw() {
        dialog.classList.toggle("beamer", beamer);
        beamerButton.textContent = beamer ? "👤 Mit Namen" : "🖥 Beamer";
        main_.replaceChildren();
        if (error) {
            main_.append(el("p", "gsg-primm-error", error));
            return;
        }
        const all = entries.map((e) => e.a);
        const n = entries.length;
        const count = (f: (a: PrimmAnswers) => boolean) => all.filter(f).length;
        const verb = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
        const predicted = count((a) => !!a.predictedAt);
        main_.append(el("p", "gsg-primm-counts",
            n === 0 ? "In dieser Lerngruppe sind noch keine Schüler/innen."
                : `${predicted} von ${n} ${predicted === 1 ? "hat" : "haben"} vermutet · ${verb(count((a) => !!a.ranAt), "hat", "haben")} ausgeführt` +
                (task.investigate.length ? ` · ${verb(count((a) => a.investigate.every((x) => x.trim())), "hat", "haben")} alle Fragen beantwortet` : "")));
        main_.append(summary());
        if (!beamer) main_.append(table());
    }

    async function load() {
        main_.replaceChildren(el("p", "gsg-task-empty", "Antworten werden geladen …"));
        const r = await ajaxAsync("/servlet/gsgPrimmAnswers", { class_id: groupId, task_id: task.id }) as
            { success: boolean; message?: string; students?: StudentRow[] };
        if (!r?.success) {
            error = r?.message || "Die Antworten konnten nicht geladen werden.";
            entries = [];
        } else {
            error = "";
            entries = (r.students ?? []).map((row) => ({ row, a: answersOf({ [ANSWERS_KEY]: row.answers }, task) }));
        }
        draw();
    }

    load();
}
