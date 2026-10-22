import { searchForWorkspaceRoot, type UserConfig } from 'vite'
import commonConfig from './vite.config-common'

let serverIP: string = 'localhost';
// let serverIP: string = '172.30.95.53';

/**
 * Entwicklung: Anwendung "Blöcke" unter /bloecke/ – dieselbe Seite wie die Java-IDE (im Betrieb
 * liefert Caddy dafür die gebaute Java-IDE aus). Server-Aufrufe unter /bloecke/ gehen ans Backend.
 */
const bloeckeDev = {
    name: "gsg-bloecke-dev",
    configureServer(server: { middlewares: { use(fn: (req: { url?: string }, res: unknown, next: () => void) => void): void } }) {
        server.middlewares.use((req, _res, next) => {
            if (req.url && /^\/bloecke(\/|$|\?)/.test(req.url) && !/^\/bloecke\/(servlet|sendUpdates)/.test(req.url)) {
                req.url = req.url.replace(/^\/bloecke\/?/, "/");
            }
            next();
        });
    },
};

export default {
    ...commonConfig,
    plugins: [...((commonConfig as { plugins?: unknown[] }).plugins ?? []), bloeckeDev],
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
            // Anwendung "Blöcke": relative Server-Aufrufe unter /bloecke/ ans Backend
            '/bloecke/servlet': { target: 'http://' + serverIP + ':5500', rewrite: (p: string) => p.replace(/^\/bloecke/, '') },
            '/bloecke/sendUpdates': { target: 'http://' + serverIP + ':5500', rewrite: (p: string) => p.replace(/^\/bloecke/, '') },
            // '/servlet/subscriptionwebsocket': { target: 'ws://localhost:5500', ws: true },
        }, 
        port: 3000
    }

} satisfies UserConfig
