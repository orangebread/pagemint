export interface IdbObjectStoreConfig {
  databaseName: string;
  databaseVersion: number;
  storeName: string;
  objectStoreOptions?: IDBObjectStoreParameters;
  indexedDB?: IDBFactory;
  createMissingIndexedDbError?: () => unknown;
  createOpenError?: () => unknown;
  createRequestError?: () => unknown;
  createTransactionError?: () => unknown;
  createTransactionAbortError?: () => unknown;
}

function createFallbackError(message: string): Error {
  return new Error(message);
}

function createConfiguredError(
  factory: (() => unknown) | undefined,
  fallbackMessage: string
): unknown {
  return factory?.() ?? createFallbackError(fallbackMessage);
}

function getGlobalIndexedDbFactory(): IDBFactory | undefined {
  return (globalThis as typeof globalThis & {
    indexedDB?: IDBFactory;
  }).indexedDB;
}

export function hasIndexedDbSupport(indexedDB: IDBFactory | undefined = getGlobalIndexedDbFactory()): boolean {
  return typeof indexedDB !== 'undefined';
}

export function runIdbRequest<TResult>(
  request: IDBRequest<TResult>,
  createRequestError?: () => unknown
): Promise<TResult> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(
      request.error ?? createConfiguredError(createRequestError, 'IndexedDB request failed.')
    );
  });
}

function openIdbDatabase(config: IdbObjectStoreConfig): Promise<IDBDatabase> {
  const indexedDb = config.indexedDB ?? getGlobalIndexedDbFactory();

  if (!indexedDb) {
    throw createConfiguredError(config.createMissingIndexedDbError, 'IndexedDB is unavailable.');
  }

  return new Promise((resolve, reject) => {
    const request = indexedDb.open(config.databaseName, config.databaseVersion);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(config.storeName)) {
        database.createObjectStore(config.storeName, config.objectStoreOptions);
      }
    };
    request.onerror = () => reject(
      request.error ?? createConfiguredError(config.createOpenError, 'Could not open IndexedDB database.')
    );
    request.onsuccess = () => resolve(request.result);
  });
}

export async function withIdbObjectStore<TResult>(
  config: IdbObjectStoreConfig,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => Promise<TResult> | TResult
): Promise<TResult> {
  const database = await openIdbDatabase(config);

  try {
    const transaction = database.transaction(config.storeName, mode);
    const store = transaction.objectStore(config.storeName);
    const result = await operation(store);

    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(
        transaction.error ?? createConfiguredError(config.createTransactionError, 'IndexedDB transaction failed.')
      );
      transaction.onabort = () => reject(
        transaction.error ?? createConfiguredError(config.createTransactionAbortError, 'IndexedDB transaction was aborted.')
      );
    });

    return result;
  } finally {
    database.close();
  }
}

export async function collectIdbStoreValues(
  store: IDBObjectStore,
  createRequestError?: () => unknown
): Promise<unknown[]> {
  if (typeof store.getAll === 'function') {
    return runIdbRequest(store.getAll(), createRequestError);
  }

  return new Promise((resolve, reject) => {
    const values: unknown[] = [];
    const request = store.openCursor();

    request.onsuccess = () => {
      const cursor = request.result;

      if (!cursor) {
        resolve(values);
        return;
      }

      values.push(cursor.value);
      cursor.continue();
    };
    request.onerror = () => reject(
      request.error ?? createConfiguredError(createRequestError, 'Could not read IndexedDB cursor values.')
    );
  });
}
