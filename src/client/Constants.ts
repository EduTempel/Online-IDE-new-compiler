export class Constants {
    /**
     * 1 = Java-IDE; 4 = Anwendung "Blöcke" (dieselbe IDE unter /bloecke/, Blockmodus, eigene
     * Projektliste – Erweiterung des GSG)
     */
    public static readonly Application: 1 | 4 = (typeof location !== "undefined" && /^\/bloecke(\/|$)/.test(location.pathname)) ? 4 : 1;
    public static readonly isBlocksApp: boolean = Constants.Application === 4;

}
