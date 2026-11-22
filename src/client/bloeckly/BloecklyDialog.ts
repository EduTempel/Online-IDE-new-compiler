import "/assets/css/gsg-bloeckly.css";

/** Blöckly: kleine Helfer für Knöpfe und Dialoge in der Seite (statt prompt/confirm des Browsers) */

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
}

export function knopf(text: string, title: string, cls = "gsg-bl-knopf"): HTMLButtonElement {
    const b = el("button", cls, text);
    b.type = "button";
    b.title = title;
    return b;
}

/** Dialog über der Seite; Escape, ✕ und Klick daneben schließen ihn. Liefert die Funktion zum Schließen. */
export function dialog(titel: string, inhalt: HTMLElement, beimSchliessen?: () => void): () => void {
    const huelle = el("div", "gsg-bl-dialoghuelle");
    const fenster = el("div", "gsg-bl-dialog");
    fenster.setAttribute("role", "dialog");
    fenster.setAttribute("aria-label", titel);
    const kopf = el("div", "gsg-bl-dialogkopf");
    const zu = knopf("✕", "Schließen", "gsg-bl-mini");
    kopf.append(el("h2", undefined, titel), zu);
    fenster.append(kopf, inhalt);
    huelle.append(fenster);
    document.body.append(huelle);
    const schliessen = () => {
        if (!huelle.isConnected) return;
        huelle.remove();
        document.removeEventListener("keydown", taste, true);
        beimSchliessen?.();
    };
    const taste = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
            e.stopPropagation();
            schliessen();
        }
    };
    document.addEventListener("keydown", taste, true);
    zu.addEventListener("click", schliessen);
    huelle.addEventListener("click", (e) => { if (e.target === huelle) schliessen(); });
    setTimeout(() => fenster.querySelector<HTMLElement>("button.gsg-bl-karte")?.focus(), 0);
    return schliessen;
}

/** Namen erfragen (z. B. Umbenennen); pruefen liefert eine Fehlermeldung oder undefined. Ergebnis: neuer Name oder undefined */
export function nameFragen(titel: string, wert: string, pruefen: (name: string) => string | undefined, okText = "Umbenennen"): Promise<string | undefined> {
    return new Promise((fertig) => {
        const form = el("form", "gsg-bl-frage");
        const feld = el("input", "gsg-bl-feld");
        feld.value = wert;
        feld.setAttribute("aria-label", titel);
        const fehler = el("div", "gsg-bl-fehler");
        fehler.setAttribute("role", "alert");
        const ok = knopf(okText, okText, "gsg-bl-knopf gsg-bl-start");
        ok.type = "submit";
        const abbrechen = knopf("Abbrechen", "Nichts ändern");
        const knoepfe = el("div", "gsg-bl-knoepfe");
        knoepfe.append(abbrechen, ok);
        form.append(feld, fehler, knoepfe);
        let ergebnis: string | undefined;
        const zeige = () => {
            const f = feld.value.trim() === wert ? undefined : pruefen(feld.value.trim());
            fehler.textContent = f ?? "";
            ok.disabled = !!f;
            return f;
        };
        feld.addEventListener("input", zeige);
        const schliessen = dialog(titel, form, () => fertig(ergebnis));
        abbrechen.addEventListener("click", schliessen);
        form.addEventListener("submit", (e) => {
            e.preventDefault();
            if (zeige()) return;
            const neu = feld.value.trim();
            ergebnis = neu === wert ? undefined : neu;
            schliessen();
        });
        setTimeout(() => { feld.focus(); feld.select(); }, 0);
    });
}

/** Hinweis mit „OK“ */
export function hinweisZeigen(titel: string, text: string): Promise<void> {
    return new Promise((fertig) => {
        const inhalt = el("div", "gsg-bl-frage");
        const ok = knopf("OK", "Schließen", "gsg-bl-knopf gsg-bl-start");
        const knoepfe = el("div", "gsg-bl-knoepfe");
        knoepfe.append(ok);
        inhalt.append(el("p", undefined, text), knoepfe);
        const schliessen = dialog(titel, inhalt, () => fertig());
        ok.addEventListener("click", schliessen);
        setTimeout(() => ok.focus(), 0);
    });
}
