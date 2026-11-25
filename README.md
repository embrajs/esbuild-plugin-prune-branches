# @embra/esbuild-plugin-prune-branches

[![Docs](https://img.shields.io/badge/Docs-read-%23fdf9f5)](https://embrajs.github.io/esbuild-plugin-prune-branches)
[![Build Status](https://github.com/embrajs/esbuild-plugin-prune-branches/actions/workflows/build.yml/badge.svg)](https://github.com/embrajs/esbuild-plugin-prune-branches/actions/workflows/build.yml)
[![npm-version](https://img.shields.io/npm/v/@embra/esbuild-plugin-prune-branches.svg)](https://www.npmjs.com/package/@embra/esbuild-plugin-prune-branches)
[![Coverage Status](https://embrajs.github.io/esbuild-plugin-prune-branches/coverage-badges/@embra/esbuild-plugin-prune-branches.svg)](https://embrajs.github.io/esbuild-plugin-prune-branches/coverage/)

esbuild plugin to prune dead conditional branches without syntax minification.

## Install

```sh
npm add -D @embra/esbuild-plugin-prune-branches
```

## Usage

```ts
import { build } from "esbuild";
import { pruneBranchesPlugin } from "@embra/esbuild-plugin-prune-branches";

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  format: "esm",
  define: { __DEV__: "false" },
  plugins: [pruneBranchesPlugin({ __DEV__: false })],
});
```

With a custom `onLoad` filter:

```ts
pruneBranchesPlugin({
  flags: { __DEV__: false },
  filter: /\.ts$/,
});
```

You can also call `pruneBranches(source, flags, filename)` directly without esbuild.

## What It Prunes

- `if (flag)` / `if (!flag)` / `if (flag && cond)` / `if (flag || cond)` / `else if (...)`
- Ternary expressions: `flag ? a : b`
- Logical expressions & statements: `flag && expr`, `flag || expr`
- `try / catch` blocks when `catch` becomes empty (`catch {}`) or reduces to `throw err`

## License

MIT @ [embrajs](https://github.com/embrajs)
