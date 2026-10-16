import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.tsx'],
  outDir: 'dist',
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  external: ['ink', 'react'],
  splitting: false,
  sourcemap: false,
  clean: true,
});
