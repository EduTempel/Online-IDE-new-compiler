import type { AccordionElement } from "../../../tools/components/treeview/AccordionElement.js";

/**
 * GSG: linke Spalte entlasten – Bereiche, die noch nichts zeigen können (z. B. „Schüler/-innen“, solange keine Klasse
 * gewählt ist), sind eingeklappt und klappen auf, sobald es Inhalt gibt. Der Kopf mit dem Pfeil bleibt sichtbar,
 * man kann also jederzeit selbst auf- und zuklappen.
 */
export function bereichEinklappen(bereich: AccordionElement | undefined, eingeklappt: boolean) {
    const schalter = bereich?.captionLineExpandCollapseComponent;
    if (!schalter) return;
    const ziel = eingeklappt ? "collapsed" : "expanded";
    if (schalter.state !== ziel) schalter.setState(ziel, true);   // true: Inhalt aus-/einblenden und Höhen neu verteilen
}
