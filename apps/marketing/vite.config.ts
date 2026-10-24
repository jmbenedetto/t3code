import { defineConfig } from "vite-plus";

// Astro reads astro.config.mjs. This file only configures `vp run` tasks.
export default defineConfig({
  run: {
    tasks: {
      // `astro check` regenerates .astro/*.d.ts and then reads them, which
      // keeps a task out of the cache. Its real inputs are tracked as usual.
      typecheck: {
        command: "astro check",
        cache: {
          input: [{ auto: true }, "!.astro/**"],
          // Cache location and telemetry do not change Astro diagnostics.
          untrackedEnv: ["XDG_CONFIG_HOME", "ASTRO_TELEMETRY_DISABLED"],
        },
      },
    },
  },
});
