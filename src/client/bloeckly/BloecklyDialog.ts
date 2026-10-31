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

export type NeueVariable = { name: string; typ: string; fuerAlle: boolean };

const TYPEN: [string, string][] = [["Zahl", "double"], ["Ganzzahl", "int"], ["Text", "String"], ["Wahrheitswert (wahr/falsch)", "boolean"]];

/**
 * „Neue Variable“ wie in Scratch: Name, Art und – bei einer Figur – für alle Figuren oder nur für diese Figur.
 * pruefen liefert eine Fehlermeldung oder undefined.
 */
export function neueVariableFragen(figur: boolean, pruefen: (name: string) => string | undefined): Promise<NeueVariable | undefined> {
    return new Promise((fertig) => {
        const form = el("form", "gsg-bl-frage");
        const feld = el("input", "gsg-bl-feld");
        feld.setAttribute("aria-label", "Name der Variablen");
        feld.placeholder = "Name, z. B. punkte";
        const typ = el("select", "gsg-bl-feld");
        typ.setAttribute("aria-label", "Art der Variablen");
        for (const [text, wert] of TYPEN) {
            const o = el("option", undefined, text);
            o.value = wert;
            typ.append(o);
        }
        form.append(feld, typ);
        const radios: HTMLInputElement[] = [];
        if (figur) {
            const gruppe = el("fieldset", "gsg-bl-wahl");
            gruppe.append(el("legend", undefined, "Gilt"));
            for (const [text, wert, an] of [["für alle Figuren", "alle", true], ["nur für diese Figur", "diese", false]] as const) {
                const label = el("label");
                const r = el("input");
                r.type = "radio";
                r.name = "gsg-bl-gilt";
                r.value = wert;
                r.checked = an;
                radios.push(r);
                label.append(r, " " + text);
                gruppe.append(label);
            }
            form.append(gruppe);
        }
        const fehler = el("div", "gsg-bl-fehler");
        fehler.setAttribute("role", "alert");
        const ok = knopf("Anlegen", "Variable anlegen", "gsg-bl-knopf gsg-bl-start");
        ok.type = "submit";
        const knoepfe = el("div", "gsg-bl-knoepfe");
        const abbrechen = knopf("Abbrechen", "Keine Variable anlegen");
        knoepfe.append(abbrechen, ok);
        form.append(fehler, knoepfe);
        let ergebnis: NeueVariable | undefined;
        let beruehrt = false;
        const zeige = () => {
            const f = pruefen(feld.value.trim());
            fehler.textContent = beruehrt ? f ?? "" : "";
            ok.disabled = !!f;
            return f;
        };
        feld.addEventListener("input", () => { beruehrt = true; zeige(); });
        zeige();
        const schliessen = dialog(figur ? "Neue Variable" : "Neue Variable für alle Figuren", form, () => fertig(ergebnis));
        abbrechen.addEventListener("click", schliessen);
        form.addEventListener("submit", (e) => {
            e.preventDefault();
            beruehrt = true;
            if (zeige()) return;
            ergebnis = { name: feld.value.trim(), typ: typ.value, fuerAlle: !figur || radios[0].checked };
            schliessen();
        });
        setTimeout(() => feld.focus(), 0);
    });
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
