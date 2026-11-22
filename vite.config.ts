import { searchForWorkspaceRoot, type UserConfig } from 'vite'
import commonConfig from './vite.config-common'

let serverIP: string = 'localhost';
// let serverIP: string = '172.30.95.53';

/**
 * Entwicklung: Anwendungen „Code“ (/code/), „Mix“ (/mix/), „Strukto“ (/strukto/), „Blocks“ (/blocks/) und „Klassen“
 * (/klassen/) – dieselbe Seite (im Betrieb liefert Caddy dafür die gebaute IDE aus). Server-Aufrufe unter diesen Pfaden
 * gehen ans Backend. Die alten Adressen (/, /bloecke/, /struktogramme/, /bloeckly/, /klassendiagramme/) leiten weiter.
 */
const APP_PFADE = ["code", "mix", "strukto", "blocks", "klassen"];
const ALTE_PFADE: Record<string, string> = { bloecke: "mix", struktogramme: "strukto", bloeckly: "blocks", klassendiagramme: "klassen", java: "code" };
const SERVER_PFADE = ["servlet", "sendUpdates", "sprites"];
const alle = [...APP_PFADE, ...Object.keys(ALTE_PFADE)].join("|");

const appPfadeDev = {
    name: "gsg-app-pfade-dev",
    configureServer(server: { middlewares: { use(fn: (req: { url?: string }, res: { statusCode: number; setHeader(k: string, v: string): void; end(): void }, next: () => void) => void): void } }) {
        server.middlewares.use((req, res, next) => {
            const url = req.url ?? "";
            // alte Adressen: Seite dauerhaft weiterleiten (Server-Aufrufe alter, noch offener Seiten gehen per Proxy durch)
            const alt = url.match(/^\/(bloecke|struktogramme|bloeckly|klassendiagramme|java)(\/|$|\?)(.*)$/);
            if (alt && !new RegExp(`^/${alt[1]}/(${SERVER_PFADE.join("|")})`).test(url)) {
                res.statusCode = 301;
                res.setHeader("Location", `/${ALTE_PFADE[alt[1]]}/${alt[2] === "?" ? "?" : ""}${alt[3]}`);
                return res.end();
            }
            if (url === "/" || url.startsWith("/?") || url === "/index.html") {
                res.statusCode = 302;
                res.setHeader("Location", "/code/" + (url.startsWith("/?") ? url.slice(1) : ""));
                return res.end();
            }
            if (new RegExp(`^/(${APP_PFADE.join("|")})(/|$|\\?)`).test(url) && !new RegExp(`^/(${APP_PFADE.join("|")})/(${SERVER_PFADE.join("|")})`).test(url)) {
                req.url = url.replace(new RegExp(`^/(${APP_PFADE.join("|")})/?`), "/");
            }
            next();
        });
    },
};

/** Server-Aufrufe unter den Anwendungspfaden (neu und alt) ans Backend */
const serverProxies = Object.fromEntries(alle.split("|").flatMap((app) => SERVER_PFADE.map((s) => [
    `/${app}/${s}`, { target: 'http://' + serverIP + ':5500', rewrite: (p: string) => p.replace(new RegExp(`^/${app}`), '') },
])));

export default {
    ...commonConfig,
    plugins: [...((commonConfig as { plugins?: unknown[] }).plugins ?? []), appPfadeDev],
    build: {
        ...commonConfig.build,
        rollupOptions: {
            input: {
                main: './index.html',
                api: './api_documentation.html',
                spriteLibrary: './spriteLibrary.html',
                shortcuts: './shortcuts.html',
                register: './register.html',
            },
            output: {
                manualChunks: (id: string, { getModuleInfo, getModuleIds }) => {
                    // gemeinsame CommonJS-Hilfsfunktionen in eine eigene Datei, sonst landen sie in
                    // irgendeinem Paket (z. B. blockly) und das wird dann beim Start mitgeladen (GSG)
                    if (id.includes('commonjsHelpers')) return 'commonjsHelpers';
                    if (id.includes('node_modules')) {
                        let moduleName: string = id.toString().split('node_modules/')[1].split('/')[0].toString().replace("@", "");
                        if (id.endsWith('.css')) {
                            return moduleName + '_css';
                        }
                        return moduleName;
                    }

                    return undefined;
                },
            }

            // output: {
            //   entryFileNames: assetInfo => {
            //     if (assetInfo.name.indexOf('worker') >= 0) {
            //       return 'worker/[name].js';
            //     }
            //     return '[name]-[hash].js';
            //   },
            //   assetFileNames: assetInfo => assetInfo.name.endsWith('css') ? '[name]-[hash][extname]' : 'assets/[name]-[hash][extname]',
            //   chunkFileNames: 'assets/js/[name]-[hash].js',
            //   manualChunks: {}
            // }
        },
        outDir: './dist',
    },
    server: {
        proxy: {
            '/servlet': 'http://' + serverIP + ':5500',
            '/sprites': 'http://' + serverIP + ':5500',
            '/servlet/websocket': { target: 'ws://' + serverIP + ':5500', ws: true },
            '/servlet/pushWebsocket': { target: 'ws://' + serverIP + ':5500', ws: true },
            // eigenes Backend: Verwaltung, API, IServ-Login
            '/verwaltung': 'http://' + serverIP + ':5500',
            '/api': 'http://' + serverIP + ':5500',
            '/auth': 'http://' + serverIP + ':5500',
            '/start': 'http://' + serverIP + ':5500',    // Startseite
            '/s/': 'http://' + serverIP + ':5500',       // geteilte Links
            '/automaten': 'http://' + serverIP + ':5500',    // Anwendung „Automaten“ (FLACI, vom Backend ausgeliefert)
            '/flaci': 'http://' + serverIP + ':5500',        // alte Adresse, das Backend leitet weiter
            '/branding': 'http://' + serverIP + ':5500',     // Logo und Schulfarben (Verwaltung → Aussehen)
            '/mitwirkende': 'http://' + serverIP + ':5500',  // Mitwirkende und Lizenzen
            '/lehrkraefte': 'http://' + serverIP + ':5500',  // Lehrerhandbuch
            // Anwendungen „Code“, „Mix“, „Strukto“, „Blocks“, „Klassen“ (und alte Pfade): Server-Aufrufe und eigene Sprite-Bilder ans Backend
            ...serverProxies,
            // '/servlet/subscriptionwebsocket': { target: 'ws://localhost:5500', ws: true },
        }, 
        port: 3000
    }

} satisfies UserConfig
