import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** 브라우저는 /api/<서비스> 로만 호출하고, 개발 서버가 각 서비스로 넘긴다. */
const service = (name: string, port: number) => ({
  [`/api/${name}`]: {
    target: `http://localhost:${port}`,
    rewrite: (path: string) => path.replace(`/api/${name}`, ''),
  },
});

export default defineConfig({
  plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: { ...service('scm', 3001), ...service('oms', 3002), ...service('as', 3003) },
  },
});
