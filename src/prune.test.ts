import { describe, expect, it } from "vitest";
import { pruneBranches } from "./prune.ts";

describe("pruneBranches", () => {
  it("returns source unchanged for empty flags, missing flags, or parse errors", () => {
    const code = "if (__DEV__) { log(); }";
    expect(pruneBranches(code, {})).toBe(code);
    expect(pruneBranches(code, { __OTHER__: false })).toBe(code);
    const broken = "if (__DEV__) {";
    expect(pruneBranches(broken, { __DEV__: false })).toBe(broken);
  });

  it("prunes if / else blocks and preserves lexical scoping when needed", () => {
    expect(pruneBranches("if (__DEV__) { log(); }", { __DEV__: false })).toBe("");
    expect(pruneBranches("if (__DEV__) { log(); }", { __DEV__: true })).toBe("log();");
    expect(pruneBranches("if (__DEV__) log(); else prod();", { __DEV__: false })).toBe("prod();");
    expect(pruneBranches("if (__DEV__) { const x = 1; log(x); }", { __DEV__: true })).toBe("{ const x = 1; log(x); }");
    expect(pruneBranches("if (__DEV__) { function f() {} f(); }", { __DEV__: true })).toBe("{ function f() {} f(); }");
    expect(pruneBranches("if (cond) if (__DEV__) log();", { __DEV__: false })).toBe("if (cond) {}");
  });

  it("handles unary, parenthesized, and compound boolean flag expressions", () => {
    expect(pruneBranches("if (!__DEV__) { prod(); }", { __DEV__: false })).toBe("prod();");
    expect(pruneBranches("if (!__DEV__) { prod(); }", { __DEV__: true })).toBe("");
    expect(pruneBranches("if ((!__DEV__)) { prod(); }", { __DEV__: false })).toBe("prod();");
    expect(pruneBranches("if (!cond && __DEV__) { work(); }", { __DEV__: true })).toBe(
      "if (!cond && __DEV__) { work(); }",
    );
    expect(pruneBranches("if (a ?? __DEV__) { work(); }", { __DEV__: false })).toBe("if (a ?? __DEV__) { work(); }");
    expect(pruneBranches("const arr = [, __DEV__ ? 1 : 2];", { __DEV__: false })).toBe("const arr = [, 2];");
    expect(pruneBranches("switch (x) { case 1: if (__DEV__) log(); break; }", { __DEV__: false })).toBe(
      "switch (x) { case 1:  break; }",
    );

    expect(pruneBranches("if (__DEV__ && __EXTRA__) { a(); }", { __DEV__: false, __EXTRA__: true })).toBe("");
    expect(pruneBranches("if (__DEV__ && __EXTRA__) { a(); }", { __DEV__: true, __EXTRA__: true })).toBe("a();");
    expect(pruneBranches("if (__DEV__ && cond) { a(); }", { __DEV__: true })).toBe("if (cond) { a(); }");
    expect(pruneBranches("if (cond && __DEV__) { a(); }", { __DEV__: false })).toBe("if (cond && __DEV__) { a(); }");

    expect(pruneBranches("if (__DEV__ || __EXTRA__) { a(); }", { __DEV__: true, __EXTRA__: false })).toBe("a();");
    expect(pruneBranches("if (__DEV__ || __EXTRA__) { a(); }", { __DEV__: false, __EXTRA__: false })).toBe("");
    expect(pruneBranches("if (__DEV__ || cond) { a(); }", { __DEV__: false })).toBe("if (cond) { a(); }");
    expect(pruneBranches("if (cond || __DEV__) { a(); }", { __DEV__: true })).toBe("if (cond || __DEV__) { a(); }");
  });

  it("handles else-if chains cleanly", () => {
    expect(pruneBranches("if (a) { x(); } else if (__DEV__) { y(); }", { __DEV__: false })).toBe("if (a) { x(); }");
    expect(pruneBranches("if (a) { x(); } else if (__DEV__) { y(); } else { z(); }", { __DEV__: false })).toBe(
      "if (a) { x(); } else { z(); }",
    );
    expect(pruneBranches("if (a) { x(); } else if (b) { __DEV__ && y(); }", { __DEV__: false })).toBe(
      "if (a) { x(); } else if (b) {  }",
    );
    expect(pruneBranches("if (a) { x(); } else { __DEV__ && y(); }", { __DEV__: false })).toBe(
      "if (a) { x(); } else {  }",
    );
  });

  it("prunes conditional expressions and preserves operator precedence", () => {
    expect(pruneBranches("const x = __DEV__ ? 1 : 2;", { __DEV__: false })).toBe("const x = 2;");
    expect(pruneBranches("const x = __DEV__ ? 1 : 2;", { __DEV__: true })).toBe("const x = 1;");
    expect(pruneBranches("const x = cond ? 1 : 2;", { __DEV__: false })).toBe("const x = cond ? 1 : 2;");
    expect(pruneBranches("const x = (__DEV__ ? a + b : c) * 2;", { __DEV__: true })).toBe("const x = (a + b) * 2;");
    expect(pruneBranches("const x = (__DEV__ ? a || b : c) && d;", { __DEV__: true })).toBe("const x = (a || b) && d;");
  });

  it("prunes logical expression statements and value-position logical expressions", () => {
    expect(pruneBranches("a ?? __DEV__;", { __DEV__: false })).toBe("a ?? __DEV__;");
    expect(pruneBranches("cond && __DEV__;", { __DEV__: false })).toBe("cond && __DEV__;");
    expect(pruneBranches("__DEV__ && log();", { __DEV__: false })).toBe("");
    expect(pruneBranches("__DEV__ && log();", { __DEV__: true })).toBe("log();");
    expect(pruneBranches("__DEV__ || log();", { __DEV__: true })).toBe("");
    expect(pruneBranches("__DEV__ || log();", { __DEV__: false })).toBe("log();");
    expect(pruneBranches("if (c) __DEV__ && log();", { __DEV__: false })).toBe("if (c) {}");
    expect(pruneBranches("__DEV__ && (() => 1)();", { __DEV__: true })).toBe("(() => 1)();");
    expect(pruneBranches("__DEV__ && function f() {};", { __DEV__: true })).toBe("(function f() {});");

    expect(pruneBranches("const x = __DEV__ && val;", { __DEV__: false })).toBe("const x = false;");
    expect(pruneBranches("const x = __DEV__ || val;", { __DEV__: true })).toBe("const x = true;");
    expect(pruneBranches("const x = (__DEV__ && (a = 1)) + 2;", { __DEV__: true })).toBe("const x = ((a = 1)) + 2;");
    expect(pruneBranches("const x = (__DEV__ && a ? b : c) + 1;", { __DEV__: true })).toBe(
      "const x = (a ? b : c) + 1;",
    );
    expect(pruneBranches("const x = (__DEV__ && (a ? b : c)) + 1;", { __DEV__: true })).toBe(
      "const x = ((a ? b : c)) + 1;",
    );
    expect(pruneBranches("const x = (__DEV__ && (a + b)) || c;", { __DEV__: true })).toBe("const x = ((a + b)) || c;");
    expect(pruneBranches("const x = (__DEV__ && (() => 1)) || c;", { __DEV__: true })).toBe(
      "const x = ((() => 1)) || c;",
    );
  });

  it("optimizes try/catch when catch body is pruned", () => {
    expect(pruneBranches("try { work(); } catch (err) { if (__DEV__) log(err); }", { __DEV__: false })).toBe(
      "try { work(); } catch {}",
    );
    expect(
      pruneBranches("try { work(); } catch (err) { if (__DEV__) log(err); } finally { done(); }", { __DEV__: false }),
    ).toBe("try { work(); } catch {} finally { done(); }");

    expect(pruneBranches("try { work(); } catch (err) { if (__DEV__) log(err); throw err; }", { __DEV__: false })).toBe(
      "work();",
    );

    expect(
      pruneBranches("try { const x = 1; work(x); } catch (err) { if (__DEV__) log(err); throw err; }", {
        __DEV__: false,
      }),
    ).toBe("{ const x = 1; work(x); }");

    expect(
      pruneBranches("try { work(); } catch (err) { if (__DEV__) log(err); throw err; } finally { done(); }", {
        __DEV__: false,
      }),
    ).toBe("try { work(); } finally { done(); }");

    expect(
      pruneBranches("try { work(); } catch (err) { if (__DEV__) log(err); other(); throw err; }", { __DEV__: false }),
    ).toBe("try { work(); } catch (err) {  other(); throw err; }");

    expect(pruneBranches("try { if (__DEV__) log(); work(); } catch (err) { throw err; }", { __DEV__: false })).toBe(
      "try {  work(); } catch (err) { throw err; }",
    );

    expect(
      pruneBranches("try { work(); } catch ({ message }) { if (__DEV__) log(message); throw message; }", {
        __DEV__: false,
      }),
    ).toBe("try { work(); } catch ({ message }) {  throw message; }");

    expect(pruneBranches("try { work(); } finally { done(); }", { __DEV__: false })).toBe(
      "try { work(); } finally { done(); }",
    );
  });

  it("handles multi-byte UTF-16 characters and TSX syntax accurately", () => {
    const code = 'const icon = "🚀";\nif (__DEV__) {\n  log(icon);\n}\nconst el = <div />;';
    expect(pruneBranches(code, { __DEV__: false }, "comp.tsx")).toBe('const icon = "🚀";\n\nconst el = <div />;');
  });
});
