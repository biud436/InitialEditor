import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import * as path from 'path';
import tsconfigPaths from 'vite-tsconfig-paths';

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react(), tsconfigPaths()],
    resolve: {
        alias: [{ find: '@', replacement: path.resolve(__dirname, 'src') }],
    },
    publicDir: path.resolve(__dirname, 'src', 'public'),
    define: {
        'process.env': {},
    },
    // 빌드 폴더 경로 변경
    build: {
        outDir: path.resolve(__dirname, '..', '..', 'dist'),
        copyPublicDir: true,
    },
    root: './',
});
