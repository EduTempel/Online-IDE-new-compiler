import type { MainBase } from "../main/MainBase";
import { StageVariableTracker } from "./StageVariableTracker";
import "/assets/css/gsg-stage.css";

/**
 * Variablen auf der Bühne (wie die Variablenanzeigen in Scratch): Kästchen „name: wert“ in einer Leiste
 * unter dem Grafikfenster (über der Textausgabe), die sich während des Programmlaufs aktualisieren –
 * so wird auf der Bühne nichts verdeckt. Ohne Bühne (Programm ohne Grafik) gibt es die Leiste nicht.
 *  - Knopf „Variablen“ rechts in der Leiste schaltet die Anzeige ein und aus
 *  - „Auswahl“ in der Anzeige: einzelne Variablen ab- und anhaken
 * Gezeigt werden die Variablen des Hauptprogramms (auch während eine Operation läuft).
 * Einstellungen bleiben im Browser (localStorage).
 */

const KEY_ON = "gsg-stage-variables";
const KEY_HIDDEN = "gsg-stage-variables-hidden";
const INTERVAL_MS = 200;

function load<T>(key: string, fallback: T): T {
    try {
        const v = localStorage.getItem(key);
        return v === null ? fallback : JSON.parse(v) as T;
    } catch {
        return fallback;
    }
}

function store(key: string, value: unknown) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* egal */ }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
}

export function addStageVariables(main: MainBase, outputBody: HTMLElement) {
    let on = load<boolean>(KEY_ON, false);
    const hidden = new Set<string>(load<string[]>(KEY_HIDDEN, []));
    let known: string[] = [];
    let chooserOpen = false;

    const toggle = el("button", "gsg-stage-toggle", "Variablen");
    toggle.type = "button";
    toggle.title = "Variablen des Hauptprogramms auf der Bühne anzeigen (wie in Scratch)";
    const panel = el("div", "gsg-stage-panel");
    const list = el("div", "gsg-stage-list");
    const chooseButton = el("button", "gsg-stage-choose", "Auswahl ▾");
    chooseButton.type = "button";
    chooseButton.title = "Variablen ab- oder anhaken";
    const chooser = el("div", "gsg-stage-chooser");
    panel.append(list, chooseButton, chooser);
    const bar = el("div", "gsg-stage-bar");
    bar.append(panel, toggle);
    // zwischen Grafikfenster und Textausgabe
    const graphics = outputBody.querySelector<HTMLElement>(".jo_graphics");
    if (!graphics) return;   // ohne Grafikfenster keine Bühne
    graphics.after(bar);
    // nur, wenn es eine Bühne gibt (Grafikfenster ohne Grafik hat die Höhe 0)
    const showBar = () => { bar.hidden = graphics.getBoundingClientRect().height < 1; };
    new ResizeObserver(showBar).observe(graphics);
    showBar();

    function renderChooser() {
        chooser.replaceChildren();
        chooser.hidden = !chooserOpen;
        if (!chooserOpen) return;
        if (known.length === 0) {
            chooser.append(el("div", "gsg-stage-empty", "Noch keine Variablen – Programm starten."));
            return;
        }
        for (const name of known) {
            const label = el("label");
            const box = el("input");
            box.type = "checkbox";
            box.checked = !hidden.has(name);
            box.addEventListener("change", () => {
                if (box.checked) hidden.delete(name); else hidden.add(name);
                store(KEY_HIDDEN, [...hidden]);
                renderList();
            });
            label.append(box, document.createTextNode(" " + name));
            chooser.append(label);
        }
    }

    function renderList() {
        const monitors = tracker.monitors;
        const shown = monitors.filter((m) => !hidden.has(m.name));
        list.replaceChildren(...shown.map((m) => {
            const box = el("div", "gsg-stage-monitor");
            box.append(el("span", "gsg-stage-name", m.name), el("span", "gsg-stage-value", m.text));
            return box;
        }));
        if (shown.length === 0) list.append(el("div", "gsg-stage-empty", monitors.length ? "Alle Variablen abgewählt." : "Variablen erscheinen beim Programmlauf."));
    }

    // neue Werte: Liste neu zeichnen, bei neuen Namen auch die Auswahl
    const tracker = new StageVariableTracker(() => {
        if (!on) return;
        const names = tracker.monitors.map((m) => m.name);
        // Auswahl behält die Namen des letzten Laufs, bis neue kommen
        if (names.length && names.join("|") !== known.join("|")) {
            known = names;
            renderChooser();
        }
        renderList();
    }, () => (main as { getCurrentWorkspace?: () => { getCurrentlyEditedModule?: () => unknown } | undefined }).getCurrentWorkspace?.()?.getCurrentlyEditedModule?.());

    function update() {
        panel.hidden = !on;
        toggle.classList.toggle("active", on);
        const interpreter = main.getInterpreter?.();
        if (!interpreter) return;
        tracker.attach(interpreter);   // Start und Ende des Programms bekommt die Anzeige als Ereignis mit
        if (on) tracker.poll(interpreter);
    }

    toggle.addEventListener("click", () => {
        on = !on;
        store(KEY_ON, on);
        update();
        known = tracker.monitors.length ? tracker.monitors.map((m) => m.name) : known;
        renderChooser();
        renderList();
    });
    chooseButton.addEventListener("click", () => {
        chooserOpen = !chooserOpen;
        renderChooser();
    });

    renderList();
    renderChooser();
    update();
    setInterval(update, INTERVAL_MS);
}
