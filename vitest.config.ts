import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
    resolve: {
        alias: {
            "@": r("./src/renderer/src"),
            "@renderer": r("./src/renderer/src"),
        },
    },
    test: {
        // Default to node; renderer tests opt into jsdom via a
        // `@vitest-environment jsdom` docblock at the top of the file.
        environment: "node",
        include: ["src/**/*.test.ts"],
        snapshotFormat: { printBasicPrototype: false },
    },
});
