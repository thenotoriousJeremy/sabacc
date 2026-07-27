import { defineConfig } from "eslint/config";
import next from "eslint-config-next";
export default defineConfig([
    // Build output: generated bundles and the generated Android project.
    { ignores: ["dist/**", "out/**", ".next/**", "android/**"] },
    { extends: [...next] },
]);
