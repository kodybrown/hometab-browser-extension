(() => {
    "use strict";
    const $ = id => document.getElementById(id);
    const store = new HomeTabFiles.FileStore();
    let snapshot = null, busy = false, folders = [];
    const status = text => { $("capture-status").textContent = text; };
    function filterFolders() {
        const selected = $("capture-location").value;
        const query = $("capture-folder-filter").value.trim().toLocaleLowerCase();
        const matches = folders.filter(folder => folder.title.toLocaleLowerCase().includes(query));
        $("capture-location").replaceChildren(...matches.map(folder => new Option(folder.title, folder.id)));
        if (matches.some(folder => folder.id === selected)) $("capture-location").value = selected;
        $("capture-save").disabled = busy || !store.writable || !matches.length;
        if (!matches.length) $("capture-location").append(new Option("No matching folders", ""));
    }
    $("capture-folder-filter").addEventListener("input", filterFolders);
    $("capture-url").addEventListener("input", () => { $("capture-favicon").disabled = !/^https?:\/\//i.test($("capture-url").value.trim()); });
    $("capture-home").addEventListener("click", () => {
        if (globalThis.chrome?.runtime?.id) chrome.tabs.create({ url: chrome.runtime.getURL("index.html") + "#connect" });
        else location.assign("index.html");
    });
    $("capture-form").addEventListener("submit", async event => {
        event.preventDefault(); if (!snapshot || busy) return;
        busy = true; $("capture-save").disabled = true;
        try {
            const title = $("capture-title").value.trim(), url = $("capture-url").value.trim();
            if (!title || HomeTabModel.urlKind(url) !== "link") throw new Error("Enter a title and a supported full address.");
            const next = HomeTabModel.clone(snapshot.data);
            const folder = HomeTabModel.find(next, $("capture-location").value)?.node;
            if (!folder || folder.kind !== "folder") throw new Error("Choose a destination folder.");
            if (folder.items.some(item => item.kind === "link" && item.url === url)) { status("This address is already saved in that folder."); return; }
            const node = { id: "local-" + crypto.randomUUID(), kind: "link", title, url };
            let iconError = "";
            if ($("capture-favicon").checked && /^https?:\/\//i.test(url)) {
                status("Getting favicon, then saving…");
                try { node.icon = await HomeTabFavicons.get(url); }
                catch (error) { iconError = " Favicon unavailable: " + error.message; }
            }
            folder.items.push(node);
            snapshot = await store.write(next, snapshot.revision);
            try { await HomeTabFiles.capturePreferences({ folderId: folder.id, favicon: $("capture-favicon").checked }); } catch { /* Remembering defaults is optional. */ }
            status("Saved to bookmarks.html." + iconError);
        } catch (error) { status(error.message); }
        finally { busy = false; filterFolders(); }
    });
    (async () => {
        try {
            const params = new URLSearchParams(location.search);
            let url = params.get("url"), title = params.get("title");
            if (!url && globalThis.chrome?.tabs) {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                url = tab?.url; title = tab?.title;
            }
            $("capture-url").value = url || ""; $("capture-title").value = title || url || "";
            if (!HomeTabFiles.extension || !await store.restore() || !store.writable) throw new Error("Open HomeTab and connect the bookmarks folder first. If needed, grant file access again.");
            snapshot = await store.read();
            document.documentElement.dataset.theme = snapshot.data.theme;
            const links = snapshot.data.tabs.find(node => node.id === "my-links");
            folders = HomeTabModel.entries({ tabs: links.items }).filter(item => item.node.kind === "folder").map(item => ({ id: item.node.id, title: [...item.path, item.node.title].join(" / ") }));
            filterFolders();
            const inbox = links.items.find(node => node.title.toLowerCase() === "saved for later");
            if (inbox) $("capture-location").value = inbox.id;
            let preferences = {};
            try { preferences = await HomeTabFiles.capturePreferences() || {}; } catch { /* Use default choices if metadata cannot be read. */ }
            if (folders.some(folder => folder.id === preferences.folderId)) $("capture-location").value = preferences.folderId;
            $("capture-favicon").checked = preferences.favicon === true;
            $("capture-favicon").disabled = !/^https?:\/\//i.test($("capture-url").value.trim());
            if (!$("capture-location").options.length) throw new Error("Create a tab in HomeTab before saving a page.");
            if (!url || HomeTabModel.urlKind(url) !== "link") status("This browser page cannot be captured automatically. Enter a web address to save.");
            else status("Choose a folder, then save this page.");
            $("capture-save").disabled = !folders.length;
        } catch (error) { status(error.message); }
    })();
})();
