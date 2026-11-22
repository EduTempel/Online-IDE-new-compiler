import { Constants } from "../Constants";

/**
 * Tooltips je Anwendung (GSG): Blöckly (Sekundarbereich I) und Blöckva zeigen kein Java; nur der Blockmodus
 * von Texva hängt „Texva: …“ an (für Neugierige und Lehrkräfte). Blöckly kann einen eigenen, einfacheren
 * Text bekommen (Skripte und eigene Blöcke statt Programmteile und Operationen).
 */
let app: number = Constants.Application;

/** nur für Tests: Tooltips für eine andere Anwendung erzeugen (vor dem Definieren der Blöcke aufrufen) */
export function setTooltipApp(a: 1 | 4 | 6) {
    app = a;
}

/** Steht Java in den Tooltips? (nur in Texva) */
export const javaInTooltips = () => app !== 4 && app !== 6;

/** text: für alle; java: nur in Texva angehängt; bloeckly: statt text in Blöckly */
export function tip(text: string, java?: string, bloeckly?: string): string {
    if (app === 6 && bloeckly) return bloeckly;
    return java && javaInTooltips() ? `${text}\nCode: ${java}` : text;
}
