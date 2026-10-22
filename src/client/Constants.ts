export class Constants {
    /**
     * 1 = Java-IDE; 4 = Anwendung "Blöcke" (dieselbe IDE unter /bloecke/, Blockmodus, eigene
     * Projektliste – Erweiterung des GSG)
     */
    public static readonly Application: 1 | 4 | 5 = typeof location === "undefined" ? 1
        : /^\/bloecke(\/|$)/.test(location.pathname) ? 4
        : /^\/struktogramme(\/|$)/.test(location.pathname) ? 5 : 1;
    public static readonly isBlocksApp: boolean = Constants.Application === 4;
    /** 5 = Anwendung "Struktogramme" (dieselbe IDE unter /struktogramme/, eigene Projektliste) */
    public static readonly isStructogramApp: boolean = Constants.Application === 5;

}
