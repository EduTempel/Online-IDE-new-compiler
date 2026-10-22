/**
 * Kleiner, sicherer Markdown-Leser für Aufgabenstellungen (Paket 12): Überschriften (#, ##, ###),
 * Absätze, **fett**, *kursiv*, `Code`, Codeblöcke (```), Listen (-, *, 1.), Zitate (>), Links und
 * Bilder (nur http/https bzw. Bilder auch als data:image). Alles andere wird als Text gezeigt –
 * HTML im Text wird nie ausgeführt.
 */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function safeUrl(url: string, image = false): string | undefined {
    const u = url.trim();
    if (/^https?:\/\//i.test(u)) return u;
    if (image && /^data:image\/(png|jpe?g|gif|svg\+xml|webp);base64,[A-Za-z0-9+/=]+$/i.test(u)) return u;
    return undefined;
}

/** Zeile mit Hervorhebungen (Text ist bereits nicht maskiert) */
function inline(text: string): string {
    // Code zuerst herausnehmen, damit darin nichts umgewandelt wird
    const codes: string[] = [];
    let s = text.replace(/`([^`]+)`/g, (_, c: string) => {
        codes.push(`<code>${esc(c)}</code>`);
        return `\u0000${codes.length - 1}\u0000`;
    });
    s = esc(s);
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt: string, url: string) => {
        const u = safeUrl(url.replace(/&amp;/g, "&"), true);
        return u ? `<img src="${esc(u)}" alt="${alt}">` : m;
    });
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label: string, url: string) => {
        const u = safeUrl(url.replace(/&amp;/g, "&"));
        return u ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${label}</a>` : m;
    });
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/__([^_]+)__/g, "<strong>$1</strong>");
    s = s.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>").replace(/(^|[^\w])_([^_\s][^_]*)_(?!\w)/g, "$1<em>$2</em>");
    return s.replace(/\u0000(\d+)\u0000/g, (_, i: string) => codes[Number(i)]);
}

export function markdownToHtml(md: string): string {
    const lines = md.replace(/\r\n?/g, "\n").split("\n");
    const out: string[] = [];
    let para: string[] = [];
    let list: { ordered: boolean; items: string[] } | undefined;
    let quote: string[] = [];
    const flushPara = () => {
        if (para.length) out.push(`<p>${para.map(inline).join("<br>")}</p>`);
        para = [];
    };
    const flushList = () => {
        if (list) out.push(`<${list.ordered ? "ol" : "ul"}>${list.items.map((i) => `<li>${inline(i)}</li>`).join("")}</${list.ordered ? "ol" : "ul"}>`);
        list = undefined;
    };
    const flushQuote = () => {
        if (quote.length) out.push(`<blockquote>${quote.map(inline).join("<br>")}</blockquote>`);
        quote = [];
    };
    const flushAll = () => { flushPara(); flushList(); flushQuote(); };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/^```/.test(line)) {
            flushAll();
            const code: string[] = [];
            for (i++; i < lines.length && !/^```/.test(lines[i]); i++) code.push(lines[i]);
            out.push(`<pre><code>${esc(code.join("\n"))}</code></pre>`);
            continue;
        }
        const h = /^(#{1,3})\s+(.*)$/.exec(line);
        if (h) {
            flushAll();
            out.push(`<h${h[1].length + 2}>${inline(h[2])}</h${h[1].length + 2}>`);
            continue;
        }
        const li = /^\s*(?:([-*])|(\d+)[.)])\s+(.*)$/.exec(line);
        if (li) {
            flushPara();
            flushQuote();
            const ordered = !!li[2];
            if (list && list.ordered !== ordered) flushList();
            list ??= { ordered, items: [] };
            list.items.push(li[3]);
            continue;
        }
        const q = /^>\s?(.*)$/.exec(line);
        if (q) {
            flushPara();
            flushList();
            quote.push(q[1]);
            continue;
        }
        if (!line.trim()) {
            flushAll();
            continue;
        }
        flushList();
        flushQuote();
        para.push(line);
    }
    flushAll();
    return out.join("\n");
}
