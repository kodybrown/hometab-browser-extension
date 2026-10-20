(() => {
    "use strict";
    const extension = Boolean(globalThis.chrome?.runtime?.id && location.protocol === "chrome-extension:");
    const hash = async bytes => [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(b => b.toString(16).padStart(2, "0")).join("");
    function pngData(bytes) {
        if (bytes.byteLength > 12000) throw new Error("Favicon exceeds the image size limit.");
        const encoded = "data:image/png;base64," + btoa(String.fromCharCode(...new Uint8Array(bytes)));
        if (!HomeTabHTML.isEmbeddedIcon(encoded)) throw new Error("Invalid favicon PNG.");
        return encoded;
    }
    const rememberHash = value => { try { localStorage.setItem("hometab.lastSeenHash", value); } catch { /* Informational only; never a save precondition. */ } };
    async function connection(value, key = "directory") {
        const db = await new Promise((resolve, reject) => {
            const request = indexedDB.open("hometab.files", 1);
            request.onupgradeneeded = () => request.result.createObjectStore("connections");
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        try {
            return await new Promise((resolve, reject) => {
                const transaction = db.transaction("connections", value === undefined ? "readonly" : "readwrite");
                const store = transaction.objectStore("connections");
                const request = value === undefined ? store.get(key) : store.put(value, key);
                let result;
                request.onsuccess = () => { result = request.result; };
                transaction.oncomplete = () => resolve(result);
                transaction.onerror = () => reject(transaction.error);
                transaction.onabort = () => reject(transaction.error || new Error("Could not remember the folder."));
            });
        } finally { db.close(); }
    }
    class FileStore {
        constructor() { this.directory = null; this.writable = false; this.icons = new Map(); this.iconURLs = new Set(); }
        clearIcons() {
            for (const url of this.iconURLs) URL.revokeObjectURL(url);
            this.iconURLs.clear(); this.icons = new Map();
        }
        async restore() {
            try { this.directory = await connection(); } catch { return false; }
            if (!this.directory) return false;
            if (await this.directory.queryPermission({ mode: "read" }) !== "granted") return false;
            this.writable = extension && await this.directory.queryPermission({ mode: "readwrite" }) === "granted";
            return true;
        }
        async connect() {
            if (typeof showDirectoryPicker !== "function") throw new Error("Folder access is unavailable. In Brave, enable brave://flags/#file-system-access-api and relaunch. You can still use Open HTML read-only.");
            const directory = await showDirectoryPicker({ id: "hometab-data", mode: extension ? "readwrite" : "read" });
            // Validate an existing database before remembering a connection. Never create or overwrite it here.
            const probe = new FileStore();
            probe.directory = directory;
            const snapshot = await probe.read();
            this.clearIcons();
            this.directory = directory;
            this.writable = extension && await directory.queryPermission({ mode: "readwrite" }) === "granted";
            try { await connection(directory); } catch { /* The current connection still works if metadata storage is blocked. */ }
            return snapshot;
        }
        async read() {
            if (!this.directory) throw new Error("Connect the folder containing bookmarks.html first.");
            // Re-resolve the name on every read: synchronizers may replace the file rather than modify it.
            const handle = await this.directory.getFileHandle("bookmarks.html");
            const bytes = await (await handle.getFile()).arrayBuffer();
            const data = HomeTabHTML.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
            const revision = await hash(bytes);
            rememberHash(revision);
            return { data, revision, bytes };
        }
        async write(data, expected) {
            if (!extension || !this.writable) throw new Error("This view is read-only. Connect the folder in the HomeTab extension to edit.");
            HomeTabHTML.validate(data);
            const save = async () => {
                const handle = await this.directory.getFileHandle("bookmarks.html");
                // The exclusive stream is a temporary file until close(). Acquire it before checking the current bytes.
                const stream = await handle.createWritable({ mode: "exclusive" });
                try {
                    const current = await this.read();
                    if (current.revision !== expected) throw new Error("bookmarks.html changed since this page loaded. Your edit was not saved. Close the editor, reload the file, and retry.");
                    if (JSON.stringify(current.data) === JSON.stringify(data)) return current;
                    const next = HomeTabModel.clone(data);
                    // Immutable, content-addressed icons are committed before HTML references them.
                    // Failed HTML writes may leave unused images; keep them for backups and undo.
                    const saved = new Map();
                    for (const { node } of HomeTabModel.entries(next)) {
                        if (!HomeTabHTML.isEmbeddedIcon(node.icon)) continue;
                        if (!saved.has(node.icon)) saved.set(node.icon, await this.saveIcon(node.icon));
                        node.icon = saved.get(node.icon);
                    }
                    const text = HomeTabHTML.serialize(next);
                    // Keep the exact previous bytes outside browser storage, including hand-written formatting.
                    const backup = await this.directory.getFileHandle("bookmarks.previous.html", { create: true });
                    const backupStream = await backup.createWritable({ mode: "exclusive" });
                    try { await backupStream.write(current.bytes); await backupStream.close(); }
                    finally { try { await backupStream.abort(); } catch { /* Already closed. */ } }
                    await stream.write(text);
                    // Catch changes that arrived while preparing the write, without claiming distributed locking.
                    if ((await this.read()).revision !== expected) throw new Error("bookmarks.html changed while saving. Your edit was not saved; reload the file.");
                    await stream.close();
                    const revision = await hash(new TextEncoder().encode(text));
                    rememberHash(revision);
                    return { data: next, revision };
                } finally {
                    // abort() only discards the uncommitted temporary stream; it never rewrites the source.
                    try { await stream.abort(); } catch { /* A committed stream is already closed. */ }
                }
            };
            // Web Locks coordinate this extension's pages. Other browsers and external sync tools remain independent.
            return navigator.locks ? navigator.locks.request("hometab-bookmarks-write", save) : save();
        }
        async saveIcon(value) {
            if (!extension || !this.writable || !HomeTabHTML.isEmbeddedIcon(value)) throw new Error("Connect the folder in the extension to save favicons.");
            const bytes = Uint8Array.from(atob(value.split(",")[1]), c => c.charCodeAt(0));
            const name = await hash(bytes) + ".png", reference = "favicons/" + name;
            const directory = await this.directory.getDirectoryHandle("favicons", { create: true });
            const file = await directory.getFileHandle(name, { create: true });
            const existing = await file.getFile();
            if (existing.size !== bytes.length || await hash(await existing.arrayBuffer()) !== name.slice(0, -4)) {
                const stream = await file.createWritable({ mode: "exclusive" });
                try { await stream.write(bytes); await stream.close(); }
                finally { try { await stream.abort(); } catch { /* Already closed. */ } }
            }
            this.icons.delete(reference);
            return reference;
        }
        async iconURL(reference, connected = true) {
            if (HomeTabHTML.isEmbeddedIcon(reference)) return reference;
            if (!HomeTabHTML.isIconFile(reference)) return "";
            if (!connected && !/^https?:$/.test(location.protocol)) return "";
            if (this.icons.has(reference)) return this.icons.get(reference);
            const cache = this.icons;
            const result = (async () => {
                try {
                    const bytes = await this.iconBytes(reference, connected);
                    const url = URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
                    if (cache !== this.icons) { URL.revokeObjectURL(url); return ""; }
                    this.iconURLs.add(url);
                    return url;
                } catch { return ""; /* Missing/unreadable images never prevent using the links. */ }
            })();
            cache.set(reference, result);
            return result;
        }
        async iconBytes(reference, connected = true) {
            if (!HomeTabHTML.isIconFile(reference)) throw new Error("Invalid favicon path.");
            let bytes;
            if (connected && this.directory) {
                const directory = await this.directory.getDirectoryHandle("favicons");
                const file = await (await directory.getFileHandle(reference.slice(9))).getFile();
                if (file.size > 12000) throw new Error("Favicon exceeds the image size limit.");
                bytes = await file.arrayBuffer();
            } else if (!connected && /^https?:$/.test(location.protocol)) {
                const response = await fetch(reference, { signal: AbortSignal.timeout(10000) });
                if (!response.ok) throw new Error("Favicon file not found.");
                bytes = await response.arrayBuffer();
            } else throw new Error("Connect the data folder to include favicon files.");
            pngData(bytes);
            if (await hash(bytes) !== reference.slice(9, -4)) throw new Error("Favicon hash does not match its filename.");
            return new Uint8Array(bytes);
        }
    }
    // Capture defaults are browser connection metadata, never bookmark or appearance content.
    const capturePreferences = value => connection(value, "capture");
    globalThis.HomeTabFiles = { FileStore, extension, hash, pngData, capturePreferences };
})();
