import { markdownToHtml } from "./Markdown";
import {
    canCommitPrediction, commitPrediction, newPrimmId, type PrimmAnswers, type PrimmTask,
} from "./Primm";

/**
 * PRIMM im Aufgaben-Reiter: die fünf Schritte für Schüler/innen (mit ihren Antworten), als Vorschau für die
 * Lehrkraft im eigenen Projekt und schreibgeschützt, wenn die Lehrkraft ein Schülerprojekt ansieht.
 * Dazu das Formular, in dem die Lehrkraft die Fragen anlegt.
 */

export type PrimmMode = "student" | "preview" | "readonly";

export type PrimmViewContext = {
    task: PrimmTask;
    answers: PrimmAnswers;
    mode: PrimmMode;
    /** Antworten geändert; immediate: gleich zum Server schicken (z. B. Vermutung festgehalten) */
    changed: (immediate: boolean) => void;
    /** neu zeichnen (nach dem Festhalten der Vermutung) */
    rerender: () => void;
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
}

function md(text: string, cls = "gsg-task-text"): HTMLElement {
    const d = el("div", cls);
    d.innerHTML = markdownToHtml(text);
    return d;
}

function time(iso: string | undefined): string {
    if (!iso) return "";
    const d = new Date(iso);
    return isNaN(d.getTime()) ? "" : d.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

type StepState = "active" | "done" | "locked";

function step(n: number, icon: string, title: string, state: StepState, status = ""): { box: HTMLElement; body: HTMLElement } {
    const box = el("section", "gsg-primm-step");
    box.dataset.state = state;
    box.dataset.step = String(n);
    const head = el("div", "gsg-primm-step-head");
    head.append(el("span", "gsg-primm-num", String(n)), el("span", "gsg-primm-title", `${icon} ${title}`));
    if (status) head.append(el("span", "gsg-primm-status", status));
    const body = el("div", "gsg-primm-step-body");
    box.append(head, body);
    return { box, body };
}

/** Textfeld, das bei jeder Eingabe speichert */
function answerArea(value: string, placeholder: string, disabled: boolean, onInput: (v: string) => void, rows = 2): HTMLTextAreaElement {
    const area = el("textarea", "gsg-primm-answer");
    area.rows = rows;
    area.value = value;
    area.placeholder = disabled ? "" : placeholder;
    area.disabled = disabled;
    area.addEventListener("input", () => onInput(area.value));
    return area;
}

function check(label: string, checked: boolean, disabled: boolean, onChange: (v: boolean) => void): HTMLLabelElement {
    const l = el("label", "gsg-primm-check");
    const box = el("input");
    box.type = "checkbox";
    box.checked = checked;
    box.disabled = disabled;
    box.addEventListener("change", () => onChange(box.checked));
    l.append(box, document.createTextNode(" " + label));
    return l;
}

export function renderPrimm(ctx: PrimmViewContext): HTMLElement {
    const { task, answers: a, mode } = ctx;
    const editable = mode === "student";
    const showAll = mode !== "student";
    const root = el("div", "gsg-primm");

    const intro = el("div", "gsg-primm-intro");
    intro.append(el("strong", undefined, "Erst vermuten, dann ausführen"));
    if (mode === "preview") {
        intro.append(el("span", undefined, " – Vorschau: So sehen es die Schüler/innen. Ihre Antworten stehen in ihren eigenen Projekten; " +
            "ihr Start-Knopf ist gesperrt, bis sie ihre Vermutung festgehalten haben."));
    } else if (mode === "readonly") {
        intro.append(el("span", undefined, " – Antworten der Schülerin/des Schülers (nur lesen)."));
    } else {
        intro.append(el("span", undefined, " Lies das Programm genau, bevor du es startest. Der Start-Knopf geht erst, wenn du deine Vermutung festgehalten hast."));
    }
    root.append(intro);

    // 1 Vorhersagen
    const predicted = !!a.predictedAt;
    const s1 = step(1, "🔮", "Vorhersagen", predicted ? "done" : "active", predicted ? `festgehalten ${time(a.predictedAt)}` : "");
    s1.body.append(md(task.predict));
    const lockedPrediction = predicted || !editable;
    let commit: HTMLButtonElement | undefined;
    const updateCommit = () => { if (commit) commit.disabled = !canCommitPrediction(task, a); };
    if (task.choices.length) {
        const list = el("div", "gsg-primm-choices");
        const name = "gsg-primm-choice-" + Math.random().toString(36).slice(2);
        task.choices.forEach((c, i) => {
            const l = el("label", "gsg-primm-choice");
            const r = el("input");
            r.type = "radio";
            r.name = name;
            r.checked = a.choice === i;
            r.disabled = lockedPrediction;
            r.addEventListener("change", () => { a.choice = i; ctx.changed(false); updateCommit(); });
            l.append(r, document.createTextNode(" " + String.fromCharCode(65 + i) + ") "), el("span", undefined, c));
            if (a.choice === i) l.classList.add("chosen");
            list.append(l);
        });
        s1.body.append(list);
    }
    if (!lockedPrediction || a.predict.trim()) {
        s1.body.append(answerArea(a.predict, task.choices.length ? "Warum? Begründe kurz (freiwillig)." : "Deine Vermutung: Was macht das Programm?",
            lockedPrediction, (v) => { a.predict = v; ctx.changed(false); updateCommit(); }, 3));
    }
    if (editable && !predicted) {
        const row = el("div", "gsg-primm-row");
        commit = el("button", "gsg-task-button gsg-task-primary", "🔒 Vermutung festhalten");
        commit.type = "button";
        commit.addEventListener("click", () => {
            if (!confirm("Vermutung festhalten? Danach kannst du sie nicht mehr ändern – und dann darfst du das Programm starten.")) return;
            if (commitPrediction(task, a)) {
                ctx.changed(true);
                ctx.rerender();
            }
        });
        updateCommit();
        row.append(commit, el("span", "gsg-task-note", "Danach lässt sich das Programm starten."));
        s1.body.append(row);
    } else if (!predicted && mode === "readonly") {
        s1.body.append(el("p", "gsg-task-empty", "Noch keine Vermutung festgehalten."));
    }
    root.append(s1.box);

    // 2 Ausführen
    const ran = !!a.ranAt;
    const s2 = step(2, "▶", "Ausführen", !predicted && !showAll ? "locked" : ran ? "done" : "active", ran ? `zuerst ${time(a.ranAt)}` : "");
    if (!predicted && !showAll) s2.body.append(el("p", "gsg-task-empty", "🔒 Erst die Vermutung festhalten."));
    else {
        if (!ran) s2.body.append(el("p", undefined, "Starte jetzt das Programm (▶ oder F5) und beobachte genau, was passiert."));
        if (ran || showAll) {
            s2.body.append(el("div", "gsg-primm-question", "Stimmt deine Vermutung? Was war anders als gedacht?"));
            s2.body.append(answerArea(a.reflect, "Vergleiche mit deiner Vermutung …", !editable, (v) => { a.reflect = v; ctx.changed(false); }));
        }
    }
    root.append(s2.box);

    const afterRun = ran || showAll;
    let n = 3;
    // 3 Untersuchen
    if (task.investigate.length) {
        const done = a.investigate.filter((x) => x.trim()).length;
        const s = step(n++, "🔍", "Untersuchen", afterRun ? (done === task.investigate.length ? "done" : "active") : "locked",
            `${done} von ${task.investigate.length}`);
        if (!afterRun) s.body.append(el("p", "gsg-task-empty", "🔒 Kommt nach dem Ausführen."));
        else {
            s.body.append(el("p", "gsg-task-note", "Tipp: Mit dem Einzelschritt siehst du, was nacheinander passiert. In der Blockansicht zeigt ein Klick auf einen Block seinen Wert."));
            task.investigate.forEach((q, i) => {
                s.body.append(md(q, "gsg-task-text gsg-primm-question"),
                    answerArea(a.investigate[i] ?? "", "Deine Antwort …", !editable, (v) => { a.investigate[i] = v; ctx.changed(false); }));
            });
        }
        root.append(s.box);
    }

    // 4 Verändern
    if (task.modify.length) {
        const done = a.modified.filter(Boolean).length;
        const s = step(n++, "✏️", "Verändern", afterRun ? (done === task.modify.length ? "done" : "active") : "locked",
            `${done} von ${task.modify.length}`);
        if (!afterRun) s.body.append(el("p", "gsg-task-empty", "🔒 Kommt nach dem Ausführen."));
        else {
            s.body.append(el("p", "gsg-task-note", "Ändere das Programm und probiere es aus. Hake ab, was du geschafft hast."));
            task.modify.forEach((m, i) => {
                const item = el("div", "gsg-primm-item");
                item.append(md(m), check("geschafft", a.modified[i], !editable, (v) => { a.modified[i] = v; ctx.changed(true); ctx.rerender(); }));
                s.body.append(item);
            });
        }
        root.append(s.box);
    }

    // 5 Selbst machen
    if (task.make.trim()) {
        const s = step(n++, "🛠", "Selbst machen", afterRun ? (a.made ? "done" : "active") : "locked");
        if (!afterRun) s.body.append(el("p", "gsg-task-empty", "🔒 Kommt nach dem Ausführen."));
        else s.body.append(md(task.make), check("geschafft", a.made, !editable, (v) => { a.made = v; ctx.changed(true); ctx.rerender(); }));
        root.append(s.box);
    }
    return root;
}

// ------------------------------------------------------------------ Formular für Lehrkräfte

function listEditor(values: string[], placeholder: string, addLabel: string): { element: HTMLElement; read: () => string[] } {
    const wrap = el("div", "gsg-task-hintlist");
    const list = el("div", "gsg-task-hintlist");
    const add = (value = "") => {
        const row = el("div", "gsg-task-hintrow");
        const area = el("textarea");
        area.rows = 2;
        area.value = value;
        area.placeholder = placeholder;
        const del = el("button", "gsg-task-button", "✕");
        del.type = "button";
        del.title = "Entfernen";
        del.addEventListener("click", () => row.remove());
        row.append(area, del);
        list.append(row);
    };
    values.forEach((v) => add(v));
    const button = el("button", "gsg-task-button", addLabel);
    button.type = "button";
    button.style.alignSelf = "flex-start";
    button.addEventListener("click", () => add());
    wrap.append(list, button);
    return { element: wrap, read: () => Array.from(list.querySelectorAll("textarea")).map((t) => t.value.trim()).filter(Boolean) };
}

/** Abschnitt „Erst vermuten, dann ausführen“ im Aufgaben-Formular */
export function primmEditor(primm: PrimmTask | undefined): { element: HTMLElement; read: () => PrimmTask | undefined } {
    const box = el("fieldset", "gsg-primm-editor");
    const legend = el("legend");
    const on = el("input");
    on.type = "checkbox";
    on.checked = !!primm;
    const onLabel = el("label", "gsg-task-check");
    onLabel.append(on, document.createTextNode(" Erst vermuten, dann ausführen (PRIMM)"));
    legend.append(onLabel);

    const fields = el("div", "gsg-primm-fields");
    const predict = el("textarea");
    predict.rows = 3;
    predict.placeholder = "z. B. „Was steht am Ende in der Konsole?“ oder „Was macht die Figur?“";
    predict.value = primm?.predict ?? "";
    const choices = el("textarea");
    choices.rows = 3;
    choices.placeholder = "Eine Möglichkeit pro Zeile – leer lassen für eine freie Antwort";
    choices.value = (primm?.choices ?? []).join("\n");
    const investigate = listEditor(primm?.investigate ?? [], "z. B. „Wie oft läuft die Schleife? Welchen Wert hat i danach?“", "+ Frage");
    const modify = listEditor(primm?.modify ?? [], "z. B. „Lass die Figur doppelt so schnell laufen.“", "+ Auftrag");
    const make = el("textarea");
    make.rows = 3;
    make.placeholder = "Eine ähnliche Aufgabe ohne Vorlage (freiwillig)";
    make.value = primm?.make ?? "";

    fields.append(
        el("p", "gsg-task-note", "Schüler/innen halten erst ihre Vermutung fest – vorher lässt sich das Programm nicht starten. " +
            "Danach vergleichen sie, untersuchen, verändern und machen selbst etwas. Die Antworten siehst du im Projekt jeder Person " +
            "und gesammelt unter „📊 Antworten“."),
        el("label", "gsg-task-label", "1 Vorhersagen: Frage"), predict,
        el("label", "gsg-task-label", "Antwortmöglichkeiten (freiwillig)"), choices,
        el("label", "gsg-task-label", "3 Untersuchen: Fragen"), investigate.element,
        el("label", "gsg-task-label", "4 Verändern: Aufträge"), modify.element,
        el("label", "gsg-task-label", "5 Selbst machen"), make);
    const sync = () => { fields.hidden = !on.checked; };
    on.addEventListener("change", sync);
    sync();
    box.append(legend, fields);

    return {
        element: box,
        read: () => {
            if (!on.checked || !predict.value.trim()) return undefined;
            return {
                id: primm?.id ?? newPrimmId(),
                predict: predict.value,
                choices: choices.value.split("\n").map((c) => c.trim()).filter(Boolean),
                investigate: investigate.read(),
                modify: modify.read(),
                make: make.value,
            };
        },
    };
}
