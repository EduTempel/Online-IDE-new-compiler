/**
 * Blöckly (Paket 19a): Eingabefeld für „frage … und warte“ wie in Scratch – unten auf der Bühne, mit ✔.
 * Fragt eine Figur, steht die Frage in ihrer Sprechblase; fragt die Bühne, steht sie über dem Feld.
 * Die Warteschlange (mehrere Skripte fragen gleichzeitig) verwaltet BuehneClass.
 */

/** Zahl aus einer Antwort: „3,5“ und „3.5“ gehen, sonst 0 (wie Scratch) */
export function antwortAlsZahl(antwort: string): number {
    const s = antwort.trim().replace(",", ".");
    const n = Number(s);
    return s !== "" && Number.isFinite(n) ? n : 0;
}

/**
 * Zeigt das Feld über der Bühne (world: Element mit der Zeichenfläche). frage: Text über dem Feld (leer: keiner).
 * fertig bekommt die Antwort; zurück kommt eine Funktion, die das Feld ohne Antwort entfernt.
 */
export function zeigeFrageFeld(world: HTMLElement, frage: string, fertig: (antwort: string) => void): () => void {
    const canvas = world.querySelector("canvas");
    if (getComputedStyle(world).position === "static") world.style.position = "relative";

    const box = document.createElement("div");
    box.className = "gsg-frage";
    // GSG-Farben (gsg-branding.css): Dunkelblau, grüner Strich oben wie auf den Karten der Startseite
    box.style.cssText = "position:absolute;box-sizing:border-box;padding:6px 8px;background:#fff;border:2px solid #00376D;"
        + "border-top:4px solid #45B82F;border-radius:10px;font:14px system-ui,sans-serif;color:#14263a;z-index:5;"
        + "box-shadow:0 2px 8px rgba(0,36,72,.3)";
    if (frage) {
        const t = document.createElement("div");
        t.textContent = frage;
        t.style.cssText = "font-weight:600;margin:0 0 4px 2px;overflow-wrap:anywhere;color:#00376D";
        box.appendChild(t);
    }
    const zeile = document.createElement("div");
    zeile.style.cssText = "display:flex;gap:6px;align-items:center";
    const input = document.createElement("input");
    input.type = "text";
    input.setAttribute("aria-label", frage || "Antwort");
    input.style.cssText = "flex:1;min-width:0;padding:4px 10px;border:1px solid #c9d5e2;border-radius:14px;font:inherit;"
        + "background:#fff;color:#14263a;outline:none";
    // Fokus: dunkelblauer Rand mit hellblauem Schein
    input.addEventListener("focus", () => { input.style.borderColor = "#00376D"; input.style.boxShadow = "0 0 0 3px #e6eef6"; });
    input.addEventListener("blur", () => { input.style.borderColor = "#c9d5e2"; input.style.boxShadow = "none"; });
    const ok = document.createElement("button");
    ok.type = "button";
    ok.textContent = "✔";
    ok.title = "Antwort abschicken (Enter)";
    ok.style.cssText = "width:28px;height:28px;border-radius:50%;border:none;background:#00376D;color:#fff;font-size:15px;cursor:pointer";
    ok.addEventListener("mouseenter", () => { ok.style.background = "#0b4a8a"; });
    ok.addEventListener("mouseleave", () => { ok.style.background = "#00376D"; });
    zeile.append(input, ok);
    box.appendChild(zeile);
    world.appendChild(box);

    // an die Zeichenfläche anpassen (sie kann ihre Größe ändern)
    const lege = () => {
        const c = canvas as HTMLElement | null;
        const left = c ? c.offsetLeft : 0, top = c ? c.offsetTop : 0;
        const w = c ? c.offsetWidth : world.clientWidth, h = c ? c.offsetHeight : world.clientHeight;
        box.style.left = left + 6 + "px";
        box.style.width = Math.max(120, w - 12) + "px";
        box.style.top = top + h - box.offsetHeight - 6 + "px";
    };
    lege();
    const beobachter = typeof ResizeObserver === "function" ? new ResizeObserver(lege) : undefined;
    if (canvas) beobachter?.observe(canvas);

    let vorbei = false;
    const entfernen = () => {
        if (vorbei) return;
        vorbei = true;
        beobachter?.disconnect();
        box.remove();
    };
    const abschicken = () => {
        if (vorbei) return;
        const antwort = input.value;
        entfernen();
        fertig(antwort);
    };
    // Tasten gehören dem Feld, nicht den Skripten („Wenn Taste … gedrückt“)
    for (const art of ["keydown", "keyup", "keypress"]) input.addEventListener(art, (e) => e.stopPropagation());
    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") abschicken();
    });
    ok.addEventListener("click", abschicken);
    box.addEventListener("mousedown", (e) => e.stopPropagation());
    setTimeout(() => input.focus(), 50);
    return entfernen;
}
