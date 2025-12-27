import { defineConfig } from 'vite';

export default defineConfig({
     server: {
          port: 5173,
          open: true
     },
     build: {
          outDir: 'dist',
          minify: 'terser',
          target: 'esnext'
     },
     define: {
          'process.env': {},
          global: 'globalThis',
     },
     resolve: {
          alias: {
               process: "process/browser",
               stream: "stream-browserify",
               zlib: "browserify-zlib",
               util: "util",
          }
     },
     optimizeDeps: {
          esbuildOptions: {
               target: 'esnext',
               define: {
                    global: 'globalThis'
               },
               supported: {
                    bigint: true
               },
          }
     }
});

