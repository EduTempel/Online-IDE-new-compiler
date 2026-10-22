import { searchForWorkspaceRoot, type UserConfig } from 'vite'
import commonConfig from './vite.config-common'

let serverIP: string = 'localhost';
// let serverIP: string = '172.30.95.53';

export default {
    ...commonConfig,
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
            // '/servlet/subscriptionwebsocket': { target: 'ws://localhost:5500', ws: true },
        }, 
        port: 3000
    }

} satisfies UserConfig
