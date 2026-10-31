import type { MainBase } from "../main/MainBase";
import type { Main } from "../main/Main";
import type { Workspace } from "../workspace/Workspace";
import { Tab, type TabManager } from "../../tools/TabManager";
import { markdownToHtml } from "./Markdown";
import { Interpreter } from "../../compiler/common/interpreter/Interpreter";
import { answersOf, cleanPrimm, startAllowed, storeAnswers, type PrimmAnswers, type PrimmTask } from "./Primm";
import { primmEditor, renderPrimm, type PrimmMode } from "./PrimmView";
import { openPrimmOverview } from "./PrimmOverview";
import { SCHOOL_TEACHER_HANDBOOK_URL } from "../main/gui/SchoolBranding";
import "/assets/css/gsg-task.css";

/**
 * Reiter "Aufgabe" (GSG, Paket 12): Aufgabenstellung und gestufte Hilfen eines Projekts. Die
 * Aufgabe steht in den Projekteinstellungen (settings.gsgTask) – so geht sie beim Austeilen und bei
 * geteilten Links mit, erscheint nicht in der Dateiliste und Schüler/innen können sie nicht ändern.
 * Lehrkräfte legen sie hier an (Text in Markdown mit Vorschau, Hilfen als Liste).
 */

export type Task = { title: string; text: string; hints: string[]; primm?: PrimmTask };

/** Aufgabe eines Projekts (oder undefined, wenn es keine gibt) */
export function taskOf(w: Workspace | undefined): Task | undefined {
    const t = (w?.settings as { gsgTask?: Partial<Task> } | undefined)?.gsgTask;
    if (!t) return undefined;
    const task: Task = { title: String(t.title ?? ""), text: String(t.text ?? ""), hints: Array.isArray(t.hints) ? t.hints.map(String).filter((h) => h.trim()) : [] };
    const primm = cleanPrimm(t.primm);
    if (primm) task.primm = primm;
    return task.title.trim() || task.text.trim() || task.hints.length || primm ? task : undefined;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
}

export function addTaskTab(base: MainBase, tabManager: TabManager) {
    const main = base as Main;
    const tab = new Tab("Task", "Aufgabe", ["gsg-task"]);
    tabManager.addTab(tab);
    tab.setVisible(false);

    let workspace: Workspace | undefined;
    let lastJson = "";
    let editing = false;
    const revealed = new Map<Workspace, number>();
    const shown = new WeakSet<Workspace>();

    const isStaff = () => {
        const u = main.user;
        return !!u && (u.is_teacher || u.is_admin || u.is_schooladmin);
    };
    /** Lehrkraft sieht gerade die Projekte einer Schülerin/eines Schülers */
    const viewingOther = () => main.workspacesOwnerId != null && main.user != null && main.workspacesOwnerId !== main.user.id;
    const primmMode = (): PrimmMode => viewingOther() ? "readonly" : isStaff() ? "preview" : "student";
    /** Start wurde gesperrt, weil die Vermutung fehlt: Hinweis oben im Reiter (einige Sekunden lang) */
    let startBlockedUntil = 0;

    /** PRIMM-Antworten ins Projekt schreiben (immediate: gleich zum Server) */
    const saveAnswers = (w: Workspace, answers: PrimmAnswers, immediate: boolean) => {
        storeAnswers(w.settings, answers);
        w.saved = false;
        if (immediate) main.networkManager.sendUpdatesAsync(false);
    };

    // PRIMM: Programmstart erst nach festgehaltener Vermutung (nur Schüler/innen im eigenen Projekt)
    Interpreter.gsgStartGuard = () => {
        const w = main.getCurrentWorkspace?.();
        const primm = taskOf(w)?.primm;
        if (!w || !primm || primmMode() !== "student") return true;
        const answers = answersOf(w.settings, primm);
        const allowed = startAllowed(answers);
        if (allowed === false) {
            startBlockedUntil = Date.now() + 10_000;
            editing = false;
            tab.show();
            render();
            tab.bodyDiv.querySelector(".gsg-primm-step[data-step='1']")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
            return false;
        }
        if (allowed === "first") {
            saveAnswers(w, answers, true);
            if (!editing) render();
        }
        return true;
    };

    const save = (task: Task | undefined) => {
        if (!workspace) return;
        const settings = workspace.settings as { gsgTask?: Task };
        if (task) settings.gsgTask = task;
        else delete settings.gsgTask;
        workspace.saved = false;
        main.networkManager.sendUpdatesAsync(true);
        editing = false;
        lastJson = JSON.stringify(taskOf(workspace) ?? null);
        render();
    };

    const render = () => {
        const body = tab.bodyDiv;
        const scroll = body.scrollTop;
        body.innerHTML = "";
        const task = taskOf(workspace);
        if (editing && workspace) {
            body.append(editor(task));
            return;
        }
        const head = el("div", "gsg-task-head");
        head.append(el("span", "gsg-task-heading", task?.title.trim() || "Aufgabe"));
        if (task?.primm && isStaff() && !viewingOther() && workspace) {
            const overview = el("button", "gsg-task-button", "📊 Antworten");
            overview.type = "button";
            overview.title = "Vermutungen und Antworten deiner Lerngruppe – auch anonym für den Beamer";
            const primm = task.primm;
            overview.addEventListener("click", () => openPrimmOverview(main, primm, task.title.trim()));
            head.append(overview);
        }
        if (isStaff() && !viewingOther() && workspace) {
            const edit = el("button", "gsg-task-button", task ? "✎ Bearbeiten" : "✎ Aufgabe anlegen");
            edit.type = "button";
            edit.title = "Aufgabenstellung und Hilfen für dieses Projekt (gehen beim Austeilen mit)";
            edit.addEventListener("click", () => { editing = true; render(); });
            head.append(edit);
        }
        body.append(head);
        const content = el("div", "gsg-task-content");
        if (!workspace) content.append(el("p", "gsg-task-empty", "Kein Projekt geöffnet."));
        else if (!task) {
            content.append(el("p", "gsg-task-empty", isStaff()
                ? "Für dieses Projekt gibt es noch keine Aufgabe. Mit „Aufgabe anlegen“ schreibst du eine Aufgabenstellung und Hilfen – beim Austeilen bekommen die Schüler/innen sie mit."
                : "Zu diesem Projekt gibt es keine Aufgabenstellung."));
        } else {
            const text = el("div", "gsg-task-text");
            text.innerHTML = markdownToHtml(task.text);
            content.append(text);
            if (task.hints.length) {
                const n = revealed.get(workspace) ?? 0;
                const hints = el("div", "gsg-task-hints");
                task.hints.slice(0, n).forEach((h, i) => {
                    const box = el("div", "gsg-task-hint");
                    box.append(el("div", "gsg-task-hint-title", `Tipp ${i + 1}`));
                    const t = el("div");
                    t.innerHTML = markdownToHtml(h);
                    box.append(t);
                    hints.append(box);
                });
                if (n < task.hints.length) {
                    const more = el("button", "gsg-task-button gsg-task-more", `💡 Tipp ${n + 1} von ${task.hints.length} anzeigen`);
                    more.type = "button";
                    more.addEventListener("click", () => { revealed.set(workspace!, n + 1); render(); });
                    hints.append(more);
                }
                content.append(hints);
            }
            if (task.primm) {
                const w = workspace;
                const primm = task.primm;
                const mode = primmMode();
                const answers = answersOf(w.settings, primm);
                if (Date.now() < startBlockedUntil && mode === "student" && !answers.predictedAt) {
                    content.append(el("div", "gsg-primm-blocked",
                        "▶ Noch nicht! Erst vermuten, dann ausführen: Halte zuerst unten deine Vermutung fest – dann lässt sich das Programm starten."));
                }
                content.append(renderPrimm({
                    task: primm, answers, mode,
                    changed: (immediate) => { if (mode === "student") saveAnswers(w, answers, immediate); },
                    rerender: () => render(),
                }));
            }
        }
        body.append(content);
        body.scrollTop = scroll;   // neu gezeichnet (z. B. nach dem Abhaken): Stelle behalten
    };

    /** Formular für Lehrkräfte */
    const editor = (task: Task | undefined): HTMLElement => {
        const form = el("form", "gsg-task-form");
        const title = el("input");
        title.placeholder = "Titel, z. B. „Aufgabe 3: Größte Zahl finden“";
        title.value = task?.title ?? "";
        const text = el("textarea");
        text.rows = 10;
        text.placeholder = "Aufgabenstellung – Überschriften mit #, Listen mit -, **fett**, `Code`, ```-Blöcke, Links [Text](https://…), Bilder ![Text](https://…)";
        text.value = task?.text ?? "";
        const preview = el("div", "gsg-task-text gsg-task-preview");
        const showPreview = el("label", "gsg-task-check");
        const previewBox = el("input");
        previewBox.type = "checkbox";
        showPreview.append(previewBox, document.createTextNode(" Vorschau"));
        const updatePreview = () => {
            preview.hidden = !previewBox.checked;
            text.hidden = previewBox.checked;
            if (previewBox.checked) preview.innerHTML = markdownToHtml(text.value) || "<p class=\"gsg-task-empty\">(leer)</p>";
        };
        previewBox.addEventListener("change", updatePreview);
        preview.hidden = true;

        const hintList = el("div", "gsg-task-hintlist");
        const addHint = (value = "") => {
            const row = el("div", "gsg-task-hintrow");
            const area = el("textarea");
            area.rows = 2;
            area.value = value;
            area.placeholder = "Hilfe (wird erst auf Klick gezeigt, der Reihe nach)";
            const del = el("button", "gsg-task-button", "✕");
            del.type = "button";
            del.title = "Hilfe entfernen";
            del.addEventListener("click", () => row.remove());
            row.append(area, del);
            hintList.append(row);
        };
        (task?.hints ?? []).forEach((h) => addHint(h));
        const add = el("button", "gsg-task-button", "+ Hilfe");
        add.type = "button";
        add.addEventListener("click", () => addHint());

        const primm = primmEditor(task?.primm);

        const buttons = el("div", "gsg-task-actions");
        const ok = el("button", "gsg-task-button gsg-task-primary", "Speichern");
        ok.type = "submit";
        const cancel = el("button", "gsg-task-button", "Abbrechen");
        cancel.type = "button";
        cancel.addEventListener("click", () => { editing = false; render(); });
        buttons.append(ok, cancel);
        if (task) {
            const remove = el("button", "gsg-task-button gsg-task-danger", "Aufgabe entfernen");
            remove.type = "button";
            remove.addEventListener("click", () => { if (confirm("Aufgabe und Hilfen dieses Projekts entfernen?")) save(undefined); });
            buttons.append(remove);
        }
        form.addEventListener("submit", (e) => {
            e.preventDefault();
            const hints = Array.from(hintList.querySelectorAll("textarea")).map((a) => a.value.trim()).filter(Boolean);
            const next: Task = { title: title.value.trim(), text: text.value, hints };
            const p = primm.read();
            if (p) next.primm = p;
            save(next.title || next.text.trim() || hints.length || p ? next : undefined);
        });

        form.append(el("label", "gsg-task-label", "Titel"), title,
            el("label", "gsg-task-label", "Aufgabenstellung"), showPreview, text, preview,
            el("label", "gsg-task-label", "Gestufte Hilfen"), hintList, add, primm.element, buttons,
            el("p", "gsg-task-note", "Die Aufgabe gehört zum Projekt: beim Austeilen und bei geteilten Links geht sie mit. Schüler/innen können sie lesen, aber nicht ändern."));
        const guide = el("p", "gsg-task-note", "Ideen für Hilfen, Puzzle und „Erst vermuten, dann ausführen“: ");
        const guideLink = el("a", undefined, "Lehrerhandbuch Blöcke");
        guideLink.href = SCHOOL_TEACHER_HANDBOOK_URL + "#lernformate";
        guideLink.target = "_blank";
        guideLink.rel = "noopener";
        guide.append(guideLink);
        form.append(guide);
        return form;
    };

    /** Projekt gewechselt oder Aufgabe geändert (z. B. durch Austeilen)? */
    const check = () => {
        const w = main.getCurrentWorkspace?.();
        const task = taskOf(w);
        const json = JSON.stringify(task ?? null);
        if (w === workspace && json === lastJson) return;
        const switched = w !== workspace;
        workspace = w;
        lastJson = json;
        if (switched) editing = false;
        const visible = !!w && (!!task || isStaff());
        if (visible !== tab.visible) {
            tab.setVisible(visible);
            // setVisible(true) blendet auch den Inhalt ein – nur der aktive Reiter darf sichtbar sein
            if (visible && !tab.isActive()) tab.bodyDiv.style.display = "none";
        }
        // beim ersten Öffnen eines Projekts mit Aufgabe den Reiter zeigen
        if (w && task && !shown.has(w)) {
            shown.add(w);
            tab.show();
        }
        if (!editing) render();
    };
    tab.onShow = () => { if (!editing) render(); };
    setInterval(check, 800);
}
