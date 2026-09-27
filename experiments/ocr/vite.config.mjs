import { defineConfig } from 'vite';
export default defineConfig({
  optimizeDeps: {
    exclude: ['@paddleocr/paddleocr-js'],
    include: ['@techstark/opencv-js', 'clipper-lib', 'js-yaml'],
  },
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
});
