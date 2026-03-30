// @ts-check

const FOLDER_DB_NAME = "meet-to-md-storage"
const FOLDER_DB_VERSION = 1
const FOLDER_STORE_NAME = "folder-handles"
const FOLDER_KEY = "obsidian-folder"

/**
 * Opens (or creates) the IndexedDB database.
 * @returns {Promise<IDBDatabase>}
 */
function openFolderDb() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(FOLDER_DB_NAME, FOLDER_DB_VERSION)

        request.onupgradeneeded = function (event) {
            const db = /** @type {IDBOpenDBRequest} */ (event.target).result
            if (!db.objectStoreNames.contains(FOLDER_STORE_NAME)) {
                db.createObjectStore(FOLDER_STORE_NAME)
            }
        }

        request.onsuccess = function (event) {
            resolve(/** @type {IDBOpenDBRequest} */ (event.target).result)
        }

        request.onerror = function (event) {
            reject(/** @type {IDBOpenDBRequest} */ (event.target).error)
        }
    })
}

/**
 * Saves a FileSystemDirectoryHandle to IndexedDB.
 * @param {FileSystemDirectoryHandle} handle
 * @returns {Promise<void>}
 */
function saveFolderHandle(handle) {
    return openFolderDb().then(db => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(FOLDER_STORE_NAME, "readwrite")
            const store = tx.objectStore(FOLDER_STORE_NAME)
            const request = store.put(handle, FOLDER_KEY)
            request.onsuccess = () => resolve()
            request.onerror = (e) => reject(/** @type {IDBRequest} */ (e.target).error)
        })
    })
}

/**
 * Retrieves the saved FileSystemDirectoryHandle from IndexedDB.
 * Returns null if not found.
 * @returns {Promise<FileSystemDirectoryHandle | null>}
 */
function getFolderHandle() {
    return openFolderDb().then(db => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(FOLDER_STORE_NAME, "readonly")
            const store = tx.objectStore(FOLDER_STORE_NAME)
            const request = store.get(FOLDER_KEY)
            request.onsuccess = (e) => resolve(/** @type {IDBRequest} */ (e.target).result || null)
            request.onerror = (e) => reject(/** @type {IDBRequest} */ (e.target).error)
        })
    })
}

/**
 * Clears the saved folder handle from IndexedDB.
 * @returns {Promise<void>}
 */
function clearFolderHandle() {
    return openFolderDb().then(db => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(FOLDER_STORE_NAME, "readwrite")
            const store = tx.objectStore(FOLDER_STORE_NAME)
            const request = store.delete(FOLDER_KEY)
            request.onsuccess = () => resolve()
            request.onerror = (e) => reject(/** @type {IDBRequest} */ (e.target).error)
        })
    })
}
