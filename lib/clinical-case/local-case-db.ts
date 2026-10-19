import type { ClinicalCase } from "./types";

const DB_NAME = "kardio-clinical-cases";
const DB_VERSION = 1;
const STORE = "cases";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt");
        store.createIndex("specialty", "specialty");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB unavailable"));
  });
}

export async function listLocalClinicalCases(): Promise<ClinicalCase[]> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).getAll();
      request.onsuccess = () => {
        const cases = (request.result as ClinicalCase[]).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        resolve(cases);
      };
      request.onerror = () => reject(request.error ?? new Error("Cannot read clinical cases"));
    });
  } finally {
    db.close();
  }
}

export async function getLocalClinicalCase(id: string): Promise<ClinicalCase | null> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).get(id);
      request.onsuccess = () => resolve((request.result as ClinicalCase | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error("Cannot read clinical case"));
    });
  } finally {
    db.close();
  }
}

export async function saveLocalClinicalCase(value: ClinicalCase): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Cannot save clinical case"));
      tx.onabort = () => reject(tx.error ?? new Error("Clinical case save aborted"));
    });
  } finally {
    db.close();
  }
}

export async function deleteLocalClinicalCase(id: string): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Cannot delete clinical case"));
      tx.onabort = () => reject(tx.error ?? new Error("Clinical case delete aborted"));
    });
  } finally {
    db.close();
  }
}
