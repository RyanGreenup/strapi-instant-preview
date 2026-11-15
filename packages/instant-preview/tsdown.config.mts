import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['admin/src/index.ts'],
  outDir: 'dist/admin',
  format: ['esm', 'cjs'],
  platform: 'browser',
  inputOptions: { platform: 'browser' },
  tsconfig: 'admin/tsconfig.build.json',
  dts: {
    sourcemap: true,
  },
  outExtensions: ({ format }) => ({
    js: format === 'es' ? '.mjs' : '.js',
  }),
});
