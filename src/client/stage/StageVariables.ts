import type { MainBase } from "../main/MainBase";
import { captureCurrentFrame } from "../objects/HeapCapture";
import { render, snapshot } from "../trace/TraceData";
import "/assets/css/gsg-stage.css";

/**
 * Variablen auf der Bühne (wie die Variablenanzeigen in Scratch): Kästchen „name: wert“ über dem
 * Grafikfenster bzw. der Ausgabe, die sich während des Programmlaufs aktualisieren.
 *  - Knopf „Variablen“ oben rechts in der Ausgabe schaltet die Anzeige ein und aus
 *  - „Auswahl“ in der Anzeige: einzelne Variablen ab- und anhaken
 * Gezeigt werden die Variablen des Hauptprogramms (auch während eine Operation läuft).
 * Einstellungen bleiben im Browser (localStorage).
 */

const KEY_ON = "gsg-stage-variables";
const KEY_HIDDEN = "gsg-stage-variables-hidden";
const INTERVAL_MS = 200;
const MAX_TEXT = 80;

type Monitor = { name: string; text: string };

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

/** Wert für die Anzeige: Kommazahlen mit Nachkommastelle, lange Texte gekürzt */
export function monitorText(value: unknown, type?: string): string {
    const float = type === "double" || type === "float" || type === "Double";
    let v = snapshot(value);
    // char wird als Zahl (Zeichencode) gespeichert
    if ((type === "char" || type === "Character") && typeof v === "number") v = String.fromCharCode(v);
    const text = render(v, float);
    return text.length > MAX_TEXT ? text.slice(0, MAX_TEXT - 1) + "…" : text;
}

export function addStageVariables(main: MainBase, outputBody: HTMLElement) {
    let on = load<boolean>(KEY_ON, false);
    const hidden = new Set<string>(load<string[]>(KEY_HIDDEN, []));
    let monitors: Monitor[] = [];
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
    outputBody.append(toggle);
    // über Grafikfenster und Ausgabe
    (outputBody.querySelector(".jo_run-inner") ?? outputBody).append(panel);

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
        const shown = monitors.filter((m) => !hidden.has(m.name));
        list.replaceChildren(...shown.map((m) => {
            const box = el("div", "gsg-stage-monitor");
            box.append(el("span", "gsg-stage-name", m.name), el("span", "gsg-stage-value", m.text));
            return box;
        }));
        if (shown.length === 0) list.append(el("div", "gsg-stage-empty", monitors.length ? "Alle Variablen abgewählt." : "Variablen erscheinen beim Programmlauf."));
    }

    function update() {
        panel.hidden = !on;
        toggle.classList.toggle("active", on);
        if (!on) return;
        const interpreter = main.getInterpreter?.();
        let capture;
        try {
            capture = interpreter ? captureCurrentFrame(interpreter, "main") : undefined;
        } catch {
            capture = undefined;   // während des Übersetzens / Startens
        }
        if (!capture) return;   // Programm beendet: letzte Werte stehen lassen
        const next = capture.roots.filter((r) => r.name !== "this").map((r) => ({ name: r.name, text: monitorText(r.value, r.type) }));
        const changed = next.length !== monitors.length || next.some((m, i) => m.name !== monitors[i].name || m.text !== monitors[i].text);
        if (!changed) return;
        monitors = next;
        const names = next.map((m) => m.name);
        if (names.join("\n") !== known.join("\n")) {
            known = names;
            renderChooser();
        }
        renderList();
    }

    toggle.addEventListener("click", () => {
        on = !on;
        store(KEY_ON, on);
        update();
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
