import { readFileSync } from 'node:fs';
import ts from 'typescript';

/** Execute the production handler with isolated adapters, not a second implementation. */
export function checkoutHandler(path: string, name: string, context: Record<string, unknown>): (...args: any[]) => Promise<any> {
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let body: string | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) body = node.getText(source);
    if (!body) ts.forEachChild(node, visit);
  };
  visit(source);
  if (!body) throw new Error(`Handler ${name} not found`);
  const javascript = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  return new Function(...Object.keys(context), `${javascript}; return ${name};`)(...Object.values(context));
}