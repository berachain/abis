import fg from "fast-glob";
import { defineConfig } from "tsup";

const generatedEntries = fg.sync("src/generated/abi/**/*.ts");

const entry: Record<string, string> = {};

for (const file of generatedEntries) {
  // src/generated/abi/contracts/pol/rewardVault.ts → contracts/pol/rewardVault
  const key = file.replace("src/generated/abi/", "").replace(/\.ts$/, "");
  entry[key] = file;
}

export default defineConfig({
  entry,
  format: ["esm", "cjs"],
  outExtension({ format }) {
    return { js: format === "esm" ? ".mjs" : ".cjs" };
  },
  target: "es2022",
  dts: true,
  minify: true,
  sourcemap: true,
  clean: true,
});
