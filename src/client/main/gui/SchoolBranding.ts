/**
 * Schulfarben für die Themes der IDE (Standard: Graf-Stauffenberg-Gymnasium Osnabrück, Dunkelblau #00376D,
 * Grün #45B82F; Schul-Admins ändern sie in der Verwaltung unter „Aussehen“).
 *
 * Wird einmal von ThemeManager nach initThemes() aufgerufen und überschreibt nur
 * Akzentfarben (Auswahl, aktive Datei, Menüs, Knöpfe, Regler). Hintergründe und
 * Syntaxfarben bleiben unverändert, damit der Code gut lesbar bleibt.
 * Eigene Datei, damit Updates des Originals möglichst ohne Konflikte übernommen werden können.
 */

/**
 * Angaben zur Schule aus /branding/schule.js (Verwaltung → Aussehen), das index.html vor dem Start lädt;
 * ohne Backend gelten die Angaben des GSG.
 */
type SchoolInfo = { name: string, short: string, imprintUrl: string, privacyUrl: string };
export const SCHOOL: SchoolInfo = {
    name: "Graf-Stauffenberg-Gymnasium Osnabrück",
    short: "GSG Osnabrück",
    imprintUrl: "https://gsg-os.de/impressum/",
    privacyUrl: "https://gsg-os.de/datenschutzerklaerung/",
    ...((globalThis as { GSG_SCHULE?: Partial<SchoolInfo> }).GSG_SCHULE ?? {}),
};

/** Rechtliche Seiten der Schule (Login-Seite: index.html, Hilfe-Menü: MainMenu.ts) */
export const SCHOOL_IMPRINT_URL = SCHOOL.imprintUrl;
export const SCHOOL_PRIVACY_URL = SCHOOL.privacyUrl;

/** Verwaltung der Lerngruppen und Konten (eigenes Backend, Menü "Klassen, Benutzer, Tests") */
export const SCHOOL_ADMIN_URL = "/verwaltung/";

/** Seite „Mitwirkende und Lizenzen“ des eigenen Backends (Hilfe-Menü, Login-Seite) */
export const SCHOOL_CREDITS_URL = "/mitwirkende/";

/** Lehrerhandbuch zur Block-Umgebung (Hilfe-Menü für Lehrkräfte, Aufgaben-Reiter) */
export const SCHOOL_TEACHER_HANDBOOK_URL = "/lehrkraefte/";

/** Startseite des eigenen Backends: Anwendungen, Projekte per Link teilen */
export const SCHOOL_START_URL = "/start/";

/** Anwendungen "Blöckva", "Struktogramme" und "Blöckly" (dieselbe IDE): Titel, Überschrift und IServ-Rücksprung anpassen */
const APP_TITLES: { path: RegExp, title: string, app: string }[] = [
    { path: /^\/bloecke(\/|$)/, title: "Blöckva", app: "bloecke" },
    { path: /^\/struktogramme(\/|$)/, title: "Struktogramme", app: "struktogramme" },
    { path: /^\/bloeckly(\/|$)/, title: "Blöckly", app: "bloeckly" },
];

function applyAppBranding() {
    const a = APP_TITLES.find((t) => t.path.test(location.pathname));
    if (!a) return;
    document.title = `${a.title} · ${SCHOOL.short}`;
    document.querySelectorAll<HTMLElement>(".gsg-login-title").forEach((el) => (el.textContent = a.title));
    document.querySelectorAll<HTMLAnchorElement>("a.gsg-iserv-button").forEach((link) => (link.href = `/auth/iserv/login?app=${a.app}`));
}

/**
 * Login-Seite: Knopf "Mit IServ anmelden" zeigen, wenn der Server IServ eingerichtet hat
 * (Elemente mit Klasse gsg-iserv-only in index.html, Abfrage /api/login-optionen des Backends).
 */
export function showIServLoginIfEnabled() {
    setupForgotPassword();
    applyAppBranding();
    fetch("/api/login-optionen")
        .then((r) => (r.ok ? r.json() : { iserv: false }))
        .then((o: { iserv?: boolean, iservUrl?: string | null }) => {
            if (!o.iserv) return;
            const iservUrl = o.iservUrl;
            if (iservUrl) document.querySelectorAll<HTMLAnchorElement>("a.gsg-iserv-home").forEach((a) => (a.href = iservUrl));
            document.querySelectorAll<HTMLElement>(".gsg-iserv-only").forEach((el) => (el.hidden = false));
        })
        .catch(() => { /* Backend nicht erreichbar: nur lokales Login */ });
}

/** Login-Seite: „Passwort vergessen?“ klappt die Hinweise für IServ- und lokale Konten auf und zu */
function setupForgotPassword() {
    document.querySelectorAll<HTMLButtonElement>(".gsg-forgot-toggle").forEach((button) => {
        const box = document.getElementById(button.getAttribute("aria-controls") ?? "");
        if (!box) return;
        button.addEventListener("click", () => {
            box.hidden = !box.hidden;
            button.setAttribute("aria-expanded", String(!box.hidden));
        });
    });
}

type ThemeLike = { name: string, cssColors: { [color: string]: string } };

/**
 * Schulfarben: kommen aus /branding/farben.css (Verwaltung → Aussehen), das index.html vor dem Start lädt.
 * Ohne Backend (z. B. lokal ohne Server) gelten die Farben des GSG.
 */
function brand(name: string, fallback: string): string {
    try {
        return getComputedStyle(document.documentElement).getPropertyValue(`--brand-${name}`).trim() || fallback;
    } catch {
        return fallback;
    }
}

function brandColors(): { [themeName: string]: { [cssVariable: string]: string } } {
    const NAVY = brand("primary", "#00376D");
    const NAVY_HOVER = brand("primary-hover", "#0b4a8a");
    const NAVY_DARK = brand("primary-dark", "#002448");
    const NAVY_TINT = brand("primary-tint-strong", "#d5e3f1");
    const NAVY_TINT_LIGHT = brand("primary-tint", "#e3ecf6");
    const NAVY_RGB = brand("primary-rgb", "0, 55, 109");
    const GREEN = brand("accent", "#45B82F");
    const GREEN_LIGHT = brand("accent-light", "#6fd35b");
    const GREEN_DARK = brand("accent-dark", "#3a9e27");
    const ON_GREEN = brand("on-accent", "#0b1d2e");
    return {
        dark: {
            "--submenu-hover": NAVY,
            "--file-active": NAVY,
            "--file-active-hover": `rgba(${NAVY_RGB}, 0.85)`,
            "--file-active-border": GREEN,
            "--contextmenu-hover-background": NAVY,
            "--error-line-ative": NAVY,
            "--bottomdiv-tabheading-active": GREEN,
            "--speedcontrol-grip": GREEN,
            "--speedcontrol-grip-hover": GREEN_LIGHT,
            // Auswahl in Datei- und Projektlisten, Fokus, Start-Knopf (gsg-branding.css)
            "--gsg-sel-bg": NAVY,
            "--gsg-sel-hover": NAVY_HOVER,
            "--gsg-sel-fg": "#ffffff",
            "--gsg-sel-bar": GREEN,
            "--gsg-focus": GREEN_LIGHT,
            "--gsg-start-bg": GREEN,
            "--gsg-start-hover": GREEN_LIGHT,
            "--gsg-start-fg": ON_GREEN,
            // Symbole der Knöpfe (für dunklen Hintergrund gezeichnet): im dunklen Design unverändert
            "--gsg-icon-filter": "none",
            "--gsg-icon-filter-hover": "brightness(150%)",
            "--gsg-icon-filter-off": "grayscale()",
            "--loginButtonBackground": NAVY,
            "--loginButtonBackgrond": NAVY,
            "--loginButtonFontColor": "#ffffff",
            "--loginButtonHover": NAVY_HOVER,
            "--loginButtonActive": NAVY_DARK,
            "--arrowBoxButtonOuter-background": GREEN,
            "--arrowBoxButtonOuter-button-hover": GREEN_LIGHT,
            "--arrowBoxButtonOuter-color": ON_GREEN,
        },
        light: {
            "--submenu-hover": NAVY,
            "--file-active": NAVY_TINT,
            "--file-active-hover": NAVY_TINT_LIGHT,
            "--file-active-border": GREEN,
            "--contextmenu-hover-color": NAVY,
            "--error-line-ative": NAVY_TINT,
            "--bottomdiv-tabheading-active": GREEN_DARK,
            "--speedcontrol-grip": GREEN,
            "--speedcontrol-grip-hover": GREEN_DARK,
            "--gsg-sel-bg": NAVY_TINT,
            "--gsg-sel-hover": NAVY_TINT_LIGHT,
            "--gsg-sel-fg": NAVY_DARK,
            "--gsg-sel-bar": GREEN_DARK,
            "--gsg-focus": GREEN_DARK,
            "--gsg-start-bg": GREEN,
            "--gsg-start-hover": GREEN_LIGHT,
            "--gsg-start-fg": ON_GREEN,
            // im hellen Design abdunkeln und kräftiger, sonst sind die hellen Symbole auf Weiß kaum zu sehen
            "--gsg-icon-filter": "brightness(.55) saturate(1.8) contrast(1.2)",
            "--gsg-icon-filter-hover": "brightness(.35) saturate(2)",
            "--gsg-icon-filter-off": "brightness(.75) grayscale()",
            "--loginButtonBackground": NAVY,
            "--loginButtonBackgrond": NAVY,
            "--loginButtonFontColor": "#ffffff",
            "--loginButtonHover": NAVY_HOVER,
            "--loginButtonActive": NAVY_DARK,
            "--arrowBoxButtonOuter-background": GREEN,
            "--arrowBoxButtonOuter-button-hover": GREEN_LIGHT,
            "--arrowBoxButtonOuter-color": ON_GREEN,
        },
    };
}

export function applySchoolBranding(themes: ThemeLike[]) {
    // Anwendung für das Stylesheet (z. B. beschriftete Start-Knöpfe nur außerhalb von Blöckly)
    document.documentElement.dataset.gsgApp = APP_TITLES.find((t) => t.path.test(location.pathname))?.app ?? "java";
    const colors = brandColors();
    for (const theme of themes) {
        const overrides = colors[theme.name];
        if (overrides) Object.assign(theme.cssColors, overrides);
    }
}
