import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Built into bilko.run/projects/thread-grader/ as a static-path host.
export default defineConfig({
  base: '/projects/thread-grader/',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2022',
  },
});
