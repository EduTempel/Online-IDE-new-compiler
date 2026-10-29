import "/assets/css/gsg-leftpanel.css";

/**
 * Linke Spalte (Dateien, Workspaces, Schüler/-innen; beim Programmlauf Variablen und Aufrufstapel) einklappbar
 * (eigene Erweiterung des GSG):
 *  - Knopf „‹“ am rechten Rand der Spalte klappt sie zu einem schmalen Streifen ein
 *  - ein Klick auf den Streifen (Ordnersymbol, „Dateien“) klappt sie wieder aus
 *  - im Blockmodus klappt sie sich ein, sobald man eine Kategorie der Werkzeugleiste öffnet (mehr Platz für die
 *    offene Kategorie). Hat man sie danach selbst wieder ausgeklappt, bleibt sie offen, bis man sie selbst einklappt.
 * Selbst ein- oder ausgeklappt bleibt im Browser gespeichert.
 */

const KEY = "gsg-leftpanel-collapsed";

type Layout = { relayout(): void; setKnobVisible(visible: boolean): void };

let state: { panel: HTMLElement; collapsed: boolean; keepOpen: boolean; layout: Layout } | undefined;

const FOLDER = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2h8.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/></svg>';

function save(collapsed: boolean) {
    try { localStorage.setItem(KEY, collapsed ? "1" : "0"); } catch { /* egal */ }
}

function load(): boolean {
    try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
}

function apply() {
    if (!state) return;
    state.panel.classList.toggle("gsg-left-collapsed", state.collapsed);
    state.layout.setKnobVisible(!state.collapsed);
    state.layout.relayout();
}

function setCollapsed(collapsed: boolean, byUser: boolean) {
    if (!state || state.collapsed === collapsed) return;
    state.collapsed = collapsed;
    // gespeichert wird nur, was man selbst einstellt (nach automatischem Einklappen startet die Seite ausgeklappt)
    if (byUser) {
        state.keepOpen = !collapsed;
        save(collapsed);
    }
    apply();
}

export function initLeftPanelToggle(panel: HTMLElement | null, layout: Layout) {
    if (!panel || state) return;
    state = { panel, collapsed: load(), keepOpen: false, layout };

    const collapse = document.createElement("button");
    collapse.type = "button";
    collapse.className = "gsg-left-collapse";
    collapse.title = "Dateiliste einklappen (mehr Platz)";
    collapse.setAttribute("aria-label", collapse.title);
    collapse.textContent = "‹";
    collapse.addEventListener("click", () => setCollapsed(true, true));

    const strip = document.createElement("button");
    strip.type = "button";
    strip.className = "gsg-left-strip";
    strip.title = "Dateiliste ausklappen";
    strip.setAttribute("aria-label", strip.title);
    strip.innerHTML = `${FOLDER}<span class="gsg-left-strip-label">Dateien</span><span class="gsg-left-strip-arrow">›</span>`;
    strip.addEventListener("click", () => setCollapsed(false, true));

    panel.append(collapse, strip);
    apply();
}

/** Blockmodus: beim Öffnen einer Kategorie einklappen (außer man hat die Liste selbst wieder ausgeklappt) */
export function autoCollapseLeftPanel() {
    if (!state || state.keepOpen) return;
    setCollapsed(true, false);
}
