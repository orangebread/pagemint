import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const TYPE_SCRIPT_EXTENSIONS = /\.(ts|tsx)$/;
const FALLBACK_EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs', '.cjs'];
const STYLE_EXTENSIONS = /\.(css|scss|sass|less)$/;
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKSPACE_PACKAGE_ENTRYPOINTS = new Map([
  ['@pagemint/render-core', path.join(REPO_ROOT, 'packages/render-core/src/index.ts')],
  ['@pagemint/shared-types', path.join(REPO_ROOT, 'packages/shared-types/src/index.ts')]
]);

export async function resolve(specifier, context, defaultResolve) {
  const workspaceEntrypoint = WORKSPACE_PACKAGE_ENTRYPOINTS.get(specifier);

  if (workspaceEntrypoint) {
    return {
      url: pathToFileURL(workspaceEntrypoint).href,
      shortCircuit: true
    };
  }

  try {
    return await defaultResolve(specifier, context, defaultResolve);
  } catch (error) {
    if (
      error?.code === 'ERR_MODULE_NOT_FOUND' &&
      (specifier.startsWith('./') || specifier.startsWith('../') || specifier.startsWith('/'))
    ) {
      for (const extension of FALLBACK_EXTENSIONS) {
        try {
          return await defaultResolve(`${specifier}${extension}`, context, defaultResolve);
        } catch {
          // Try the next extension.
        }
      }
    }

    throw error;
  }
}

export async function load(url, context, defaultLoad) {
  const pathname = new URL(url).pathname;

  if (STYLE_EXTENSIONS.test(pathname)) {
    return {
      format: 'module',
      source: 'export default {};',
      shortCircuit: true
    };
  }

  if (!TYPE_SCRIPT_EXTENSIONS.test(pathname)) {
    return defaultLoad(url, context, defaultLoad);
  }

  const source = await fs.readFile(new URL(url), 'utf8');
  const transpiled = ts.transpileModule(source, {
    fileName: new URL(url).pathname,
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
      isolatedModules: true,
      sourceMap: false,
      inlineSourceMap: true,
      inlineSources: true
    }
  });

  return {
    format: 'module',
    source: transpiled.outputText,
    shortCircuit: true
  };
}
