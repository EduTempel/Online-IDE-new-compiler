import * as PIXI from 'pixi.js';
import { CallbackParameter } from "../../../common/interpreter/CallbackParameter";
import type { PartOwner } from "../../../common/interpreter/GsgParts";
import type { Interpreter } from "../../../common/interpreter/Interpreter";
import { SchedulerState } from "../../../common/interpreter/SchedulerState";
import { Thread } from "../../../common/interpreter/Thread";
import { ThreadState } from "../../../common/interpreter/ThreadState";
import { LibraryDeclarations } from "../../module/libraries/DeclareType";
import { NonPrimitiveType } from "../../types/NonPrimitiveType";
import { ObjectClass } from "../system/javalang/ObjectClassStringClass";
import { RuntimeExceptionClass } from "../system/javalang/RuntimeException";
import { BuehneClass, klassenVon, text, type BuehnenFigur } from "./BuehneClass";
import {
    abgeprallt, ansichtZurRichtung, ausGrafik, beruehrtRand, bilddrehung, BUEHNE_BREITE, BUEHNE_HOEHE, DREHSTILE,
    drehstilAus, eingezaeunt, type FigurZustand, gerundet, Kostueme, neuerZustand, richtungNach, richtungNormal,
    ueberlappen, umriss, zurGrafik,
} from "./GsgBuehnenLogik";
import { GSG_FIGUR_GROESSE, GSG_FIGUREN } from "./GsgFigurenLibrary";
import { MouseClass } from "./MouseClass";
import { SpeechBubble } from "./SpeechBubble";
import { SpriteClass } from "./SpriteClass";

/** höchstens so viele Klone gleichzeitig (wie Scratch) */
export const MAX_KLONE = 300;

/**
 * Blöckly (Paket 18c): eine Figur wie in Scratch. Jede Figur eines Projekts ist eine eigene Klasse
 * (class Waschbaer extends Figur), ihre Skripte sind Methoden mit @BeimStart, @WennTaste("…"), @WennNachricht("…"),
 * @WennAngeklickt (diese Figur) und @WennIchAlsKlonEntstehe. Die Methoden hier sind die Blöcke von Bewegung,
 * Aussehen, Fühlen und Steuerung; gemeint ist immer diese Figur.
 *
 * Koordinaten wie in Scratch (Bühne 480 × 360, Mitte (0 | 0), y nach oben), Richtung 90 = nach rechts. Die Figur
 * dreht sich nicht, sondern zeigt das Kostüm zur Blickrichtung (vorne, rechts, links, hinten); „laufen 1“ ist je
 * nach Richtung das passende Bild. Rechnungen: GsgBuehnenLogik; gezeichnet wird mit einem Sprite der IDE.
 */
export class FigurClass extends ObjectClass implements PartOwner, BuehnenFigur {
    static __javaDeclarations: LibraryDeclarations = [
        { type: "declaration", signature: "class Figur extends Object", comment: "Eine Figur auf der Bühne (wie in Scratch). Eigene Figuren sind Unterklassen: class Waschbaer extends Figur. Koordinaten: Bühne 480 × 360, Mitte (0 | 0), y nach oben; Richtung 90 = nach rechts." },
        { type: "method", signature: "Figur()", java: FigurClass.prototype._cj$_constructor_$Figur$, comment: "Erzeugt die Figur in der Mitte der Bühne. Das Aussehen richtet sich nach dem Namen der Klasse (Waschbaer, RoterPanda, Roboter, Axolotl, Pinguin), sonst Waschbär." },
        { type: "method", signature: "Figur(string figur)", java: FigurClass.prototype._cj$_constructor_$Figur$string, comment: "Erzeugt die Figur in der Mitte der Bühne mit diesem Aussehen: Waschbaer, RoterPanda, Roboter, Axolotl oder Pinguin." },
        { type: "method", signature: "Figur(string figur, double x, double y)", java: FigurClass.prototype._cj$_constructor_$Figur$string$double$double, comment: "Erzeugt die Figur an der Stelle (x | y) mit diesem Aussehen: Waschbaer, RoterPanda, Roboter, Axolotl oder Pinguin." },

        // Bewegung
        { type: "method", signature: "void gehe(double schritte)", native: FigurClass.prototype._gehe, comment: "Geht so viele Schritte in die aktuelle Richtung und schaut dabei in diese Richtung." },
        { type: "method", signature: "void dreheRechts(double grad)", native: FigurClass.prototype._dreheRechts, comment: "Dreht die Richtung um so viele Grad im Uhrzeigersinn ↻." },
        { type: "method", signature: "void dreheLinks(double grad)", native: FigurClass.prototype._dreheLinks, comment: "Dreht die Richtung um so viele Grad gegen den Uhrzeigersinn ↺." },
        { type: "method", signature: "void zeigeInRichtung(double grad)", native: FigurClass.prototype._zeigeInRichtung, comment: "Setzt die Richtung: 90 = nach rechts, -90 = nach links, 0 = nach oben, 180 = nach unten." },
        { type: "method", signature: "void zeigeAuf(Figur figur)", native: FigurClass.prototype._zeigeAuf, comment: "Dreht die Richtung zu dieser Figur hin." },
        { type: "method", signature: "void zeigeAuf(string figur)", native: FigurClass.prototype._zeigeAufFigurMitNamen, comment: "Dreht die Richtung zur Figur mit diesem Namen hin (Name der Klasse, z. B. \"Pinguin\")." },
        { type: "method", signature: "void zeigeAufMauszeiger()", native: FigurClass.prototype._zeigeAufMauszeiger, comment: "Dreht die Richtung zum Mauszeiger hin." },
        { type: "method", signature: "void geheZu(double x, double y)", native: FigurClass.prototype._geheZu, comment: "Springt an die Stelle (x | y)." },
        { type: "method", signature: "void geheZu(Figur figur)", native: FigurClass.prototype._geheZuFigur, comment: "Springt an die Stelle dieser Figur." },
        { type: "method", signature: "void geheZu(string figur)", native: FigurClass.prototype._geheZuFigurMitNamen, comment: "Springt an die Stelle der Figur mit diesem Namen (Name der Klasse, z. B. \"Pinguin\")." },
        { type: "method", signature: "void geheZuMauszeiger()", native: FigurClass.prototype._geheZuMauszeiger, comment: "Springt an die Stelle des Mauszeigers." },
        { type: "method", signature: "void geheZuZufaelligerPosition()", native: FigurClass.prototype._geheZuZufaelligerPosition, comment: "Springt an eine zufällige Stelle der Bühne." },
        { type: "method", signature: "void gleite(double sekunden, double x, double y)", java: FigurClass.prototype._mj$gleite$void$double$double$double, comment: "Gleitet in so vielen Sekunden gleichmäßig an die Stelle (x | y)." },
        { type: "method", signature: "void aendereXUm(double dx)", native: FigurClass.prototype._aendereXUm, comment: "Ändert x um diesen Wert (positiv: nach rechts)." },
        { type: "method", signature: "void setzeX(double x)", native: FigurClass.prototype._setzeX, comment: "Setzt x auf diesen Wert (-240 links bis 240 rechts)." },
        { type: "method", signature: "void aendereYUm(double dy)", native: FigurClass.prototype._aendereYUm, comment: "Ändert y um diesen Wert (positiv: nach oben)." },
        { type: "method", signature: "void setzeY(double y)", native: FigurClass.prototype._setzeY, comment: "Setzt y auf diesen Wert (-180 unten bis 180 oben)." },
        { type: "method", signature: "void pralleVomRandAb()", native: FigurClass.prototype._pralleVomRandAb, comment: "Berührt die Figur den Rand, prallt sie ab: Die Richtung wird gespiegelt, und die Figur kommt ganz auf die Bühne zurück." },
        { type: "method", signature: "void setzeDrehstil(string drehstil)", native: FigurClass.prototype._setzeDrehstil, comment: "Wie die Richtung das Aussehen ändert: \"Blickrichtung\" (Kostüm nach vorne, rechts, links oder hinten; Standard), \"links-rechts\", \"rundherum\" (Bild dreht sich) oder \"nicht drehen\"." },
        { type: "method", signature: "double xPosition()", native: FigurClass.prototype._xPosition, comment: "x-Koordinate der Figur." },
        { type: "method", signature: "double yPosition()", native: FigurClass.prototype._yPosition, comment: "y-Koordinate der Figur." },
        { type: "method", signature: "double richtung()", native: FigurClass.prototype._richtung, comment: "Richtung der Figur in Grad (90 = nach rechts)." },

        // Aussehen
        { type: "method", signature: "void sage(string text)", native: FigurClass.prototype._sage, comment: "Zeigt eine Sprechblase mit diesem Text. Sie bleibt, bis die Figur etwas anderes sagt; sage(\"\") entfernt sie." },
        { type: "method", signature: "void sage(double zahl)", native: FigurClass.prototype._sage, comment: "Zeigt eine Sprechblase mit dieser Zahl." },
        { type: "method", signature: "void sage(string text, double sekunden)", java: FigurClass.prototype._mj$sage$void$string$double, comment: "Zeigt eine Sprechblase mit diesem Text, wartet so viele Sekunden und entfernt sie dann." },
        { type: "method", signature: "void denke(string text)", native: FigurClass.prototype._denke, comment: "Zeigt eine Denkblase mit diesem Text; denke(\"\") entfernt sie." },
        { type: "method", signature: "void sage(double zahl, double sekunden)", java: FigurClass.prototype._mj$sage$void$double$double, comment: "Zeigt eine Sprechblase mit dieser Zahl, wartet so viele Sekunden und entfernt sie dann." },
        { type: "method", signature: "void denke(double zahl)", native: FigurClass.prototype._denke, comment: "Zeigt eine Denkblase mit dieser Zahl." },
        { type: "method", signature: "void denke(double zahl, double sekunden)", java: FigurClass.prototype._mj$denke$void$double$double, comment: "Zeigt eine Denkblase mit dieser Zahl, wartet so viele Sekunden und entfernt sie dann." },
        { type: "method", signature: "void denke(string text, double sekunden)", java: FigurClass.prototype._mj$denke$void$string$double, comment: "Zeigt eine Denkblase mit diesem Text, wartet so viele Sekunden und entfernt sie dann." },
        { type: "method", signature: "void wechsleZuKostuem(string kostuem)", native: FigurClass.prototype._wechsleZuKostuem, comment: "Wechselt das Kostüm, z. B. \"stehen\", \"laufen 1\" … \"laufen 4\", \"winken\". Die Ansicht folgt der Richtung; mit \"vorne stehen\", \"rechts laufen 2\" … wählst du sie selbst." },
        { type: "method", signature: "void naechstesKostuem()", native: FigurClass.prototype._naechstesKostuem, comment: "Wechselt zum nächsten Kostüm. Beim Laufen folgt das nächste Laufbild (laufen 4 → laufen 1) – gut für Laufanimationen." },
        { type: "method", signature: "string kostuemName()", native: FigurClass.prototype._kostuemName, comment: "Name des Kostüms, z. B. \"laufen 1\"." },
        { type: "method", signature: "void wechsleZuBuehnenbild(string name)", native: FigurClass.prototype._wechsleZuBuehnenbild, comment: "Zeigt dieses Bühnenbild: Wiese, Wald, Stadt, Schulhof, Weltraum oder Unterwasser." },
        { type: "method", signature: "void naechstesBuehnenbild()", native: FigurClass.prototype._naechstesBuehnenbild, comment: "Zeigt das nächste Bühnenbild." },
        { type: "method", signature: "void aendereGroesseUm(double prozent)", native: FigurClass.prototype._aendereGroesseUm, comment: "Ändert die Größe um so viele Prozentpunkte." },
        { type: "method", signature: "void setzeGroesse(double prozent)", native: FigurClass.prototype._setzeGroesse, comment: "Setzt die Größe in Prozent (100 = normal)." },
        { type: "method", signature: "double groesse()", native: FigurClass.prototype._groesse, comment: "Größe der Figur in Prozent." },
        { type: "method", signature: "void zeige()", native: FigurClass.prototype._zeige, comment: "Zeigt die Figur." },
        { type: "method", signature: "void verstecke()", native: FigurClass.prototype._verstecke, comment: "Versteckt die Figur. Versteckte Figuren berühren nichts und lassen sich nicht anklicken." },
        { type: "method", signature: "void geheGanzNachVorne()", native: FigurClass.prototype._geheGanzNachVorne, comment: "Legt die Figur vor alle anderen." },
        { type: "method", signature: "void geheGanzNachHinten()", native: FigurClass.prototype._geheGanzNachHinten, comment: "Legt die Figur hinter alle anderen (vor das Bühnenbild)." },

        // Fühlen
        { type: "method", signature: "boolean beruehrt(Figur figur)", native: FigurClass.prototype._beruehrt, comment: "Wahr, wenn diese Figur die andere berührt (beide sichtbar)." },
        { type: "method", signature: "boolean beruehrt(string figur)", native: FigurClass.prototype._beruehrtFigurMitNamen, comment: "Wahr, wenn diese Figur eine Figur mit diesem Namen berührt (Name der Klasse, z. B. \"Pinguin\"; auch jeden ihrer Klone)." },
        { type: "method", signature: "boolean beruehrtRand()", native: FigurClass.prototype._beruehrtRand, comment: "Wahr, wenn die Figur den Rand der Bühne berührt." },
        { type: "method", signature: "boolean beruehrtMauszeiger()", native: FigurClass.prototype._beruehrtMauszeiger, comment: "Wahr, wenn der Mauszeiger auf der Figur ist." },
        { type: "method", signature: "double abstandZu(Figur figur)", native: FigurClass.prototype._abstandZu, comment: "Abstand zur anderen Figur (von Mitte zu Mitte)." },
        { type: "method", signature: "double abstandZu(string figur)", native: FigurClass.prototype._abstandZuFigurMitNamen, comment: "Abstand zur Figur mit diesem Namen (Name der Klasse, z. B. \"Pinguin\"; von Mitte zu Mitte)." },
        { type: "method", signature: "double abstandZuMauszeiger()", native: FigurClass.prototype._abstandZuMauszeiger, comment: "Abstand zum Mauszeiger." },
        { type: "method", signature: "double mausX()", native: FigurClass.prototype._mausX, comment: "x-Koordinate des Mauszeigers auf der Bühne." },
        { type: "method", signature: "double mausY()", native: FigurClass.prototype._mausY, comment: "y-Koordinate des Mauszeigers auf der Bühne." },
        { type: "method", signature: "boolean mausGedrueckt()", native: FigurClass.prototype._mausGedrueckt, comment: "Wahr, solange die Maustaste über der Bühne gedrückt ist." },
        { type: "method", signature: "boolean tasteGedrueckt(string taste)", native: FigurClass.prototype._tasteGedrueckt, comment: "Wahr, solange diese Taste gedrückt ist, z. B. \"ArrowUp\", \" \" (Leertaste) oder \"a\"." },
        { type: "method", signature: "double stoppuhr()", native: FigurClass.prototype._stoppuhr, comment: "Sekunden seit dem Start der Bühne oder seit setzeStoppuhrZurueck()." },
        { type: "method", signature: "void setzeStoppuhrZurueck()", native: FigurClass.prototype._setzeStoppuhrZurueck, comment: "Setzt die Stoppuhr auf 0." },

        // Steuerung
        { type: "method", signature: "void warte(double sekunden)", java: FigurClass.prototype._mj$warte$void$double, comment: "Wartet so viele Sekunden." },
        { type: "method", signature: "void erzeugeKlon()", java: FigurClass.prototype._mj$erzeugeKlon$void$, comment: "Erzeugt einen Klon dieser Figur: gleiche Stelle, gleiches Aussehen, eigene Kopie der Attribute. Im Klon startet @WennIchAlsKlonEntstehe." },
        { type: "method", signature: "void erzeugeKlonVon(string figur)", java: FigurClass.prototype._mj$erzeugeKlonVon$void$string, comment: "Erzeugt einen Klon der Figur mit diesem Namen (Name ihrer Klasse, z. B. \"Pinguin\")." },
        { type: "method", signature: "void loescheDiesenKlon()", java: FigurClass.prototype._mj$loescheDiesenKlon$void$, comment: "Entfernt diesen Klon und beendet seine Skripte. Beim Original geschieht nichts." },
        { type: "method", signature: "void stoppeAndereSkripteDieserFigur()", java: FigurClass.prototype._mj$stoppeAndereSkripteDieserFigur$void$, comment: "Beendet die anderen laufenden Skripte dieser Figur; dieses läuft weiter." },
        { type: "method", signature: "void stoppeAlles()", java: FigurClass.prototype._mj$stoppeAlles$void$, comment: "Beendet das ganze Programm (wie der Stopp-Knopf)." },
    ];

    static type: NonPrimitiveType;

    figInterpreter!: Interpreter;
    figBuehne!: BuehneClass;
    figKostueme!: Kostueme;
    figZustand: FigurZustand = neuerZustand();
    figSprite?: SpriteClass;
    figEbene = 0;
    figIstKlon = false;
    figGeloescht = false;
    /** beim letzten Zeichnen sichtbar – auch Verstecken und Löschen brauchen ein neues Bild */
    figZuletztSichtbar = false;
    /** was die Figur gerade sagt oder denkt (auch ohne Grafik) */
    figBlase?: { text: string; denken: boolean };

    // —— Konstruktoren ——

    _cj$_constructor_$Figur$(t: Thread, callback: CallbackParameter) {
        this._cj$_constructor_$Figur$string$double$double(t, callback, "", 0, 0);
    }

    _cj$_constructor_$Figur$string(t: Thread, callback: CallbackParameter, figur: string) {
        this._cj$_constructor_$Figur$string$double$double(t, callback, figur, 0, 0);
    }

    _cj$_constructor_$Figur$string$double$double(t: Thread, callback: CallbackParameter, figur: string, x: number, y: number) {
        t.s.push(this);
        const name = text(figur) || this.figNameAusKlasse();
        const kostueme = Kostueme.fuer(name);
        if (!kostueme) throw new RuntimeExceptionClass(`Eine Figur „${name}“ gibt es nicht. Figuren: ${Kostueme.alleFiguren().map((f) => f.name).join(", ")}.`);
        this.figKostueme = kostueme;
        this.figInterpreter = t.scheduler.interpreter;
        this.figZustand = neuerZustand();
        this.figPosition(x, y);
        BuehneClass.sicher(t, (buehne) => {
            this.figBuehne = buehne;
            buehne.figurHinzu(this);
            const fertig = () => {
                // eine Figur ohne eigene Klasse meldet sich selbst an (sonst: _registerListeners nach dem Konstruktor)
                if (this.constructor === FigurClass) this.figAnmelden(t, false);
                if (callback) callback();
            };
            if (buehne.world) this.figErzeugeSprite(t, fertig);
            else fertig();
        });
    }

    /** nach dem Konstruktor einer Figurenklasse (TermCodeGenerator): Programmteile anmelden */
    _registerListeners(t: Thread) {
        this.figAnmelden(t, false);
    }

    private figAnmelden(t: Thread, klon: boolean) {
        t.scheduler.interpreter.parts?.registerObject(this, klassenVon(this, FigurClass), klon);
    }

    /** Aussehen aus dem Namen der Klasse (class Pinguin extends Figur), sonst Waschbär */
    private figNameAusKlasse(): string {
        for (let c = this.constructor as (Function & { type?: { identifier?: string } }) | undefined; c && c !== FigurClass; c = Object.getPrototypeOf(c)) {
            const id = c.type?.identifier;
            if (id && Kostueme.fuer(id)) return id;
        }
        return GSG_FIGUREN[0].name;
    }

    /** Name für „berührt …“ und „erzeuge Klon von …“: Name der Klasse, bei Figur selbst die Bibliotheksfigur */
    figName(): string {
        const id = (this.constructor as { type?: { identifier?: string } }).type?.identifier;
        return this.constructor === FigurClass || !id ? this.figKostueme.figur.name : id;
    }

    private figErzeugeSprite(t: Thread, fertig: () => void) {
        const sprite = new SpriteClass();
        const p = zurGrafik(this.figZustand.x, this.figZustand.y);
        const z = this.figZustand;
        sprite._cj$_constructor_$Sprite$double$double$SpriteLibrary$int(t, () => {
            t.s.pop();
            this.figSprite = sprite;
            this.figZeichne();
            fertig();
        }, p.x, p.y, this.figKostueme.figur.name, this.figKostueme.bildnummer(z.ansicht, z.pose));
    }

    // —— zeichnen ——

    /** Sprite der IDE auf den Stand der Figur bringen: Kostüm, Stelle, Größe, Drehung, sichtbar */
    figZeichne() {
        // Bildtakt (wie Scratch): nur Sichtbares braucht ein neues Bild
        const sichtbar = this.figZustand.sichtbar && !this.figGeloescht;
        if (sichtbar || this.figZuletztSichtbar) this.figBuehne?.bildAnfordern();
        this.figZuletztSichtbar = sichtbar;
        const sprite = this.figSprite;
        if (!sprite || sprite.isDestroyed || sprite.container?.destroyed) return;
        const z = this.figZustand;
        sprite.setTexture(this.figKostueme.figur.name, this.figKostueme.bildnummer(z.ansicht, z.pose));
        const c = sprite.container as PIXI.Sprite;
        const w = c.texture.width, h = c.texture.height;
        const f = z.groesse / 100;
        const p = zurGrafik(z.x, z.y);
        const m = new PIXI.Matrix().translate(-w / 2, -h / 2).scale(f, f).rotate(bilddrehung(z) * Math.PI / 180).translate(p.x, p.y);
        c.setFromMatrix(m);
        sprite.hitPolygonDirty = true;
        c.visible = z.sichtbar && !this.figGeloescht;
    }

    private figPosition(x: number, y: number) {
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        const p = eingezaeunt(this.figZustand, x, y);
        this.figZustand.x = p.x;
        this.figZustand.y = p.y;
        this.figZeichne();
    }

    private figRichtung(grad: number) {
        if (!Number.isFinite(grad)) return;
        this.figZustand.richtung = richtungNormal(grad);
        this.figAnsichtNachRichtung();
        this.figZeichne();
    }

    private figAnsichtNachRichtung() {
        const a = ansichtZurRichtung(this.figZustand.richtung, this.figZustand.drehstil);
        if (a) this.figZustand.ansicht = a;
    }

    // —— Bewegung ——

    _gehe(schritte: number) {
        const rad = (90 - this.figZustand.richtung) * Math.PI / 180;
        this.figAnsichtNachRichtung();
        this.figPosition(this.figZustand.x + schritte * Math.cos(rad), this.figZustand.y + schritte * Math.sin(rad));
    }

    _dreheRechts(grad: number) {
        this.figRichtung(this.figZustand.richtung + grad);
    }

    _dreheLinks(grad: number) {
        this.figRichtung(this.figZustand.richtung - grad);
    }

    _zeigeInRichtung(grad: number) {
        this.figRichtung(grad);
    }

    _zeigeAuf(figur: FigurClass | null) {
        if (!figur || figur === this) return;
        this.figRichtung(richtungNach(this.figZustand.x, this.figZustand.y, figur.figZustand.x, figur.figZustand.y));
    }

    /** Figur mit diesem Namen (Klasse): das Original, sonst ein Klon; nie diese Figur selbst */
    private figAndere(name: string): FigurClass | null {
        const alle = this.figBuehne.figurenMitNamen(text(name)).filter((f) => f !== this) as FigurClass[];
        return alle.find((f) => !f.figIstKlon) ?? alle[0] ?? null;
    }

    _zeigeAufFigurMitNamen(name: string) {
        this._zeigeAuf(this.figAndere(name));
    }

    _zeigeAufMauszeiger() {
        const m = BuehneClass.maus();
        this.figRichtung(richtungNach(this.figZustand.x, this.figZustand.y, m.x, m.y));
    }

    _geheZu(x: number, y: number) {
        this.figPosition(x, y);
    }

    _geheZuFigur(figur: FigurClass | null) {
        if (figur) this.figPosition(figur.figZustand.x, figur.figZustand.y);
    }

    _geheZuFigurMitNamen(name: string) {
        this._geheZuFigur(this.figAndere(name));
    }

    _geheZuMauszeiger() {
        const m = BuehneClass.maus();
        this.figPosition(m.x, m.y);
    }

    _geheZuZufaelligerPosition() {
        this.figPosition(Math.round(BUEHNE_BREITE * (Math.random() - 0.5)), Math.round(BUEHNE_HOEHE * (Math.random() - 0.5)));
    }

    _mj$gleite$void$double$double$double(t: Thread, callback: CallbackParameter, sekunden: number, x: number, y: number) {
        const dauer = Math.max(0, sekunden) * 1000;
        const x0 = this.figZustand.x, y0 = this.figZustand.y;
        if (dauer === 0) {
            this.figPosition(x, y);
            if (callback) callback();
            return;
        }
        const start = performance.now();
        t.scheduler.suspendThread(t);
        t.state = ThreadState.timedWaiting;
        const schritt = () => {
            if (t.state >= ThreadState.terminated || t.scheduler.state === SchedulerState.stopped) return;
            const anteil = Math.min(1, (performance.now() - start) / dauer);
            this.figPosition(x0 + (x - x0) * anteil, y0 + (y - y0) * anteil);
            if (anteil >= 1) t.scheduler.restoreThread(t);
            else setTimeout(schritt, 16);
        };
        setTimeout(schritt, 16);
        if (callback) callback();
    }

    _aendereXUm(dx: number) {
        this.figPosition(this.figZustand.x + dx, this.figZustand.y);
    }

    _setzeX(x: number) {
        this.figPosition(x, this.figZustand.y);
    }

    _aendereYUm(dy: number) {
        this.figPosition(this.figZustand.x, this.figZustand.y + dy);
    }

    _setzeY(y: number) {
        this.figPosition(this.figZustand.x, y);
    }

    _pralleVomRandAb() {
        const neu = abgeprallt(this.figZustand);
        if (!neu) return;
        this.figZustand.richtung = neu.richtung;
        this.figZustand.x = neu.x;
        this.figZustand.y = neu.y;
        this.figAnsichtNachRichtung();
        this.figZeichne();
    }

    _setzeDrehstil(name: string) {
        const stil = drehstilAus(text(name));
        if (!stil) throw new RuntimeExceptionClass(`Einen Drehstil „${text(name)}“ gibt es nicht. Drehstile: Blickrichtung, ${DREHSTILE.slice(1).join(", ")}.`);
        this.figZustand.drehstil = stil;
        this.figAnsichtNachRichtung();
        this.figZeichne();
    }

    _xPosition(): number {
        return gerundet(this.figZustand.x);
    }

    _yPosition(): number {
        return gerundet(this.figZustand.y);
    }

    _richtung(): number {
        return gerundet(this.figZustand.richtung);
    }

    // —— Aussehen ——

    private figSage(inhalt: unknown, denken: boolean) {
        const t = typeof inhalt === "number" ? String(inhalt) : text(inhalt);
        if (this.figGeloescht) return;
        this.figBlase = t === "" ? undefined : { text: t, denken };
        if (this.figZustand.sichtbar) this.figBuehne?.bildAnfordern();
        const sprite = this.figSprite;
        if (!sprite || sprite.isDestroyed) return;
        if (t === "") {
            sprite.speechBubble?.remove();
            return;
        }
        if (!sprite.speechBubble) sprite.speechBubble = new SpeechBubble(sprite);
        sprite.speechBubble.say(t, denken);
    }

    private figSageFuer(t: Thread, callback: CallbackParameter, inhalt: unknown, sekunden: number, denken: boolean) {
        this.figSage(inhalt, denken);
        const blase = this.figBlase;
        t.scheduler.suspendThread(t);
        t.state = ThreadState.timedWaiting;
        setTimeout(() => {
            if (blase && this.figBlase === blase) this.figSage("", denken);
            t.scheduler.restoreThread(t);
        }, Math.max(0, sekunden) * 1000);
        if (callback) callback();
    }

    _sage(inhalt: unknown) {
        this.figSage(inhalt, false);
    }

    _mj$sage$void$string$double(t: Thread, callback: CallbackParameter, inhalt: string, sekunden: number) {
        this.figSageFuer(t, callback, inhalt, sekunden, false);
    }

    _mj$sage$void$double$double(t: Thread, callback: CallbackParameter, inhalt: number, sekunden: number) {
        this.figSageFuer(t, callback, inhalt, sekunden, false);
    }

    _mj$denke$void$double$double(t: Thread, callback: CallbackParameter, inhalt: number, sekunden: number) {
        this.figSageFuer(t, callback, inhalt, sekunden, true);
    }

    _denke(inhalt: unknown) {
        this.figSage(inhalt, true);
    }

    _mj$denke$void$string$double(t: Thread, callback: CallbackParameter, inhalt: string, sekunden: number) {
        this.figSageFuer(t, callback, inhalt, sekunden, true);
    }

    _wechsleZuKostuem(name: string) {
        const k = this.figKostueme.lese(text(name));
        if (!k) throw new RuntimeExceptionClass(`Ein Kostüm „${text(name)}“ hat ${this.figKostueme.figur.titel} nicht. Kostüme: ${this.figKostueme.alleTitel().join(", ")}; dazu mit Ansicht, z. B. „vorne stehen“, „rechts laufen 1“.`);
        if (k.ansicht) this.figZustand.ansicht = k.ansicht;
        this.figZustand.pose = k.pose;
        this.figZeichne();
    }

    _naechstesKostuem() {
        this.figZustand.pose = this.figKostueme.naechste(this.figZustand.ansicht, this.figZustand.pose);
        this.figZeichne();
    }

    _kostuemName(): string {
        return Kostueme.titel(this.figKostueme.gezeigtePose(this.figZustand.ansicht, this.figZustand.pose));
    }

    _wechsleZuBuehnenbild(name: string) {
        this.figBuehne._wechsleZuBuehnenbild(name);
    }

    _naechstesBuehnenbild() {
        this.figBuehne._naechstesBuehnenbild();
    }

    _setzeGroesse(prozent: number) {
        if (!Number.isFinite(prozent)) return;
        // Grenzen wie in Scratch: mindestens 5 Punkte groß, höchstens anderthalb Bühnen
        const { breite, hoehe } = GSG_FIGUR_GROESSE;
        const min = Math.min(1, Math.max(5 / breite, 5 / hoehe)) * 100;
        const max = Math.min(1.5 * BUEHNE_BREITE / breite, 1.5 * BUEHNE_HOEHE / hoehe) * 100;
        this.figZustand.groesse = Math.min(max, Math.max(min, prozent));
        this.figPosition(this.figZustand.x, this.figZustand.y);
    }

    _aendereGroesseUm(prozent: number) {
        this._setzeGroesse(this.figZustand.groesse + prozent);
    }

    _groesse(): number {
        return gerundet(this.figZustand.groesse);
    }

    _zeige() {
        this.figZustand.sichtbar = true;
        this.figZeichne();
    }

    _verstecke() {
        this.figZustand.sichtbar = false;
        this.figZeichne();
    }

    _geheGanzNachVorne() {
        this.figBuehne.nachVorne(this);
        if (this.figSprite && !this.figSprite.isDestroyed) this.figSprite._bringToFront();
    }

    _geheGanzNachHinten() {
        if (this.figSprite && !this.figSprite.isDestroyed) this.figSprite._sendToBack();
        this.figBuehne.nachHinten(this);
    }

    // —— Fühlen ——

    private figSichtbar(): boolean {
        return this.figZustand.sichtbar && !this.figGeloescht;
    }

    _beruehrt(andere: FigurClass | null): boolean {
        if (!andere || andere === this || !this.figSichtbar() || !andere.figSichtbar()) return false;
        if (this.figSprite && andere.figSprite) return this.figSprite._collidesWith(andere.figSprite);
        return ueberlappen(umriss(this.figZustand), umriss(andere.figZustand));
    }

    _beruehrtFigurMitNamen(name: string): boolean {
        return this.figBuehne.figurenMitNamen(text(name)).some((f) => this._beruehrt(f as FigurClass));
    }

    _beruehrtRand(): boolean {
        return this.figSichtbar() && beruehrtRand(umriss(this.figZustand));
    }

    _beruehrtMauszeiger(): boolean {
        if (!MouseClass.state.inside) return false;
        return this.gsgPartsHit(MouseClass.state.x, MouseClass.state.y);
    }

    _abstandZu(andere: FigurClass | null): number {
        if (!andere) return 10000;
        return Math.hypot(andere.figZustand.x - this.figZustand.x, andere.figZustand.y - this.figZustand.y);
    }

    _abstandZuFigurMitNamen(name: string): number {
        return this._abstandZu(this.figAndere(name));
    }

    _abstandZuMauszeiger(): number {
        const m = BuehneClass.maus();
        return Math.hypot(m.x - this.figZustand.x, m.y - this.figZustand.y);
    }

    _mausX(): number {
        return BuehneClass.maus().x;
    }

    _mausY(): number {
        return BuehneClass.maus().y;
    }

    _mausGedrueckt(): boolean {
        return MouseClass.state.down;
    }

    _tasteGedrueckt(taste: string): boolean {
        return !!this.figInterpreter?.keyboardManager?.isPressed?.(text(taste));
    }

    _stoppuhr(): number {
        return this.figBuehne._stoppuhr();
    }

    _setzeStoppuhrZurueck() {
        this.figBuehne._setzeStoppuhrZurueck();
    }

    // —— Steuerung ——

    _mj$warte$void$double(t: Thread, callback: CallbackParameter, sekunden: number) {
        BuehneClass.warte(t, sekunden);
        if (callback) callback();
    }

    _mj$erzeugeKlon$void$(t: Thread, callback: CallbackParameter) {
        this.figKlonen(t, callback);
    }

    _mj$erzeugeKlonVon$void$string(t: Thread, callback: CallbackParameter, name: string) {
        this.figBuehne.klonVon(t, callback, text(name));
    }

    /**
     * Klon: neues Objekt derselben Klasse ohne Konstruktor, mit Kopien der Attribute (wie in Scratch die
     * Variablen „nur für diese Figur“), an derselben Stelle, direkt hinter dem Original
     */
    figKlonen(t: Thread, callback: CallbackParameter) {
        if (this.figGeloescht || this.figBuehne.anzahlKlone() >= MAX_KLONE) {
            if (callback) callback();
            return;
        }
        const Klasse = this.constructor as new () => FigurClass;
        const klon = new Klasse();
        for (const key of Object.keys(this)) {
            if (key.startsWith("$f_")) (klon as unknown as Record<string, unknown>)[key] = (this as unknown as Record<string, unknown>)[key];
        }
        klon.figInterpreter = this.figInterpreter;
        klon.figKostueme = this.figKostueme;
        klon.figZustand = { ...this.figZustand };
        klon.figIstKlon = true;
        this.figBuehne.figurHinzu(klon);
        klon.figBuehne = this.figBuehne;
        klon.figEbene = this.figEbene - 0.001;
        const fertig = () => {
            klon.figAnmelden(t, true);
            if (callback) callback();
        };
        if (!this.figSprite) {
            fertig();
            return;
        }
        klon.figErzeugeSprite(t, () => {
            // direkt hinter das Original
            try {
                const stage = this.figSprite!.container.parent;
                if (stage && klon.figSprite) stage.setChildIndex(klon.figSprite.container, stage.getChildIndex(this.figSprite!.container));
            } catch {
                // Ebene ist nicht wichtig genug für einen Fehler
            }
            fertig();
        });
    }

    _mj$loescheDiesenKlon$void$(t: Thread, callback: CallbackParameter) {
        if (!this.figIstKlon || this.figGeloescht) {
            if (callback) callback();
            return;
        }
        this.figGeloescht = true;
        this.figBlase = undefined;
        this.figBuehne.figurWeg(this);
        const sprite = this.figSprite;
        if (sprite && !sprite.isDestroyed) {
            sprite.speechBubble?.remove();
            sprite.destroy();
        }
        t.scheduler.interpreter.parts?.unregisterObject(this);    // beendet die Skripte des Klons, auch dieses
        if (t.state < ThreadState.terminated && callback) callback();
    }

    _mj$stoppeAndereSkripteDieserFigur$void$(t: Thread, callback: CallbackParameter) {
        t.scheduler.interpreter.parts?.stopThreadsOf(this, t);
        if (callback) callback();
    }

    _mj$stoppeAlles$void$(t: Thread, callback: CallbackParameter) {
        BuehneClass.stoppeAlles(t);
    }

    // —— Programmteile (Klicks) ——

    gsgPartsHit(x: number, y: number): boolean {
        if (!this.figSichtbar()) return false;
        const sprite = this.figSprite;
        if (sprite && !sprite.isDestroyed) {
            try {
                return !!sprite._containsPoint(x, y);
            } catch {
                return false;
            }
        }
        const p = ausGrafik(x, y);
        const r = umriss(this.figZustand);
        return p.x >= r.links && p.x <= r.rechts && p.y >= r.unten && p.y <= r.oben;
    }

    gsgPartsOrder(): number {
        return this.figEbene;
    }

    gsgPartsIsStage(): boolean {
        return false;
    }
}
