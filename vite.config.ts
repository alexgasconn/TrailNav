import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png', 'manifest.webmanifest', 'maps/catalunya.json'],
        manifest: false, // Use public/manifest.webmanifest instead
        devOptions: {
          enabled: false,
          navigateFallback: 'index.html'
        },
        workbox: {
          importScripts: ['share-target.js'],
          globPatterns: ['**/*.{js,css,html,ico,png,svg,json,woff2}'],
          navigateFallback: 'index.html',
          navigateFallbackDenylist: [/^\/api\//],
          runtimeCaching: [
            // OSM Tiles - Cache first (maps)
            {
              urlPattern: /^https:\/\/tile\.openstreetmap\.org\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'osm-tiles-cache',
                expiration: {
                  maxEntries: 8000,
                  maxAgeSeconds: 60 * 60 * 24 * 60 // 60 days
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            },
            // API calls - Network first
            {
              urlPattern: /^https:\/\/api\.(?!open-meteo)[^/]+\/.*/i,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'api-cache',
                networkTimeoutSeconds: 10,
                expiration: {
                  maxEntries: 100,
                  maxAgeSeconds: 60 * 60 * 24 // 24 hours
                }
              }
            }
          ],
          skipWaiting: true,
          clientsClaim: true,
          cleanupOutdatedCaches: true
        }
      })
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      target: 'esnext',
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: mode === 'production',
          drop_debugger: mode === 'production'
        }
      },
      rollupOptions: {
        output: {
          manualChunks: {
            'maplibre': ['maplibre-gl'],
            'turf': ['@turf/turf'],
            'vendor': ['react', 'react-dom']
          }
        }
      },
      reportCompressedSize: false,
      chunkSizeWarningLimit: 1000
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      headers: {
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN'
      }
    },
  };
});
