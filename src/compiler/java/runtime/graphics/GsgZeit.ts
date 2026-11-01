import type { LibraryDeclarations } from "../../module/libraries/DeclareType";

/**
 * Blöckly (Paket 19c): Datum und Uhrzeit wie in Scratch („aktuelles Jahr“ …, „Tage seit 2000“) – für Figur und
 * Bühne gleich. Wochentag nach deutscher Zählung: Montag = 1 … Sonntag = 7.
 */
export const ZEIT = {
    jahr: () => new Date().getFullYear(),
    monat: () => new Date().getMonth() + 1,
    tag: () => new Date().getDate(),
    wochentag: () => ((new Date().getDay() + 6) % 7) + 1,
    stunde: () => new Date().getHours(),
    minute: () => new Date().getMinutes(),
    sekunde: () => new Date().getSeconds(),
    /** Tage seit dem 1.1.2000, 0 Uhr (UTC), mit Bruchteil wie in Scratch */
    tageSeit2000: () => (Date.now() - Date.UTC(2000, 0, 1)) / 86400000,
};

export const ZEIT_DEKLARATIONEN: LibraryDeclarations = [
    { type: "method", signature: "int aktuellesJahr()", native: ZEIT.jahr, comment: "Das aktuelle Jahr, z. B. 2026." },
    { type: "method", signature: "int aktuellerMonat()", native: ZEIT.monat, comment: "Der aktuelle Monat: 1 (Januar) bis 12 (Dezember)." },
    { type: "method", signature: "int aktuellerTag()", native: ZEIT.tag, comment: "Der aktuelle Tag im Monat: 1 bis 31." },
    { type: "method", signature: "int aktuellerWochentag()", native: ZEIT.wochentag, comment: "Der aktuelle Wochentag: 1 (Montag) bis 7 (Sonntag)." },
    { type: "method", signature: "int aktuelleStunde()", native: ZEIT.stunde, comment: "Die aktuelle Stunde: 0 bis 23." },
    { type: "method", signature: "int aktuelleMinute()", native: ZEIT.minute, comment: "Die aktuelle Minute: 0 bis 59." },
    { type: "method", signature: "int aktuelleSekunde()", native: ZEIT.sekunde, comment: "Die aktuelle Sekunde: 0 bis 59." },
    { type: "method", signature: "double tageSeit2000()", native: ZEIT.tageSeit2000, comment: "Tage seit dem 1. Januar 2000 (mit Bruchteil) – gut zum Messen langer Zeiträume." },
];
