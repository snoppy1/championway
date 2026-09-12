import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// BASE_PATH lets CI build for a repository subpath (GitHub Pages) without
// changing local dev and preview, which stay at the root.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({ base, plugins: [react()] });
