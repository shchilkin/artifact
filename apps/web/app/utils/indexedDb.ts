function hasIndexedDb() {
  return typeof indexedDB !== 'undefined';
}

export function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
  });
}

export function openIndexedDatabase({
  name,
  version,
  upgrade,
  openErrorMessage,
}: {
  name: string;
  version: number;
  upgrade: (db: IDBDatabase) => void;
  openErrorMessage: string;
}): Promise<IDBDatabase> {
  if (!hasIndexedDb()) return Promise.reject(new Error('IndexedDB is unavailable'));

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onupgradeneeded = () => upgrade(request.result);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error(openErrorMessage));
  });
}

export async function withIndexedDbStore<T>(
  openDatabase: () => Promise<IDBDatabase>,
  storeName: string,
  mode: IDBTransactionMode,
  read: (store: IDBObjectStore, transaction: IDBTransaction) => Promise<T> | T,
): Promise<T> {
  const db = await openDatabase();
  try {
    const transaction = db.transaction(storeName, mode);
    const done = transactionDone(transaction);
    const store = transaction.objectStore(storeName);
    const result = await read(store, transaction);
    await done;
    return result;
  } finally {
    db.close();
  }
}
