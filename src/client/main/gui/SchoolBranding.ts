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

/** Startseite des eigenen Backends: Anwendungen, Projekte per Link teilen */
export const SCHOOL_START_URL = "/start/";

/** Anwendungen "Blöcke" und "Struktogramme" (dieselbe IDE): Titel, Überschrift und IServ-Rücksprung anpassen */
function applyAppBranding() {
    if (/^\/struktogramme(\/|$)/.test(location.pathname)) {
        document.title = `Struktogramme · ${SCHOOL.short}`;
        document.querySelectorAll<HTMLElement>(".gsg-login-title").forEach((el) => (el.textContent = "Struktogramme"));
        document.querySelectorAll<HTMLAnchorElement>("a.gsg-iserv-button").forEach((a) => (a.href = "/auth/iserv/login?app=struktogramme"));
        return;
    }
    if (!/^\/bloecke(\/|$)/.test(location.pathname)) return;
    document.title = `Blöcke · ${SCHOOL.short}`;
    document.querySelectorAll<HTMLElement>(".gsg-login-title").forEach((el) => (el.textContent = "Blöcke"));
    document.querySelectorAll<HTMLAnchorElement>("a.gsg-iserv-button").forEach((a) => (a.href = "/auth/iserv/login?app=bloecke"));
}

/**
 * Login-Seite: Knopf "Mit IServ anmelden" zeigen, wenn der Server IServ eingerichtet hat
 * (Elemente mit Klasse gsg-iserv-only in index.html, Abfrage /api/login-optionen des Backends).
 */
export function showIServLoginIfEnabled() {
    applyAppBranding();
    fetch("/api/login-optionen")
        .then((r) => (r.ok ? r.json() : { iserv: false }))
        .then((o: { iserv?: boolean }) => {
            if (!o.iserv) return;
            document.querySelectorAll<HTMLElement>(".gsg-iserv-only").forEach((el) => (el.hidden = false));
        })
        .catch(() => { /* Backend nicht erreichbar: nur lokales Login */ });
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
            "--bottomdiv-tabheading-active": GREEN_LIGHT,
            "--speedcontrol-grip": GREEN,
            "--speedcontrol-grip-hover": GREEN_LIGHT,
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
            "--bottomdiv-tabheading-active": NAVY,
            "--speedcontrol-grip": GREEN,
            "--speedcontrol-grip-hover": GREEN_DARK,
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
    const colors = brandColors();
    for (const theme of themes) {
        const overrides = colors[theme.name];
        if (overrides) Object.assign(theme.cssColors, overrides);
    }
}
