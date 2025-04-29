import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  minify: true,
  sourcemap: true,
  dts: false, // 타입 빌드 하지마
  clean: true,
  target: "es2020",
  banner: {
    js: "#!/usr/bin/env node",
  },
});
