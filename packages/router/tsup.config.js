import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.mjs'],
  format: ['esm', 'cjs'],
  dts: false,
  splitting: true,
  sourcemap: true,
  clean: true,
  minify: false,
  outDir: 'dist',
  outExtension({ format }) {
    return {
      js: format === 'esm' ? '.mjs' : '.js',
    };
  },
});

