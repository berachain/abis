/**
 * Split a mixed-case identifier into lowercase word tokens.
 *
 * Handles common Solidity naming conventions:
 * - `camelCase`  → `["camel", "case"]`
 * - `PascalCase` → `["pascal", "case"]`
 * - Consecutive uppercase like `BGTStaker` → `["bgt", "staker"]`
 * - Separators like underscores/hyphens → split on them
 */
export function splitWords(input: string): string[] {
  return input
    .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.toLowerCase());
}

/**
 * Convert an identifier to `camelCase`.
 *
 * Used for generated export names (e.g. `RewardVault` → `rewardVault`).
 * Returns `"abi"` for empty inputs.
 */
export function toCamelCase(input: string): string {
  const parts = splitWords(input);
  if (parts.length === 0) return "abi";
  return [parts[0], ...parts.slice(1).map((p) => p[0].toUpperCase() + p.slice(1))].join("");
}

/**
 * Convert an identifier to `PascalCase`.
 *
 * Returns `"Contract"` for empty inputs.
 */
export function toPascalCase(input: string): string {
  const parts = splitWords(input);
  if (parts.length === 0) return "Contract";
  return parts.map((p) => p[0].toUpperCase() + p.slice(1)).join("");
}

/**
 * Convert an identifier to `kebab-case`.
 */
export function toKebabCase(input: string): string {
  return splitWords(input).join("-");
}
