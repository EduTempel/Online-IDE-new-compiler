/**
 * GSG: Gruppen in der Baumansicht (Explorer: Ordner, Klassendiagramme, Struktogramme, Code).
 * Innerhalb eines Ordners stehen die Gruppen nacheinander; die erste Zeile jeder weiteren Gruppe bekommt die
 * Klasse „gsg-tv-gruppenstart“ (sanfter Trennstrich, siehe gsg-branding.css). Die Reihenfolge innerhalb einer Gruppe
 * bleibt die gewohnte (benutzerdefiniert oder alphabetisch).
 */
export type Gruppe<E> = ((object: E) => number) | undefined;

/** Vergleich: erst nach Gruppe, dann wie bisher */
export function mitGruppen<E>(gruppe: Gruppe<E>, vergleich?: (a: E, b: E) => number): ((a: E, b: E) => number) | undefined {
    if (!gruppe) return vergleich;
    return (a, b) => Math.sign(gruppeVon(gruppe, a) - gruppeVon(gruppe, b)) || (vergleich ? vergleich(a, b) : 0);
}

/** Trennstriche setzen: erste Zeile jeder Gruppe nach der ersten */
export function markiereGruppen<E>(gruppe: Gruppe<E>, kinder: { externalObject: E | undefined; getMainDiv(): HTMLElement }[]) {
    if (!gruppe) return;
    let vorher: number | undefined;
    for (const k of kinder) {
        const g = gruppeVon(gruppe, k.externalObject);
        k.getMainDiv()?.classList.toggle("gsg-tv-gruppenstart", vorher !== undefined && g !== vorher);
        vorher = g;
    }
}

function gruppeVon<E>(gruppe: (object: E) => number, e: E | undefined): number {
    return e === undefined || e === null ? 0 : gruppe(e);
}
