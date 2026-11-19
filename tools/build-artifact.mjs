// Builds the claude.ai Artifact page from index.html: drops the document skeleton
// (the Artifact host adds its own) and inlines the stylesheet.
// Usage: node tools/build-artifact.mjs <out.html>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] || join(root, 'dist', 'artifact.html');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const css = readFileSync(join(root, 'css', 'style.css'), 'utf8');

const head = html.slice(html.indexOf('<!-- ARTIFACT:START -->') + 23, html.indexOf('<!-- ARTIFACT:HEAD-END -->'));
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('<!-- ARTIFACT:END -->'));
const page = head.replace('<link rel="stylesheet" href="css/style.css">', `<style>\n${css}\n</style>`) + body;

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, page.trim() + '\n');
console.log('wrote', out, (page.length / 1024).toFixed(1) + ' KB');
