/**
 * Schulfarben des Graf-Stauffenberg-Gymnasiums Osnabrück (GSG) für die Themes der IDE.
 * Logofarben: Dunkelblau #00376D, Grün #45B82F.
 *
 * Wird einmal von ThemeManager nach initThemes() aufgerufen und überschreibt nur
 * Akzentfarben (Auswahl, aktive Datei, Menüs, Knöpfe, Regler). Hintergründe und
 * Syntaxfarben bleiben unverändert, damit der Code gut lesbar bleibt.
 * Eigene Datei, damit Updates des Originals möglichst ohne Konflikte übernommen werden können.
 */

/** Rechtliche Seiten der Schule (Login-Seite: index.html, Hilfe-Menü: MainMenu.ts) */
export const SCHOOL_IMPRINT_URL = "https://gsg-os.de/impressum/";
export const SCHOOL_PRIVACY_URL = "https://gsg-os.de/datenschutzerklaerung/";

/** Verwaltung der Lerngruppen und Konten (eigenes Backend, Menü "Klassen, Benutzer, Tests") */
export const SCHOOL_ADMIN_URL = "/verwaltung/";

/** Startseite des eigenen Backends: Anwendungen, Projekte per Link teilen */
export const SCHOOL_START_URL = "/start/";

/**
 * Login-Seite: Knopf "Mit IServ anmelden" zeigen, wenn der Server IServ eingerichtet hat
 * (Elemente mit Klasse gsg-iserv-only in index.html, Abfrage /api/login-optionen des Backends).
 */
export function showIServLoginIfEnabled() {
    fetch("/api/login-optionen")
        .then((r) => (r.ok ? r.json() : { iserv: false }))
        .then((o: { iserv?: boolean }) => {
            if (!o.iserv) return;
            document.querySelectorAll<HTMLElement>(".gsg-iserv-only").forEach((el) => (el.hidden = false));
        })
        .catch(() => { /* Backend nicht erreichbar: nur lokales Login */ });
}

type ThemeLike = { name: string, cssColors: { [color: string]: string } };

const NAVY = "#00376D";
const NAVY_HOVER = "#0b4a8a";
const GREEN = "#45B82F";
const GREEN_LIGHT = "#6fd35b";

const brandColors: { [themeName: string]: { [cssVariable: string]: string } } = {
    dark: {
        "--submenu-hover": NAVY,
        "--file-active": NAVY,
        "--file-active-hover": "rgba(0, 55, 109, 0.85)",
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
        "--loginButtonActive": "#002448",
        "--arrowBoxButtonOuter-background": GREEN,
        "--arrowBoxButtonOuter-button-hover": GREEN_LIGHT,
        "--arrowBoxButtonOuter-color": "#0b1d2e",
    },
    light: {
        "--submenu-hover": NAVY,
        "--file-active": "#d5e3f1",
        "--file-active-hover": "#e3ecf6",
        "--file-active-border": GREEN,
        "--contextmenu-hover-color": NAVY,
        "--error-line-ative": "#d5e3f1",
        "--bottomdiv-tabheading-active": NAVY,
        "--speedcontrol-grip": GREEN,
        "--speedcontrol-grip-hover": "#3a9e27",
        "--loginButtonBackground": NAVY,
        "--loginButtonBackgrond": NAVY,
        "--loginButtonFontColor": "#ffffff",
        "--loginButtonHover": NAVY_HOVER,
        "--loginButtonActive": "#002448",
        "--arrowBoxButtonOuter-background": GREEN,
        "--arrowBoxButtonOuter-button-hover": GREEN_LIGHT,
        "--arrowBoxButtonOuter-color": "#0b1d2e",
    },
};

export function applySchoolBranding(themes: ThemeLike[]) {
    for (const theme of themes) {
        const overrides = brandColors[theme.name];
        if (overrides) Object.assign(theme.cssColors, overrides);
    }
}
