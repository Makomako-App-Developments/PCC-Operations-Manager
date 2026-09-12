const DATABASE_NAME = "gardenops-field-attachments";
const DATABASE_VERSION = 1;
const STORE_NAME = "attachments";

export interface StoredWebAttachment {
  key: string;
  blob: Blob;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("Browser attachment storage is unavailable."));
  }
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    } catch {
      reject(new Error("Browser attachment storage is unavailable."));
      return;
    }
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("Browser attachment storage could not be opened."));
    request.onblocked = () => reject(new Error("Browser attachment storage is blocked by another GardenOps tab."));
  });
}

async function runRequest<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const request = operation(transaction.objectStore(STORE_NAME));
      let result: T;
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => reject(request.error ?? new Error("Browser attachment storage operation failed."));
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error ?? new Error("Browser attachment storage operation failed."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Browser attachment storage operation was cancelled."));
    });
  } finally {
    database.close();
  }
}

export async function saveWebAttachment(attachment: StoredWebAttachment): Promise<void> {
  try {
    await runRequest("readwrite", store => store.put(attachment));
  } catch (error) {
    if (error instanceof DOMException && error.name === "QuotaExceededError") {
      throw new Error("This browser does not have enough storage to safely queue the photo.");
    }
    throw error;
  }
}

export async function loadWebAttachment(key: string): Promise<StoredWebAttachment | undefined> {
  return runRequest("readonly", store => store.get(key));
}

export async function deleteWebAttachment(key: string): Promise<void> {
  await runRequest("readwrite", store => store.delete(key));
}