import { defineConfig, loadEnv } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `vite build`               -> dist/ (normal static site, hashed assets, base = VITE_BASE or './')
// `vite build --mode single` -> dist-single/index.html (everything inlined, opens from disk)
//
// Examples:
//   VITE_BASE=/house/ VITE_PUBLIC_URL=https://tstockham96.github.io/house/ npm run build
// The single-file build always uses a relative base so it keeps working from file://.
export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env };
  return {
    base: single ? './' : env.VITE_BASE || './',
    plugins: [single && viteSingleFile({ removeViteModuleLoader: true })].filter(Boolean),
    build: {
      outDir: single ? 'dist-single' : 'dist',
      emptyOutDir: true,
      target: 'es2020',
      ...(single ? { assetsInlineLimit: 100_000_000, cssCodeSplit: false } : {}),
    },
    test: { include: ['tests/**/*.test.ts'] },
  };
});
