import { promises as fs } from "node:fs";
import path from "node:path";

import { buildManifest } from "./lib/changelog";
import { loadConfig } from "./lib/config";
import { discoverArtifacts, matchesAny } from "./lib/discovery";
import { ensureRepo } from "./lib/git";
import { artifactToModule, dedupeAndValidateModules } from "./lib/modules";
import { splitWords, toCamelCase, toKebabCase, toPascalCase } from "./lib/naming";
import { updateReadmeTree } from "./lib/readme";
import type { DiscoveredArtifact, GenerateOptions } from "./lib/types";
import { stableStringify } from "./lib/utils";
import { writeGeneratedFiles } from "./lib/writer";

export { buildManifest, diffManifests, fetchManifestFromNpm, renderChangelog } from "./lib/changelog";
// Re-export everything for tests and external consumers.
export { loadConfig } from "./lib/config";
export { discoverArtifacts, extractArtifact } from "./lib/discovery";
export { ensureRepo, injectAuthToken, resolveRepoUrl } from "./lib/git";
export { artifactToModule, dedupeAndValidateModules } from "./lib/modules";
export { buildExportTree, updateReadmeTree } from "./lib/readme";
export type * from "./lib/types";
export { writeGeneratedFiles } from "./lib/writer";

/**
 * Main orchestrator: load config, clone/update repos, discover artifacts,
 * generate TypeScript modules, and write them to disk.
 *
 * Steps:
 * 1. Load and validate `abi.config.json`.
 * 2. For each source, ensure the repo is available locally (clone or update).
 * 3. Discover Foundry artifacts by walking the source's `srcDir`.
 * 4. Convert artifacts to TypeScript module descriptors.
 * 5. Deduplicate and validate (detect ABI collisions).
 * 6. Write generated `.ts` files to the output directory.
 */
export async function generateAbis(options: GenerateOptions = {}): Promise<{
  moduleCount: number;
  artifactCount: number;
  warnings: string[];
}> {
  const configPath = path.resolve(options.configPath ?? "abi.config.json");
  const config = await loadConfig(configPath);
  const reposDir = config.reposDir ?? ".repos";

  const allArtifacts: DiscoveredArtifact[] = [];
  const warnings: string[] = [];

  for (const source of config.sources) {
    const repoOverride = options.repoOverrides?.[source.id] ?? options.repoOverrides?.["*"];
    const refOverride = options.refOverrides?.[source.id] ?? options.refOverrides?.["*"];
    const effectiveSource = {
      ...source,
      ...(repoOverride && source.repo ? { repo: repoOverride } : {}),
      ...(refOverride ? { ref: refOverride } : {}),
    };

    let resolvedPath: string;
    try {
      resolvedPath = await ensureRepo(effectiveSource, reposDir);
    } catch (err) {
      const message = `Failed to resolve repo for source "${source.id}": ${err instanceof Error ? err.message : err}`;
      if (config.onMissingRepo === "warn") {
        warnings.push(message);
        continue;
      }
      throw new Error(message);
    }

    const discovered = await discoverArtifacts(
      source,
      resolvedPath,
      options.runBuild ?? true,
      config.onMissingRepo ?? "error",
    );
    allArtifacts.push(...discovered.artifacts);
    warnings.push(...discovered.warnings);
  }

  const modules = allArtifacts.map((a) => artifactToModule(a, config.mainSource));
  const deduped = dedupeAndValidateModules(modules);
  warnings.push(...deduped.warnings);

  await writeGeneratedFiles(config, deduped.modules);
  await updateReadmeTree(deduped.modules);

  // Write ABI manifest for changelog diffing (ships in the npm package).
  const manifest = buildManifest(deduped.modules);
  await fs.writeFile(path.resolve("abi-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  return {
    moduleCount: deduped.modules.length,
    artifactCount: allArtifacts.length,
    warnings,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const repoOverrides: Record<string, string> = {};
  const refOverrides: Record<string, string> = {};

  for (let i = 2; i < process.argv.length; i++) {
    const flag = process.argv[i];
    const next = process.argv[i + 1];
    if ((flag === "--repo" || flag === "--ref") && next) {
      const map = flag === "--repo" ? repoOverrides : refOverrides;
      const value = process.argv[++i];
      const eqIdx = value.indexOf("=");
      if (eqIdx !== -1) {
        map[value.slice(0, eqIdx)] = value.slice(eqIdx + 1);
      } else {
        map["*"] = value;
      }
    }
  }

  generateAbis({
    repoOverrides: Object.keys(repoOverrides).length > 0 ? repoOverrides : undefined,
    refOverrides: Object.keys(refOverrides).length > 0 ? refOverrides : undefined,
  })
    .then((result) => {
      for (const warning of result.warnings) {
        console.warn(`[abi:generate] ${warning}`);
      }
      console.log(
        `[abi:generate] Generated ${result.moduleCount} modules from ${result.artifactCount} artifacts`,
      );
    })
    .catch((error) => {
      console.error("[abi:generate] Failed:", error);
      process.exitCode = 1;
    });
}

export const __testUtils = {
  stableStringify,
  toCamelCase,
  toPascalCase,
  toKebabCase,
  matchesAny,
  splitWords,
};
