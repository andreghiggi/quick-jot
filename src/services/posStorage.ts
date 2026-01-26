// Offline-first storage for POS transactions using IndexedDB

import { POSTransaction, TransactionStatus } from '@/types/pos';

const DB_NAME = 'comandatech_pos';
const DB_VERSION = 1;
const STORE_NAME = 'transactions';

let db: IDBDatabase | null = null;

export async function initPOSDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve();
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'localId' });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('syncedAt', 'syncedAt', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        store.createIndex('companyId', 'companyId', { unique: false });
      }
    };
  });
}

async function getDB(): Promise<IDBDatabase> {
  if (!db) {
    await initPOSDatabase();
  }
  return db!;
}

export async function saveTransaction(transaction: POSTransaction): Promise<void> {
  const database = await getDB();
  
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    
    const request = store.put({
      ...transaction,
      createdAt: transaction.createdAt.toISOString(),
      processedAt: transaction.processedAt?.toISOString(),
      syncedAt: transaction.syncedAt?.toISOString(),
    });
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export async function getTransaction(localId: string): Promise<POSTransaction | null> {
  const database = await getDB();
  
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(localId);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const result = request.result;
      if (result) {
        resolve({
          ...result,
          createdAt: new Date(result.createdAt),
          processedAt: result.processedAt ? new Date(result.processedAt) : undefined,
          syncedAt: result.syncedAt ? new Date(result.syncedAt) : undefined,
        });
      } else {
        resolve(null);
      }
    };
  });
}

export async function getPendingSyncTransactions(): Promise<POSTransaction[]> {
  const database = await getDB();
  
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('syncedAt');
    const request = index.getAll(IDBKeyRange.only(null));
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const results = request.result
        .filter((t: any) => !t.syncedAt && t.status === 'approved')
        .map((result: any) => ({
          ...result,
          createdAt: new Date(result.createdAt),
          processedAt: result.processedAt ? new Date(result.processedAt) : undefined,
          syncedAt: undefined,
        }));
      resolve(results);
    };
  });
}

export async function getAllTransactions(companyId: string, limit = 50): Promise<POSTransaction[]> {
  const database = await getDB();
  
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('createdAt');
    const request = index.openCursor(null, 'prev');
    
    const results: POSTransaction[] = [];
    
    request.onerror = () => reject(request.error);
    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor && results.length < limit) {
        const value = cursor.value;
        if (value.companyId === companyId) {
          results.push({
            ...value,
            createdAt: new Date(value.createdAt),
            processedAt: value.processedAt ? new Date(value.processedAt) : undefined,
            syncedAt: value.syncedAt ? new Date(value.syncedAt) : undefined,
          });
        }
        cursor.continue();
      } else {
        resolve(results);
      }
    };
  });
}

export async function updateTransactionStatus(
  localId: string, 
  status: TransactionStatus,
  additionalData?: Partial<POSTransaction>
): Promise<void> {
  const transaction = await getTransaction(localId);
  if (!transaction) return;

  await saveTransaction({
    ...transaction,
    ...additionalData,
    status,
  });
}

export async function markTransactionSynced(localId: string, serverId: string): Promise<void> {
  const transaction = await getTransaction(localId);
  if (!transaction) return;

  await saveTransaction({
    ...transaction,
    id: serverId,
    syncedAt: new Date(),
  });
}

export async function clearOldTransactions(daysOld = 30): Promise<void> {
  const database = await getDB();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);
  
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('createdAt');
    const request = index.openCursor(IDBKeyRange.upperBound(cutoffDate.toISOString()));
    
    request.onerror = () => reject(request.error);
    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        if (cursor.value.syncedAt) {
          cursor.delete();
        }
        cursor.continue();
      } else {
        resolve();
      }
    };
  });
}
