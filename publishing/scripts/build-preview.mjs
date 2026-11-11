import { readFileSync, writeFileSync, cpSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd(); const dist = resolve(root, 'dist');
let html = readFileSync(resolve(dist, 'index.html'), 'utf8');
const manifest = JSON.parse(readFileSync(resolve(dist, '.vite', 'manifest.json'), 'utf8'));
const entry = manifest['index.html'];
let js = readFileSync(resolve(dist, entry.file), 'utf8');
const cssFiles = [...(entry.css || [])];
for (const imported of entry.imports || []) {
  const chunk = manifest[imported];
  cssFiles.push(...(chunk.css || []));
  const source = readFileSync(resolve(dist, chunk.file), 'utf8');
  const dataUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  js = js.replaceAll(`./${chunk.file.split('/').pop()}`, dataUrl);
}
const css = cssFiles.map(file => readFileSync(resolve(dist, file), 'utf8')).join('\n');
html = html.replace(/<script type="module"[^>]*src="[^"]+"[^>]*><\/script>/g, '');
html = html.replace(/<link rel="stylesheet"[^>]*>/g, '');
html = html.replace(/\.\/assets\/favicon-[^"']+\.svg/g, './assets/favicon.svg');
html = html.replace('</head>', () => `<style>${css}</style>\n</head>`);
html = html.replace('</body>', () => `<script type="module">${js.replace(/<\/script/gi, '<\\/script')}</script>\n</body>`);
writeFileSync(resolve(root, 'preview.html'), html);
mkdirSync(resolve(root, 'assets'), { recursive: true });
cpSync(resolve(root, 'public', 'assets'), resolve(root, 'assets'), { recursive: true });
console.log('preview.html + assets/ ready (no CDN)');
