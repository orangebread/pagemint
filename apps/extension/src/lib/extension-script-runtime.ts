export interface ExtensionExecuteScriptTarget {
  tabId: number;
}

export interface ExtensionExecuteScriptFunctionDetails<TResult, TArgs extends unknown[]> {
  target: ExtensionExecuteScriptTarget;
  func: (...args: TArgs) => TResult | Promise<TResult>;
  args: TArgs;
}

export interface ExtensionExecuteScriptFilesDetails {
  target: ExtensionExecuteScriptTarget;
  files: string[];
}

export interface ExtensionScriptingLike {
  executeScript<TResult, TArgs extends unknown[]>(
    details: ExtensionExecuteScriptFunctionDetails<TResult, TArgs> | ExtensionExecuteScriptFilesDetails
  ): Promise<Array<{ result?: TResult | null } | null>>;
}

export interface ExecuteScriptInTabOptions {
  allowUndefinedResult?: boolean;
  allowNullResult?: boolean;
  missingResultMessage?: string;
}

export function normalizeExtensionErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }

  return '';
}

export function isPermissionDeniedExtensionError(error: unknown): boolean {
  const message = normalizeExtensionErrorMessage(error).toLowerCase();
  return /permission|denied|access is denied|not allowed|cannot access contents/.test(message);
}

export async function executeScriptInTab<TResult, TArgs extends unknown[]>(
  scripting: ExtensionScriptingLike,
  tabId: number,
  func: (...args: TArgs) => TResult | Promise<TResult>,
  args: TArgs,
  options: ExecuteScriptInTabOptions = {}
): Promise<TResult> {
  const executionResults = await scripting.executeScript<TResult, TArgs>({
    target: { tabId },
    func,
    args
  });

  if (!executionResults.length) {
    throw new Error(
      options.missingResultMessage
      ?? 'PageMint did not receive a script result from the active tab.'
    );
  }

  const firstExecutionResult = executionResults[0];
  const result = firstExecutionResult && typeof firstExecutionResult === 'object'
    ? firstExecutionResult.result
    : undefined;

  if (
    typeof result === 'undefined'
    && options.allowUndefinedResult !== true
  ) {
    throw new Error(
      options.missingResultMessage
      ?? 'PageMint did not receive a script result from the active tab.'
    );
  }

  if (
    result === null
    && options.allowNullResult !== true
    && options.allowUndefinedResult !== true
  ) {
    throw new Error(
      options.missingResultMessage
      ?? 'PageMint did not receive a script result from the active tab.'
    );
  }

  return result as TResult;
}

export async function executeScriptFilesInTab(
  scripting: ExtensionScriptingLike,
  tabId: number,
  files: string[]
): Promise<void> {
  await scripting.executeScript({
    target: { tabId },
    files
  });
}
