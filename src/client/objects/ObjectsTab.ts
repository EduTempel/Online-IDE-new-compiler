import type { MainBase } from "../main/MainBase";
import type { Main } from "../main/Main";
import { Tab, type TabManager } from "../../tools/TabManager";
import type { ProgramPointerPositionInfo } from "../../compiler/common/monacoproviders/ProgramPointerManager";
import { buildSnapshot, type HeapSnapshot } from "./HeapSnapshot";
import { captureCurrentFrame } from "./HeapCapture";
import { canvasMeasure, renderObjectDiagram } from "./ObjectDiagram";
import { slowMotionButton } from "./SlowMotion";
import "/assets/css/gsg-objects.css";

/**
 * Reiter "Objekte" (GSG, Paket 9): UML-Objektdiagramm der Variablen und Objekte, immer wenn das Programm
 * hält (Einzelschritt, Haltepunkt, Zeitlupe). Jeder Halt wird aufgezeichnet; mit ◀ ▶ blättert man zu
 * früheren Ständen zurück (die Zeile bzw. der Block wird orange markiert). Das Programm selbst läuft
 * dabei nicht rückwärts.
 */

type Entry = { snapshot: HeapSnapshot; key: string; position?: ProgramPointerPositionInfo; method: string; line?: number };

const MAX_HISTORY = 500;
const HISTORY_KEY = "gsgHistory";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
}

export function addObjectsTab(base: MainBase, tabManager: TabManager) {
    const main = base as Main;
    const tab = new Tab("Objects", "Objekte", ["gsg-objects"]);
    tabManager.addTab(tab);

    const history: Entry[] = [];
    let index = -1;          // -1: neuester Stand
    let finished = false;
    let dirty = true;
    let subscribed: unknown;
    const measure = canvasMeasure();

    // --- Aufbau
    const bar = el("div", "gsg-od-bar");
    const back = el("button", "gsg-od-button", "◀");
    back.type = "button";
    back.title = "Schritt zurück: früheren Stand zeigen (das Programm läuft dabei nicht rückwärts)";
    const forward = el("button", "gsg-od-button", "▶");
    forward.type = "button";
    forward.title = "Wieder vor bis zum aktuellen Stand";
    const label = el("span", "gsg-od-label");
    const save = el("button", "gsg-od-button", "⤓ SVG");
    save.type = "button";
    save.title = "Objektdiagramm als Bild (SVG) speichern";
    bar.append(slowMotionButton(main, "gsg-od-button gsg-od-slow"), back, label, forward, save);
    const area = el("div", "gsg-od-area");
    tab.bodyDiv.append(bar, area);

    const interpreter = () => main.getInterpreter?.();

    const showHistoryPointer = (e: Entry | undefined) => {
        const ppm = interpreter()?.programPointerManager;
        if (!ppm) return;
        if (!e?.position?.range) {
            ppm.hide(HISTORY_KEY);
            return;
        }
        ppm.show({ programOrmoduleOrFile: e.position.programOrmoduleOrFile, range: { ...e.position.range } }, {
            key: HISTORY_KEY, isWholeLine: true, className: "gsg-history-pointer", rulerColor: "#f0a020", minimapColor: "#f0a020",
        });
    };

    const current = (): Entry | undefined => (index >= 0 ? history[index] : history[history.length - 1]);

    const render = () => {
        dirty = false;
        const n = history.length;
        const i = index >= 0 ? index : n - 1;
        const e = current();
        back.disabled = i <= 0;
        forward.disabled = index < 0;
        save.disabled = !e;
        label.textContent = !e ? "" : `${index >= 0 ? "Rückblick: " : ""}Halt ${i + 1} von ${n}${e.line ? ` · Zeile ${e.line}` : ""}${finished && index < 0 ? " · Programm beendet" : ""}`;
        area.innerHTML = "";
        if (!e) {
            const help = el("div", "gsg-od-help");
            help.innerHTML = "<p>Hier erscheint ein <b>Objektdiagramm</b>: alle Variablen und die Objekte, auf die sie zeigen.</p>"
                + "<p>Es zeigt den Stand, wenn das Programm <b>hält</b>: im Einzelschritt, an einem Haltepunkt oder in der "
                + "<b>🐢 Zeitlupe</b>. Mit ◀ blätterst du zu früheren Ständen zurück.</p>";
            area.append(help);
            return;
        }
        const sheet = el("div", "gsg-od-sheet");
        sheet.innerHTML = renderObjectDiagram(e.snapshot, measure, `Variablen – ${e.method}`).svg;
        area.append(sheet);
    };
    const renderSoon = () => {
        dirty = true;
        if (tab.isActive()) render();
    };

    back.addEventListener("click", () => {
        const n = history.length;
        const i = index >= 0 ? index : n - 1;
        if (i <= 0) return;
        index = i - 1;
        showHistoryPointer(history[index]);
        render();
    });
    forward.addEventListener("click", () => {
        if (index < 0) return;
        index++;
        if (index >= history.length - 1) {
            index = -1;
            showHistoryPointer(undefined);
        } else showHistoryPointer(history[index]);
        render();
    });
    save.addEventListener("click", () => {
        const e = current();
        if (!e) return;
        const { svg } = renderObjectDiagram(e.snapshot, measure, `Variablen – ${e.method}`);
        const a = el("a");
        a.href = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
        a.download = "Objektdiagramm.svg";
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });

    // --- Halt des Programms aufzeichnen
    const onHalt = () => {
        const i = interpreter();
        if (!i) return;
        let capture;
        try {
            capture = captureCurrentFrame(i);
        } catch (e) {
            console.error(e);
            return;
        }
        if (!capture) return;
        const snapshot = buildSnapshot(capture.roots);
        const key = `${capture.method}|${capture.line}|${JSON.stringify(snapshot)}`;
        if (history.length && history[history.length - 1].key === key) return;
        const position = capture.position?.range
            ? { programOrmoduleOrFile: capture.position.programOrmoduleOrFile, range: { ...capture.position.range } }
            : undefined;
        history.push({ snapshot, key, position, method: capture.method, line: capture.line });
        if (history.length > MAX_HISTORY) history.shift();
        if (index >= 0) showHistoryPointer(undefined);
        index = -1;
        finished = false;
        renderSoon();
    };

    const check = () => {
        const i = interpreter();
        if (i && i !== subscribed) {
            subscribed = i;
            i.eventManager.on("showProgramPointer", onHalt);
            i.eventManager.on("start", () => {
                history.length = 0;
                index = -1;
                finished = false;
                showHistoryPointer(undefined);
                renderSoon();
            });
            i.eventManager.on("stop", () => {
                finished = true;
                if (index >= 0) {
                    index = -1;
                    showHistoryPointer(undefined);
                }
                renderSoon();
            });
        }
    };
    tab.onShow = () => { if (dirty) render(); };
    render();
    setInterval(check, 1000);
}
