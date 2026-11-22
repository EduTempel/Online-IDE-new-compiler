export class Constants {
    /**
     * 1 = „Code“ (/code/, bisher Texva unter /java/ bzw. /); 4 = „Mix“ (/mix/, bisher Blöckva unter /bloecke/:
     * Blockmodus, eigene Projektliste – Erweiterung des GSG); 5 = „Strukto“ (/strukto/, bisher /struktogramme/);
     * 6 = „Blocks“ (/blocks/, bisher Blöckly unter /bloeckly/, Blöcke nah an Scratch, Paket 18); 7 = „Klassen“
     * (/klassen/, bisher /klassendiagramme/, Paket 20). Die alten Adressen leiten weiter; erkannt werden beide.
     */
    public static readonly Application: 1 | 4 | 5 | 6 | 7 = typeof location === "undefined" ? 1
        : /^\/(mix|bloecke)(\/|$)/.test(location.pathname) ? 4
        : /^\/(strukto|struktogramme)(\/|$)/.test(location.pathname) ? 5
        : /^\/(blocks|bloeckly)(\/|$)/.test(location.pathname) ? 6
        : /^\/(klassen|klassendiagramme)(\/|$)/.test(location.pathname) ? 7 : 1;
    /** 6 = Anwendung „Blocks“ (Jahrgang 9–10; im Code weiter „Blöckly“) */
    public static readonly isBloecklyApp: boolean = Constants.Application === 6;
    /** Anwendungen im Blockmodus: Mix (4) und Blocks (6) */
    public static readonly isBlocksApp: boolean = Constants.Application === 4 || Constants.isBloecklyApp;
    /** 1 = Anwendung „Code“: nur Text, keine Blockansicht (13.11.2026) */
    public static readonly isTexvaApp: boolean = Constants.Application === 1;
    /** 5 = Anwendung „Strukto“ (dieselbe IDE unter /strukto/, eigene Projektliste) */
    public static readonly isStructogramApp: boolean = Constants.Application === 5;
    /** 7 = Anwendung „Klassen“ (dieselbe IDE unter /klassen/, eigene Projektliste) */
    public static readonly isKlassendiagrammApp: boolean = Constants.Application === 7;
    /** Name der Anwendung beim Server (Startseite, Einmal-Anmeldung, IServ) – interne Schlüssel, unverändert */
    public static readonly appName: "java" | "bloecke" | "struktogramme" | "bloeckly" | "klassendiagramme" =
        Constants.Application === 4 ? "bloecke" : Constants.Application === 5 ? "struktogramme"
            : Constants.Application === 6 ? "bloeckly" : Constants.Application === 7 ? "klassendiagramme" : "java";

}
