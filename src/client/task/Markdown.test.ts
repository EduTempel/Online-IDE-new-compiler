import { describe, expect, it } from "vitest";
import { markdownToHtml } from "./Markdown";

describe("Markdown für Aufgabenstellungen (Paket 12)", () => {
    it("Überschriften, Absätze, Hervorhebungen", () => {
        expect(markdownToHtml("# Aufgabe\nSchreibe **eine** Methode *max*.")).toBe(
            "<h3>Aufgabe</h3>\n<p>Schreibe <strong>eine</strong> Methode <em>max</em>.</p>");
    });
    it("Listen, Code und Codeblöcke", () => {
        expect(markdownToHtml("- a\n- `x < y`\n\n1. eins\n2. zwei")).toBe(
            "<ul><li>a</li><li><code>x &lt; y</code></li></ul>\n<ol><li>eins</li><li>zwei</li></ol>");
        expect(markdownToHtml("```\nint a = 1 < 2;\n```")).toBe("<pre><code>int a = 1 &lt; 2;</code></pre>");
    });
    it("HTML wird nie ausgeführt", () => {
        const html = markdownToHtml("<script>alert(1)</script> <img src=x onerror=alert(1)>");
        expect(html).not.toContain("<script");
        expect(html).not.toContain("<img");
    });
    it("nur sichere Links und Bilder", () => {
        expect(markdownToHtml("[Doku](https://example.org/a?b=1&c=2)")).toBe(
            '<p><a href="https://example.org/a?b=1&amp;c=2" target="_blank" rel="noopener noreferrer">Doku</a></p>');
        expect(markdownToHtml("[böse](javascript:alert(1))")).not.toContain("<a");
        expect(markdownToHtml("![Bild](data:image/png;base64,AAAA)")).toContain('<img src="data:image/png;base64,AAAA"');
        expect(markdownToHtml("![x](data:text/html;base64,AAAA)")).not.toContain("<img");
    });
});
