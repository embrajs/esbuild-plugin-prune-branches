import { type Expression, type Node, parseSync, type Statement } from "oxc-parser";

/**
 * Map of compile-time boolean flag identifiers to their boolean values.
 */
export type BranchFlags = Record<string, boolean>;

interface Edit {
  start: number;
  end: number;
  text: string;
}

const LEXICAL_DECL_TYPES = new Set([
  "FunctionDeclaration",
  "ClassDeclaration",
  "TSTypeAliasDeclaration",
  "TSInterfaceDeclaration",
  "TSEnumDeclaration",
]);

function evalFlagExpr(node: Expression, flags: BranchFlags): boolean | undefined {
  if (node.type === "ParenthesizedExpression") {
    return evalFlagExpr(node.expression, flags);
  }
  if (node.type === "Identifier") {
    return Object.hasOwn(flags, node.name) ? flags[node.name] : undefined;
  }
  if (node.type === "UnaryExpression" && node.operator === "!") {
    const val = evalFlagExpr(node.argument, flags);
    return val === undefined ? undefined : !val;
  }
  if (node.type === "LogicalExpression") {
    if (node.operator === "&&") {
      const left = evalFlagExpr(node.left, flags);
      if (left === false) {
        return false;
      }
      if (left === true) {
        return evalFlagExpr(node.right, flags);
      }
      return undefined;
    }
    if (node.operator === "||") {
      const left = evalFlagExpr(node.left, flags);
      if (left === true) {
        return true;
      }
      if (left === false) {
        return evalFlagExpr(node.right, flags);
      }
      return undefined;
    }
  }
  return undefined;
}

function hasLexicalDecl(stmts: Statement[]): boolean {
  for (const stmt of stmts) {
    if (stmt.type === "VariableDeclaration" && stmt.kind !== "var") {
      return true;
    }
    if (LEXICAL_DECL_TYPES.has(stmt.type)) {
      return true;
    }
  }
  return false;
}

function needsStmtParens(text: string): boolean {
  return text.startsWith("{") || text.startsWith("function") || text.startsWith("class");
}

function applyEdits(source: string, baseStart: number, baseEnd: number, edits: Edit[]): string {
  let out = "";
  let cursor = baseStart;
  for (const edit of edits) {
    out += source.slice(cursor, edit.start);
    out += edit.text;
    cursor = edit.end;
  }
  out += source.slice(cursor, baseEnd);
  return out;
}

function visitChildren(
  node: Node,
  source: string,
  flags: BranchFlags,
  edits: Edit[],
  visitFn: (child: Node, inStmtList: boolean, edits: Edit[]) => void,
): void {
  for (const key of Object.keys(node)) {
    if (key === "type" || key === "start" || key === "end") {
      continue;
    }
    const value = (node as unknown as Record<string, unknown>)[key];
    if (Array.isArray(value)) {
      const childInStmtList = node.type === "Program" || node.type === "BlockStatement" || node.type === "SwitchCase";
      for (const item of value) {
        if (item && typeof item === "object" && "type" in item) {
          visitFn(item as Node, childInStmtList, edits);
        }
      }
    } else if (value && typeof value === "object" && "type" in value) {
      visitFn(value as Node, false, edits);
    }
  }
  void source;
  void flags;
}

/**
 * Prunes statically known conditional branches from JS/TS source code without
 * enabling full syntax minification.
 */
export function pruneBranches(source: string, flags: BranchFlags, filename = "input.ts"): string {
  const flagNames = Object.keys(flags);
  if (flagNames.length === 0 || !flagNames.some((name) => source.includes(name))) {
    return source;
  }

  const parsed = parseSync(filename, source);
  if (parsed.errors.length > 0) {
    return source;
  }

  const transformNode = (node: Node, inStmtList: boolean): string => {
    const subEdits: Edit[] = [];
    visit(node, inStmtList, subEdits);
    return applyEdits(source, node.start, node.end, subEdits);
  };

  const transformBlockBody = (stmts: Statement[], blockStart: number, blockEnd: number): string => {
    const bodyEdits: Edit[] = [];
    for (const stmt of stmts) {
      visit(stmt, true, bodyEdits);
    }
    return applyEdits(source, blockStart + 1, blockEnd - 1, bodyEdits).trim();
  };

  const visit = (node: Node, inStmtList: boolean, edits: Edit[]): void => {
    if (node.type === "IfStatement") {
      const testVal = evalFlagExpr(node.test, flags);
      if (testVal !== undefined) {
        const chosen = testVal ? node.consequent : node.alternate;
        if (!chosen) {
          edits.push({ start: node.start, end: node.end, text: inStmtList ? "" : "{}" });
          return;
        }
        if (chosen.type === "BlockStatement") {
          const text =
            inStmtList && !hasLexicalDecl(chosen.body)
              ? transformBlockBody(chosen.body, chosen.start, chosen.end)
              : transformNode(chosen, false);
          edits.push({ start: node.start, end: node.end, text });
          return;
        }
        edits.push({ start: node.start, end: node.end, text: transformNode(chosen, inStmtList) });
        return;
      }

      visit(node.test, false, edits);
      visit(node.consequent, false, edits);
      if (node.alternate) {
        if (node.alternate.type === "IfStatement") {
          const altText = transformNode(node.alternate, true);
          if (altText.trim() === "") {
            edits.push({ start: node.consequent.end, end: node.end, text: "" });
            return;
          }
        }
        visit(node.alternate, false, edits);
      }
      return;
    }

    if (node.type === "ConditionalExpression") {
      const testVal = evalFlagExpr(node.test, flags);
      if (testVal !== undefined) {
        const chosen = testVal ? node.consequent : node.alternate;
        const text = transformNode(chosen, false);
        edits.push({ start: node.start, end: node.end, text });
        return;
      }
    }

    if (node.type === "ExpressionStatement" && node.expression.type === "LogicalExpression") {
      const expr = node.expression;
      if (expr.operator === "&&" || expr.operator === "||") {
        const leftVal = evalFlagExpr(expr.left, flags);
        if ((expr.operator === "&&" && leftVal === false) || (expr.operator === "||" && leftVal === true)) {
          edits.push({ start: node.start, end: node.end, text: inStmtList ? "" : "{}" });
          return;
        }
        if ((expr.operator === "&&" && leftVal === true) || (expr.operator === "||" && leftVal === false)) {
          const rightText = transformNode(expr.right, false);
          const text = needsStmtParens(rightText) ? `(${rightText});` : `${rightText};`;
          edits.push({ start: node.start, end: node.end, text });
          return;
        }
      }
    }

    if (node.type === "LogicalExpression" && (node.operator === "&&" || node.operator === "||")) {
      const leftVal = evalFlagExpr(node.left, flags);
      if (leftVal === false && node.operator === "&&") {
        edits.push({ start: node.start, end: node.end, text: "false" });
        return;
      }
      if (leftVal === true && node.operator === "||") {
        edits.push({ start: node.start, end: node.end, text: "true" });
        return;
      }
      if ((leftVal === true && node.operator === "&&") || (leftVal === false && node.operator === "||")) {
        const text = transformNode(node.right, false);
        edits.push({ start: node.start, end: node.end, text });
        return;
      }
    }

    if (node.type === "TryStatement" && node.handler) {
      const handler = node.handler;
      const handlerEdits: Edit[] = [];
      visit(handler.body, false, handlerEdits);

      if (handlerEdits.length > 0) {
        const remaining: string[] = [];
        for (const stmt of handler.body.body) {
          const stmtText = transformNode(stmt, true).trim();
          if (stmtText !== "") {
            remaining.push(stmtText);
          }
        }

        if (remaining.length === 0) {
          visit(node.block, false, edits);
          edits.push({ start: handler.start, end: handler.end, text: "catch {}" });
          if (node.finalizer) {
            visit(node.finalizer, false, edits);
          }
          return;
        }

        if (
          remaining.length === 1 &&
          handler.param?.type === "Identifier" &&
          remaining[0] === `throw ${handler.param.name};`
        ) {
          if (node.finalizer) {
            visit(node.block, false, edits);
            edits.push({ start: node.block.end, end: handler.end, text: "" });
            visit(node.finalizer, false, edits);
            return;
          }
          const text =
            inStmtList && !hasLexicalDecl(node.block.body)
              ? transformBlockBody(node.block.body, node.block.start, node.block.end)
              : transformNode(node.block, false);
          edits.push({ start: node.start, end: node.end, text });
          return;
        }
      }
    }

    visitChildren(node, source, flags, edits, visit);
  };

  const edits: Edit[] = [];
  visit(parsed.program, true, edits);
  return applyEdits(source, 0, source.length, edits);
}
