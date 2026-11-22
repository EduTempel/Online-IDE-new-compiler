import * as monaco from "monaco-editor";
import type { Main } from "../main/Main";
import type { GUIFile } from "../workspace/File";
import {
    aendereArt, aendereEintrag, aendereKlasse, baueTyp, benenneTypenUm, brauchtAbiturklassen, emptyDoc, entferneBeziehung, entferneEintrag,
    entferneKlasse, findeEintrag, GRUNDTYPEN, istAttribut, klasseVon, namenProblem, neueBeziehung, neueKlasse, neuerEintrag, parseDoc,
    probleme, serializeDoc, tauscheRichtung, typText, verschiebeEintrag, zerlegeTyp,
    type Beziehung, type Form, type KlassenDoc, type NeuerEintrag, type Operation, type Parameter, type Sicht,
} from "./KlassenDoc";
import { docAusKlassen, docZuJava, klassenAusJava } from "./KlassenJava";
import { renderSvg, STIL, type Measure } from "./KlassenSvg";
import { createFile, ensureLibraries, findFile, replaceText } from "../structogram/ProjectFiles";
import { Constants } from "../Constants";
import { openHandbook } from "../handbook/Handbook";
import "/assets/css/gsg-structogram.css";
import "/assets/css/gsg-klassendiagramm.css";

/**
 * Editor für Klassendiagramm-Dateien (*.klassendiagramm, Paket 20). Schreibweise der Ergänzenden Hinweise;
 * Klassen mit der Maus verschieben, Klasse oder Eintrag anklicken und in der Leiste bearbeiten, Beziehungen
 * per Knopf und Klick auf die zweite Klasse. Der Inhalt steht als JSON im Text der Datei; Rückgängig und
 * Wiederholen nutzen den Verlauf der Datei (wie beim Struktogramm-Editor).
 */

type Auswahl = { art: "klasse" | "eintrag" | "beziehung"; id: string } | undefined;
type Ziehen = { id: string; sx: number; sy: number; x: number; y: number; bewegt: boolean; doc: KlassenDoc } | undefined;

export class KlassenEditor {

    private file?: GUIFile;
    private model?: monaco.editor.ITextModel;
    private listener?: monaco.IDisposable;
    private doc: KlassenDoc = emptyDoc();
    private lastText = "";
    private auswahl: Auswahl;
    private verbinden?: { art: Beziehung["art"]; von: string };
    private ziehen: Ziehen;
    /** worauf beim Drücken der Maustaste gezeigt wurde (beim Loslassen ist das Ziel wegen setPointerCapture die Fläche) */
    private gedrueckt: Auswahl;
    /** letztes Loslassen (für den Doppelklick: die Fläche wird nach dem ersten Klick neu gezeichnet, darum kein dblclick) */
    private letzterKlick?: { t: number; x: number; y: number; id?: string };
    private zoom = 1;
    private readOnly = false;
    private meldung = "";
    /** Name der Klasse beim Beginn des Umbenennens (Typen werden beim Verlassen des Felds angepasst) */
    private alterName?: { id: string; name: string };

    private canvas: HTMLDivElement;
    private editRow: HTMLDivElement;
    private buttons = new Map<string, HTMLButtonElement>();
    private measureCtx = document.createElement("canvas").getContext("2d")!;

    constructor(private main: Main, private host: HTMLElement) {
        host.innerHTML = "";
        host.classList.add("gsg-sedit", "gsg-kd");
        host.tabIndex = -1;

        const bar = this.div("gsg-struct-bar");
        const title = document.createElement("span");
        title.className = "gsg-struct-title";
        title.innerHTML = `Klassendiagramm <span class="gsg-struct-sub">bearbeiten</span>`;
        bar.append(title,
            this.button("java", "⇢ In Code umwandeln", "Für jede Klasse eine Code-Datei anlegen bzw. ersetzen", () => this.zuJava()),
            this.button("code", "⇠ Aus dem Code", "Klassen aus den Code-Dateien des Projekts übernehmen", () => this.ausCode()),
            this.button("typen", "Typen: Abitur", "Datentypen in Abitur-Sprache (Ganzzahl, Zeichenkette …) oder als Java (int, String …) zeigen", () => this.typenUmschalten()),
            this.button("svg", "⤓ SVG", "Als Vektorbild speichern", () => this.speichern("svg")),
            this.button("png", "⤓ PNG", "Als Bild speichern", () => this.speichern("png")),
            this.button("print", "⎙ Drucken", "Klassendiagramm drucken", () => this.drucken()),
            this.button("help", "? Hilfe", "Handbuch: Klassendiagramme", () => openHandbook({ kind: "klassendiagramm" })));

        const tools = this.div("gsg-sedit-insert");
        const sep = () => { const s = document.createElement("span"); s.className = "gsg-sedit-sep"; return s; };
        const label = document.createElement("span");
        label.className = "gsg-sedit-label";
        label.textContent = "Neu:";
        tools.append(label,
            this.button("klasse", "Klasse", "neue Klasse (oder Doppelklick auf eine freie Stelle)", () => this.neueKlasse()),
            this.button("attribut", "Attribut", "neues Attribut in der ausgewählten Klasse", () => this.neu("attribut")),
            this.button("konstruktor", "Konstruktor", "neuer Konstruktor (c …) in der ausgewählten Klasse", () => this.neu("konstruktor")),
            this.button("operation", "Operation", "neue Operation in der ausgewählten Klasse", () => this.neu("operation")),
            sep(),
            this.button("assoziation", "— Assoziation", "ausgewählte Klasse mit einer anderen verbinden: danach die andere Klasse anklicken", () => this.starteVerbinden("assoziation")),
            this.button("vererbung", "△ Vererbung", "ausgewählte Klasse erbt von …: danach die Oberklasse anklicken", () => this.starteVerbinden("vererbung")),
            sep(),
            this.button("up", "↑", "Eintrag nach oben (Alt+↑)", () => this.verschieben(-1)),
            this.button("down", "↓", "Eintrag nach unten (Alt+↓)", () => this.verschieben(1)),
            this.button("delete", "🗑", "Auswahl löschen (Entf)", () => this.loeschen()),
            sep(),
            this.button("undo", "↶", "rückgängig (Strg+Z)", () => this.model?.undo()),
            this.button("redo", "↷", "wiederholen (Strg+Y)", () => this.model?.redo()),
            sep(),
            this.button("zoom-", "−", "verkleinern", () => this.setZoom(this.zoom - 0.1)),
            this.button("zoom0", "100 %", "Originalgröße", () => this.setZoom(1)),
            this.button("zoom+", "+", "vergrößern", () => this.setZoom(this.zoom + 0.1)));

        this.editRow = this.div("gsg-sedit-edit gsg-kd-edit");
        this.canvas = this.div("gsg-struct-content gsg-sedit-canvas gsg-kd-canvas");
        this.canvas.addEventListener("pointerdown", (e) => this.onPointerDown(e));
        this.canvas.addEventListener("pointermove", (e) => this.onPointerMove(e));
        this.canvas.addEventListener("pointerup", (e) => this.onPointerUp(e));
        host.addEventListener("keydown", (e) => this.onKey(e));
        host.append(bar, tools, this.editRow, this.canvas);
    }

    private div(cls: string): HTMLDivElement {
        const d = document.createElement("div");
        d.className = cls;
        return d;
    }

    private button(key: string, text: string, tip: string, action: () => void): HTMLButtonElement {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = text;
        b.title = tip;
        b.addEventListener("mousedown", (e) => e.preventDefault());   // Fokus behalten
        b.addEventListener("click", action);
        if (key) this.buttons.set(key, b);
        return b;
    }

    // ------------------------------------------------------------------ Datei

    /** Umwandeln in Texva: nicht in Blöckly; in Blöckva und Struktogramme nur mit Texva-Freigabe (Lehrkräfte immer) */
    private javaErlaubt(): boolean {
        if (Constants.isBloecklyApp) return false;
        const u = this.main.user as { is_teacher?: boolean; is_admin?: boolean; is_schooladmin?: boolean; gsgFreigaben?: { java?: boolean; bloeckeJava?: boolean } } | undefined;
        if (!u || u.is_teacher || u.is_admin || u.is_schooladmin) return true;
        if (Constants.isStructogramApp || Constants.isKlassendiagrammApp) return !!u.gsgFreigaben?.java;
        if (Constants.isBlocksApp) return !!u.gsgFreigaben?.bloeckeJava;
        return true;
    }

    show(file: GUIFile, readOnly: boolean) {
        this.readOnly = readOnly;
        this.buttons.get("java")!.hidden = !this.javaErlaubt();
        this.buttons.get("code")!.hidden = readOnly || Constants.isBloecklyApp;
        if (this.file !== file) {
            this.listener?.dispose();
            this.file = file;
            this.model = file.getMonacoModel();
            this.auswahl = undefined;
            this.verbinden = undefined;
            this.listener = this.model?.onDidChangeContent(() => this.onModelChanged());
        }
        this.host.classList.toggle("readonly", readOnly);
        this.laden();
    }

    hide() {
        this.listener?.dispose();
        this.listener = undefined;
        this.file = undefined;
        this.model = undefined;
        this.ziehen = undefined;
    }

    private laden() {
        if (!this.model || this.model.isDisposed()) return;
        this.lastText = this.model.getValue(monaco.editor.EndOfLinePreference.LF);
        const doc = parseDoc(this.lastText);
        this.meldung = doc.fehler ?? "";
        this.doc = doc;
        if (!this.gueltig(this.auswahl)) this.auswahl = undefined;
        this.zeichnen();
        this.leiste();
    }

    private gueltig(a: Auswahl): boolean {
        if (!a) return true;
        if (a.art === "klasse") return !!klasseVon(this.doc, a.id);
        if (a.art === "eintrag") return !!findeEintrag(this.doc, a.id);
        return this.doc.beziehungen.some((b) => b.id === a.id);
    }

    private onModelChanged() {
        if (!this.model) return;
        const text = this.model.getValue(monaco.editor.EndOfLinePreference.LF);
        if (text !== this.lastText) this.laden();   // Rückgängig, Korrektur der Lehrkraft …
    }

    /** neuen Stand speichern (merge: Tippen in einem Feld zählt als ein Rückgängig-Schritt); leiste: Formular neu aufbauen */
    private apply(doc: KlassenDoc, merge = false, leiste = !merge) {
        if (this.readOnly || !this.model || this.model.isDisposed()) return;
        this.doc = doc;
        const text = serializeDoc(doc);
        this.lastText = text;
        if (!merge) this.model.pushStackElement();
        this.model.pushEditOperations([], [{ range: this.model.getFullModelRange(), text }], () => null);
        if (!merge) this.model.pushStackElement();
        this.zeichnen();
        if (leiste) this.leiste();
        else this.hinweis();
    }

    // ------------------------------------------------------------------ Darstellung

    private measure: Measure = (text, bold) => {
        this.measureCtx.font = `${bold ? "bold " : ""}${STIL.font}px Arial, Helvetica, sans-serif`;
        return this.measureCtx.measureText(text).width;
    };

    private zeichnen(doc = this.doc) {
        const { svg, width, height } = renderSvg(doc, this.measure, {
            interaktiv: !this.readOnly,
            ausgewaehlt: this.auswahl?.id,
            verbinden: !!this.verbinden,
        });
        this.canvas.innerHTML = svg;
        const el = this.canvas.querySelector("svg");
        if (el) {
            el.setAttribute("width", String(Math.round(width * this.zoom)));
            el.setAttribute("height", String(Math.round(height * this.zoom)));
        }
        this.canvas.classList.toggle("gsg-kd-verbinden", !!this.verbinden);
        if (!doc.klassen.length) {
            const leer = this.div("gsg-kd-leer");
            leer.innerHTML = this.meldung
                ? `<b>${this.meldung}</b>`
                : `Noch keine Klasse. Lege mit <b>Neu: Klasse</b> (oder Doppelklick) eine an`
                + (this.readOnly || Constants.isBloecklyApp ? "." : " – oder übernimm die Klassen aus dem Code:");
            if (!this.readOnly && !this.meldung && !Constants.isBloecklyApp) {
                leer.append(document.createElement("br"), this.button("", "⇠ Aus dem Code übernehmen", "Klassen aus den Code-Dateien des Projekts", () => this.ausCode()));
            }
            this.canvas.append(leer);
        }
        this.buttons.get("typen")!.textContent = doc.typen === "java" ? "Typen: Java" : "Typen: Abitur";
    }

    private ausgewaehlteKlasse(): string | undefined {
        const a = this.auswahl;
        if (a?.art === "klasse") return a.id;
        if (a?.art === "eintrag") return findeEintrag(this.doc, a.id)?.klasse.id;
        return undefined;
    }

    // ------------------------------------------------------------------ Formular (zweite Leiste)

    private label(text: string): HTMLSpanElement {
        const s = document.createElement("span");
        s.className = "gsg-sedit-label";
        s.textContent = text;
        return s;
    }

    private input(value: string, size: number, onInput: (v: string) => void, placeholder = ""): HTMLInputElement {
        const inp = document.createElement("input");
        inp.type = "text";
        inp.spellcheck = false;
        inp.value = value;
        inp.size = size;
        inp.placeholder = placeholder;
        inp.addEventListener("focus", () => this.model?.pushStackElement());
        inp.addEventListener("blur", () => this.model?.pushStackElement());
        inp.addEventListener("input", () => onInput(inp.value));
        inp.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === "Escape") {
                e.preventDefault();
                inp.blur();
                this.host.focus();
            }
        });
        return inp;
    }

    private select<T extends string>(optionen: [T, string][], wert: T, onChange: (v: T) => void, tip = ""): HTMLSelectElement {
        const s = document.createElement("select");
        s.title = tip;
        for (const [v, text] of optionen) {
            const o = document.createElement("option");
            o.value = v;
            o.textContent = text;
            s.append(o);
        }
        s.value = wert;
        s.addEventListener("change", () => onChange(s.value as T));
        return s;
    }

    private sichtAuswahl(wert: Sicht, onChange: (v: Sicht) => void): HTMLSelectElement {
        return this.select<Sicht>([["-", "- privat"], ["+", "+ öffentlich"]], wert, onChange, "Sichtbarkeit");
    }

    /** Datentyp wählen: Form (einfach, Reihungen, Liste, Stapel, Schlange, Binärbaum) und Inhaltstyp (Grundtypen, Klassen des Diagramms) */
    private typAuswahl(typ: string, onChange: (t: string) => void, keiner = false): HTMLSpanElement {
        const span = document.createElement("span");
        span.className = "gsg-kd-typ";
        const t = this.doc.typen;
        const { form, inhalt } = zerlegeTyp(typ);
        const formen: [Form | "keine", string][] = [
            ...(keiner ? [["keine", "keine Rückgabe"] as [Form | "keine", string]] : []),
            ["einfach", "einfach"],
            ["stat", t === "java" ? "…[]" : "stat. Reihung von"],
            ["stat2", t === "java" ? "…[][]" : "zweidim. stat. Reihung von"],
            ["dyn", t === "java" ? "DynArray" : "dyn. Reihung von"],
            ["liste", t === "java" ? "Liste<…>" : "Liste von"],
            ["stapel", t === "java" ? "Stack" : "Stapel von"],
            ["schlange", t === "java" ? "Queue" : "Schlange von"],
            ["baum", t === "java" ? "BinTree" : "Binärbaum von"],
        ];
        const aktuelleForm: Form | "keine" = keiner && !typ ? "keine" : form;
        const inhalte = [...GRUNDTYPEN as readonly string[], ...this.doc.klassen.map((k) => k.name).filter((n) => n && !namenProblem(n, ""))];
        const aktuellerInhalt = inhalt || "int";
        if (!inhalte.includes(aktuellerInhalt)) inhalte.push(aktuellerInhalt);
        const inhaltSel = this.select(inhalte.map((n) => [n, typText(n, t)] as [string, string]), aktuellerInhalt, (v) => onChange(baueTyp(formSel.value as Form, v)), "Datentyp bzw. Inhaltstyp");
        const formSel = this.select(formen, aktuelleForm, (v) => {
            if (v === "keine") onChange("");
            else onChange(baueTyp(v, inhaltSel.value));
            inhaltSel.hidden = v === "keine";
        }, "einfacher Datentyp, Reihung, Liste, Stapel, Schlange oder Binärbaum");
        inhaltSel.hidden = aktuelleForm === "keine";
        span.append(formSel, inhaltSel);
        return span;
    }

    private hinweisFeld?: HTMLSpanElement;

    /** zweite Leiste: Formular zur Auswahl */
    private leiste() {
        const row = this.editRow;
        row.innerHTML = "";
        const a = this.auswahl;
        const klasseId = this.ausgewaehlteKlasse();
        for (const k of ["attribut", "konstruktor", "operation", "assoziation", "vererbung"]) this.buttons.get(k)!.disabled = this.readOnly || !klasseId;
        const eintrag = a?.art === "eintrag" ? findeEintrag(this.doc, a.id) : undefined;
        this.buttons.get("up")!.disabled = this.buttons.get("down")!.disabled = this.readOnly || !eintrag;
        this.buttons.get("delete")!.disabled = this.readOnly || !a;
        this.buttons.get("klasse")!.disabled = this.readOnly;

        if (this.verbinden) {
            const von = klasseVon(this.doc, this.verbinden.von)?.name ?? "";
            row.append(this.label(this.verbinden.art === "vererbung" ? "Vererbung:" : "Assoziation:"),
                document.createTextNode(this.verbinden.art === "vererbung"
                    ? `Klicke die Oberklasse an, von der „${von}“ erbt.`
                    : `Klicke die Klasse an, mit der „${von}“ verbunden werden soll.`),
                this.button("", "Abbrechen (Esc)", "nicht verbinden", () => this.abbrechen()));
        } else if (a?.art === "klasse") {
            const k = klasseVon(this.doc, a.id)!;
            const name = this.input(k.name, Math.max(12, k.name.length + 2), (v) => this.apply(aendereKlasse(this.doc, k.id, { name: v }), true));
            name.addEventListener("focus", () => { this.alterName = { id: k.id, name: klasseVon(this.doc, k.id)?.name ?? "" }; });
            name.addEventListener("blur", () => this.umbenennenAbschliessen());
            row.append(this.label("Klasse:"), name,
                this.haken("... weitere Attribute", !!k.mehrAttribute, (v) => this.apply(aendereKlasse(this.doc, k.id, { mehrAttribute: v || undefined }))),
                this.haken("... weitere Operationen", !!k.mehrOperationen, (v) => this.apply(aendereKlasse(this.doc, k.id, { mehrOperationen: v || undefined }))));
        } else if (eintrag && istAttribut(eintrag.eintrag)) {
            const e = eintrag.eintrag;
            row.append(this.label("Attribut:"),
                this.sichtAuswahl(e.sicht, (v) => this.apply(aendereEintrag(this.doc, e.id, { sicht: v }), false, false)),
                this.input(e.name, Math.max(10, e.name.length + 2), (v) => this.apply(aendereEintrag(this.doc, e.id, { name: v }), true), "Name"),
                this.label(":"),
                this.typAuswahl(e.typ, (t) => this.apply(aendereEintrag(this.doc, e.id, { typ: t }), false, false)));
        } else if (eintrag) {
            this.operationFormular(eintrag.eintrag as Operation, eintrag.klasse.name);
        } else if (a?.art === "beziehung") {
            const b = this.doc.beziehungen.find((x) => x.id === a.id)!;
            const von = klasseVon(this.doc, b.von)?.name, nach = klasseVon(this.doc, b.nach)?.name;
            row.append(this.label("Beziehung:"),
                this.select<Beziehung["art"]>([["assoziation", "Assoziation (Linie)"], ["vererbung", "Vererbung (Pfeil)"]], b.art, (v) => this.versuche(aendereArt(this.doc, b.id, v))),
                document.createTextNode(b.art === "vererbung" ? `„${von}“ erbt von „${nach}“` : `„${von}“ – „${nach}“`),
                this.button("", "⇄ Richtung tauschen", "Ober- und Unterklasse tauschen", () => this.versuche(tauscheRichtung(this.doc, b.id))));
        } else {
            row.append(document.createTextNode(this.readOnly ? "" : "Klasse, Eintrag oder Linie anklicken. Klassen lassen sich mit der Maus verschieben."));
        }
        this.hinweisFeld = document.createElement("span");
        this.hinweisFeld.className = "gsg-sedit-hint";
        row.append(this.hinweisFeld);
        this.hinweis();
    }

    private haken(text: string, wert: boolean, onChange: (v: boolean) => void): HTMLLabelElement {
        const l = document.createElement("label");
        l.className = "gsg-kd-haken";
        const c = document.createElement("input");
        c.type = "checkbox";
        c.checked = wert;
        c.addEventListener("change", () => onChange(c.checked));
        l.append(c, document.createTextNode(" " + text));
        return l;
    }

    private operationFormular(o: Operation, klassenname: string) {
        const row = this.editRow;
        const setze = (aenderung: Partial<Operation>, merge = false) => this.apply(aendereEintrag(this.doc, o.id, aenderung), merge, false);
        const params = () => (findeEintrag(this.doc, o.id)?.eintrag as Operation | undefined)?.parameter ?? [];
        const setzeParam = (i: number, p: Partial<Parameter>, merge = false) => setze({ parameter: params().map((x, j) => j === i ? { ...x, ...p } : x) }, merge);
        if (o.konstruktor) {
            row.append(this.label("Konstruktor:"), this.sichtAuswahl(o.sicht, (v) => setze({ sicht: v })), document.createTextNode(`c ${klassenname}(`));
        } else {
            row.append(this.label("Operation:"), this.sichtAuswahl(o.sicht, (v) => setze({ sicht: v })),
                this.input(o.name, Math.max(10, o.name.length + 2), (v) => setze({ name: v }, true), "Name"), document.createTextNode("("));
        }
        o.parameter.forEach((p, i) => {
            const box = document.createElement("span");
            box.className = "gsg-kd-param";
            box.append(this.input(p.name, Math.max(6, p.name.length + 1), (v) => setzeParam(i, { name: v }, true), "Name"), document.createTextNode(":"),
                this.typAuswahl(p.typ, (t) => setzeParam(i, { typ: t })),
                this.button("", "×", "Parameter entfernen", () => this.apply(aendereEintrag(this.doc, o.id, { parameter: params().filter((_, j) => j !== i) }))));
            row.append(box);
        });
        row.append(this.button("", "+ Parameter", "Parameter hinzufügen", () => {
            const namen = new Set(params().map((p) => p.name));
            let name = "p";
            for (let i = 2; namen.has(name); i++) name = "p" + i;
            this.apply(aendereEintrag(this.doc, o.id, { parameter: [...params(), { name, typ: "int" }] }));
        }), document.createTextNode(")"));
        if (!o.konstruktor) row.append(this.label(":"), this.typAuswahl(o.rueckgabe, (t) => setze({ rueckgabe: t }), true));
    }

    /** Hinweis zu Namen (ohne das Formular neu aufzubauen – sonst ginge beim Tippen der Fokus verloren) */
    private hinweis() {
        if (!this.hinweisFeld) return;
        const a = this.auswahl;
        let text = "";
        if (a?.art === "klasse") {
            const k = klasseVon(this.doc, a.id);
            if (k) text = namenProblem(k.name, "Die Klasse") ?? (this.doc.klassen.filter((x) => x.name === k.name).length > 1 ? `Die Klasse „${k.name}“ gibt es mehrfach.` : "");
        } else if (a?.art === "eintrag") {
            const f = findeEintrag(this.doc, a.id);
            if (f) {
                const e = f.eintrag;
                text = (istAttribut(e) || !e.konstruktor ? namenProblem(e.name, istAttribut(e) ? "Das Attribut" : "Die Operation") : undefined)
                    ?? (istAttribut(e) ? undefined : e.parameter.map((p) => namenProblem(p.name, "Ein Parameter")).find(Boolean)) ?? "";
            }
        }
        this.hinweisFeld.textContent = text;
    }

    private umbenennenAbschliessen() {
        const alt = this.alterName;
        this.alterName = undefined;
        const k = alt && klasseVon(this.doc, alt.id);
        if (!alt || !k || k.name === alt.name) return;
        const neu = benenneTypenUm(this.doc, alt.name, k.name);
        if (neu !== this.doc) this.apply(neu, true);
    }

    // ------------------------------------------------------------------ Bedienung

    private ziel(e: Event): Auswahl {
        const el = e.target as Element;
        const eintrag = el.closest("[data-e]")?.getAttribute("data-e");
        if (eintrag) return { art: "eintrag", id: eintrag };
        const klasse = el.closest("[data-k]")?.getAttribute("data-k");
        if (klasse) return { art: "klasse", id: klasse };
        const bez = el.closest("[data-b]")?.getAttribute("data-b");
        if (bez) return { art: "beziehung", id: bez };
        return undefined;
    }

    private onPointerDown(e: PointerEvent) {
        if (e.button !== 0 || this.readOnly) return;
        this.gedrueckt = this.ziel(e);
        const klasse = (e.target as Element).closest("[data-k]")?.getAttribute("data-k");
        const k = klasse ? klasseVon(this.doc, klasse) : undefined;
        if (k && !this.verbinden) {
            this.ziehen = { id: k.id, sx: e.clientX, sy: e.clientY, x: k.x, y: k.y, bewegt: false, doc: this.doc };
            this.canvas.setPointerCapture(e.pointerId);
        }
    }

    private onPointerMove(e: PointerEvent) {
        const z = this.ziehen;
        if (!z) return;
        const dx = (e.clientX - z.sx) / this.zoom, dy = (e.clientY - z.sy) / this.zoom;
        if (!z.bewegt && Math.hypot(dx, dy) < 4) return;
        z.bewegt = true;
        const raster = (v: number) => Math.max(0, Math.round(v / 5) * 5);
        z.doc = aendereKlasse(this.doc, z.id, { x: raster(z.x + dx), y: raster(z.y + dy) });
        this.zeichnen(z.doc);
    }

    private onPointerUp(e: PointerEvent) {
        const z = this.ziehen;
        this.ziehen = undefined;
        if (z?.bewegt) {
            this.auswahl = { art: "klasse", id: z.id };
            this.apply(z.doc);
            return;
        }
        if (e.button !== 0 || this.readOnly) return;
        const ziel = this.gedrueckt;
        this.gedrueckt = undefined;
        if (this.verbinden) {
            if (ziel?.art === "klasse" || ziel?.art === "eintrag") {
                const nach = ziel.art === "klasse" ? ziel.id : findeEintrag(this.doc, ziel.id)!.klasse.id;
                const r = neueBeziehung(this.doc, this.verbinden.art, this.verbinden.von, nach);
                this.verbinden = undefined;
                if ("fehler" in r) {
                    this.zeichnen();
                    this.leiste();
                    this.zeigeFehler(r.fehler);
                    return;
                }
                this.auswahl = { art: "beziehung", id: r.id };
                this.apply(r.doc);
            } else {
                this.abbrechen();
            }
            return;
        }
        const vorher = this.letzterKlick;
        this.letzterKlick = { t: e.timeStamp, x: e.clientX, y: e.clientY, id: ziel?.id };
        if (vorher && e.timeStamp - vorher.t < 450 && Math.hypot(e.clientX - vorher.x, e.clientY - vorher.y) < 6 && vorher.id === ziel?.id) {
            this.letzterKlick = undefined;
            this.doppelklick(e, ziel);
            return;
        }
        const geaendert = this.auswahl?.id !== ziel?.id;
        this.auswahl = ziel;
        if (geaendert) {
            this.zeichnen();
            this.leiste();
        }
        this.host.focus();
    }

    private doppelklick(e: MouseEvent, ziel: Auswahl) {
        if (ziel) {
            // Doppelklick auf Klasse oder Eintrag: Namen bearbeiten
            this.editRow.querySelector<HTMLInputElement>("input[type=text]")?.focus();
            return;
        }
        const svg = this.canvas.querySelector("svg")?.getBoundingClientRect();
        if (!svg) return;
        this.neueKlasse((e.clientX - svg.left) / this.zoom - 40, (e.clientY - svg.top) / this.zoom - 15);
    }

    private onKey(e: KeyboardEvent) {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === "INPUT" || tag === "SELECT") return;
        const ctrl = e.ctrlKey || e.metaKey;
        if (ctrl && e.key.toLowerCase() === "z") this.model?.undo();
        else if (ctrl && e.key.toLowerCase() === "y") this.model?.redo();
        else if (e.key === "Delete") this.loeschen();
        else if (e.key === "Escape") this.abbrechen();
        else if (e.altKey && e.key === "ArrowUp") this.verschieben(-1);
        else if (e.altKey && e.key === "ArrowDown") this.verschieben(1);
        else if (e.key === "Enter" || e.key === "F2") this.editRow.querySelector<HTMLInputElement>("input[type=text]")?.focus();
        else return;
        e.preventDefault();
        e.stopPropagation();
    }

    private abbrechen() {
        if (this.verbinden) this.verbinden = undefined;
        else this.auswahl = undefined;
        this.zeichnen();
        this.leiste();
    }

    private zeigeFehler(text: string) {
        if (this.hinweisFeld) this.hinweisFeld.textContent = text;
    }

    /** Ergebnis einer Änderung übernehmen oder den Grund zeigen */
    private versuche(r: KlassenDoc | { fehler: string }) {
        if ("fehler" in r) {
            this.leiste();
            this.zeigeFehler(r.fehler);
        } else {
            this.apply(r);
        }
    }

    private neueKlasse(x?: number, y?: number) {
        if (this.readOnly) return;
        if (x === undefined || y === undefined) {
            // rechts neben die letzte Klasse bzw. oben links
            const { boxes } = renderSvg(this.doc, this.measure);
            const rechts = [...boxes.values()].reduce((m, b) => Math.max(m, b.x + b.w), 0);
            x = rechts ? rechts + 60 : STIL.abstand;
            y = STIL.abstand;
        }
        const r = neueKlasse(this.doc, x, y);
        this.auswahl = { art: "klasse", id: r.id };
        this.apply(r.doc);
        const inp = this.editRow.querySelector<HTMLInputElement>("input[type=text]");
        inp?.focus();
        inp?.select();
    }

    private neu(art: NeuerEintrag) {
        const klasse = this.ausgewaehlteKlasse();
        if (!klasse || this.readOnly) return;
        const nach = this.auswahl?.art === "eintrag" ? this.auswahl.id : undefined;
        const passt = nach && findeEintrag(this.doc, nach)?.eintrag;
        const gleichesFeld = passt && (art === "attribut") === istAttribut(passt);
        const r = neuerEintrag(this.doc, klasse, art, gleichesFeld ? nach : undefined);
        this.auswahl = { art: "eintrag", id: r.id };
        this.apply(r.doc);
        if (art !== "konstruktor") {
            const inp = this.editRow.querySelector<HTMLInputElement>("input[type=text]");
            inp?.focus();
            inp?.select();
        }
    }

    private starteVerbinden(art: Beziehung["art"]) {
        const von = this.ausgewaehlteKlasse();
        if (!von || this.readOnly) return;
        this.verbinden = { art, von };
        this.zeichnen();
        this.leiste();
        this.host.focus();
    }

    private verschieben(delta: -1 | 1) {
        if (this.auswahl?.art === "eintrag") this.apply(verschiebeEintrag(this.doc, this.auswahl.id, delta));
    }

    private loeschen() {
        const a = this.auswahl;
        if (!a || this.readOnly) return;
        if (a.art === "klasse") {
            const k = klasseVon(this.doc, a.id);
            if (k && (k.attribute.length || k.operationen.length) && !confirm(`Die Klasse „${k.name}“ mit allen Einträgen löschen?`)) return;
            this.auswahl = undefined;
            this.apply(entferneKlasse(this.doc, a.id));
        } else if (a.art === "eintrag") {
            const f = findeEintrag(this.doc, a.id);
            this.auswahl = f ? { art: "klasse", id: f.klasse.id } : undefined;
            this.apply(entferneEintrag(this.doc, a.id));
        } else {
            this.auswahl = undefined;
            this.apply(entferneBeziehung(this.doc, a.id));
        }
    }

    private setZoom(z: number) {
        this.zoom = Math.min(2, Math.max(0.5, Math.round(z * 10) / 10));
        this.buttons.get("zoom0")!.textContent = Math.round(this.zoom * 100) + " %";
        this.zeichnen();
    }

    private typenUmschalten() {
        const typen = this.doc.typen === "java" ? "abitur" : "java";
        if (this.readOnly) {
            // nur ansehen: umschalten, ohne die Datei zu ändern
            this.doc = { ...this.doc, typen };
            this.zeichnen();
            return;
        }
        this.apply({ ...this.doc, typen });
    }

    // ------------------------------------------------------------------ Texva

    private baseName(): string {
        return (this.file?.name ?? "klassendiagramm").replace(/\.klassendiagramm$/i, "");
    }

    private ausCode() {
        if (this.readOnly) return;
        const texte = (this.main.getCurrentWorkspace()?.getFiles() ?? []).filter((f) => !f.isFolder && /\.java$/i.test(f.name)).map((f) => f.getText());
        const klassen = klassenAusJava(texte);
        if (!klassen.length) {
            alert("Im Projekt gibt es noch keine Code-Datei mit einer Klasse.");
            return;
        }
        if (this.doc.klassen.length && !confirm(`Das Diagramm durch die ${klassen.length} Klasse(n) aus dem Code ersetzen? (Rückgängig mit Strg+Z)`)) return;
        this.auswahl = undefined;
        this.apply(docAusKlassen(klassen, this.measure, this.doc.typen));
    }

    private async zuJava() {
        if (!this.file) return;
        if (!this.doc.klassen.length) {
            alert("Das Diagramm hat noch keine Klasse.");
            return;
        }
        const fehler = probleme(this.doc);
        if (fehler.length) {
            alert("Bitte zuerst korrigieren:\n\n• " + fehler.slice(0, 8).join("\n• ") + (fehler.length > 8 ? "\n• …" : ""));
            return;
        }
        const folder = this.file.parent_folder_id ?? null;
        const dateien = docZuJava(this.doc, this.file.name);
        const vorhanden = dateien.filter((d) => findFile(this.main, d.name, folder));
        let ersetzen = false;
        if (vorhanden.length) {
            ersetzen = confirm(`Diese Datei(en) gibt es schon: ${vorhanden.map((d) => d.name).join(", ")}.\n\n`
                + "OK: durch den Code aus dem Klassendiagramm ersetzen (der bisherige Inhalt geht verloren).\n"
                + "Abbrechen: vorhandene Dateien behalten, nur die neuen anlegen.");
        }
        if (brauchtAbiturklassen(this.doc)) ensureLibraries(this.main, ["niedersachsen"]);
        for (const d of dateien) {
            const alt = findFile(this.main, d.name, folder);
            if (alt) {
                if (ersetzen) replaceText(this.main, alt, d.code);
            } else {
                await createFile(this.main, d.name, d.code, folder);
            }
        }
    }

    // ------------------------------------------------------------------ Bild, Druck

    private bild(): { svg: string; width: number; height: number } {
        return renderSvg(this.doc, this.measure);
    }

    private download(blob: Blob, name: string) {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = name;
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }

    private speichern(art: "svg" | "png") {
        const { svg, width, height } = this.bild();
        if (art === "svg") {
            this.download(new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${svg}`], { type: "image/svg+xml" }), this.baseName() + ".svg");
            return;
        }
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = width * 2;
            canvas.height = height * 2;
            const ctx = canvas.getContext("2d")!;
            ctx.scale(2, 2);
            ctx.drawImage(img, 0, 0);
            canvas.toBlob((b) => { if (b) this.download(b, this.baseName() + ".png"); }, "image/png");
        };
        img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    }

    private drucken() {
        const { svg } = this.bild();
        const frame = document.createElement("iframe");
        frame.style.cssText = "position:fixed;width:0;height:0;border:0;right:0;bottom:0";
        document.body.append(frame);
        const doc = frame.contentDocument!;
        doc.open();
        doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${this.baseName()}</title>`
            + `<style>@page{margin:12mm}body{margin:0}svg{max-width:100%;height:auto}</style></head><body>${svg}</body></html>`);
        doc.close();
        setTimeout(() => {
            frame.contentWindow?.focus();
            frame.contentWindow?.print();
            setTimeout(() => frame.remove(), 1000);
        }, 100);
    }
}
