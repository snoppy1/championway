// GitHub Pages has no rewrite rules, so a deep link like /competitions/some-slug
// would 404 before the app ever boots. Pages serves 404.html for unknown paths,
// so shipping a copy of index.html under that name lets the router take over.
import { copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
await copyFile(`${dist}index.html`, `${dist}404.html`);
console.log('spa-fallback: wrote dist/404.html');
