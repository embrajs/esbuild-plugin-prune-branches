import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "esbuild";
import { afterEach, describe, expect, it } from "vitest";
import { pruneBranchesPlugin } from "./index.ts";

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "prune-branches-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("pruneBranchesPlugin", () => {
  it("prunes branches across .ts, .tsx, .js, and .jsx files with esbuild", async () => {
    const dir = await makeTempDir();
    await writeFile(
      join(dir, "entry.ts"),
      `
      import { comp } from "./comp.tsx";
      import { helper } from "./helper.js";
      import { widget } from "./widget.jsx";
      if (__DEV__) {
        console.log("dev-only");
      }
      export { comp, helper, widget };
      `,
    );
    await writeFile(join(dir, "comp.tsx"), "export const comp = () => (__DEV__ ? <span /> : <div />);");
    await writeFile(join(dir, "helper.js"), "export function helper() { if (__DEV__) return 1; return 2; }");
    await writeFile(join(dir, "widget.jsx"), "export const widget = () => (__DEV__ ? <a /> : <b />);");

    const result = await build({
      entryPoints: [join(dir, "entry.ts")],
      bundle: true,
      format: "esm",
      write: false,
      jsx: "preserve",
      plugins: [pruneBranchesPlugin({ __DEV__: false })],
    });

    const output = result.outputFiles[0].text;
    expect(output).not.toContain("__DEV__");
    expect(output).not.toContain("dev-only");
    expect(output).toContain("<div />");
    expect(output).toContain("<b />");
    expect(output).toContain("return 2;");
  });

  it("accepts PruneBranchesOptions with a custom filter", async () => {
    const dir = await makeTempDir();
    await writeFile(join(dir, "a.ts"), "export const a = __DEV__ ? 1 : 2;");
    await writeFile(join(dir, "b.js"), "export const b = __DEV__ ? 3 : 4;");
    await writeFile(join(dir, "index.ts"), 'export * from "./a.ts"; export * from "./b.js";');

    const result = await build({
      entryPoints: [join(dir, "index.ts")],
      bundle: true,
      format: "esm",
      write: false,
      define: { __DEV__: "false" },
      plugins: [pruneBranchesPlugin({ flags: { __DEV__: false }, filter: /\.ts$/ })],
    });

    const output = result.outputFiles[0].text;
    expect(output).toContain("var a = 2;");
    expect(output).toContain("var b = false ? 3 : 4;");
  });
});
