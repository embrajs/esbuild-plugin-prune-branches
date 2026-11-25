import { readFile } from "node:fs/promises";
import type { Loader, Plugin } from "esbuild";
import { type BranchFlags, pruneBranches } from "./prune.ts";

export { type BranchFlags, pruneBranches } from "./prune.ts";

/**
 * Options for {@link pruneBranchesPlugin}.
 */
export interface PruneBranchesOptions {
  /** Compile-time boolean flags to evaluate and prune. */
  flags: BranchFlags;
  /** Optional esbuild `onLoad` filter regex. Defaults to `/\.[cm]?[jt]sx?$/`. */
  filter?: RegExp;
}

const DEFAULT_FILTER = /\.[cm]?[jt]sx?$/;

function getLoader(filePath: string): Loader {
  if (filePath.endsWith(".tsx")) {
    return "tsx";
  }
  if (filePath.endsWith(".jsx")) {
    return "jsx";
  }
  if (/\.[cm]?ts$/.test(filePath)) {
    return "ts";
  }
  return "js";
}

function isOptionsObject(value: BranchFlags | PruneBranchesOptions): value is PruneBranchesOptions {
  return "flags" in value && typeof value.flags === "object" && value.flags !== null;
}

/**
 * Creates an esbuild plugin that prunes statically known conditional branches
 * without enabling syntax minification.
 */
export function pruneBranchesPlugin(options: BranchFlags | PruneBranchesOptions): Plugin {
  const { flags, filter = DEFAULT_FILTER } = isOptionsObject(options) ? options : { flags: options };

  return {
    name: "prune-branches",
    setup(build) {
      build.onLoad({ filter }, async ({ path }) => {
        const source = await readFile(path, "utf8");
        return {
          contents: pruneBranches(source, flags, path),
          loader: getLoader(path),
        };
      });
    },
  };
}
