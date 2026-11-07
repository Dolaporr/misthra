import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()], build:{rollupOptions:{output:{manualChunks:{motion:['framer-motion']}}}}, server: { host: '127.0.0.1', port: 5173, proxy: { '/api': 'http://127.0.0.1:4317', '/uploads': 'http://127.0.0.1:4317' } } });
