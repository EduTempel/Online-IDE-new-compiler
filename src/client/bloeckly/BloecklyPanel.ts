import { SchedulerState } from "../../compiler/common/interpreter/SchedulerState";
import { FileTypeManager } from "../../compiler/common/module/FileTypeManager";
import { BUEHNE_BREITE, BUEHNE_HOEHE, Kostueme } from "../../compiler/java/runtime/graphics/GsgBuehnenLogik";
import { GSG_BUEHNENBILDER, GSG_FIGUR_GROESSE, GSG_FIGUREN } from "../../compiler/java/runtime/graphics/GsgFigurenLibrary";
import { Tab, type TabManager } from "../../tools/TabManager";
import type { Main } from "../main/Main";
import { GUIFile } from "../workspace/File";
import { bildchen, bildtafel, buehnenbildName, zeichne } from "./BloecklyBilder";
import {
    bibliotheksfigur, bildnummer, BUEHNEN_DATEI, buehnenQuelltext, figurQuelltext, freierName, HAUPTPROGRAMM, hatFlagge,
    hauptprogrammHatMehr, hauptprogrammQuelltext, klassenname, liesProjekt, mitBuehnenbild, mitFigur, mitStart, namensFehler, umbenannt,
    type FigurInfo, type Projekt,
} from "./BloecklyProjekt";
import "/assets/css/gsg-bloeckly.css";
import { dialog, el, knopf } from "./BloecklyDialog";
import { eigeneFigurDialog, eigeneFigurEntfernen } from "./BloecklyEigeneFigur";
import { istModern } from "../main/gui/GsgModern";
import { beiEigenenFiguren, eigeneFiguren } from "../../compiler/java/runtime/graphics/GsgEigeneFiguren";

/**
 * Blöckly (Paket 18d): Oberfläche im Stil von Scratch, im eigenen Design.
 *
 *  - oben rechts die Bühne (Reiter „Ausgabe“) mit 🚩 Start und ⏹ Stopp. Solange kein Programm läuft, zeigt sie das
 *    Startbild: Bühnenbild und Figuren an ihrer Startposition. Figuren lassen sich dort an ihren Platz ziehen.
 *  - unten rechts der Reiter „Figuren“: alle Figuren mit Bildchen, „Figur wählen“ (Bibliothek), daneben die Bühne
 *    mit „Bühnenbild wählen“. Ein Klick öffnet die Skripte der Figur (ihre Klassendatei) links.
 *  - links über den Skripten „Skripte │ Kostüme“: die Kostüme der Figur bzw. die Bühnenbilder.
 *
 * Alles steht in den Java-Dateien des Projekts (BloecklyProjekt.ts); das Hauptprogramm hält die Oberfläche selbst
 * aktuell, Schüler/innen sehen es nicht.
 */

type Fig = { datei: GUIFile; info: FigurInfo };

/** Reiter „Figuren“ anlegen (nur in Blöckly); liefert den Reiter */
export function addBloecklyTab(main: Main, tabs: TabManager, outputTab: Tab): Tab {
    const tab = new Tab("Figures", "Figuren", ["gsg-bl-tab"]);
    tabs.addTab(tab);
    new BloecklyPanel(main, tab, outputTab);
    return tab;
}

class BloecklyPanel {
    private projekt: Projekt<GUIFile> = { figuren: [], weitere: [] };
    private workspace: unknown;
    private signatur = "";
    private beschaeftigt = false;
    /** Startbild statt Grafik des letzten Laufs zeigen */
    private vorschauAn = true;
    /** Figur, die gerade gezogen wird (Position noch nicht in der Datei) */
    private ziehen?: { fig: Fig; dx: number; dy: number; x: number; y: number; bewegt: boolean };
    private kostuemeAn = false;

    // Reiter „Figuren“
    private kopf = el("div", "gsg-bl-kopf");
    private liste = el("div", "gsg-bl-liste");
    private buehnenSpalte = el("div", "gsg-bl-buehnenspalte");
    private hinweis = el("div", "gsg-bl-hinweis");
    /** Programmteile, die zu keiner Figur gehören (versteckte Blöcke im Hauptprogramm, fremde Dateien) */
    private fremde = el("div", "gsg-bl-fremde");
    /** über „Gehört zu keiner Figur“ geöffnet: darf im Editor stehen, obwohl weder Figur noch Bühne */
    private angesehen?: GUIFile;
    private umleitung = false;

    // Bühne
    private leiste = el("div", "gsg-bl-buehnenleiste");
    private vorschau = el("div", "gsg-bl-vorschau");
    private leinwand = el("canvas", "gsg-bl-leinwand");

    // Skripte │ Kostüme
    private umschalter = el("div", "gsg-bl-umschalter");
    private kostuemFlaeche = el("div", "gsg-bl-kostueme");
    /** an Stelle der Blöcke, wenn weder Figur noch Bühne gewählt ist (Blöcke gibt es nur bei Figuren und der Bühne) */
    private ohneAuswahl = el("div", "gsg-bl-ohneauswahl");
    /** nach dem Start bzw. Wechsel des Projekts: bis dahin die Bühne wählen (auch wenn die IDE die zuletzt offene Datei öffnet) */
    private buehneBis = 0;

    constructor(private main: Main, private tab: Tab, private outputTab: Tab) {
        this.baueReiter();
        this.baueBuehne();
        this.baueUmschalter();
        setInterval(() => this.pruefe(), 400);
        this.warteAufInterpreter();
        this.warteAufEditor();
    }

    /** Der Editor entsteht erst nach den Reitern */
    private warteAufEditor() {
        let editor;
        try { editor = this.main.getMainEditor(); } catch { /* noch nicht da */ }
        if (!editor) {
            setTimeout(() => this.warteAufEditor(), 300);
            return;
        }
        editor.onDidChangeModel(() => this.zeigeAuswahl());
    }

    // —— Aufbau ——

    private baueReiter() {
        const body = this.tab.bodyDiv;
        body.classList.add("gsg-bl");
        const haupt = el("div", "gsg-bl-figurenspalte");
        const neu = knopf("＋ Figur wählen", "Neue Figur aus der Bibliothek", "gsg-bl-knopf gsg-bl-neu");
        neu.addEventListener("click", () => this.bibliothek());
        // Paket 18i: eigene Bilder als Figur
        const hoch = knopf("＋ Eigene Figur hochladen", "Eigene Bilder (PNG, JPG, SVG) als Kostüme einer neuen Figur", "gsg-bl-knopf gsg-bl-neu gsg-bl-hoch");
        hoch.addEventListener("click", () => this.eigeneFigur());
        haupt.append(this.kopf, this.liste, neu, hoch, this.fremde);
        // neue Bildtafel (anderes Projekt, hochgeladen): Bildchen neu zeichnen
        beiEigenenFiguren(() => this.zeigeAlles());
        body.append(haupt, this.buehnenSpalte, this.hinweis);
    }

    private baueBuehne() {
        const start = knopf("🚩 Start", "Programm starten", "gsg-bl-knopf gsg-bl-start");
        const stopp = knopf("⏹ Stopp", "Programm beenden und das Startbild zeigen", "gsg-bl-knopf gsg-bl-stopp");
        const tipp = el("span", "gsg-bl-tipp", "Figuren auf der Bühne an ihren Startplatz ziehen");
        start.addEventListener("click", () => {
            const state = this.main.getInterpreter()?.scheduler.state;
            if (state === SchedulerState.running) this.main.getActionManager().trigger("interpreter.stop");
            setTimeout(() => this.main.getActionManager().trigger("interpreter.start"), state === SchedulerState.running ? 150 : 0);
        });
        stopp.addEventListener("click", () => {
            const state = this.main.getInterpreter()?.scheduler.state;
            if (state === SchedulerState.running || state === SchedulerState.paused) this.main.getActionManager().trigger("interpreter.stop");
            this.setzeVorschau(true);
        });
        this.leiste.append(start, stopp, tipp);
        this.leinwand.width = BUEHNE_BREITE * 2;
        this.leinwand.height = BUEHNE_HOEHE * 2;
        this.vorschau.append(this.leinwand);
        const body = this.outputTab.bodyDiv;
        body.classList.add("gsg-bl-ausgabe");
        body.prepend(this.leiste, this.vorschau);
        this.leinwand.addEventListener("pointerdown", (e) => this.druecken(e));
        this.leinwand.addEventListener("pointermove", (e) => this.bewegen(e));
        this.leinwand.addEventListener("pointerup", (e) => this.loslassen(e));
        this.leinwand.addEventListener("pointercancel", (e) => this.loslassen(e));
        this.setzeVorschau(true);
    }

    private baueUmschalter() {
        const skripte = knopf("🧩 Skripte", "Skripte der Figur", "gsg-bl-reiter");
        const kostueme = knopf("🖌 Kostüme", "Kostüme der Figur bzw. Bühnenbilder", "gsg-bl-reiter");
        skripte.dataset.modus = "skripte";
        kostueme.dataset.modus = "kostueme";
        this.umschalter.append(skripte, kostueme);
        this.umschalter.setAttribute("role", "group");
        this.umschalter.addEventListener("click", (e) => {
            const modus = (e.target as HTMLElement).closest<HTMLElement>("button")?.dataset.modus;
            if (!modus) return;
            this.kostuemeAn = modus === "kostueme";
            this.zeigeAuswahl();
        });
        // Reiter über dem Editor (wie in Scratch); Kostüme an Stelle des Editors (vor dem unteren Bereich)
        const bereich = document.getElementById("editoranderrors");
        bereich?.insertBefore(this.umschalter, document.getElementById("debugpanel")?.nextSibling ?? null);
        bereich?.insertBefore(this.kostuemFlaeche, document.getElementById("bottomdiv-outer"));
        this.kostuemFlaeche.style.display = "none";
        bereich?.insertBefore(this.ohneAuswahl, document.getElementById("bottomdiv-outer"));
        this.ohneAuswahl.style.display = "none";
    }

    private warteAufInterpreter() {
        const interpreter = this.main.getInterpreter?.();
        if (!interpreter) {
            setTimeout(() => this.warteAufInterpreter(), 500);
            return;
        }
        interpreter.eventManager.on("start", () => this.setzeVorschau(false));
        interpreter.eventManager.on("stop", () => {
            // ohne Grafik (Fehler vor der Bühne, nur Text): wieder das Startbild
            // (die Leinwand der Grafik entsteht erst etwas später, ihr Behälter sofort)
            setTimeout(() => {
                if (this.laeuft()) return;
                if (!this.outputTab.bodyDiv.querySelector(".jo_graphics > *")) this.setzeVorschau(true);
            }, 100);
        });
    }

    // —— Zustand ——

    private darfAendern(): boolean {
        const ws = this.main.getCurrentWorkspace();
        if (!ws) return false;
        const u = this.main.user;
        const staff = !!u && (u.is_teacher || u.is_admin || u.is_schooladmin);
        return !ws.readonly || staff;
    }

    private laeuft(): boolean {
        const s = this.main.getInterpreter?.()?.scheduler.state;
        return s === SchedulerState.running || s === SchedulerState.paused;
    }

    /** regelmäßig: anderes Projekt oder geänderte Dateien → neu lesen und zeigen */
    private pruefe() {
        if (this.beschaeftigt) return;
        const ws = this.main.getCurrentWorkspace();
        const dateien = ws?.getFiles() ?? [];
        const signatur = dateien.map((f) => `${f.name}:${f.hasMonacoModel() ? f.getMonacoModel()!.getAlternativeVersionId() : f.getText().length}`).join("|");
        if (ws === this.workspace && signatur === this.signatur) return;
        const anderesProjekt = ws !== this.workspace;
        this.workspace = ws;
        this.signatur = signatur;
        this.projekt = liesProjekt(dateien.filter((f) => !f.isFolder));
        if (anderesProjekt) {
            this.angesehen = undefined;
            this.setzeVorschau(true);
            // Blöckly startet mit der Bühne (die IDE öffnet sonst die zuletzt offene Datei); ein ganz neues Projekt
            // dagegen mit seiner ersten Figur – dort steht schon „Wenn 🚩 angeklickt“
            this.buehneBis = dateien.length > 0 ? Date.now() + 2500 : 0;
            // leeres oder unvollständiges Projekt (z. B. ausgeteilt, über das Menü angelegt): Bühne und Hauptprogramm
            // gleich anlegen – Blöcke gibt es nur bei Figuren und der Bühne
            const unvollstaendig = dateien.length === 0 || !this.projekt.haupt || !this.projekt.buehne;
            if (ws && unvollstaendig && this.darfAendern()) {
                void this.einrichten();
                return;
            }
        }
        this.zeigeAlles();
    }

    private zeigeAlles() {
        this.zeigeListe();
        this.zeichneVorschau();
        this.zeigeAuswahl();
    }

    private aktuelleDatei(): GUIFile | undefined {
        let model;
        try { model = this.main.getMainEditor()?.getModel(); } catch { return undefined; }
        if (!model) return undefined;
        return this.main.getCurrentWorkspace()?.getFiles().find((f) => f.hasMonacoModel() && f.getMonacoModel() === model);
    }

    private ausgewaehlteFigur(): Fig | undefined {
        const datei = this.aktuelleDatei();
        return this.projekt.figuren.find((f) => f.datei === datei);
    }

    private istBuehneAusgewaehlt(): boolean {
        return !!this.projekt.buehne && this.projekt.buehne.datei === this.aktuelleDatei();
    }

    // —— Reiter „Figuren“ ——

    private zeigeListe() {
        const p = this.projekt;
        this.liste.replaceChildren();
        this.buehnenSpalte.replaceChildren();
        this.hinweis.replaceChildren();
        this.fremde.replaceChildren();
        const ok = !!p.haupt && !!p.buehne;
        this.tab.bodyDiv.classList.toggle("gsg-bl-kein-projekt", !ok);
        if (!ok) {
            const ws = this.main.getCurrentWorkspace();
            this.hinweis.append(el("p", undefined, ws ? "Dieses Projekt ist noch kein Blocks-Projekt (es fehlen Bühne oder Hauptprogramm)." : "Wähle links ein Projekt."));
            if (ws && this.darfAendern()) {
                const b = knopf("Als Blocks-Projekt einrichten", "Bühne und Hauptprogramm anlegen");
                b.addEventListener("click", () => void this.einrichten());
                this.hinweis.append(b);
            }
            return;
        }
        for (const fig of p.figuren) {
            const kachel = el("button", "gsg-bl-kachel");
            kachel.type = "button";
            kachel.title = `${fig.info.klasse}: Skripte öffnen`;
            const name = bibliotheksfigur(fig.info.figur);
            kachel.append(bildchen(`${name ?? GSG_FIGUREN[0].name}#0`, 56, 56), el("span", "gsg-bl-name", fig.info.klasse));
            kachel.addEventListener("click", () => this.oeffne(fig.datei));
            kachel.dataset.datei = fig.datei.name;
            this.liste.append(kachel);
        }
        if (p.figuren.length === 0) this.liste.append(el("p", "gsg-bl-leer", "Noch keine Figur – wähle eine aus der Bibliothek."));

        // Bühne
        const b = p.buehne!;
        const nummer = bildnummer(b.info.bild);
        const kachel = el("button", "gsg-bl-kachel gsg-bl-buehnenkachel");
        kachel.type = "button";
        kachel.title = "Bühne: Skripte öffnen";
        const bild = nummer !== undefined ? bildchen(buehnenbildName(nummer), 80, 60) : el("div", "gsg-bl-weiss");
        kachel.append(bild, el("span", "gsg-bl-name", "Bühne"));
        kachel.addEventListener("click", () => this.oeffne(b.datei));
        kachel.dataset.datei = b.datei.name;
        const wahl = knopf("Bühnenbild wählen", "Bühnenbild aus der Bibliothek");
        wahl.addEventListener("click", () => this.bildWaehlen());
        this.buehnenSpalte.append(el("div", "gsg-bl-spaltentitel", "Bühne"), kachel, wahl);
        this.zeigeFremde();
    }

    /** Blöcke, die zu keiner Figur gehören, laufen mit – hier sind sie zu finden (sonst „unsichtbares Programm“) */
    private zeigeFremde() {
        const p = this.projekt;
        const fremd = [...(p.haupt && hauptprogrammHatMehr(p.haupt.getText()) ? [p.haupt] : []), ...p.weitere];
        if (fremd.length === 0) return;
        const reihe = el("div", "gsg-bl-liste");
        for (const datei of fremd) {
            const kachel = el("button", "gsg-bl-kachel gsg-bl-fremdkachel");
            kachel.type = "button";
            kachel.title = `${datei.name}: Blöcke ansehen`;
            kachel.append(el("span", "gsg-bl-dateisymbol", "📄"), el("span", "gsg-bl-name", datei.name));
            kachel.addEventListener("click", () => this.ansehen(datei));
            kachel.dataset.datei = datei.name;
            reihe.append(kachel);
        }
        this.fremde.append(el("div", "gsg-bl-spaltentitel", "⚠ Gehört zu keiner Figur"),
            el("p", "gsg-bl-leer", "Blöcke hier laufen beim Start mit, gehören aber weder zu einer Figur noch zur Bühne."), reihe);
    }

    /** Datei öffnen, die weder Figur noch Bühne ist (auch das sonst versteckte Hauptprogramm) */
    private ansehen(datei: GUIFile) {
        this.angesehen = datei;
        const explorer = this.main.projectExplorer;
        explorer.gsgHauptprogrammZeigen = datei === this.projekt.haupt;
        try {
            explorer.setFileActive(datei);
        } finally {
            explorer.gsgHauptprogrammZeigen = false;
        }
        this.zeigeAuswahl();
    }

    /** Darf diese Datei im Editor stehen? Figuren, die Bühne und ausdrücklich angesehene Dateien */
    private istWaehlbar(datei: GUIFile | undefined): boolean {
        const p = this.projekt;
        return !!datei && (datei === p.buehne?.datei || datei === this.angesehen || p.figuren.some((f) => f.datei === datei));
    }

    /**
     * In Blöckly ist immer eine Figur oder die Bühne gewählt – sonst landeten Blöcke „im Nirwana“ (z. B. im versteckten
     * Hauptprogramm, das beim Start als zuletzt geöffnete Datei im Editor stehen kann). Sonst: erste Figur bzw. Bühne öffnen.
     */
    private sorgeFuerAuswahl() {
        const ws = this.main.getCurrentWorkspace();
        const p = this.projekt;
        if (this.beschaeftigt || this.umleitung || !ws || ws !== this.workspace || !p.buehne) return;
        const zurBuehne = Date.now() < this.buehneBis;
        if (zurBuehne ? this.istBuehneAusgewaehlt() : this.istWaehlbar(this.aktuelleDatei())) return;
        this.umleitung = true;
        // nicht mitten im Wechsel des Editor-Modells umschalten
        setTimeout(() => {
            this.umleitung = false;
            if (this.beschaeftigt || this.main.getCurrentWorkspace() !== ws) return;
            if (Date.now() < this.buehneBis ? this.istBuehneAusgewaehlt() : this.istWaehlbar(this.aktuelleDatei())) return;
            const ziel = this.projekt.buehne?.datei ?? this.projekt.figuren[0]?.datei;
            if (ziel && ws.getFiles().includes(ziel)) this.main.projectExplorer.setFileActive(ziel);
        }, 0);
    }

    /** Kopfzeile, Hervorhebung, Umschalter und Kostüme passend zur Datei im Editor */
    private zeigeAuswahl() {
        this.sorgeFuerAuswahl();
        const datei = this.aktuelleDatei();
        for (const k of Array.from(this.tab.bodyDiv.querySelectorAll<HTMLElement>(".gsg-bl-kachel"))) {
            k.classList.toggle("gsg-bl-gewaehlt", !!datei && k.dataset.datei === datei.name);
        }
        const fig = this.ausgewaehlteFigur();
        const buehne = this.istBuehneAusgewaehlt();
        this.kopf.replaceChildren();
        if (fig) {
            const { x, y } = this.position(fig);
            this.kopf.append(el("strong", undefined, fig.info.klasse),
                istModern() ? this.positionsFelder(fig, Math.round(x), Math.round(y))
                    : el("span", "gsg-bl-pos", `x: ${Math.round(x)}   y: ${Math.round(y)}`));
            if (this.darfAendern()) {
                const umbenennen = knopf("✎", "Figur umbenennen", "gsg-bl-mini");
                umbenennen.addEventListener("click", () => void this.umbenennen(fig));
                const loeschen = knopf("🗑", "Figur löschen", "gsg-bl-mini");
                loeschen.addEventListener("click", () => void this.loeschen(fig));
                this.kopf.append(umbenennen, loeschen);
            }
        } else if (buehne) {
            this.kopf.append(el("strong", undefined, "Bühne"), el("span", "gsg-bl-pos", this.projekt.buehne!.info.bild || "ohne Bühnenbild"));
        } else if (datei && datei === this.angesehen) {
            this.kopf.append(el("strong", undefined, `⚠ ${datei.name}`), el("span", "gsg-bl-fremdhinweis",
                "gehört zu keiner Figur – die Blöcke laufen trotzdem mit. Zieh sie auf eine Figur oder die Bühne (oder Strg+C, Figur anklicken, Strg+V) und entferne sie dann hier."));
            if (this.darfAendern()) {
                const weg = knopf("🗑 Entfernen", datei === this.projekt.haupt ? "Die Blöcke aus dem Hauptprogramm entfernen" : "Diese Datei löschen", "gsg-bl-mini");
                weg.addEventListener("click", () => void this.fremdeEntfernen(datei));
                this.kopf.append(weg);
            }
        } else {
            this.kopf.append(el("span", "gsg-bl-pos", "Klicke eine Figur an, um ihre Skripte zu sehen."));
        }
        // Skripte │ Kostüme nur bei Figuren und Bühne
        const passend = !!fig || buehne;
        this.umschalter.style.display = passend ? "" : "none";
        const kostuemKnopf = this.umschalter.querySelector<HTMLElement>('[data-modus="kostueme"]');
        if (kostuemKnopf) kostuemKnopf.textContent = buehne ? "🖼 Bühnenbilder" : "🖌 Kostüme";
        const skriptKnopf = this.umschalter.querySelector<HTMLElement>('[data-modus="skripte"]');
        if (skriptKnopf) skriptKnopf.textContent = `🧩 Skripte${fig ? " von " + fig.info.klasse : buehne ? " der Bühne" : ""}`;
        const kostueme = passend && this.kostuemeAn;
        for (const b of Array.from(this.umschalter.querySelectorAll<HTMLElement>("button"))) {
            b.classList.toggle("active", (b.dataset.modus === "kostueme") === kostueme);
            b.setAttribute("aria-pressed", String((b.dataset.modus === "kostueme") === kostueme));
        }
        const bereich = document.getElementById("editoranderrors");
        if (bereich && bereich.classList.contains("gsg-bl-kostueme-an") !== kostueme) {
            bereich.classList.toggle("gsg-bl-kostueme-an", kostueme);
            // Editor bzw. Blöcke wieder sichtbar: Größe neu berechnen lassen
            if (!kostueme) setTimeout(() => window.dispatchEvent(new Event("resize")), 0);
        }
        this.kostuemFlaeche.style.display = kostueme ? "" : "none";
        if (kostueme) this.zeigeKostueme(fig);
        this.zeigeOhneAuswahl(!passend && !(datei && datei === this.angesehen) && !!this.main.getCurrentWorkspace());
        this.zeichneVorschau();
    }

    /**
     * Weder Figur noch Bühne gewählt (z. B. unvollständiges Projekt, das nicht eingerichtet werden darf): keine Blöcke
     * zeigen – sonst entstünde ein Programm, das zu keiner Figur gehört und beim Wählen einer Figur „verschwindet“.
     */
    private zeigeOhneAuswahl(an: boolean) {
        const bereich = document.getElementById("editoranderrors");
        if (bereich && bereich.classList.contains("gsg-bl-ohne-auswahl") !== an) {
            bereich.classList.toggle("gsg-bl-ohne-auswahl", an);
            if (!an) setTimeout(() => window.dispatchEvent(new Event("resize")), 0);
        }
        this.ohneAuswahl.style.display = an ? "" : "none";
        if (!an) return;
        const ok = !!this.projekt.haupt && !!this.projekt.buehne;
        this.ohneAuswahl.replaceChildren(el("p", undefined, ok
            ? "Klicke unter „Figuren“ eine Figur oder die Bühne an – Skripte gibt es nur bei Figuren und bei der Bühne."
            : "Dieses Projekt ist noch kein Blocks-Projekt: Es fehlen Bühne oder Hauptprogramm."));
        if (!ok && this.darfAendern()) {
            const b = knopf("Als Blocks-Projekt einrichten", "Bühne und Hauptprogramm anlegen");
            b.addEventListener("click", () => void this.einrichten());
            this.ohneAuswahl.append(b);
        }
    }

    /** Modern: Startposition als Eingabefelder (wie unter der Bühne in Scratch) */
    private positionsFelder(fig: Fig, x: number, y: number): HTMLElement {
        const felder = el("div", "gsg-bl-felder");
        const feld = (achse: "x" | "y", wert: number, grenze: number) => {
            const label = el("label", undefined, achse);
            const input = el("input");
            input.type = "number";
            input.value = String(wert);
            input.min = String(-grenze);
            input.max = String(grenze);
            input.dataset.achse = achse;
            input.disabled = !this.darfAendern();
            input.addEventListener("change", () => {
                const zahl = Number(input.value);
                if (!Number.isFinite(zahl)) return;
                const neu = Math.max(-grenze, Math.min(grenze, Math.round(zahl)));
                if (achse === "x") fig.info.x = neu; else fig.info.y = neu;
                this.schreibe(fig.datei, mitStart(fig.datei.getText(), fig.info.x, fig.info.y));
                this.setzeVorschau(true);
            });
            label.append(input);
            felder.append(label);
        };
        feld("x", x, BUEHNE_BREITE / 2);
        feld("y", y, BUEHNE_HOEHE / 2);
        return felder;
    }

    private oeffne(datei: GUIFile) {
        this.angesehen = undefined;
        this.buehneBis = 0;   // selbst gewählt: nicht mehr zur Bühne umlenken
        this.main.projectExplorer.setFileActive(datei);
        this.zeigeAuswahl();
    }

    // —— Kostüme ——

    private zeigeKostueme(fig: Fig | undefined) {
        const f = this.kostuemFlaeche;
        f.replaceChildren();
        if (!fig) {
            // Bühne: Bühnenbilder
            f.append(el("h3", undefined, "Bühnenbilder"),
                el("p", "gsg-bl-tipp", "Klicke ein Bühnenbild an, um es als Startbild zu wählen. Im Programm: wechsleZuBuehnenbild(\"Wald\")."));
            const raster = el("div", "gsg-bl-raster");
            const aktuell = bildnummer(this.projekt.buehne?.info.bild ?? "");
            for (const b of GSG_BUEHNENBILDER) {
                const k = el("button", "gsg-bl-kostuem" + (b.index === aktuell ? " gsg-bl-gewaehlt" : ""));
                k.type = "button";
                k.append(bildchen(buehnenbildName(b.index), 120, 90), el("span", undefined, b.titel));
                k.addEventListener("click", () => this.setzeBild(b.titel));
                k.disabled = !this.darfAendern();
                raster.append(k);
            }
            f.append(raster);
            return;
        }
        const kostueme = Kostueme.fuer(fig.info.figur);
        const kopf = el("div", "gsg-bl-kostuemkopf");
        kopf.append(el("h3", undefined, `Kostüme von ${fig.info.klasse}`));
        if (this.darfAendern()) {
            const auswahl = el("select", "gsg-bl-aussehen");
            auswahl.title = "Aussehen der Figur";
            if (!kostueme) {
                const o = el("option", undefined, "– bitte wählen –");
                o.value = "";
                o.disabled = true;
                o.selected = true;
                auswahl.append(o);
            }
            for (const g of Kostueme.alleFiguren()) {
                const o = el("option", undefined, g.titel);
                o.value = GSG_FIGUREN.includes(g) ? g.name : g.titel;
                o.selected = g.name === kostueme?.figur.name;
                auswahl.append(o);
            }
            auswahl.addEventListener("change", () => this.schreibe(fig.datei, mitFigur(fig.datei.getText(), auswahl.value)));
            const label = el("label", "gsg-bl-aussehen-label", "Aussehen: ");
            label.append(auswahl);
            kopf.append(label);
        }
        f.append(kopf, el("p", "gsg-bl-tipp",
            "Im Programm: wechsleZuKostuem(\"laufen 1\"). Die Ansicht – vorne, rechts, links oder hinten – richtet sich nach der Richtung, in die die Figur geht. Eigene Bilder: „＋ Eigene Figur hochladen“ im Reiter Figuren."));
        if (!kostueme) {
            f.append(el("p", "gsg-bl-fehler", `Das Aussehen „${fig.info.figur}“ gibt es nicht. Wähle oben eines aus.`));
            return;
        }
        const titel: Record<string, string> = { vorne: "von vorne", rechts: "nach rechts", links: "nach links", hinten: "von hinten" };
        for (const ansicht of ["vorne", "rechts", "links", "hinten"] as const) {
            const zeile = el("div", "gsg-bl-ansicht");
            zeile.append(el("div", "gsg-bl-ansichttitel", titel[ansicht]));
            const raster = el("div", "gsg-bl-raster");
            for (const pose of kostueme.posenFuer(ansicht)) {
                const k = el("div", "gsg-bl-kostuem");
                k.append(bildchen(`${kostueme.figur.name}#${kostueme.bildnummer(ansicht, pose)}`, 66, 72), el("span", undefined, Kostueme.titel(pose)));
                raster.append(k);
            }
            zeile.append(raster);
            f.append(zeile);
        }
    }

    // —— Bühne: Startbild ——

    private setzeVorschau(an: boolean) {
        this.vorschauAn = an;
        this.outputTab.bodyDiv.classList.toggle("gsg-bl-vorschau-an", an);
        if (an) this.zeichneVorschau();
    }

    private zeichneVorschau() {
        if (!this.vorschauAn) return;
        const ctx = this.leinwand.getContext("2d");
        if (!ctx) return;
        const p = this.projekt;
        bildtafel().then((tafel) => {
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, this.leinwand.width, this.leinwand.height);
            ctx.imageSmoothingQuality = "high";
            const nummer = bildnummer(p.buehne?.info.bild ?? "");
            if (nummer !== undefined) zeichne(ctx, tafel, buehnenbildName(nummer), 0, 0, this.leinwand.width, this.leinwand.height);
            const gewaehlt = this.ausgewaehlteFigur();
            for (const fig of p.figuren) {
                const { x, y } = this.position(fig);
                const r = this.rechteck(x, y);
                const name = bibliotheksfigur(fig.info.figur) ?? GSG_FIGUREN[0].name;
                zeichne(ctx, tafel, `${name}#0`, r.x, r.y, r.b, r.h);
                if (fig === gewaehlt) {
                    ctx.save();
                    ctx.setLineDash([8, 6]);
                    ctx.lineWidth = 3;
                    ctx.strokeStyle = "rgba(69, 184, 47, .9)";
                    ctx.strokeRect(r.x, r.y, r.b, r.h);
                    ctx.restore();
                }
            }
        }).catch(() => { /* ohne Bilder */ });
    }

    private position(fig: Fig): { x: number; y: number } {
        return this.ziehen?.fig === fig ? { x: this.ziehen.x, y: this.ziehen.y } : { x: fig.info.x, y: fig.info.y };
    }

    /** Rechteck des Kostüms auf der Leinwand (doppelte Auflösung) */
    private rechteck(x: number, y: number) {
        const b = GSG_FIGUR_GROESSE.breite * 2, h = GSG_FIGUR_GROESSE.hoehe * 2;
        return { x: (x + BUEHNE_BREITE / 2) * 2 - b / 2, y: (BUEHNE_HOEHE / 2 - y) * 2 - h / 2, b, h };
    }

    /** Mauspunkt → Bühnenkoordinaten */
    private buehnenpunkt(e: PointerEvent): { x: number; y: number } {
        const r = this.leinwand.getBoundingClientRect();
        return {
            x: (e.clientX - r.left) / r.width * BUEHNE_BREITE - BUEHNE_BREITE / 2,
            y: BUEHNE_HOEHE / 2 - (e.clientY - r.top) / r.height * BUEHNE_HOEHE,
        };
    }

    private druecken(e: PointerEvent) {
        if (e.button !== 0 || !this.vorschauAn) return;
        const p = this.buehnenpunkt(e);
        // vorderste Figur zuerst
        const fig = [...this.projekt.figuren].reverse().find((f) => {
            const hb = GSG_FIGUR_GROESSE.breite / 2, hh = GSG_FIGUR_GROESSE.hoehe / 2;
            return Math.abs(p.x - f.info.x) <= hb && Math.abs(p.y - f.info.y) <= hh;
        });
        if (!fig) {
            if (this.projekt.buehne) this.oeffne(this.projekt.buehne.datei);
            return;
        }
        this.oeffne(fig.datei);
        if (!this.darfAendern()) return;
        this.ziehen = { fig, dx: fig.info.x - p.x, dy: fig.info.y - p.y, x: fig.info.x, y: fig.info.y, bewegt: false };
        this.leinwand.setPointerCapture(e.pointerId);
        this.leinwand.classList.add("gsg-bl-zieht");
    }

    private bewegen(e: PointerEvent) {
        const z = this.ziehen;
        if (!z) {
            // Mauszeiger als Hand über Figuren
            const p = this.buehnenpunkt(e);
            const ueber = this.vorschauAn && this.projekt.figuren.some((f) => Math.abs(p.x - f.info.x) <= GSG_FIGUR_GROESSE.breite / 2 && Math.abs(p.y - f.info.y) <= GSG_FIGUR_GROESSE.hoehe / 2);
            this.leinwand.classList.toggle("gsg-bl-greifbar", ueber && this.darfAendern());
            return;
        }
        const p = this.buehnenpunkt(e);
        z.x = Math.max(-BUEHNE_BREITE / 2, Math.min(BUEHNE_BREITE / 2, Math.round(p.x + z.dx)));
        z.y = Math.max(-BUEHNE_HOEHE / 2, Math.min(BUEHNE_HOEHE / 2, Math.round(p.y + z.dy)));
        z.bewegt = z.bewegt || z.x !== z.fig.info.x || z.y !== z.fig.info.y;
        this.zeichneVorschau();
        const pos = this.kopf.querySelector(".gsg-bl-pos");
        if (pos) pos.textContent = `x: ${z.x}   y: ${z.y}`;
        for (const input of Array.from(this.kopf.querySelectorAll<HTMLInputElement>(".gsg-bl-felder input"))) {
            input.value = String(input.dataset.achse === "x" ? z.x : z.y);
        }
    }

    private loslassen(e: PointerEvent) {
        const z = this.ziehen;
        if (!z) return;
        this.ziehen = undefined;
        this.leinwand.classList.remove("gsg-bl-zieht");
        try { this.leinwand.releasePointerCapture(e.pointerId); } catch { /* egal */ }
        if (z.bewegt) {
            z.fig.info.x = z.x;
            z.fig.info.y = z.y;
            this.schreibe(z.fig.datei, mitStart(z.fig.datei.getText(), z.x, z.y));
        }
        this.zeigeAuswahl();
    }

    // —— Dateien ändern ——

    /** Text einer Datei ersetzen (wird gespeichert und neu übersetzt) */
    private schreibe(datei: GUIFile, text: string) {
        if (datei.getText() === text) return;
        // ohne Editor-Modell bemerkt der Compiler die Änderung nicht (Versionsnummer)
        datei.getMonacoModel();
        datei.setText(text);
        datei.setSaved(false);
        this.main.getCompiler()?.triggerCompile();
    }

    private async neueDatei(name: string, text: string): Promise<GUIFile | undefined> {
        const ws = this.main.getCurrentWorkspace();
        if (!ws) return undefined;
        const datei = new GUIFile(this.main, name, text);
        ws.addFile(datei);
        datei.getMonacoModel();   // wie beim Laden eines Projekts; sonst gilt die Datei später als geändert
        const ok = this.main.user.is_testuser || await this.main.networkManager.sendCreateFile(datei, ws, this.main.workspacesOwnerId);
        if (!ok) {
            ws.removeFile(datei);
            return undefined;
        }
        if (name !== HAUPTPROGRAMM) {
            this.main.projectExplorer.fileTreeview.addNode(false, name,
                FileTypeManager.filenameToFileType(name, this.main.getCurrentProgrammingLanguage()).iconclass, datei);
        }
        this.main.getCompiler()?.triggerCompile();
        return datei;
    }

    /** Hauptprogramm passend zu Bühne und Figurenliste */
    private aktualisiereHauptprogramm(reihenfolge?: string[]) {
        const p = this.projekt;
        if (!p.haupt || !p.buehne) return;
        const figuren = reihenfolge ?? p.figuren.map((f) => f.info.klasse);
        this.schreibe(p.haupt, hauptprogrammQuelltext(p.buehne.info.klasse, figuren));
    }

    private neu() {
        this.signatur = "";
        this.pruefe();
    }

    /** neues (leeres) Projekt bzw. fehlende Teile: Bühne, ein Waschbär, Hauptprogramm */
    private async einrichten() {
        if (this.beschaeftigt) return;
        this.beschaeftigt = true;
        try {
            const ws = this.main.getCurrentWorkspace();
            if (!ws) return;
            let p = liesProjekt(ws.getFiles().filter((f) => !f.isFolder));
            const namen = ws.getFiles().map((f) => f.name);
            if (!p.buehne) await this.neueDatei(freierName(BUEHNEN_DATEI, namen), buehnenQuelltext(""));
            let erste: GUIFile | undefined;
            if (p.figuren.length === 0 && ws.getFiles().length <= 1) {
                const f = GSG_FIGUREN[0];
                const klasse = klassenname(f.titel);
                // Startblock „Wenn 🚩 angeklickt“ gleich dabei (ihn gibt es nur einmal im Projekt)
                const flagge = !hatFlagge(ws.getFiles().filter((d) => !d.isFolder).map((d) => d.getText()));
                erste = await this.neueDatei(klasse, figurQuelltext({ klasse, figur: f.name, x: 0, y: 0 }, flagge));
            }
            p = liesProjekt(ws.getFiles().filter((f) => !f.isFolder));
            const haupttext = hauptprogrammQuelltext(p.buehne?.info.klasse ?? "Spiel", p.figuren.map((f) => f.info.klasse));
            if (!p.haupt) await this.neueDatei(HAUPTPROGRAMM, haupttext);
            else this.schreibe(p.haupt, haupttext);
            const oeffnen = erste ?? liesProjekt(ws.getFiles()).figuren[0]?.datei ?? liesProjekt(ws.getFiles()).buehne?.datei;
            if (oeffnen) this.main.projectExplorer.setFileActive(oeffnen);
        } finally {
            this.beschaeftigt = false;
            this.neu();
        }
    }

    // —— Bibliothek ——

    /** Name erfragen; pruefen liefert eine Fehlermeldung oder undefined */
    private frage(titel: string, wert: string, pruefen: (name: string) => string | undefined): Promise<string | undefined> {
        return new Promise((fertig) => {
            const form = el("form", "gsg-bl-frage");
            const feld = el("input", "gsg-bl-feld");
            feld.value = wert;
            feld.setAttribute("aria-label", titel);
            const fehler = el("div", "gsg-bl-fehler");
            fehler.setAttribute("role", "alert");
            const ok = knopf("Umbenennen", "Neuen Namen übernehmen", "gsg-bl-knopf gsg-bl-start");
            ok.type = "submit";
            const knoepfe = el("div", "gsg-bl-knoepfe");
            const abbrechen = knopf("Abbrechen", "Nichts ändern");
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
            const schliessen = this.dialog(titel, form, () => fertig(ergebnis));
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

    private bestaetige(titel: string, text: string, ja: string): Promise<boolean> {
        return new Promise((fertig) => {
            const inhalt = el("div", "gsg-bl-frage");
            const knoepfe = el("div", "gsg-bl-knoepfe");
            const nein = knopf("Abbrechen", "Nichts ändern");
            const jaKnopf = knopf(ja, ja, "gsg-bl-knopf gsg-bl-gefahr");
            knoepfe.append(nein, jaKnopf);
            inhalt.append(el("p", undefined, text), knoepfe);
            let ergebnis = false;
            const schliessen = this.dialog(titel, inhalt, () => fertig(ergebnis));
            nein.addEventListener("click", schliessen);
            jaKnopf.addEventListener("click", () => { ergebnis = true; schliessen(); });
            setTimeout(() => nein.focus(), 0);
        });
    }

    private dialog(titel: string, inhalt: HTMLElement, beimSchliessen?: () => void): () => void {
        return dialog(titel, inhalt, beimSchliessen);
    }

    private bibliothek() {
        if (!this.darfAendern() || !this.projekt.haupt) return;
        const raster = el("div", "gsg-bl-karten");
        let schliessen = () => { };
        for (const f of GSG_FIGUREN) {
            const karte = el("button", "gsg-bl-karte");
            karte.type = "button";
            karte.append(bildchen(`${f.name}#3`, 110, 110), el("strong", undefined, f.titel), el("span", undefined, f.beschreibung));
            karte.addEventListener("click", () => {
                schliessen();
                void this.figurHinzufuegen(f.name, f.titel);
            });
            raster.append(karte);
        }
        // eigene Figuren des Projekts (Paket 18i)
        for (const f of eigeneFiguren()) {
            const huelle = el("div", "gsg-bl-kartenhuelle");
            const karte = el("button", "gsg-bl-karte gsg-bl-eigen");
            karte.type = "button";
            karte.append(bildchen(`${f.name}#0`, 110, 110), el("strong", undefined, f.titel), el("span", undefined, `eigene Figur, ${f.kostueme.length} Kostüm${f.kostueme.length === 1 ? "" : "e"}`));
            karte.addEventListener("click", () => {
                schliessen();
                void this.figurHinzufuegen(f.titel, f.titel);
            });
            const weg = knopf("🗑", `Bilder von „${f.titel}“ aus dem Projekt entfernen`, "gsg-bl-mini gsg-bl-kartenweg");
            weg.addEventListener("click", () => { schliessen(); void this.eigeneFigurWeg(f.name, f.titel); });
            huelle.append(karte, weg);
            raster.append(huelle);
        }
        const hoch = el("button", "gsg-bl-karte gsg-bl-karte-hoch");
        hoch.type = "button";
        hoch.append(el("div", "gsg-bl-hochsymbol", "＋"), el("strong", undefined, "Eigene Figur hochladen"), el("span", undefined, "eigene Bilder als Kostüme"));
        hoch.addEventListener("click", () => { schliessen(); this.eigeneFigur(); });
        raster.append(hoch);
        schliessen = this.dialog("Figur wählen", raster);
    }

    /** Paket 18i: Bilder hochladen, danach die neue Figur einsetzen */
    private eigeneFigur() {
        if (!this.darfAendern() || !this.projekt.haupt) return;
        eigeneFigurDialog(this.main, (_figur, titel) => void this.figurHinzufuegen(titel, titel));
    }

    private async eigeneFigurWeg(name: string, titel: string) {
        const benutzt = this.projekt.figuren.filter((f) => bibliotheksfigur(f.info.figur) === name).map((f) => f.info.klasse);
        const text = benutzt.length
            ? `Die Bilder von „${titel}“ entfernen? ${benutzt.join(", ")} ${benutzt.length === 1 ? "hat" : "haben"} danach kein Aussehen mehr – wähle dort im Reiter Kostüme ein anderes.`
            : `Die Bilder von „${titel}“ aus dem Projekt entfernen?`;
        if (!await this.bestaetige("Eigene Figur entfernen", text, "Entfernen")) return;
        try {
            await eigeneFigurEntfernen(this.main, name);
        } catch (e) {
            alert("Das Entfernen hat nicht geklappt: " + (e instanceof Error ? e.message : String(e ?? "")));
        }
        this.zeigeAlles();
    }

    private async figurHinzufuegen(figur: string, titel: string) {
        if (this.beschaeftigt) return;
        this.beschaeftigt = true;
        try {
            const ws = this.main.getCurrentWorkspace();
            if (!ws) return;
            const vorhanden = [...this.projekt.figuren.map((f) => f.info.klasse), ...ws.getFiles().map((f) => f.name)];
            const klasse = freierName(klassenname(titel), vorhanden);
            // wie in Scratch: irgendwo auf der Bühne
            const x = Math.round((Math.random() - 0.5) * 300), y = Math.round((Math.random() - 0.5) * 180);
            const flagge = !hatFlagge(ws.getFiles().filter((d) => !d.isFolder).map((d) => d.getText()));
            const datei = await this.neueDatei(klasse, figurQuelltext({ klasse, figur, x, y }, flagge));
            if (!datei) return;
            this.aktualisiereHauptprogramm([...this.projekt.figuren.map((f) => f.info.klasse), klasse]);
            this.main.projectExplorer.setFileActive(datei);
        } finally {
            this.beschaeftigt = false;
            this.neu();
        }
    }

    private bildWaehlen() {
        if (!this.darfAendern() || !this.projekt.buehne) return;
        const raster = el("div", "gsg-bl-karten");
        let schliessen = () => { };
        const weiss = el("button", "gsg-bl-karte");
        weiss.type = "button";
        weiss.append(el("div", "gsg-bl-weiss gsg-bl-weiss-gross"), el("strong", undefined, "ohne Bühnenbild"), el("span", undefined, "weiße Bühne"));
        weiss.addEventListener("click", () => { schliessen(); this.setzeBild(""); });
        raster.append(weiss);
        for (const b of GSG_BUEHNENBILDER) {
            const karte = el("button", "gsg-bl-karte");
            karte.type = "button";
            karte.append(bildchen(buehnenbildName(b.index), 160, 120), el("strong", undefined, b.titel));
            karte.addEventListener("click", () => { schliessen(); this.setzeBild(b.titel); });
            raster.append(karte);
        }
        schliessen = this.dialog("Bühnenbild wählen", raster);
    }

    private setzeBild(bild: string) {
        const b = this.projekt.buehne;
        if (!b || !this.darfAendern()) return;
        this.schreibe(b.datei, mitBuehnenbild(b.datei.getText(), bild));
        this.setzeVorschau(true);
        this.neu();
    }

    // —— Umbenennen und Löschen ——

    private async umbenennen(fig: Fig) {
        const ws = this.main.getCurrentWorkspace();
        if (!ws || !this.darfAendern()) return;
        const alt = fig.info.klasse;
        const andere = [...this.projekt.figuren.filter((f) => f !== fig).map((f) => f.info.klasse),
            ...ws.getFiles().filter((f) => f !== fig.datei).map((f) => f.name)];
        const neu = await this.frage(`${alt} umbenennen`, alt, (name) => namensFehler(name, andere));
        if (neu === undefined || neu === alt) return;
        this.beschaeftigt = true;
        try {
            for (const datei of ws.getFiles()) {
                if (datei.isFolder || /\.[A-Za-z]+$/.test(datei.name)) continue;
                this.schreibe(datei, umbenannt(datei.getText(), alt, neu));
            }
            if (fig.datei.name === alt) {
                fig.datei.name = neu;
                fig.datei.setSaved(false);
                const node = this.main.projectExplorer.fileTreeview.findNodeByElement(fig.datei);
                if (node) node.caption = neu;
            }
            await this.main.networkManager.sendUpdatesAsync(true);
        } finally {
            this.beschaeftigt = false;
            this.neu();
        }
    }

    /** Blöcke, die zu keiner Figur gehören, entfernen: Hauptprogramm neu schreiben bzw. fremde Datei löschen */
    private async fremdeEntfernen(datei: GUIFile) {
        const ws = this.main.getCurrentWorkspace();
        if (!ws || !this.darfAendern()) return;
        const haupt = datei === this.projekt.haupt;
        if (!await this.bestaetige(haupt ? "Blöcke entfernen" : "Datei löschen",
            haupt ? "Alle Blöcke entfernen, die im Hauptprogramm stehen? Figuren und Bühne bleiben, wie sie sind."
                : `Die Datei „${datei.name}“ mit allen ihren Blöcken löschen?`, haupt ? "Entfernen" : "Löschen")) return;
        this.beschaeftigt = true;
        try {
            // erst zu einer Figur wechseln, damit die Blockansicht die Datei nicht mehr schreibt
            this.angesehen = undefined;
            const ziel = this.projekt.figuren[0]?.datei ?? this.projekt.buehne?.datei;
            if (ziel) this.main.projectExplorer.setFileActive(ziel);
            if (haupt) {
                this.aktualisiereHauptprogramm();
            } else {
                const ok = this.main.user.is_testuser || await this.main.networkManager.sendDeleteWorkspaceOrFileAsync("file", [datei.id!]);
                if (!ok) return;
                ws.removeFile(datei);
                const node = this.main.projectExplorer.fileTreeview.findNodeByElement(datei);
                if (node) this.main.projectExplorer.fileTreeview.removeNodeAndItsFolderContents(node);
                this.main.getCompiler()?.triggerCompile();
            }
        } finally {
            this.beschaeftigt = false;
            this.neu();
        }
    }

    private async loeschen(fig: Fig) {
        const ws = this.main.getCurrentWorkspace();
        if (!ws || !this.darfAendern()) return;
        if (!await this.bestaetige("Figur löschen", `Die Figur „${fig.info.klasse}“ mit allen ihren Skripten löschen?`, "Löschen")) return;
        this.beschaeftigt = true;
        try {
            const ok = this.main.user.is_testuser || await this.main.networkManager.sendDeleteWorkspaceOrFileAsync("file", [fig.datei.id!]);
            if (!ok) return;
            ws.removeFile(fig.datei);
            const node = this.main.projectExplorer.fileTreeview.findNodeByElement(fig.datei);
            if (node) this.main.projectExplorer.fileTreeview.removeNodeAndItsFolderContents(node);
            this.projekt.figuren = this.projekt.figuren.filter((f) => f !== fig);
            this.aktualisiereHauptprogramm();
            const naechste = this.projekt.figuren[0]?.datei ?? this.projekt.buehne?.datei;
            if (naechste) this.main.projectExplorer.setFileActive(naechste);
            this.main.getCompiler()?.triggerCompile();
        } finally {
            this.beschaeftigt = false;
            this.neu();
        }
    }
}
