import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves the project at /<repo>/ — keep base in sync with the repo name.
const base = '/dbe2026/';

export default defineConfig({
  base,
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Dark Bombastic Evening 12 — Night Planner',
        short_name: 'DBE 12',
        description:
          'Plan your four nights at Dark Bombastic Evening 12, Alba Iulia, 12–15 August 2026.',
        id: base,
        scope: base,
        start_url: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#08070a',
        theme_color: '#08070a',
        lang: 'en',
        categories: ['music', 'events', 'lifestyle'],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        // pdf.js is only pulled in when someone imports a ticket PDF, and it is
        // most of a megabyte — keeping it out of the precache leaves the app
        // itself small to install. The rule below keeps a copy once it is
        // actually fetched, so a second import works offline too.
        globIgnores: ['**/pdf*.{js,mjs}'],
        runtimeCaching: [
          {
            urlPattern: /\/assets\/pdf[^/]*\.m?js$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'pdfjs',
              expiration: { maxEntries: 8 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
        navigateFallback: `${base}index.html`,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
