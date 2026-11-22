import { Constants } from "../../Constants";
import { openHandbook } from "../../handbook/Handbook";
import { taskOf } from "../../task/TaskTab";
import { neuesProjekt, zeigeProjekte } from "../../bloeckly/BloecklyProjekte";
import type { Main } from "../Main";
import type { MainMenu } from "./MainMenu";
import "/assets/css/gsg-modern.css";
import "/assets/css/gsg-modern-texva.css";
import { DATEI_GEWECHSELT, zeigeDateiart } from "./Dateiart";

/**
 * Aussehen „Modern“ neben dem bisherigen Aussehen („Retro“). Modern ist Standard.
 *
 *  - Blöckly (Jg. 9/10): Entwurf F „Bühne vorn“ (html.gsg-modern-f): Kopfleiste mit „Meine Projekte“
 *    (BloecklyProjekte.ts), keine Dateiliste, große Bühne rechts.
 *  - Texva, Blöckva, Struktogramme (Jg. 11+): Entwurf A „Klar“ (hell) bzw. B „Nacht“ (dunkel) (html.gsg-modern-a):
 *    Kopfleiste mit Pfad (Projekt / Datei), Blöcke │ Texva, Start, Einzelschritt, Stopp und Tempo; links eine schmale
 *    Leiste (Dateien, Ausgabe, Aufgabe, Handbuch, Einstellungen), Editor, Meldungen, Ausgabe und Aufgabe als Karten.
 *  - Gemeinsam: Hilfe, „Menü“ (die bisherige Menüleiste zum Aufklappen), hell │ dunkel (☾/☀ oder Menü Ansicht →
 *    Farbschema), Person mit Einstellungen und Abmelden.
 *
 * Umschalten im Menü Ansicht → „Aussehen: Retro“ bzw. „Aussehen: Modern“. Aussehen und hell │ dunkel werden je
 * Rechner gemerkt (localStorage, Blöckly und Texva & Co. getrennt), nach dem Umschalten des Aussehens lädt die Seite neu.
 * Gestaltung: gsg-modern.css (gemeinsam und F), gsg-modern-texva.css (A │ B).
 */
const KEY = Constants.isBloecklyApp ? "gsg-aussehen-bloeckly" : "gsg-aussehen-texva";
/** hell (Standard) oder dunkel – eigene Wahl für Modern, unabhängig vom Farbschema in Retro */
const KEY_FARBE = Constants.isBloecklyApp ? "gsg-modern-farbe" : "gsg-modern-farbe-texva";
const KEY_DATEIEN = "gsg-modern-dateien-zu";
/** Blöckly: Breite des rechten Bereichs mit der Bühne (480 × 360 und Rand) */
const BREITE_RECHTS = 540;

function lesen(schluessel: string): string | null {
    try { return localStorage.getItem(schluessel); } catch { return null; }
}
function schreiben(schluessel: string, wert: string | null) {
    try {
        if (wert === null) localStorage.removeItem(schluessel);
        else localStorage.setItem(schluessel, wert);
    } catch { /* ohne Speicher gilt die Wahl nur bis zum Neuladen */ }
}

export function istModern(): boolean {
    return lesen(KEY) !== "retro";
}

let dunkelGewaehlt: boolean | undefined;
function istDunkel(): boolean {
    if (dunkelGewaehlt === undefined) dunkelGewaehlt = lesen(KEY_FARBE) === "dunkel";
    return dunkelGewaehlt;
}

/** Menüeintrag (Ansicht): Text und Umschalten */
export function aussehenMenuText(): string {
    return istModern() ? "Aussehen: Retro (bisherige Ansicht)" : "Aussehen: Modern";
}

/**
 * Knopf „＋ Neues Projekt“ bzw. „＋ Neue Datei“ der leeren Ansicht (EmptyState.ts): Die Liste, in der er die Eingabe
 * öffnet, ist in Modern evtl. ausgeblendet. Blöckly (F): eigener Dialog „Neues Projekt“ (true: erledigt);
 * A │ B: ausgeblendete Dateiliste zuerst wieder zeigen.
 */
export function vorNeuemEintrag(main: Main, projekt: boolean): boolean {
    if (!document.documentElement.classList.contains("gsg-modern")) return false;
    if (Constants.isBloecklyApp) {
        if (projekt) neuesProjekt(main);
        return projekt;
    }
    dateienZeigen?.();
    return false;
}
let dateienZeigen: (() => void) | undefined;

export function aussehenUmschalten() {
    schreiben(KEY, istModern() ? "retro" : null);
    location.reload();
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
}
function knopf(text: string, title: string, cls: string): HTMLButtonElement {
    const b = el("button", cls, text);
    b.type = "button";
    if (title) b.title = title;
    return b;
}
/** kleines Strich-Symbol (24 × 24) */
function symbol(pfade: string): SVGSVGElement {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "22");
    svg.setAttribute("height", "22");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = pfade;
    return svg;
}

/** beim Start (Main.ts, nach dem ThemeManager) */
export function initModern(main: Main) {
    if (!istModern()) return;
    const html = document.documentElement;
    html.classList.add("gsg-modern", Constants.isBloecklyApp ? "gsg-modern-f" : "gsg-modern-a");

    // Farbschema: Modern hat eine eigene Wahl (hell │ dunkel). Gespeicherte Einstellungen aus Retro schalten nicht um,
    // das Menü „Farbschema“ ändert die Wahl von Modern.
    const tm = main.themeManager;
    const umschalten = tm.switchTheme.bind(tm);
    tm.switchTheme = () => umschalten(istDunkel() ? "dark" : "light");
    html.classList.toggle("gsg-modern-dunkel", istDunkel());
    umschalten(istDunkel() ? "dark" : "light");
    if (main.mainMenu) main.mainMenu.switchTheme = (name: string) => setzeFarbe(main, name === "dark");

    baueKopf(main);
    untermenuesAmKopf(main);
    beobachteKategorien();
    if (!Constants.isBloecklyApp) baueLeiste();

    setTimeout(() => {
        // Blöckly: rechter Bereich breit genug für die Bühne (der Regler bleibt benutzbar)
        const rechts = document.getElementById("rightdiv");
        if (Constants.isBloecklyApp && rechts && rechts.getBoundingClientRect().width < BREITE_RECHTS) rechts.style.width = BREITE_RECHTS + "px";
        window.dispatchEvent(new Event("resize"));
    }, 0);
}

let zeigeFarbknopf: (() => void) | undefined;

/** hell │ dunkel umschalten und merken; die Blöcke werden mit dem passenden Farbschema neu aufgebaut */
function setzeFarbe(main: Main, dunkel: boolean) {
    dunkelGewaehlt = dunkel;
    schreiben(KEY_FARBE, dunkel ? "dunkel" : null);
    document.documentElement.classList.toggle("gsg-modern-dunkel", dunkel);
    main.themeManager.switchTheme(dunkel ? "dark" : "light");
    zeigeFarbknopf?.();
    main.blockModeController?.refresh();
}

function baueKopf(main: Main) {
    const hauptDiv = document.getElementById("main");
    if (!hauptDiv) return;
    const f = Constants.isBloecklyApp;
    const kopf = el("header", "gsg-kopf");

    const marke = el("div", "gsg-kopf-marke");
    const logo = el("span", "gsg-kopf-logo");
    logo.setAttribute("aria-hidden", "true");
    for (let i = 0; i < 4; i++) logo.append(el("span"));
    const appName = document.title.split(" · ")[0]?.trim() || "Code";
    marke.append(logo, el("span", "gsg-kopf-app", appName));

    const name = el("span", "gsg-kopf-projekt");
    const art = el("span", "gsg-kopf-art");   // Dateiart der offenen Datei (Klassendiagramm, Struktogramm, Texva)
    art.hidden = true;
    const stand = el("span", "gsg-kopf-stand");

    const farbe = knopf("", "", "gsg-kopf-knopf gsg-kopf-farbe");
    farbe.addEventListener("click", () => setzeFarbe(main, !istDunkel()));
    zeigeFarbknopf = () => {
        const dunkel = istDunkel();
        farbe.textContent = dunkel ? "☀" : "☾";
        farbe.title = dunkel ? "Helles Aussehen" : "Dunkles Aussehen";
        farbe.setAttribute("aria-label", "Dunkles Aussehen");
        farbe.setAttribute("aria-pressed", String(dunkel));
    };
    zeigeFarbknopf();
    const hilfe = knopf("Hilfe", f ? "Handbuch mit Beispielen zu den Blöcken" : "Handbuch öffnen", "gsg-kopf-knopf gsg-kopf-hilfe");
    hilfe.addEventListener("click", () => openHandbook());

    // bisherige Menüleiste zum Aufklappen
    const menueKnopf = knopf("Menü", "Menü mit allen Befehlen (Datei, Bearbeiten, Ansicht …)", "gsg-kopf-knopf gsg-kopf-menueknopf");
    menueKnopf.setAttribute("aria-expanded", "false");
    const menue = el("div", "gsg-kopf-menue");
    const mainmenu = document.getElementById("mainmenu");
    if (mainmenu) menue.append(mainmenu);

    // Person: Einstellungen und Abmelden (die Knöpfe der bisherigen Leiste bleiben unsichtbar erhalten)
    const person = knopf("", "Einstellungen und Abmelden", "gsg-kopf-person");
    person.setAttribute("aria-expanded", "false");
    const kuerzel = el("span", "gsg-kopf-kuerzel");
    kuerzel.setAttribute("aria-hidden", "true");
    const personName = el("span", "gsg-kopf-name");
    person.append(kuerzel, personName);
    const personMenue = el("div", "gsg-kopf-personmenue");
    personMenue.setAttribute("role", "menu");
    const eintrag = (text: string, id: string) => {
        const b = knopf(text, "", "gsg-kopf-eintrag");
        b.setAttribute("role", "menuitem");
        b.addEventListener("click", () => { setzeOffen(undefined); document.getElementById(id)?.click(); });
        return b;
    };
    personMenue.append(eintrag("Einstellungen …", "buttonUserSettings"), eintrag("Abmelden", "buttonLogout"));

    /** höchstens eines offen: Menü oder Person */
    const setzeOffen = (was: "menue" | "person" | undefined) => {
        kopf.classList.toggle("gsg-kopf-menue-offen", was === "menue");
        kopf.classList.toggle("gsg-kopf-person-offen", was === "person");
        menueKnopf.setAttribute("aria-expanded", String(was === "menue"));
        person.setAttribute("aria-expanded", String(was === "person"));
    };
    menueKnopf.addEventListener("click", (e) => {
        e.stopPropagation();
        setzeOffen(kopf.classList.contains("gsg-kopf-menue-offen") ? undefined : "menue");
    });
    person.addEventListener("click", (e) => {
        e.stopPropagation();
        setzeOffen(kopf.classList.contains("gsg-kopf-person-offen") ? undefined : "person");
    });
    // nach einem Klick auf einen Befehl oder außerhalb wieder zu
    document.addEventListener("click", (e) => {
        const ziel = e.target as HTMLElement | null;
        if (!ziel) return;
        if (ziel.closest(".gsg-kopf-menue") && !ziel.closest(".jo_menuitem, .jo_submenu")) return;
        setzeOffen(undefined);
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") setzeOffen(undefined); });

    const teile: Node[] = [marke, el("span", "gsg-kopf-trenner")];
    let aufgabe: HTMLButtonElement | undefined;
    if (f) {
        const projekte = knopf("Meine Projekte", "Alle Projekte zeigen, öffnen und neu anlegen", "gsg-kopf-knopf gsg-kopf-projekte");
        projekte.addEventListener("click", () => zeigeProjekte(main));
        aufgabe = knopf("Aufgabe", "Aufgabe der Lehrkraft zeigen", "gsg-kopf-knopf gsg-kopf-aufgabe");
        aufgabe.addEventListener("click", () => zeigeReiter("Aufgabe"));
        teile.push(projekte, name, stand, el("span", "gsg-kopf-luecke"), aufgabe);
    } else {
        // Blöcke │ Texva, Ansicht (Vollbild, Beamer), Start … und Tempo aus der bisherigen Leiste übernehmen
        const pfad = el("nav", "gsg-kopf-pfad");
        pfad.setAttribute("aria-label", "Pfad");
        pfad.append(art, name, stand);
        teile.push(pfad);
        const umschalter = document.querySelector("#debugpanel .gsg-viewtoggle");
        if (umschalter) teile.push(umschalter);
        teile.push(el("span", "gsg-kopf-luecke"));
        const steuerung = el("div", "gsg-kopf-steuerung");
        for (const id of ["controls", "view-mode"]) {
            const e = document.getElementById(id);
            if (e) steuerung.append(e);
        }
        teile.push(steuerung, el("span", "gsg-kopf-trenner"));
    }
    teile.push(farbe, hilfe, menueKnopf, person, menue, personMenue);
    kopf.append(...teile);
    hauptDiv.prepend(kopf);

    // Projekt, Datei, Speicherstand, Aufgabe und Person aktuell halten
    const aktualisiere = () => {
        const ws = main.getCurrentWorkspace?.();
        const datei = ws?.getCurrentlyEditedFile?.();
        name.textContent = !ws ? "kein Projekt" : f || !datei ? ws.name : `${ws.name} / ${datei.name}`;
        if (!f) zeigeDateiart(art, datei?.name, main.blockModeController?.getMode());
        const gespeichert = !ws || (ws.saved !== false && ws.getFiles().every((d) => d.isSaved()));
        stand.textContent = ws ? (gespeichert ? "Gespeichert" : "Wird gespeichert …") : "";
        stand.title = stand.textContent;
        name.title = name.textContent;
        stand.classList.toggle("gsg-kopf-ungespeichert", !gespeichert);
        if (aufgabe) aufgabe.hidden = !taskOf(ws);
        document.documentElement.classList.toggle("gsg-modern-mit-aufgabe", !!taskOf(ws));
        // Leiste: „Aufgabe“ nur, wenn es den Reiter gibt (Struktogramme haben keinen)
        if (leisteAufgabe) leisteAufgabe.hidden = !reiter("Aufgabe")?.getClientRects().length;
        const u = main.user;
        const anzeige = u ? (u.rufname && u.familienname ? `${u.rufname} ${u.familienname}` : u.username) : "";
        personName.textContent = anzeige ?? "";
        kuerzel.textContent = (u?.rufname?.[0] ?? u?.username?.[0] ?? "").toUpperCase() + (u?.familienname?.[0] ?? "").toUpperCase();
    };
    aktualisiere();
    setInterval(aktualisiere, 1000);
    document.addEventListener(DATEI_GEWECHSELT, () => aktualisiere());
}

let leisteAufgabe: HTMLButtonElement | undefined;

/**
 * A │ B: schmale Leiste links mit Dateien (Dateiliste ein/aus), Ausgabe, Aufgabe, Handbuch und Einstellungen.
 * Die bisherigen Knöpfe zum Einklappen der Dateiliste blendet gsg-modern-texva.css aus.
 */
function baueLeiste() {
    const unten = document.getElementById("belowmainmenu");
    if (!unten) return;
    const leiste = el("nav", "gsg-leiste");
    leiste.setAttribute("aria-label", "Bereiche");
    const eintrag = (text: string, titel: string, pfade: string, aktion: () => void) => {
        const b = knopf("", titel, "gsg-leiste-knopf");
        b.append(symbol(pfade), el("span", undefined, text));
        b.addEventListener("click", aktion);
        return b;
    };
    const html = document.documentElement;
    const dateien = eintrag("Dateien", "Dateiliste und Projekte ein- oder ausblenden",
        '<path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/>', () => {
            const zu = !html.classList.contains("gsg-modern-ohne-dateien");
            setzeDateien(zu);
            schreiben(KEY_DATEIEN, zu ? "1" : null);
        });
    const setzeDateien = (zu: boolean) => {
        html.classList.toggle("gsg-modern-ohne-dateien", zu);
        dateien.setAttribute("aria-pressed", String(!zu));
        window.dispatchEvent(new Event("resize"));
    };
    setzeDateien(lesen(KEY_DATEIEN) === "1");
    dateienZeigen = () => {
        if (!html.classList.contains("gsg-modern-ohne-dateien")) return;
        setzeDateien(false);
        schreiben(KEY_DATEIEN, null);
    };
    const ausgabe = eintrag("Ausgabe", "Ausgabe des Programms zeigen",
        '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>', () => zeigeReiter("Ausgabe"));
    const aufgabe = eintrag("Aufgabe", "Aufgabe der Lehrkraft zeigen",
        '<path d="M10 6h10M10 12h10M10 18h10"/><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>', () => zeigeReiter("Aufgabe"));
    aufgabe.classList.add("gsg-leiste-aufgabe");
    leisteAufgabe = aufgabe;
    const handbuch = eintrag("Handbuch", "Handbuch öffnen",
        '<path d="M3 19a9 9 0 0 1 9 0a9 9 0 0 1 9 0"/><path d="M3 6a9 9 0 0 1 9 0a9 9 0 0 1 9 0"/><path d="M3 6v13M12 6v13M21 6v13"/>',
        () => openHandbook());
    const einstellungen = eintrag("", "Einstellungen",
        '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
        () => document.getElementById("buttonUserSettings")?.click());
    einstellungen.setAttribute("aria-label", "Einstellungen");
    leiste.append(dateien, ausgabe, aufgabe, handbuch, el("span", "gsg-kopf-luecke"), einstellungen);
    unten.prepend(leiste);
}

/**
 * Die Menüleiste rechnet die Lage ihrer Untermenüs für ihren alten Platz oben links. In der aufgeklappten
 * Kopfleiste stehen die Untermenüs direkt unter ihrem Menüpunkt (und ragen nicht über den rechten Rand).
 */
function untermenuesAmKopf(main: Main) {
    const mm = main.mainMenu;
    if (!mm) return;
    const oeffne = mm.opensubmenu.bind(mm);
    mm.opensubmenu = (mi: Parameters<MainMenu["opensubmenu"]>[0]) => {
        oeffne(mi);
        if (mi.subMenu.level !== 1) return;
        const punkt = mi.$element[0]?.getBoundingClientRect();
        const unter = mi.subMenu.$element[0];
        if (!punkt || !unter) return;
        const links = Math.max(8, Math.min(punkt.left, window.innerWidth - unter.offsetWidth - 8));
        unter.style.left = links + window.scrollX + "px";
        unter.style.top = punkt.bottom + window.scrollY + "px";
    };
}

/**
 * Kategorien der Blöcke: Blockly zeichnet die Farbe als linken Rand; Modern zeigt sie als Punkt über dem Namen
 * (gsg-modern.css liest --gsg-kat). Die Leiste entsteht bei jedem neuen Arbeitsbereich neu.
 */
function beobachteKategorien() {
    let geplant = false;
    const faerben = () => {
        geplant = false;
        for (const zeile of Array.from(document.querySelectorAll<HTMLElement>(".blocklyToolbox .blocklyToolboxCategory"))) {
            const farbe = zeile.style.borderLeftColor;
            if (farbe && zeile.style.getPropertyValue("--gsg-kat") !== farbe) zeile.style.setProperty("--gsg-kat", farbe);
        }
    };
    new MutationObserver(() => {
        if (geplant) return;
        geplant = true;
        requestAnimationFrame(faerben);
    }).observe(document.body, { childList: true, subtree: true });
}

/** Überschrift eines Reiters im rechten Bereich (Ausgabe, Aufgabe, Handbuch, Figuren) */
function reiter(titel: string): HTMLElement | undefined {
    return Array.from(document.querySelectorAll<HTMLElement>("#rightdiv .jo_tabheading"))
        .find((h) => h.textContent?.trim().startsWith(titel));
}

/** Reiter im rechten Bereich nach seiner Überschrift öffnen */
function zeigeReiter(titel: string) {
    reiter(titel)?.click();
}
