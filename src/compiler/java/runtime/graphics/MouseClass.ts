import { LibraryDeclarations } from "../../module/libraries/DeclareType";
import { NonPrimitiveType } from "../../types/NonPrimitiveType";
import { ObjectClass } from "../system/javalang/ObjectClassStringClass";
import type { ShapeClass } from "./ShapeClass";
import { gsgClickListeners } from "../../../common/interpreter/GsgParts";

/**
 * GSG (Blockmodus, Paket 8): Maus abfragen, ohne eigene Klasse mit onMouseDown usw. –
 * passend zur Spielschleife im Hauptprogramm:
 *
 *     while (true) {
 *         if (Mouse.isOver(ball) && Mouse.wasClicked()) { ... }
 *         Thread.sleep(20);
 *     }
 *
 * Den Zustand schreibt der MouseManager der Grafik bei jedem Mausereignis (Koordinaten der Welt).
 */
export class MouseClass extends ObjectClass {
    static __javaDeclarations: LibraryDeclarations = [
        { type: "declaration", signature: "class Mouse extends Object", comment: "Abfrage der Maus im Grafikbereich (Position, Maustaste, Klick)." },
        { type: "method", signature: "static boolean isDown()", native: MouseClass._isDown, comment: "Wahr, solange eine Maustaste über dem Grafikbereich gedrückt ist." },
        { type: "method", signature: "static boolean wasClicked()", native: MouseClass._wasClicked, comment: "Wahr, wenn gerade (in der letzten Sekunde) in den Grafikbereich geklickt wurde. Jeder Klick zählt nur einmal." },
        { type: "method", signature: "static boolean wasClicked(Shape shape)", native: MouseClass._wasClickedShape, comment: "Wahr, wenn gerade (in der letzten Sekunde) auf die Figur geklickt wurde. Jeder Klick zählt nur einmal." },
        { type: "method", signature: "static boolean isOver(Shape shape)", native: MouseClass._isOver, comment: "Wahr, wenn der Mauszeiger über der Figur ist." },
        { type: "method", signature: "static double getX()", native: MouseClass._getX, comment: "x-Koordinate des Mauszeigers (in Koordinaten der Welt)." },
        { type: "method", signature: "static double getY()", native: MouseClass._getY, comment: "y-Koordinate des Mauszeigers (in Koordinaten der Welt)." },
    ];

    static type: NonPrimitiveType;

    /** Klicks verfallen nach dieser Zeit, damit ein alter Klick nicht später „nachwirkt“ */
    static CLICK_LIFETIME_MS = 1000;

    /** vom MouseManager gepflegt; clicks: noch nicht abgefragte Klicks */
    static state = { x: 0, y: 0, inside: false, down: false, clicks: [] as { x: number; y: number; time: number }[] };

    static reset() {
        MouseClass.state = { x: 0, y: 0, inside: false, down: false, clicks: [] };
    }

    private static freshClicks() {
        const limit = performance.now() - MouseClass.CLICK_LIFETIME_MS;
        const s = MouseClass.state;
        s.clicks = s.clicks.filter((c) => c.time >= limit);
        return s.clicks;
    }

    /** Ereignis aus dem MouseManager */
    static onMouseEvent(kind: string, x: number, y: number) {
        const s = MouseClass.state;
        s.x = x;
        s.y = y;
        switch (kind) {
            case "mousedown":
                s.down = true;
                s.inside = true;
                s.clicks.push({ x, y, time: performance.now() });
                if (s.clicks.length > 20) s.clicks.shift();
                for (const listener of gsgClickListeners) listener(x, y);   // GSG: „wenn … angeklickt wird“
                break;
            case "mouseup": s.down = false; break;
            case "mouseenter": case "mousemove": s.inside = true; break;
            case "mouseleave": s.inside = false; s.down = false; break;
        }
    }

    static _isDown(): boolean {
        return MouseClass.state.down;
    }

    static _wasClicked(): boolean {
        if (MouseClass.freshClicks().length === 0) return false;
        MouseClass.state.clicks = [];
        return true;
    }

    static _wasClickedShape(shape: ShapeClass | null): boolean {
        if (!shape || shape.isDestroyed) return false;   // GSG: entfernte Figuren lassen sich nicht anklicken
        const clicks = MouseClass.freshClicks();
        const hits = clicks.filter((c) => {
            try {
                return !!shape._containsPoint(c.x, c.y);
            } catch {
                return false;
            }
        });
        if (hits.length === 0) return false;
        MouseClass.state.clicks = clicks.filter((c) => !hits.includes(c));
        return true;
    }

    static _isOver(shape: ShapeClass | null): boolean {
        const s = MouseClass.state;
        if (!shape || shape.isDestroyed || !s.inside) return false;
        try {
            return !!shape._containsPoint(s.x, s.y);
        } catch {
            return false;
        }
    }

    static _getX(): number {
        return MouseClass.state.x;
    }

    static _getY(): number {
        return MouseClass.state.y;
    }
}
