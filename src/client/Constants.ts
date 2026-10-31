export class Constants {
    /**
     * 1 = Java-IDE; 4 = Anwendung "Blöckva" (bisher „Blöcke“: dieselbe IDE unter /bloecke/, Blockmodus, eigene
     * Projektliste – Erweiterung des GSG); 5 = "Struktogramme" (/struktogramme/); 6 = "Blöckly" (/bloeckly/,
     * Blöcke nah an Scratch, Paket 18)
     */
    public static readonly Application: 1 | 4 | 5 | 6 = typeof location === "undefined" ? 1
        : /^\/bloecke(\/|$)/.test(location.pathname) ? 4
        : /^\/struktogramme(\/|$)/.test(location.pathname) ? 5
        : /^\/bloeckly(\/|$)/.test(location.pathname) ? 6 : 1;
    /** 6 = Anwendung "Blöckly" (Jahrgang 9–10) */
    public static readonly isBloecklyApp: boolean = Constants.Application === 6;
    /** Anwendungen im Blockmodus: Blöckva (4) und Blöckly (6) */
    public static readonly isBlocksApp: boolean = Constants.Application === 4 || Constants.isBloecklyApp;
    /** 5 = Anwendung "Struktogramme" (dieselbe IDE unter /struktogramme/, eigene Projektliste) */
    public static readonly isStructogramApp: boolean = Constants.Application === 5;
    /** Name der Anwendung beim Server (Startseite, Einmal-Anmeldung, IServ) */
    public static readonly appName: "java" | "bloecke" | "struktogramme" | "bloeckly" =
        Constants.Application === 4 ? "bloecke" : Constants.Application === 5 ? "struktogramme"
            : Constants.Application === 6 ? "bloeckly" : "java";

}
