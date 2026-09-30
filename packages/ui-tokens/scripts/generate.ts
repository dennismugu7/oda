import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { toThemeCss } from '../src/css';

const out = fileURLToPath(new URL('../src/theme.css', import.meta.url));
writeFileSync(out, toThemeCss());
console.log(`wrote ${out}`);
