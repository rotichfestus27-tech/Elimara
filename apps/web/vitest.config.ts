import { mergeConfig } from "vite";
import { defineConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

export default defineConfig(({ mode }) => {
  const resolvedViteConfig =
    typeof viteConfig === "function"
      ? viteConfig({
          command: "serve",
          mode,
          isSsrBuild: false,
          isPreview: false,
        })
      : viteConfig;

  return mergeConfig(resolvedViteConfig, {
    test: {
      clearMocks: true,
      environment: "jsdom",
      restoreMocks: true,
    },
  });
});
