import { UserConfigExport, defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import * as path from "path";
import { compression } from "vite-plugin-compression2";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ command, mode, ssrBuild }) => {
    const defaultConfig = {
        plugins: [
            react(),
            compression({
                include: ["**/*.{js,css,html}"],
                threshold: 1400,
            }),
            tsconfigPaths(),
        ],
        server: {
            port: 3000,
            host: "localhost",
            watch: {},
        },
        preview: {
            port: 3000,
        },
        publicDir: path.resolve(__dirname, "renderer", "public"),
        resolve: {
            alias: [
                { find: "@", replacement: path.resolve(__dirname, "renderer") },
                {
                    find: "@components",
                    replacement: path.resolve(__dirname, "renderer/components"),
                },
            ],
        },
        define: {
            "process.env": {},
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
