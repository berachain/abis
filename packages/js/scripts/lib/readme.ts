import { promises as fs } from "node:fs";
import path from "node:path";

import type { GeneratedModule } from "./types";

const MARKER_START = "<!-- exports:start -->";
const MARKER_END = "<!-- exports:end -->";

type TreeNode = {
  children: Map<string, TreeNode>;
};

/**
 * Build a Markdown directory-tree string from generated modules.
 *
 * Each module's `moduleRelPath` (minus `.ts`) becomes an entry. Directories
 * get a trailing `/`, leaves are bare names. The root is `@berachain/abis`.
 */
export function buildExportTree(modules: GeneratedModule[]): string {
  const root: TreeNode = { children: new Map() };

  for (const mod of modules) {
    const subpath = mod.moduleRelPath.replace(/\.ts$/, "");
    const segments = subpath.split("/");

    let current = root;
    for (const segment of segments) {
      if (!current.children.has(segment)) {
        current.children.set(segment, { children: new Map() });
      }
      current = current.children.get(segment) as TreeNode;
    }
  }

  const lines: string[] = ["@berachain/abis"];
  renderNode(root, "", lines);
  return lines.join("\n");
}

function renderNode(node: TreeNode, prefix: string, lines: string[]): void {
  const entries = [...node.children.entries()];

  for (let i = 0; i < entries.length; i++) {
    const [name, child] = entries[i];
    const isLast = i === entries.length - 1;
    const connector = isLast ? "\u2514\u2500\u2500 " : "\u251c\u2500\u2500 ";
    const isDir = child.children.size > 0;

    lines.push(`${prefix}${connector}${name}${isDir ? "/" : ""}`);

    if (isDir) {
      const childPrefix = prefix + (isLast ? "    " : "\u2502   ");
      renderNode(child, childPrefix, lines);
    }
  }
}

/**
 * Update the README with an auto-generated export tree.
 *
 * Finds `<!-- exports:start -->` / `<!-- exports:end -->` markers and replaces
 * everything between them with a fenced code block containing the tree.
 * If markers are missing, logs a warning and skips.
 */
export async function updateReadmeTree(
  modules: GeneratedModule[],
  readmePath = path.resolve("README.md"),
): Promise<void> {
  let content: string;
  try {
    content = await fs.readFile(readmePath, "utf8");
  } catch {
    console.warn(`[readme] Could not read ${readmePath}, skipping tree update`);
    return;
  }

  const startIdx = content.indexOf(MARKER_START);
  const endIdx = content.indexOf(MARKER_END);

  if (startIdx === -1 || endIdx === -1) {
    console.warn("[readme] Missing export markers in README.md, skipping tree update");
    return;
  }

  const tree = buildExportTree(modules);
  const replacement = `${MARKER_START}\n\`\`\`\n${tree}\n\`\`\`\n${MARKER_END}`;
  const updated = content.slice(0, startIdx) + replacement + content.slice(endIdx + MARKER_END.length);

  await fs.writeFile(readmePath, updated, "utf8");
}
