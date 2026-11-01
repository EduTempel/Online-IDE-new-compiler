import { blockKatalog, type KatalogKategorie, type Mikrowelt } from "../blocks/BlockMikrowelt";

/**
 * GSG (Paket 19k): „Blöcke für diese Aufgabe“ im Aufgaben-Editor – die Werkzeugleiste als Liste mit Häkchen je
 * Block, je Kategorie ein Häkchen für alle ihre Blöcke, dazu „alle“ und „keine“. Gespeichert in der Aufgabe
 * (bloecke). Den Katalog liefert die Blockansicht; ist noch keine offen, bleibt die bisherige Auswahl.
 */

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
}

function checkbox(checked: boolean): HTMLInputElement {
    const c = el("input");
    c.type = "checkbox";
    c.checked = checked;
    return c;
}

export function mikroweltEditor(welt: Mikrowelt | undefined): { element: HTMLElement; read: () => Mikrowelt | undefined } {
    const box = el("fieldset", "gsg-primm-editor gsg-welt-editor");
    const legend = el("legend");
    const on = checkbox(!!welt);
    const onLabel = el("label", "gsg-task-check");
    onLabel.append(on, document.createTextNode(" Nur ausgewählte Blöcke anbieten (Mikrowelt)"));
    legend.append(onLabel);
    const fields = el("div", "gsg-primm-fields");
    fields.append(el("p", "gsg-task-note", "Die Werkzeugleiste zeigt dann nur die angehakten Blöcke; Kategorien ohne Blöcke verschwinden. "
        + "Blöcke, die schon im Projekt stehen, bleiben und laufen. Du selbst kannst über „🧭 Alle Blöcke zeigen“ weiter alles sehen."));

    const katalog: KatalogKategorie[] = blockKatalog() ?? [];
    const boxes = new Map<string, Map<string, HTMLInputElement>>();
    if (!katalog.some((k) => k.bloecke.length)) {
        fields.append(el("p", "gsg-task-note gsg-welt-leer", "Öffne zuerst eine Datei des Projekts in der Blockansicht – dann erscheinen hier alle Blöcke zum Auswählen."
            + (welt ? " Bis dahin bleibt die bisherige Auswahl." : "")));
    } else {
        const actions = el("div", "gsg-welt-actions");
        const alle = el("button", "gsg-task-button", "alle");
        alle.type = "button";
        const keine = el("button", "gsg-task-button", "keine");
        keine.type = "button";
        const zaehler = el("span", "gsg-welt-zaehler");
        actions.append(alle, keine, zaehler);
        fields.append(actions);
        const list = el("div", "gsg-welt-liste");
        const syncs: (() => void)[] = [];
        const zaehle = () => {
            let n = 0;
            for (const m of boxes.values()) for (const c of m.values()) if (c.checked) n++;
            zaehler.textContent = n === 1 ? "1 Block ausgewählt" : `${n} Blöcke ausgewählt`;
        };
        for (const k of katalog) {
            if (!k.bloecke.length) continue;
            const gewaehlt = new Set(welt?.[k.id] ?? []);
            const details = el("details", "gsg-welt-kategorie");
            details.style.setProperty("--gsg-welt-farbe", k.colour ?? "#888");
            details.style.marginLeft = `${k.tiefe * 1.2}em`;
            const summary = el("summary");
            const alleDer = checkbox(false);
            alleDer.title = "alle Blöcke dieser Kategorie";
            const name = el("span", "gsg-welt-name", k.name);
            const anzahl = el("span", "gsg-welt-anzahl");
            summary.append(alleDer, name, anzahl);
            details.append(summary);
            const m = new Map<string, HTMLInputElement>();
            for (const b of k.bloecke) {
                const label = el("label", "gsg-welt-block");
                const c = checkbox(gewaehlt.has(b.schluessel));
                label.append(c, el("span", undefined, b.text));
                details.append(label);
                m.set(b.schluessel, c);
            }
            boxes.set(k.id, m);
            const sync = () => {
                const n = [...m.values()].filter((c) => c.checked).length;
                alleDer.checked = n === m.size;
                alleDer.indeterminate = n > 0 && n < m.size;
                anzahl.textContent = `${n} / ${m.size}`;
                zaehle();
            };
            syncs.push(sync);
            // Klick auf das Häkchen der Kategorie: nicht auf- oder zuklappen
            alleDer.addEventListener("click", (e) => e.stopPropagation());
            alleDer.addEventListener("change", () => { for (const c of m.values()) c.checked = alleDer.checked; sync(); });
            for (const c of m.values()) c.addEventListener("change", sync);
            sync();
            list.append(details);
        }
        const setzeAlle = (an: boolean) => {
            for (const m of boxes.values()) for (const c of m.values()) c.checked = an;
            syncs.forEach((s) => s());
        };
        alle.addEventListener("click", () => setzeAlle(true));
        keine.addEventListener("click", () => setzeAlle(false));
        fields.append(list);
    }

    const sync = () => { fields.hidden = !on.checked; };
    on.addEventListener("change", sync);
    sync();
    box.append(legend, fields);

    return {
        element: box,
        read: () => {
            if (!on.checked) return undefined;
            if (boxes.size === 0) return welt;   // ohne Katalog: unverändert
            const result: Mikrowelt = {};
            for (const [id, m] of boxes) {
                // was der Katalog gerade nicht zeigt (z. B. Blöcke ohne Variablen), bleibt erhalten
                const rest = (welt?.[id] ?? []).filter((s) => !m.has(s));
                const keys = [...[...m].filter(([, c]) => c.checked).map(([s]) => s), ...rest];
                if (keys.length) result[id] = keys;
            }
            for (const [id, keys] of Object.entries(welt ?? {})) if (!boxes.has(id)) result[id] = keys;
            // nichts angehakt: alle Kategorien wären leer – dann lieber gar keine Einschränkung
            return Object.keys(result).length ? result : undefined;
        },
    };
}
