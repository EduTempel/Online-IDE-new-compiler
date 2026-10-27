import { Tab, TabManager } from "../../tools/TabManager";
import "/assets/css/gsg-rightpanel.css";

/**
 * Rechter Bereich der IDE in zwei Teilen (eigene Erweiterung des GSG):
 *  - oben: was das Programm tut – Ausgabe (Bühne, Variablen, Text), Klassendiagramm, Struktogramm,
 *    Objekte, Tracetabelle
 *  - unten: was zu tun ist und wie es geht – Aufgabe und Handbuch
 * Dazwischen eine Trennlinie zum Ziehen (Höhe bleibt im Browser gespeichert, Doppelklick klappt zu/auf).
 * Der untere Teil startet zugeklappt; er öffnet sich, sobald einer seiner Reiter gezeigt wird
 * (Aufgabe beim Öffnen eines Projekts mit Aufgabe, Handbuch über Menü oder „Hilfe“ am Block).
 * Reiter haben Symbole und kurze Namen; ist die Spalte zu schmal, nur noch Symbole (Name als Tooltip).
 */

const KEY_HEIGHT = "gsg-right-bottom-height";
const DEFAULT_HEIGHT = 300;
const MIN_HEIGHT = 90;
/** so viel Platz bleibt oben mindestens */
const MIN_TOP = 160;

/** Symbole (eigene, einfache Zeichnungen; Farbe = Schriftfarbe) */
const ICONS: Record<string, string> = {
    output: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M10 7.5v5l4-2.5z"/><path d="M8 21h8M12 17v4"/>',
    classes: '<rect x="2" y="3" width="8" height="7" rx="1"/><rect x="14" y="14" width="8" height="7" rx="1"/><path d="M2 6.5h8M14 17.5h8M6 10v7.5h8"/>',
    structogram: '<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 8h18M3 8l9 5 9-5M12 13v8"/>',
    objects: '<circle cx="6" cy="6" r="3"/><circle cx="18" cy="8" r="3"/><circle cx="10" cy="18" r="3"/><path d="M8.6 7.2l6.5 0.4M7.2 8.8l1.8 6.4"/>',
    trace: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 9h18M3 14.5h18M9 4v16M15 4v16"/>',
    task: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 11l2 2 4-4M9 17h6"/>',
    handbook: '<path d="M12 6c-2-1.5-5-2-8-1.5V19c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V4.5c-3-.5-6 0-8 1.5zM12 6v14.5"/>',
    collapse: '<path d="M6 9l6 6 6-6"/>',
    expand: '<path d="M6 15l6-6 6 6"/>',
};

export function icon(name: string): string {
    return `<svg class="gsg-tab-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] ?? ""}</svg>`;
}

/** Reiter → Symbol und kurzer Name (Schlüssel: interner Name des Reiters) */
export const TAB_LOOK: Record<string, { icon: string; label: string }> = {
    "Output": { icon: "output", label: "Ausgabe" },
    "Class Diagram": { icon: "classes", label: "Klassen" },
    "Structogram": { icon: "structogram", label: "Struktogramm" },
    "Objects": { icon: "objects", label: "Objekte" },
    "Trace": { icon: "trace", label: "Trace" },
    "Task": { icon: "task", label: "Aufgabe" },
    "Handbook": { icon: "handbook", label: "Handbuch" },
};

/** Reiter mit Symbol und kurzem Namen versehen; der bisherige Name wird zum Tooltip */
export function decorateTab(tab: Tab) {
    const look = TAB_LOOK[tab.name];
    if (!look || tab.headingDiv.querySelector(".gsg-tab-icon")) return;
    const full = tab.headingDiv.textContent?.trim() || look.label;
    tab.headingDiv.title = full;
    tab.headingDiv.classList.add("gsg-tabheading");
    tab.headingDiv.innerHTML = `${icon(look.icon)}<span class="gsg-tab-label"></span>`;
    tab.headingDiv.querySelector(".gsg-tab-label")!.textContent = look.label;
}

/** Reiterleiste: passen die Namen nicht in eine Zeile, nur Symbole zeigen */
export function compactWhenNarrow(manager: TabManager) {
    const headings = manager.headingsDiv;
    headings.classList.add("gsg-tabheadings");
    const fit = () => {
        headings.classList.remove("gsg-compact");
        const tabs = Array.from(headings.querySelectorAll<HTMLElement>(".jo_tabheading")).filter((h) => h.offsetParent !== null);
        if (tabs.length === 0) return;
        const top = tabs[0].offsetTop;
        const reserve = manager.tabheadingRightDiv.getBoundingClientRect().width + 12;
        const right = headings.getBoundingClientRect().right - reserve;
        const tooWide = tabs.some((t) => t.offsetTop !== top || t.getBoundingClientRect().right > right);
        headings.classList.toggle("gsg-compact", tooWide);
    };
    new ResizeObserver(fit).observe(headings);
    // Reiter werden ein- und ausgeblendet (Aufgabe, Tracetabelle)
    new MutationObserver(fit).observe(headings, { subtree: true, attributes: true, attributeFilter: ["style"] });
    fit();
}

/** Reiterverwaltung des unteren Teils: zeigt ein Reiter sich, klappt der Teil auf */
class BottomTabManager extends TabManager {
    onShowTab?: () => void;
    private quiet = false;

    setActive(tab: Tab) {
        super.setActive(tab);
        if (!this.quiet) this.onShowTab?.();
    }

    /** Reiter aktivieren, ohne aufzuklappen (Start, Ersatz für ausgeblendeten Reiter) */
    setActiveQuietly(tab: Tab) {
        this.quiet = true;
        try { this.setActive(tab); } finally { this.quiet = false; }
    }

    setTabVisible(tab: Tab, visibility: boolean) {
        this.quiet = true;
        try { super.setTabVisible(tab, visibility); } finally { this.quiet = false; }
    }
}

function loadHeight(): number {
    try {
        const v = Number(localStorage.getItem(KEY_HEIGHT));
        return Number.isFinite(v) && v >= MIN_HEIGHT ? v : DEFAULT_HEIGHT;
    } catch {
        return DEFAULT_HEIGHT;
    }
}

export type RightSplit = { top: HTMLElement; bottomTabs: TabManager; finish: () => void };

/**
 * Teilt den rechten Bereich: liefert den Behälter für die obere Reiterleiste und die Reiterverwaltung
 * des unteren Teils. finish() aufrufen, nachdem alle Reiter angelegt sind.
 */
export function splitRightDiv(inner: HTMLElement, onResized: () => void): RightSplit {
    inner.classList.add("gsg-split");
    const top = document.createElement("div");
    top.className = "gsg-right-top";
    const splitter = document.createElement("div");
    splitter.className = "gsg-right-splitter";
    splitter.title = "Ziehen: Höhe ändern · Doppelklick: unteren Bereich zu- oder aufklappen";
    const bottom = document.createElement("div");
    bottom.className = "gsg-right-bottom";
    inner.append(top, splitter, bottom);

    const bottomTabs = new BottomTabManager(bottom);
    let height = loadHeight();
    let collapsed = true;

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "gsg-right-toggle";
    bottomTabs.insertIntoRightDiv(toggle);

    const apply = () => {
        const max = Math.max(MIN_HEIGHT, inner.clientHeight - MIN_TOP);
        bottom.classList.toggle("gsg-collapsed", collapsed);
        bottom.style.height = collapsed ? "" : Math.min(height, max) + "px";
        splitter.classList.toggle("gsg-collapsed", collapsed);
        toggle.innerHTML = icon(collapsed ? "expand" : "collapse");
        toggle.title = collapsed ? "Bereich aufklappen" : "Bereich zuklappen";
        toggle.setAttribute("aria-expanded", String(!collapsed));
        onResized();
    };
    const setCollapsed = (c: boolean) => {
        if (c === collapsed) return;
        collapsed = c;
        apply();
    };

    bottomTabs.onShowTab = () => setCollapsed(false);
    toggle.addEventListener("click", (e) => {
        e.stopPropagation();
        setCollapsed(!collapsed);
    });
    splitter.addEventListener("dblclick", () => setCollapsed(!collapsed));

    splitter.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        const startY = e.clientY;
        const startHeight = collapsed ? MIN_HEIGHT : bottom.getBoundingClientRect().height;
        let moved = false;
        splitter.classList.add("gsg-dragging");
        const move = (ev: PointerEvent) => {
            const dy = startY - ev.clientY;
            if (!moved && Math.abs(dy) < 3) return;
            moved = true;
            const max = Math.max(MIN_HEIGHT, inner.clientHeight - MIN_TOP);
            height = Math.round(Math.min(max, Math.max(MIN_HEIGHT, startHeight + dy)));
            collapsed = false;
            bottom.classList.remove("gsg-collapsed");
            splitter.classList.remove("gsg-collapsed");
            bottom.style.height = height + "px";
        };
        const up = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
            window.removeEventListener("pointercancel", up);
            splitter.classList.remove("gsg-dragging");
            if (!moved) return;
            try { localStorage.setItem(KEY_HEIGHT, String(height)); } catch { /* egal */ }
            apply();
        };
        // am ganzen Fenster lauschen: die Maus verlässt die schmale Trennlinie beim Ziehen sofort
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
        window.addEventListener("pointercancel", up);
    });

    // Fenster kleiner: oben muss Platz bleiben
    new ResizeObserver(() => { if (!collapsed) apply(); }).observe(inner);

    const finish = () => {
        for (const tab of bottomTabs.tabs) decorateTab(tab);
        compactWhenNarrow(bottomTabs);
        // ein sichtbarer Reiter ist aktiv, ohne dass der Bereich aufklappt
        const first = bottomTabs.tabs.find((t) => t.visible && t.isActive()) ?? bottomTabs.tabs.find((t) => t.visible);
        if (first && !first.isActive()) bottomTabs.setActiveQuietly(first);
        apply();
    };

    return { top, bottomTabs, finish };
}
