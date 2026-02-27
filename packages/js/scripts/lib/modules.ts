import path from "node:path";
import { toCamelCase } from "./naming";
import type { DiscoveredArtifact, GeneratedModule } from "./types";

/**
 * Convert a discovered artifact into a generated TypeScript module descriptor.
 *
 * The output path preserves the source repo's directory structure:
 * - The main source (matching `mainSource`) outputs at the top level.
 * - Other sources are nested under their `sourceId` directory.
 * - The relative directory from `srcDir` is preserved (e.g. `pol/rewards/`).
 * - The filename is the camelCase contract name (e.g. `rewardVault.ts`).
 *
 * The export name is `{camelCaseName}Abi` (e.g. `rewardVaultAbi`).
 * The module content is a `const … = [...] as const` for viem type inference.
 */
export function artifactToModule(artifact: DiscoveredArtifact, mainSource?: string): GeneratedModule {
  const exportName = `${toCamelCase(artifact.contractName)}Abi`;
  const fileName = `${toCamelCase(artifact.contractName)}.ts`;
  const innerPath = artifact.relDir === "." ? fileName : path.posix.join(artifact.relDir, fileName);
  const isMain = mainSource !== undefined && artifact.sourceId === mainSource;
  const moduleRelPath = isMain ? innerPath : path.posix.join(artifact.sourceId, innerPath);
  const abiContent = JSON.stringify(artifact.abi, null, 2);

  return {
    sourceId: artifact.sourceId,
    contractName: artifact.contractName,
    exportName,
    moduleRelPath,
    dedupeKey: `${artifact.sourceId}:${artifact.contractName}`,
    moduleContent: `export const ${exportName} = ${abiContent} as const;\n\nexport default ${exportName};\n`,
  };
}

/**
 * Deduplicate modules and detect ABI collisions.
 *
 * Modules are keyed by `{sourceId}:{contractName}`. When two modules
 * share the same key:
 * - If their content is identical → one is silently dropped with a warning.
 * - If their content differs → an error is thrown (ABI collision).
 *
 * The returned modules are sorted by source id, then contract name.
 *
 * @throws on ABI collision (same key, different content).
 */
export function dedupeAndValidateModules(modules: GeneratedModule[]): {
  modules: GeneratedModule[];
  warnings: string[];
} {
  const byKey = new Map<string, GeneratedModule>();
  const warnings: string[] = [];

  for (const mod of modules) {
    const existing = byKey.get(mod.dedupeKey);
    if (!existing) {
      byKey.set(mod.dedupeKey, mod);
      continue;
    }

    if (existing.moduleContent === mod.moduleContent) {
      warnings.push(`Duplicate ABI ignored for ${mod.dedupeKey}`);
      continue;
    }

    throw new Error(
      `ABI collision for ${mod.dedupeKey}: same source and contractName produced different ABI content`,
    );
  }

  const deduped = [...byKey.values()].sort((a, b) => {
    return (
      a.sourceId.localeCompare(b.sourceId) ||
      a.contractName.localeCompare(b.contractName) ||
      a.moduleRelPath.localeCompare(b.moduleRelPath)
    );
  });

  return { modules: deduped, warnings };
}
