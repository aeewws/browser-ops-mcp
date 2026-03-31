import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: {
      index: "src/index.ts",
      "cli/index": "src/cli/index.ts"
    },
    clean: true,
    dts: true,
    format: ["esm"],
    sourcemap: true,
    target: "node20",
    banner: {
      js: "#!/usr/bin/env node"
    }
  }
]);
