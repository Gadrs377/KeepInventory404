// Acesso ao IndexedDB. Só este arquivo conhece o banco; o resto do app usa store.js.

const DB_NAME = 'keepinventory';
const DB_VERSION = 1;

let dbPromise;

export function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('products')) {
        db.createObjectStore('products', { keyPath: 'code' });
      }
      if (!db.objectStoreNames.contains('movements')) {
        const mv = db.createObjectStore('movements', { keyPath: 'id', autoIncrement: true });
        mv.createIndex('code', 'code');
        mv.createIndex('at', 'at');
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export function promisify(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Executa `fn(stores)` dentro de uma transação e resolve com o retorno de `fn`
// quando a transação termina (commit). Se algo falhar, nada é gravado.
export async function tx(storeNames, mode, fn) {
  const db = await openDb();
  const names = Array.isArray(storeNames) ? storeNames : [storeNames];
  return new Promise((resolve, reject) => {
    const t = db.transaction(names, mode);
    const stores = Object.fromEntries(names.map((n) => [n, t.objectStore(n)]));
    let result;
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Transação cancelada'));
    Promise.resolve()
      .then(() => fn(stores, t))
      .then((r) => { result = r; })
      .catch((err) => {
        try { t.abort(); } catch { /* já finalizada */ }
        reject(err);
      });
  });
}

export async function getAll(storeName) {
  return tx(storeName, 'readonly', (s) => promisify(s[storeName].getAll()));
}

export async function get(storeName, key) {
  return tx(storeName, 'readonly', (s) => promisify(s[storeName].get(key)));
}

export async function put(storeName, value) {
  return tx(storeName, 'readwrite', (s) => promisify(s[storeName].put(value)));
}

export async function del(storeName, key) {
  return tx(storeName, 'readwrite', (s) => promisify(s[storeName].delete(key)));
}
