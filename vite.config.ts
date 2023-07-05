import { UserConfigExport, defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import * as path from "path";
import { compression } from "vite-plugin-compression2";

export default defineConfig(({ command, mode, ssrBuild }) => {
    const defaultConfig = {
        plugins: [
            react(),
            compression({
                include: ["**/*.{js,css,html}"],
                threshold: 1400,
            }),
        ],
        server: {
            port: 3000,
            host: "localhost",
            watch: {},
        },
        preview: {
            port: 3000,
        },
        resolve: {
            alias: [
                { find: "@", replacement: path.resolve(__dirname, "renderer") },
            ],
        },
    } as UserConfigExport;

    if (mode === "test") {
        return {
            ...defaultConfig,
            build: {
                outDir: "build",
            },
        };
    } else {
        return {
            ...defaultConfig,
        };
    }
});
