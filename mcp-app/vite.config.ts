import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import fs from 'node:fs/promises';
import path from 'node:path';

/** Rename the single-file entry from index.html to app.html so the API can serve it as ui://activate/app.html. */
function renameEntryHtml(): Plugin {
  let outDir = 'dist';
  return {
    name: 'activate-rename-entry-html',
    enforce: 'post',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      const from = path.join(outDir, 'index.html');
      const to = path.join(outDir, 'app.html');
      try {
        await fs.rename(from, to);
      } catch (e) {
        this.warn(`could not rename index.html to app.html: ${String(e)}`);
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile(), renameEntryHtml()],
  build: {
    target: 'es2022',
    cssMinify: true,
    minify: true,
    assetsInlineLimit: 100_000_000,
    rollupOptions: { input: 'index.html' },
    outDir: 'dist',
    emptyOutDir: true,
  },
});
