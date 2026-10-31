import type { Main } from "../Main.js";
import { expandLeftPanel } from "./LeftPanelToggle.js";

/**
 * GSG: Leer-Ansicht über dem Editor, wenn kein Projekt oder keine Datei offen ist – statt des Textes
 * „Keine Datei vorhanden“ mit Ausrufezeichen-Rahmen im Editor. Mit Knopf „Neues Projekt“ bzw. „Neue Datei“, der
 * dieselbe Eingabe öffnet wie das „+“ in der linken Liste, und dem Datenschutz-Hinweis.
 */
type Art = "projekt" | "datei";

let ansicht: HTMLDivElement | undefined;

export function zeigeLeerAnsicht(main: Main, art: Art | null) {
    const editor = document.getElementById("editor");
    if (!editor) return;
    if (!art) {
        if (ansicht) ansicht.hidden = true;
        return;
    }
    if (!ansicht) {
        ansicht = document.createElement("div");
        ansicht.className = "gsg-leer";
        editor.classList.add("gsg-leer-host");
        editor.append(ansicht);
    }

    const ws = main.getCurrentWorkspace();
    const fremd = main.workspacesOwnerId != null && main.workspacesOwnerId !== main.user?.id;   // Lehrkraft sieht Schülerprojekte
    const darfAnlegen = art === "projekt" ? !fremd : !!ws && !(ws.readonly && !main.user?.is_teacher);
    const hatProjekte = main.workspaceList.length > 0;

    const titel = art === "projekt"
        ? (hatProjekte ? "Wähle links ein Projekt aus" : "Noch kein Projekt")
        : "Dieses Projekt ist noch leer";
    const text = art === "projekt"
        ? (hatProjekte ? "Oder lege ein neues Projekt an." : "Lege dein erstes Projekt an – darin speicherst du deine Programme.")
        : "Lege eine Datei an, um mit dem Programmieren zu beginnen.";
    const knopfText = art === "projekt" ? "＋ Neues Projekt" : "＋ Neue Datei";

    ansicht.replaceChildren();
    const karte = document.createElement("div");
    karte.className = "gsg-leer-karte";
    const symbol = document.createElement("div");
    symbol.className = "gsg-leer-symbol";
    symbol.textContent = art === "projekt" ? "📁" : "📄";
    symbol.setAttribute("aria-hidden", "true");
    const h = document.createElement("h2");
    h.textContent = titel;
    const p = document.createElement("p");
    p.textContent = darfAnlegen ? text : "";
    karte.append(symbol, h, p);
    if (darfAnlegen) {
        const knopf = document.createElement("button");
        knopf.type = "button";
        knopf.className = "gsg-leer-knopf";
        knopf.textContent = knopfText;
        knopf.addEventListener("click", () => {
            expandLeftPanel();
            const liste = art === "projekt" ? main.projectExplorer.workspaceTreeview : main.projectExplorer.fileTreeview;
            const r = knopf.getBoundingClientRect();
            liste.buttonAddElementsClicked(r.left, r.bottom + 2);
        });
        karte.append(knopf);
    }
    const datenschutz = document.createElement("p");
    datenschutz.className = "gsg-leer-hinweis";
    datenschutz.textContent = "🔒 Hilf mit beim Datenschutz: Schreibe keine Namen, Adressen oder andere persönlichen Daten in deine Programme.";
    karte.append(datenschutz);
    ansicht.append(karte);
    ansicht.hidden = false;
}
