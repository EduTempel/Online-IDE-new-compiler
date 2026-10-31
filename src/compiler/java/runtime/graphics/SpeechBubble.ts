import * as PIXI from 'pixi.js';
import type { ShapeClass } from './ShapeClass';

/**
 * GSG (Paket 17c, wie „sage …“ in Scratch): Sprechblase über einer Figur. Sie liegt ganz oben auf der
 * Bühne (wird also nicht mitgedreht oder mitvergrößert) und wandert bei jedem Bild mit der Figur mit.
 * Versteckte Figuren zeigen keine Blase; entfernte Figuren verlieren sie.
 */
export class SpeechBubble {

    readonly container = new PIXI.Container();
    private background = new PIXI.Graphics();
    readonly label: PIXI.Text;
    private ticker?: (t: PIXI.Ticker) => void;
    private width = 0;
    private height = 0;

    static readonly PADDING = 8;
    static readonly MAX_WIDTH = 220;
    static readonly TAIL = 12;

    constructor(private shape: ShapeClass) {
        this.label = new PIXI.Text({
            text: "",
            style: {
                fontFamily: "Roboto, 'Segoe UI', sans-serif",
                fontSize: 16,
                fill: 0x1f2430,
                wordWrap: true,
                wordWrapWidth: SpeechBubble.MAX_WIDTH,
                breakWords: true,
            },
        });
        this.label.x = SpeechBubble.PADDING;
        this.label.y = SpeechBubble.PADDING;
        this.container.addChild(this.background, this.label);
    }

    /** Text setzen und Blase zeigen (leerer Text: Blase entfernen); thought: Denkblase (Blöckly „denke …“) */
    say(text: string, thought = false) {
        if (text === "") {
            this.remove();
            return;
        }
        this.label.text = text;
        this.width = Math.max(this.label.width + 2 * SpeechBubble.PADDING, 36);
        this.height = this.label.height + 2 * SpeechBubble.PADDING;
        const g = this.background;
        const w = this.width, h = this.height, tail = SpeechBubble.TAIL;
        g.clear();
        if (thought) {
            // Denkblase: runder, mit kleinen Kreisen zur Figur hin
            g.roundRect(0, 0, w, h, Math.min(h / 2, 20)).fill(0xffffff).stroke({ width: 2, color: 0x6b7280 });
            g.circle(16, h + 5, 4).fill(0xffffff).stroke({ width: 2, color: 0x6b7280 });
            g.circle(9, h + tail, 2.5).fill(0xffffff).stroke({ width: 2, color: 0x6b7280 });
        } else {
            g.roundRect(0, 0, w, h, 12).fill(0xffffff).stroke({ width: 2, color: 0x6b7280 });
            // Spitze unten links zur Figur hin (überdeckt den Rand der Blase an dieser Stelle)
            g.poly([14, h - 2, 30, h - 2, 10, h + tail]).fill(0xffffff);
            g.moveTo(14, h).lineTo(10, h + tail).lineTo(30, h).stroke({ width: 2, color: 0x6b7280 });
        }

        const app = this.shape.world?.app;
        if (!app) return;
        if (!this.ticker) {
            this.ticker = () => this.update();
            app.ticker.add(this.ticker);
        }
        this.update();
    }

    /** Lage über der Figur (rechts oben), immer im sichtbaren Fenster */
    update() {
        const app = this.shape.world?.app;
        if (!app || this.container.destroyed || this.shape.isDestroyed) {
            this.remove();
            return;
        }
        const stage = app.stage;
        if (this.container.parent !== stage) stage.addChild(this.container);
        else if (stage.children[stage.children.length - 1] !== this.container) stage.addChild(this.container);   // ganz nach oben
        const visible = !!this.shape.container?.visible && !this.shape.isDestroyed;
        this.container.visible = visible;
        if (!visible) return;
        const b = this.shape.container.getBounds();
        const anchor = stage.toLocal(new PIXI.Point(b.x + b.width * 0.75, b.y));
        const w = this.shape.world;
        let x = anchor.x - 10;
        let y = anchor.y - this.height - SpeechBubble.TAIL - 4;
        // im Fenster halten
        x = Math.min(Math.max(x, w.currentLeft + 2), w.currentLeft + w.currentWidth - this.width - 2);
        y = Math.max(y, w.currentTop + 2);
        this.container.x = x;
        this.container.y = y;
    }

    remove() {
        const app = this.shape.world?.app;
        if (this.ticker) app?.ticker.remove(this.ticker);
        this.ticker = undefined;
        if (!this.container.destroyed) this.container.parent?.removeChild(this.container);
    }
}
