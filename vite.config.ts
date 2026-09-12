import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// BASE_PATH lets CI build for a repository subpath (GitHub Pages) without
// changing local dev and preview, which stay at the root.
const base = process.env.BASE_PATH ?? '/';
const apiPort = process.env.PORT ?? '8787';

export default defineConfig({
  base,
  plugins: [react()],
  // หน้าเว็บเรียก /api ด้วย path เดียวกันทั้ง dev และ production คุกกี้ session
  // จึงเป็น same-site เสมอ ไม่ต้องตั้ง CORS และไม่ต้องมี URL คนละชุดสองที่
  server: { proxy: { '/api': { target: `http://127.0.0.1:${apiPort}`, changeOrigin: false } } },
  preview: { proxy: { '/api': { target: `http://127.0.0.1:${apiPort}`, changeOrigin: false } } },
});
