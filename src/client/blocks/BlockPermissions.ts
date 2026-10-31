/**
 * Freigaben der Lerngruppe für die Blöcke (Verwaltung → Lerngruppe → Freigaben), wie sie der Server beim
 * Anmelden mitschickt (`user.gsgFreigaben`). Lehrkräfte bekommen vom Server immer alles. Fehlen die Angaben
 * (z. B. ohne eigenes Backend), gilt alles als erlaubt. Ohne Blockly-Abhängigkeit, damit auch der Login sie nutzen kann.
 */

export type BlockPermissions = {
    /** Java-Vorschau neben den Blöcken */
    preview: boolean;
    /** Schalter „Beschriftung: Deutsch │ Java“ */
    javaLabels: boolean;
    /** Gültigkeitsbereich von Variablen anzeigen (Kasten in Blöcken, Randbalken im Java-Editor) */
    scope: boolean;
};

type Freigaben = { bloeckeVorschau?: unknown; bloeckeBeschriftung?: unknown; gueltigkeit?: unknown; bloecklyJava?: unknown };

export function blockPermissions(user: unknown, bloeckly = false): BlockPermissions {
    const f = (user as { gsgFreigaben?: Freigaben } | null | undefined)?.gsgFreigaben;
    const flag = (v: unknown) => (typeof v === "boolean" ? v : true);
    if (bloeckly) {
        // Blöckly (Paket 18): eine Freigabe für alles, was Java zeigt (Vorschau, Java-Beschriftung)
        const java = flag(f?.bloecklyJava);
        return { preview: java, javaLabels: java, scope: flag(f?.gueltigkeit) };
    }
    return { preview: flag(f?.bloeckeVorschau), javaLabels: flag(f?.bloeckeBeschriftung), scope: flag(f?.gueltigkeit) };
}
