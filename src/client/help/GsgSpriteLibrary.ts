import { GSG_BUEHNENBILD_NAME, GSG_BUEHNENBILDER, GSG_FIGUR_GROESSE, GSG_FIGUREN } from "../../compiler/java/runtime/graphics/GsgFigurenLibrary";
import { bildchen } from "../bloeckly/BloecklyBilder";

/**
 * Hilfeseite „SpriteLibrary“ (GSG): oben die Figuren und Bühnenbilder der Schule (Blöckly, Bildtafel gsg-figuren.png)
 * mit Nummer, Größe und Kostümname – darunter wie bisher die Bilder der Original-IDE.
 */
export function gsgFigurenZeigen(entries: HTMLElement) {
    const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text !== undefined) e.textContent = text;
        return e;
    };
    const teil = document.createDocumentFragment();
    teil.append(
        el("h2", "gsg-sl-titel", "Figuren und Bühnenbilder der Schule (Blöckly)"),
        el("p", "gsg-sl-text", "In Blöckly und Blöckva: new Figur(\"Waschbaer\", 0, 0) bzw. class Waschbär extends Figur; Kostüme mit " +
            "wechsleZuKostuem(\"laufen 1\"). Als Sprite: new Sprite(100, 150, SpriteLibrary.Waschbaer, 3)."),
    );
    const box = (name: string, nummer: number, b: number, h: number, groesse: string, titel: string) => {
        const aussen = el("div", "jo_spritelibrary-box");
        const innen = el("div", "jo_spritelibrary-innerbox");
        innen.append(bildchen(`${name}#${nummer}`, b, h, "gsg-sl-bild"));
        aussen.append(innen,
            el("div", "jo_spritelibrary-subscript", `Nr. ${nummer}`),
            el("div", "jo_spritelibrary-subscript", groesse),
            el("div", "jo_spritelibrary-subscript", `(${titel})`));
        return aussen;
    };
    const reihe = (ueberschrift: string, kaesten: HTMLElement[]) => {
        const satz = el("div", "jo_spritelibrary-set");
        const zeile = el("div", "jo_spritelibrary-line gsg-sl-zeile");
        zeile.append(...kaesten);
        satz.append(zeile);
        teil.append(el("div", "jo_spritelibrary-heading", ueberschrift), satz);
    };
    const { breite, hoehe } = GSG_FIGUR_GROESSE;
    for (const f of GSG_FIGUREN) {
        reihe(`${f.name} – ${f.titel}: ${f.beschreibung}`,
            f.kostueme.map((k, i) => box(f.name, i, breite, hoehe, `${breite} x ${hoehe}`, k.titel)));
    }
    reihe(`${GSG_BUEHNENBILD_NAME} – Bühnenbilder`,
        GSG_BUEHNENBILDER.map((b) => box(GSG_BUEHNENBILD_NAME, b.index, 240, 180, "480 x 360", b.titel)));
    teil.append(el("h2", "gsg-sl-titel", "Bilder der Online-IDE"));
    entries.prepend(teil);

    const stil = document.createElement("style");
    stil.textContent = ".gsg-sl-titel{color:#ccc;margin:24px 0 6px}.gsg-sl-text{margin:0 0 16px}.gsg-sl-zeile{flex-wrap:wrap}";
    document.head.append(stil);
}
