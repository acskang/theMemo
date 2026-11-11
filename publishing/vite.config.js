import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';

const publicBuild = process.env.PUBLIC_BUILD === '1';
export default defineConfig({
  base: './',
  plugins: [tailwindcss()],
  build: publicBuild
    ? { manifest: '.vite/public-manifest.json', emptyOutDir: false, sourcemap: false, assetsInlineLimit: 0, rollupOptions: { input: resolve(process.cwd(), 'public.html') } }
    : { manifest: true, sourcemap: false, assetsInlineLimit: 0 },
  server: { host: '127.0.0.1' },
});
