(() => {
    "use strict";
    function website(address) {
        const page = new URL(address);
        if (!["http:", "https:"].includes(page.protocol)) throw new Error("Favicons are available for http and https websites.");
        return page;
    }
    async function requestAccess() {
        if (!HomeTabFiles.extension || !globalThis.chrome?.permissions) throw new Error("Get favicon is available in the HomeTab extension.");
        // Request only on a user click. The browser supplies the icon; no website host access is needed.
        if (!await chrome.permissions.request({ permissions: ["favicon"] })) throw new Error("Favicon permission was not granted. Your existing icon is unchanged.");
    }
    async function load(address, signal) {
        if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
        const page = website(address);
        const source = new URL(chrome.runtime.getURL("_favicon/"));
        source.searchParams.set("pageUrl", page.href);
        source.searchParams.set("size", "32");
        const image = new Image();
        await new Promise((resolve, reject) => {
            const finish = error => {
                clearTimeout(timeout);
                signal?.removeEventListener("abort", abort);
                image.onload = image.onerror = null;
                if (error) { image.src = ""; reject(error); } else resolve();
            };
            const abort = () => finish(new DOMException("Cancelled", "AbortError"));
            const timeout = setTimeout(() => finish(new Error("The browser did not return an icon. Visit the website, then try again.")), 10000);
            signal?.addEventListener("abort", abort, { once: true });
            image.onload = () => finish();
            image.onerror = () => finish(new Error("Could not get the browser's favicon. Visit the website, then try again."));
            image.src = source.href;
        });
        // Normalize in memory; FileStore writes this PNG into the data folder only when the form is saved.
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 32;
        canvas.getContext("2d").drawImage(image, 0, 0, 32, 32);
        const icon = canvas.toDataURL("image/png");
        if (!HomeTabHTML.isEmbeddedIcon(icon)) throw new Error("The browser returned an unsupported icon.");
        return icon;
    }
    async function get(address, signal) {
        website(address);
        await requestAccess();
        return load(address, signal);
    }
    async function getMany(addresses, progress, signal) {
        const urls = [...new Set(addresses)]; urls.forEach(website);
        await requestAccess();
        const icons = new Map(); let index = 0, done = 0, failed = 0;
        // Bound concurrent browser work; duplicate addresses are fetched only once.
        await Promise.all(Array.from({ length: Math.min(4, urls.length) }, async () => {
            while (index < urls.length) {
                if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
                const address = urls[index++];
                try { icons.set(address, await load(address, signal)); }
                catch (error) { if (error.name === "AbortError") throw error; failed++; }
                progress?.(++done, urls.length);
            }
        }));
        return { icons, failed };
    }
    globalThis.HomeTabFavicons = { get, getMany };
})();
