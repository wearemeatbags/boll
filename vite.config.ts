import { defineConfig } from 'vite';

// Relative base so the built dist/ runs from any static host or subfolder.
export default defineConfig({
  base: './',
  build: {
    // Three.js is intentionally isolated from the app entry. The vendor chunk
    // sits just above Vite's default 500 kB warning, but it is stable and
    // browser-cacheable while gameplay code stays small.
    chunkSizeWarningLimit: 600,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'vendor',
              test: /node_modules/,
            },
          ],
        },
      },
    },
  },
});
