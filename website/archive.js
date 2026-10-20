(() => {
    "use strict";
    const H = HomeTabHTML, F = HomeTabFiles, M = HomeTabModel;
    const ZIP_LIMIT = 32 * 1024 * 1024, TOTAL_LIMIT = 40 * 1024 * 1024, HTML_LIMIT = 10000000;
    async function create(data, store, connected, expected) {
        H.validate(data);
        const verify = async () => {
            if (connected && (await store.read()).revision !== expected) throw new Error("bookmarks.html changed. Reload the file before downloading a ZIP backup.");
        };
        await verify();
        const html = new TextEncoder().encode(H.serialize(data));
        if (html.length > HTML_LIMIT) throw new Error("The HTML database exceeds 10 MB.");
        const files = { "bookmarks.html": [html, { level: 6 }] };
        let total = html.length;
        const references = new Set(M.entries(data).map(item => item.node.icon).filter(H.isIconFile));
        for (const reference of references) {
            let bytes;
            try { bytes = await store.iconBytes(reference, connected); }
            catch (error) { throw new Error("ZIP backup could not include " + reference + ". " + error.message); }
            total += bytes.length;
            if (total > TOTAL_LIMIT) throw new Error("The backup exceeds the 40 MB expanded limit.");
            files[reference] = [bytes, { level: 0 }];
        }
        await verify();
        const zip = fflate.zipSync(files);
        if (zip.length > ZIP_LIMIT) throw new Error("The ZIP backup exceeds 32 MB.");
        return zip;
    }
    async function parse(bytes) {
        if (bytes.byteLength > ZIP_LIMIT) throw new Error("ZIP backups must be no larger than 32 MB.");
        let total = 0;
        const declared = new Map();
        // Filter central-directory metadata BEFORE decompression. Never extract arbitrary archive paths.
        const input = new Uint8Array(bytes);
        fflate.unzipSync(input, { filter(file) {
            const name = file.name;
            if (declared.has(name) || declared.size >= 20002 || (name !== "bookmarks.html" && name !== "favicons/" && !H.isIconFile(name))) throw new Error("The ZIP contains duplicate or unexpected files.");
            declared.set(name, file.originalSize); total += file.originalSize;
            const limit = name === "bookmarks.html" ? HTML_LIMIT : 12000;
            if (file.originalSize > limit || total > TOTAL_LIMIT || (name === "favicons/" && file.originalSize !== 0)) throw new Error("The ZIP exceeds the supported file size limits.");
            return false;
        } });
        const files = {}, local = new Set(); let actualTotal = 0;
        // Stream small compressed chunks and enforce ACTUAL output sizes, too: ZIP headers can lie.
        // This bounds expansion work before a malformed compressed entry can allocate a huge output.
        const unzip = new fflate.Unzip(file => {
            if (!declared.has(file.name) || local.has(file.name)) throw new Error("The ZIP contains inconsistent or duplicate files.");
            local.add(file.name);
            const chunks = []; let size = 0;
            file.ondata = (error, chunk, final) => {
                if (error) throw error;
                size += chunk.length; actualTotal += chunk.length;
                if (size > declared.get(file.name) || actualTotal > TOTAL_LIMIT) throw new Error("The ZIP exceeds its declared file sizes.");
                chunks.push(chunk);
                if (final) {
                    if (size !== declared.get(file.name)) throw new Error("The ZIP contains an incomplete file.");
                    const output = new Uint8Array(size); let offset = 0;
                    for (const part of chunks) { output.set(part, offset); offset += part.length; }
                    files[file.name] = output;
                }
            };
            file.start();
        });
        unzip.register(fflate.UnzipInflate);
        for (let offset = 0; offset < input.length; offset += 1024) unzip.push(input.subarray(offset, offset + 1024), offset + 1024 >= input.length);
        if (Object.keys(files).length !== declared.size) throw new Error("The ZIP is incomplete.");
        if (!files["bookmarks.html"]) throw new Error("The ZIP must contain bookmarks.html at its root.");
        const data = H.parse(new TextDecoder("utf-8", { fatal: true }).decode(files["bookmarks.html"]));
        const restoreData = M.clone(data);
        const icons = new Map();
        for (const [name, image] of Object.entries(files)) {
            if (name === "bookmarks.html" || name === "favicons/") continue;
            if (await F.hash(image) !== name.slice(9, -4)) throw new Error("A favicon in the ZIP has an incorrect hash.");
            icons.set(name, F.pngData(image));
        }
        for (const { node } of M.entries(restoreData)) {
            if (!H.isIconFile(node.icon)) continue;
            if (!icons.has(node.icon)) throw new Error("The ZIP is missing a referenced favicon: " + node.icon);
            // FileStore commits verified images before HTML using its usual conflict and backup protections.
            node.icon = icons.get(node.icon);
        }
        return { data, restoreData, iconCount: new Set(M.entries(data).map(item => item.node.icon).filter(H.isIconFile)).size };
    }
    globalThis.HomeTabArchive = { create, parse };
})();
