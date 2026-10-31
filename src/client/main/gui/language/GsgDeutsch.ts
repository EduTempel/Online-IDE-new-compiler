/**
 * GSG: deutsche Oberflächentexte an unsere Begriffe anpassen, ohne die Sprachdateien des Originals zu ändern
 * (weniger Konflikte bei Updates). LanguageManager.lm() schickt jeden deutschen Text hier durch.
 *  - „Workspace“ heißt bei uns „Projekt“ (wie auf der Startseite und im Handbuch); Artikel und Endungen passen sich an.
 *  - einzelne englisch gebliebene Begriffe (Theme, Dark, Light, Testrunner, Console, Step out, Goto cursor)
 */

/** ganze Texte, die genau so ersetzt werden */
const GANZE_TEXTE: Record<string, string> = {
    "Theme": "Farbschema",
    "Dark": "Dunkel",
    "Light": "Hell",
    "Testrunner": "Tests",
    "Console": "Konsole",
    "Step out": "Zurück aus der Methode (step out)",
    "Goto cursor": "Bis zur Zeile mit dem Cursor laufen",
    "Alle Workspaces also JSON-Datei exportieren": "Alle Projekte als JSON-Datei exportieren",   // Tippfehler im Original
};

/** Ersetzungen für „Workspace“ – die genaueren zuerst */
const WORKSPACE: [RegExp, string][] = [
    // zusammengesetzte Wörter
    [/\bWorkspace-Ordner/g, "Projekt-Ordner"],
    [/\bWorkspace-?[Ll]iste/g, "Projektliste"],
    [/\bWorkspacedatei/g, "Projektdatei"],
    [/\bWorkspacebaum/g, "Projektbaum"],
    [/\bWorkspaceexplorer/g, "Projektexplorer"],
    [/\bWORKSPACES\b/g, "PROJEKTE"],
    // Genitiv
    [/\b(des|eines) (aktuell offenen )?Workspaces?\b/g, "$1 $2Projekts"],
    // Mehrzahl (Dativ: „zu Ihren eigenen Projekten“)
    [/\b(zu (?:Ihren|deinen) eigenen) Workspaces\b/g, "$1 Projekten"],
    [/\bWorkspaces\b/g, "Projekte"],
    // Relativsatz: „auf einen Workspace rechtsklicken, der …“
    [/\beinen Workspace rechtsklicken, der\b/g, "ein Projekt rechtsklicken, das"],
    // Nominativ (der → das)
    [/\bDer neue Workspace\b/g, "Das neue Projekt"],
    [/\b([Dd])er aktuelle Workspace\b/g, "$1as aktuelle Projekt"],
    [/\b([Dd])er Workspace\b/g, "$1as Projekt"],
    [/\bNeuer Workspace\b/g, "Neues Projekt"],
    // Akkusativ (den/einen/keinen … → das/ein/kein …)
    [/\b([Dd])en Workspace\b/g, "$1as Projekt"],
    [/\b([Ee])inen Workspace\b/g, "$1in Projekt"],
    [/\b([Kk])einen Workspace\b/g, "$1ein Projekt"],
    [/\b([Dd])iesen Workspace\b/g, "$1ieses Projekt"],
    [/\b([Nn])euen Workspace\b/g, "$1eues Projekt"],
    [/\b([Ee])igenen Workspace\b/g, "$1igenes Projekt"],
    [/\bAktuellen Workspace\b/g, "Aktuelles Projekt"],
    // alles Übrige (im/am/zum/dem/deinem/diesem/kein/dein/mit … Workspace)
    [/\bWorkspace\b/g, "Projekt"],
];

export function gsgDeutsch(text: string): string {
    if (typeof text !== "string") return text;   // manche Aufrufer geben keine Zeichenkette (z. B. Funktionen) – unverändert lassen
    const ganz = GANZE_TEXTE[text];
    if (ganz !== undefined) return ganz;
    if (!text.includes("Workspace") && !text.includes("WORKSPACES")) return text;
    let ergebnis = text;
    for (const [muster, ersatz] of WORKSPACE) ergebnis = ergebnis.replace(muster, ersatz);
    // „Das Projekt … wurde ausgeteilt. Er wird …“
    if (/\bDas Projekt\b/.test(ergebnis)) ergebnis = ergebnis.replace(/\bEr wird\b/g, "Es wird");
    return ergebnis;
}
