import * as Blockly from "blockly/core";
import { SHAPE, shapeFor, type TypeSet } from "./BlockTypeSystem";

/**
 * Renderer "gsg": wie zelos (Scratch-ähnlich), aber mit einer Form je Datentyp – auch für die
 * Löcher. zelos selbst kennt nur rund/eckig/Sechseck und nimmt für Löcher die Form des
 * umgebenden Blocks; hier bestimmt der Typ des Lochs die Form, ein eingesteckter Block seine eigene.
 */

type Shape = ReturnType<Blockly.zelos.ConstantProvider["makeRounded"]>;

const { lineTo, lineOnAxis, arc, point } = Blockly.utils.svgPaths;

class GsgConstants extends Blockly.zelos.ConstantProvider {

    BEVELED!: Shape;
    WAVY!: Shape;
    OBJECTY!: Shape;

    constructor() {
        super();
        // Abstände "Form in Form" (äußere Form -> innere Form; 0 = Feld) um die eigenen Formen ergänzen
        const g = this.GRID_UNIT;
        const pad = this.SHAPE_IN_SHAPE_PADDING as Record<number, Record<number, number>>;
        pad[SHAPE.HEXAGON][SHAPE.BEVEL] = 5 * g;
        pad[SHAPE.HEXAGON][SHAPE.WAVE] = 5 * g;
        pad[SHAPE.ROUND][SHAPE.BEVEL] = 2 * g;
        pad[SHAPE.ROUND][SHAPE.WAVE] = 1 * g;
        pad[SHAPE.SQUARE][SHAPE.BEVEL] = 2 * g;
        pad[SHAPE.SQUARE][SHAPE.WAVE] = 2 * g;
        pad[SHAPE.BEVEL] = { 0: 2 * g, [SHAPE.HEXAGON]: 2 * g, [SHAPE.ROUND]: 2 * g, [SHAPE.SQUARE]: 2 * g, [SHAPE.BEVEL]: 2 * g, [SHAPE.WAVE]: 2 * g };
        pad[SHAPE.WAVE] = { 0: 3 * g, [SHAPE.HEXAGON]: 3 * g, [SHAPE.ROUND]: 1 * g, [SHAPE.SQUARE]: 2 * g, [SHAPE.BEVEL]: 2 * g, [SHAPE.WAVE]: 1 * g };
        pad[SHAPE.HEXAGON][SHAPE.OBJECT] = 5 * g;
        pad[SHAPE.ROUND][SHAPE.OBJECT] = 2 * g;
        pad[SHAPE.SQUARE][SHAPE.OBJECT] = 2 * g;
        pad[SHAPE.BEVEL][SHAPE.OBJECT] = 2 * g;
        pad[SHAPE.WAVE][SHAPE.OBJECT] = 2 * g;
        pad[SHAPE.OBJECT] = { 0: 2 * g, [SHAPE.HEXAGON]: 2 * g, [SHAPE.ROUND]: 2 * g, [SHAPE.SQUARE]: 2 * g, [SHAPE.BEVEL]: 2 * g, [SHAPE.WAVE]: 2 * g, [SHAPE.OBJECT]: 2 * g };
    }

    override init() {
        super.init();
        this.BEVELED = this.makeBeveled();
        this.WAVY = this.makeWavy();
        this.OBJECTY = this.makeObject();
    }

    /** Objekte, Reihungen, Listen: gerade Seiten mit kleiner Spitze in der Mitte */
    makeObject(): Shape {
        const max = this.MAX_DYNAMIC_CONNECTION_SHAPE_WIDTH;
        const tip = (h: number) => Math.min(h / 5, max);
        const side = (h: number, up: boolean, right: boolean) => {
            const w = tip(h);
            const x = right ? 1 : -1;
            const y = up ? -1 : 1;
            const straight = (h - 2 * w) / 2;
            return lineOnAxis("v", y * straight) + lineTo(x * w, y * w) + lineTo(-x * w, y * w) + lineOnAxis("v", y * straight);
        };
        return {
            type: SHAPE.OBJECT, isDynamic: true,
            width: (h: number) => tip(h),
            height: (h: number) => h,
            connectionOffsetY: (h: number) => h / 2,
            connectionOffsetX: (w: number) => -w,
            pathDown: (h: number) => side(h, false, false),
            pathUp: (h: number) => side(h, true, false),
            pathRightDown: (h: number) => side(h, false, true),
            pathRightUp: (h: number) => side(h, false, true),
        } as unknown as Shape;
    }

    /** Zeichen (char): Rechteck mit abgeschrägten Ecken */
    makeBeveled(): Shape {
        const max = this.MAX_DYNAMIC_CONNECTION_SHAPE_WIDTH;
        const cut = (h: number) => Math.min(h / 4, max);
        const side = (h: number, up: boolean, right: boolean) => {
            const w = cut(h);
            const x = right ? 1 : -1;
            const y = up ? -1 : 1;
            return lineTo(x * w, y * w) + lineOnAxis("v", y * (h - 2 * w)) + lineTo(-x * w, y * w);
        };
        return {
            type: SHAPE.BEVEL, isDynamic: true,
            width: (h: number) => cut(h),
            height: (h: number) => h,
            connectionOffsetY: (h: number) => h / 2,
            connectionOffsetX: (w: number) => -w,
            pathDown: (h: number) => side(h, false, false),
            pathUp: (h: number) => side(h, true, false),
            pathRightDown: (h: number) => side(h, false, true),
            pathRightUp: (h: number) => side(h, false, true),
        } as unknown as Shape;
    }

    /** offen / mehrere Typen möglich: zwei kleine Bögen je Seite (Wellenform) */
    makeWavy(): Shape {
        const max = this.MAX_DYNAMIC_CONNECTION_SHAPE_WIDTH;
        const radius = (h: number) => Math.min(h / 4, max);
        const side = (h: number, up: boolean, right: boolean) => {
            const r = radius(h);
            const y = up ? -1 : 1;
            const sweep = right === up ? "0" : "1";
            const bump = arc("a", "0 0," + sweep, r, point(0, y * 2 * r));
            return bump + lineOnAxis("v", y * (h - 4 * r)) + bump;
        };
        return {
            type: SHAPE.WAVE, isDynamic: true,
            width: (h: number) => radius(h),
            height: (h: number) => h,
            connectionOffsetY: (h: number) => h / 2,
            connectionOffsetX: (w: number) => -w,
            pathDown: (h: number) => side(h, false, false),
            pathUp: (h: number) => side(h, true, false),
            pathRightDown: (h: number) => side(h, false, true),
            pathRightUp: (h: number) => side(h, false, true),
        } as unknown as Shape;
    }

    private byId(id: number | null | undefined): Shape {
        switch (id) {
            case SHAPE.HEXAGON: return this.HEXAGONAL;
            case SHAPE.SQUARE: return this.SQUARED;
            case SHAPE.BEVEL: return this.BEVELED;
            case SHAPE.WAVE: return this.WAVY;
            case SHAPE.OBJECT: return this.OBJECTY;
            default: return this.ROUNDED;
        }
    }

    override shapeFor(connection: Blockly.RenderedConnection) {
        const types = Blockly.ConnectionType;
        if (connection.type === types.INPUT_VALUE) {
            const child = connection.targetBlock();
            if (child && child.getOutputShape() !== null) return this.byId(child.getOutputShape());
            return this.byId(shapeFor(connection.getCheck() as TypeSet));
        }
        if (connection.type === types.OUTPUT_VALUE) {
            const own = connection.getSourceBlock().getOutputShape();
            return this.byId(own ?? shapeFor(connection.getCheck() as TypeSet));
        }
        return super.shapeFor(connection);
    }
}

class GsgRenderer extends Blockly.zelos.Renderer {
    protected override makeConstants_() {
        return new GsgConstants();
    }
}

let registered = false;
export function registerRenderer() {
    if (registered) return;
    registered = true;
    Blockly.blockRendering.register("gsg", GsgRenderer);
}
