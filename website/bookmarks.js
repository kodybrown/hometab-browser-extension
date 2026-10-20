(() => {
    "use strict";
    const M = HomeTabModel, H = HomeTabHTML, F = HomeTabFiles;
    const store = new F.FileStore();
    const $ = id => document.getElementById(id);
    const make = (tag, className, text) => {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text !== undefined) element.textContent = text;
        return element;
    };
    let data = null, revision = null, connected = false, busy = false, loading = false;
    let active = null, previous = null, editor = null, filtered = false, collectionWasOpen = true;
    const opened = new Set();
    let dragging = null;
    const dropBindings = new WeakMap();
    const canEdit = () => Boolean(data && connected && store.writable && F.extension && !loading);
    const actions = HomeTabItemActions.create({ data: () => data, revision: () => revision, canEdit,
        save, render, edit: openEditor, status: message => status(message), message: () => $("collection-status").textContent });
    const root = id => data?.tabs.find(node => node.id === id);
    const tabs = () => root("my-links")?.items || [];
    const status = message => { $("collection-status").textContent = message; };
    function labelConnection(message) { $("connection-status").textContent = message; }
    // Settings closes when a file action starts; failures must remain visible outside it.
    function connectionError(message) { labelConnection(message); status(message); }
    function setLoading(value) {
        loading = value;
        for (const id of ["connect-folder", "open-html", "reload-file"]) $(id).disabled = value;
        render();
    }
    function applySnapshot(snapshot, isConnected, label) {
        store.clearIcons();
        data = snapshot.data;
        revision = snapshot.revision;
        connected = isConnected;
        previous = null;
        actions.clear();
        HomeTabAppearance.apply(data.theme);
        $("appearance-status").textContent = "";
        if (!tabs().some(tab => tab.id === active)) active = tabs()[0]?.id;
        labelConnection(label);
        status("");
        render();
    }
    async function save(next, message, expected = revision, undo = true) {
        if (busy) return false;
        busy = true;
        status("Saving…");
        $("item-form").querySelector('[type="submit"]').disabled = true;
        try {
            if (!canEdit()) throw new Error("Connect the bookmarks folder in the extension before editing.");
            const snapshot = await store.write(next, expected);
            if (undo && snapshot.revision !== revision) previous = M.clone(data);
            data = snapshot.data;
            revision = snapshot.revision;
            HomeTabAppearance.apply(data.theme);
            render();
            status(message);
            return true;
        } catch (error) {
            status(error.message);
            return false;
        } finally {
            busy = false;
            $("item-form").querySelector('[type="submit"]').disabled = false;
        }
    }
    function icon(node, size) {
        const mark = make("span", "site-mark", ({ "ChatGPT desktop": ">_", "ChatGPT": "AI", "C# / .NET": "C#", "Dictionary.com": "Aa" })[node.title] || node.title.slice(0, 1).toUpperCase());
        mark.setAttribute("aria-hidden", "true");
        if (!node.icon) return mark;
        const frame = make("span", "site-icon"); frame.append(mark);
        frame.style.width = frame.style.height = size + "px";
        store.iconURL(node.icon, connected).then(url => {
            if (!url) return;
            const img = make("img"); img.alt = ""; img.width = img.height = size;
            img.onload = () => frame.replaceChildren(img); img.src = url;
        });
        return frame;
    }
    function renderHomepage() {
        if (!data) return;
        const searchHeading = $("search-heading");
        searchHeading.textContent = root("search-engines").title === "Search engines" ? "Search the web" : root("search-engines").title;
        const cursor = make("span", "cursor", "_"); cursor.setAttribute("aria-hidden", "true"); searchHeading.append(cursor);
        document.querySelector(".collection > summary > span").textContent = root("my-links").title;
        for (const [id, headingId] of [["search-engines", "search-heading"], ["quick-access", "quick-heading"], ["my-websites", "sites-heading"]]) {
            const heading = $(headingId);
            if (id !== "search-engines") heading.textContent = root(id).title;
            actions.decorate(heading, root(id)); heading.append(actions.addButton(id)); dropZone(heading, id);
        }
        const engines = $("search-engines"); engines.replaceChildren();
        for (const node of root("search-engines").items) {
            const form = make("form", "search-card"); form.action = node.url; form.method = "get"; form.setAttribute("role", "search"); form.setAttribute("aria-label", node.title);
            const label = make("label"); label.htmlFor = "engine-" + node.id;
            const home = make("a"); home.href = node.url; home.setAttribute("aria-label", "Open " + node.title); home.append(icon(node, 20));
            label.append(home, document.createTextNode(node.title), make("span", null, node.description || "Search"));
            const field = make("div", "search-field"), input = make("input"), button = make("button", null, "→");
            input.id = label.htmlFor; input.name = "q"; input.type = "search"; input.placeholder = "Search " + node.title; input.required = true;
            button.type = "submit"; button.setAttribute("aria-label", "Search " + node.title);
            field.append(input, button); form.append(label, field);
            form.addEventListener("submit", event => { event.preventDefault(); const query = input.value.trim(); if (query) location.assign(node.searchTemplate.replaceAll("{query}", encodeURIComponent(query))); });
            actions.decorate(form, node); draggable(form, node); dropZone(form, "search-engines", node.id); engines.append(form);
        }
        for (const id of ["quick-access", "my-websites"]) {
            const container = $(id); container.replaceChildren();
            for (const node of root(id).items) {
                const link = make("a"); link.href = node.url; link.append(icon(node, id === "quick-access" ? 24 : 20));
                const text = make("span", null, node.title);
                if (id === "quick-access" && node.description) text.append(make("small", null, node.description));
                const arrow = make("span", "link-arrow", "↗"); arrow.setAttribute("aria-hidden", "true");
                link.append(text, arrow);
                const row = make("div", "homepage-item"); row.append(link);
                actions.decorate(row, node); draggable(row, node); dropZone(row, id, node.id); container.append(row);
            }
        }
    }
    function draggable(element, node) {
        if (!actions.selecting || !canEdit()) return;
        const handle = element.querySelector(':scope > .node-actions > .drag-handle');
        if (!handle) return;
        // Only the handle rearranges items. Links keep ordinary browser drag behavior.
        handle.draggable = true;
        handle.addEventListener("dragstart", event => {
            if (busy) { event.preventDefault(); return; }
            event.stopPropagation();
            dragging = actions.dragSelection(node.id);
            event.dataTransfer.setData("text/plain", dragging.ids.join("\n")); event.dataTransfer.effectAllowed = "move";
            const badge = make("span", "drag-badge", dragging.ids.length + (dragging.ids.length === 1 ? " item" : " items"));
            document.body.append(badge); event.dataTransfer.setDragImage(badge, 0, 0); setTimeout(() => badge.remove(), 0);
            element.classList.add("dragging");
        });
        element.addEventListener("dragend", event => { event.stopPropagation(); dragging = null; element.classList.remove("dragging"); document.querySelectorAll(".drag-over").forEach(node => node.classList.remove("drag-over")); });
    }
    function dropZone(element, parentId, beforeId = null, tab = false) {
        dropBindings.get(element)?.abort();
        if (!canEdit()) return;
        const controller = new AbortController(); dropBindings.set(element, controller);
        const options = { signal: controller.signal };
        element.addEventListener("dragover", event => {
            if (!dragging || busy) return;
            event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = "move"; element.classList.add("drag-over");
        }, options);
        element.addEventListener("dragleave", event => { if (!element.contains(event.relatedTarget)) element.classList.remove("drag-over"); }, options);
        element.addEventListener("drop", async event => {
            if (!dragging || !canEdit() || busy) return;
            event.preventDefault(); event.stopPropagation(); element.classList.remove("drag-over");
            const source = dragging; dragging = null;
            try {
                // Dropping a top-level folder on another tab reorders tabs. Other items move into that tab.
                const reorder = tab && M.selectionRoots(data, source.ids).every(entry => entry.parent?.id === "my-links");
                const next = M.placeMany(data, source.ids, reorder ? "my-links" : parentId, reorder ? parentId : beforeId);
                H.validate(next);
                if (await save(next, source.ids.length === 1 ? "Item moved. Undo is available." : "Items moved. Undo is available.", source.expected)) { actions.clear(); render(); }
            } catch (error) { status(error.message); }
        }, options);
    }
    function linkRow(node, path = null) {
        const row = make("div", "bookmark-row"); row.dataset.itemId = node.id;
        const bookmarklet = M.urlKind(node.url) === "bookmarklet";
        const link = make(bookmarklet ? "button" : "a", "bookmark-link");
        if (bookmarklet) {
            link.type = "button";
            link.addEventListener("click", () => { $("bookmarklet-title").textContent = node.title; $("bookmarklet-code").value = node.url; $("copy-bookmarklet").textContent = "Copy code"; $("bookmarklet-dialog").showModal(); });
        } else link.href = node.url;
        link.draggable = !bookmarklet;
        link.title = node.originalTitle || node.title;
        const text = make("span", "bookmark-text");
        text.append(make("span", "bookmark-name", node.title), make("small", "bookmark-context", path || (bookmarklet ? "Bookmarklet · copy code" : new URL(node.url).hostname.replace(/^www\./, "") || "Local app")));
        if (node.icon) { link.classList.add("has-icon"); link.append(icon(node, 16)); }
        link.append(text);
        row.append(link); actions.decorate(row, node);
        draggable(row, node); dropZone(row, M.find(data, node.id)?.parent?.id, node.id);
        return row;
    }
    function renderItems(items, container) {
        let list = null;
        for (const node of items) {
            if (node.kind === "link") {
                if (!list) { list = make("div", "bookmark-list"); container.append(list); }
                list.append(linkRow(node)); continue;
            }
            // Separators and folders break the link grid while retaining the database's order.
            list = null;
            if (node.kind === "separator") {
                const separator = make("div", "bookmark-separator"); separator.append(make("hr"));
                if (node.title) separator.append(make("span", "separator-title", node.title));
                actions.decorate(separator, node);
                draggable(separator, node); dropZone(separator, M.find(data, node.id)?.parent?.id, node.id); container.append(separator);
            } else {
                const group = make("details", "bookmark-group"); group.open = opened.has(node.id);
                const summary = make("summary"); summary.append(make("span", "group-title", node.title), make("small", "group-count", String(M.count(node))));
                actions.decorate(summary, node); summary.append(actions.addButton(node.id));
                draggable(summary, node); dropZone(summary, node.id); group.append(summary);
                const body = make("div", "group-body"); renderItems(node.items, body);
                if (!node.items.length) body.append(make("p", "empty-state", "This section is empty."));
                group.append(body); group.addEventListener("toggle", () => group.open ? opened.add(node.id) : opened.delete(node.id)); container.append(group);
            }
        }
    }
    function selectTab(id, focus = false) {
        if (!dragging) actions.clear();
        active = id; render(); if (focus) $("bookmark-tabs").querySelector('[aria-selected="true"]')?.focus();
    }
    function renderCollection() {
        if (!tabs().some(tab => tab.id === active)) active = tabs()[0]?.id;
        const writable = canEdit();
        $("collection-total").textContent = data ? M.count(root("my-links")) + " links" : "";
        $("export-links").disabled = !data;
        $("export-zip").disabled = !data || loading;
        $("restore-zip").disabled = !writable;
        $("undo-links").hidden = !previous || !writable;
        $("reload-file").hidden = !connected;
        const tablist = $("bookmark-tabs"); tablist.replaceChildren();
        const query = $("link-filter").value.trim().toLocaleLowerCase();
        const collection = document.querySelector(".collection");
        if (query) { if (!filtered) collectionWasOpen = collection.open; collection.open = true; }
        if (!query && filtered) collection.open = collectionWasOpen;
        filtered = Boolean(query);
        document.querySelector(".search-section").hidden = filtered;
        document.querySelector(".links-grid").hidden = filtered;
        tablist.parentElement.hidden = Boolean(query);
        $("tab-add").replaceChildren(actions.addButton("my-links", "tab"));
        const collectionSummary = document.querySelector(".collection > summary");
        collectionSummary.querySelector(":scope > .node-actions")?.remove();
        if (data) actions.decorate(collectionSummary, root("my-links"));
        for (const tab of tabs()) {
            const button = make("button", "tab", tab.title); button.type = "button"; button.id = "tab-" + tab.id;
            button.setAttribute("role", "tab"); button.setAttribute("aria-selected", String(tab.id === active)); button.setAttribute("aria-controls", "bookmark-panel"); button.tabIndex = tab.id === active ? 0 : -1;
            button.append(make("small", "tab-count", String(M.count(tab)))); button.addEventListener("click", event => { if (!event.ctrlKey && !event.metaKey && !event.shiftKey) selectTab(tab.id, true); });
            const shell = make("div", "tab-item"); shell.append(button); actions.decorate(shell, tab); tablist.append(shell);
            draggable(shell, tab); dropZone(shell, tab.id, null, true);
        }
        const panel = $("bookmark-panel"); panel.replaceChildren(); panel.removeAttribute("aria-labelledby"); panel.removeAttribute("aria-label");
        if (!data) { panel.append(make("p", "empty-state", "Open bookmarks.html to view your saved homepage. Without the extension, HomeTab is read-only.")); return; }
        if (query) {
            panel.setAttribute("aria-label", "Search results across the homepage");
            const matches = M.entries({ tabs: data.tabs.filter(node => node.id !== "search-engines") }).filter(({ node, path }) => node.kind === "link" && [node.title, node.originalTitle || "", node.description || "", node.url, ...path].join(" ").toLocaleLowerCase().includes(query));
            $("filter-status").textContent = matches.length + " saved links match.";
            document.querySelector(".collection > summary > span").textContent = "Search results";
            $("collection-total").textContent = matches.length + " links";
            panel.append(make("h3", "panel-title", matches.length + " matching links"));
            const results = make("div", "bookmark-list"); matches.forEach(({ node, path }) => results.append(linkRow(node, path.join(" / ")))); panel.append(results);
            if (!matches.length) panel.append(make("p", "empty-state", "No links match that search."));
        } else {
            $("filter-status").textContent = "";
            document.querySelector(".collection > summary > span").textContent = root("my-links").title;
            const section = tabs().find(tab => tab.id === active);
            if (!section) { panel.append(make("p", "empty-state", writable ? "Use + beside the tabs, or right-click My links, to add a tab." : "This collection is empty.")); return; }
            panel.setAttribute("aria-labelledby", "tab-" + section.id); panel.setAttribute("role", "tabpanel");
            const heading = make("div", "panel-heading"); heading.append(make("h3", "panel-title", section.title));
            actions.decorate(heading, section); heading.append(actions.addButton(section.id));
            draggable(heading, section); dropZone(heading, section.id);
            panel.append(heading); renderItems(section.items, panel);
            if (!section.items.length) panel.append(make("p", "empty-state", "This collection is empty."));
        }
    }
    function render() { renderHomepage(); renderCollection(); actions.sync(); }
    function focusHome(id) {
        const el = id && document.querySelector('[data-node-id="' + CSS.escape(id) + '"]');
        (el?.querySelector(".node-gear, a, button") || $("settings-toggle")).focus();
    }
    function openEditor(id = null, kind = "link", parentId = null) {
        if (!canEdit()) return;
        const found = id ? M.find(data, id) : null, node = found?.node;
        const actualKind = node?.kind || (kind === "tab" ? "folder" : kind);
        const fixed = H.sections.includes(id);
        editor = { id, kind: actualKind, expected: revision, fixed, favicons: new Map(), faviconAbort: new AbortController(), restoreViewport: HomeTabItemActions.preserveViewport() };
        $("item-form").reset(); $("item-error").textContent = "";
        $("item-dialog-title").textContent = (id ? "Edit " : "Add ") + (kind === "tab" || found?.parent?.id === "my-links" ? "tab" : actualKind === "folder" ? "section" : actualKind);
        $("item-title").value = node?.title || ""; $("item-title").required = actualKind !== "separator";
        $("item-url").value = node?.url || ""; $("item-url").required = actualKind === "link"; $("url-label").hidden = actualKind !== "link";
        $("item-template").value = node?.searchTemplate || ""; $("item-description").value = node?.description || ""; $("item-icon").value = node?.icon || "";
        $("item-icon-status").textContent = "";
        $("folder-favicon-status").textContent = "";
        $("folder-favicon-tools").hidden = actualKind !== "folder";
        updateIconControls();
        for (const label of ["template-label", "description-label", "icon-label"]) $(label).hidden = actualKind !== "link";
        $("item-delete").hidden = $("item-earlier").hidden = $("item-later").hidden = !id || fixed;
        const select = $("item-parent"); select.replaceChildren(); select.disabled = fixed;
        const excluded = node?.kind === "folder" ? new Set(M.entries({ tabs: [node] }).map(item => item.node.id)) : new Set();
        const linkFolders = new Set(M.entries({ tabs: [root("my-links")] }).filter(item => item.node.kind === "folder").map(item => item.node.id));
        if (fixed) select.append(new Option("Permanent homepage section", ""));
        else M.entries(data).filter(({ node: candidate }) => candidate.kind === "folder" && !excluded.has(candidate.id) && (
            actualKind === "folder" ? linkFolders.has(candidate.id) : candidate.id !== "my-links" &&
            (actualKind !== "separator" || linkFolders.has(candidate.id))
        )).forEach(item => select.append(new Option([...item.path, item.node.title].join(" / "), item.node.id)));
        select.value = found ? found.parent?.id || "" : parentId || (kind === "tab" ? "my-links" : active || "my-links");
        const updateSearchField = () => {
            const searchEngine = actualKind === "link" && select.value === "search-engines";
            $("template-label").hidden = !searchEngine;
            $("item-template").required = searchEngine;
        };
        select.onchange = updateSearchField;
        updateSearchField();
        $("item-dialog").showModal(); $("item-title").focus();
    }
    function updateIconControls() {
        const value = $("item-icon").value.trim(), pending = Boolean(editor?.faviconPending);
        const preview = $("item-icon-preview");
        preview.hidden = true; preview.removeAttribute("src"); preview.dataset.icon = value;
        store.iconURL(value, connected).then(url => {
            if (!url || preview.dataset.icon !== value) return;
            preview.src = url; preview.hidden = false;
        });
        $("get-favicon").disabled = pending || !/^https?:\/\//i.test($("item-url").value.trim());
        $("get-favicon").textContent = pending ? "Getting favicon…" : "Get favicon";
        $("clear-icon").disabled = pending || !value;
        $("item-icon").disabled = pending;
        $("get-folder-favicons").disabled = pending || !folderLinks().length;
        for (const button of $("item-form").querySelectorAll('[type="submit"], #item-earlier, #item-later, #item-delete')) button.disabled = pending;
    }
    $("item-icon").addEventListener("input", updateIconControls);
    $("item-url").addEventListener("input", updateIconControls);
    $("clear-icon").addEventListener("click", () => { $("item-icon").value = ""; $("item-icon-status").textContent = "Save to remove this icon."; updateIconControls(); });
    $("get-favicon").addEventListener("click", async () => {
        const target = editor, address = $("item-url").value.trim();
        if (!target || target.faviconPending || busy) return;
        target.faviconPending = true;
        $("item-icon-status").textContent = "Getting the browser's favicon…";
        updateIconControls();
        try {
            const value = await HomeTabFavicons.get(address, target.faviconAbort.signal);
            // A late result must never replace the icon in a different editor or for a changed URL.
            if (editor !== target || !$("item-dialog").open) return;
            if (address !== $("item-url").value.trim()) { $("item-icon-status").textContent = "The address changed. Get its favicon again."; return; }
            $("item-icon").value = value;
            $("item-icon-status").textContent = "Icon ready. Save to keep it. If it looks generic, visit the website and try again.";
        } catch (error) {
            if (editor === target && $("item-dialog").open) $("item-icon-status").textContent = error.message;
        } finally {
            target.faviconPending = false;
            if (editor === target) updateIconControls();
        }
    });
    function folderLinks() {
        const node = editor?.kind === "folder" && M.find(data, editor.id)?.node;
        return node ? M.entries({ tabs: [node] }).map(item => item.node).filter(item => item.kind === "link" && /^https?:\/\//i.test(item.url)) : [];
    }
    $("get-folder-favicons").addEventListener("click", async () => {
        const target = editor, links = folderLinks();
        if (!target || target.faviconPending || busy || !links.length) return;
        target.faviconPending = true; updateIconControls();
        $("folder-favicon-status").textContent = "Getting icons for this folder and its subfolders…";
        try {
            const result = await HomeTabFavicons.getMany(links.map(node => node.url), (done, total) => {
                if (editor === target && $("item-dialog").open) $("folder-favicon-status").textContent = "Retrieved " + done + " / " + total + " icons…";
            }, target.faviconAbort.signal);
            if (editor !== target || !$("item-dialog").open) return;
            target.favicons.clear();
            for (const node of links) if (result.icons.has(node.url)) target.favicons.set(node.id, { url: node.url, icon: result.icons.get(node.url) });
            $("folder-favicon-status").textContent = target.favicons.size + " bookmark icons ready. " + result.failed + " failed. Save to keep them; failed links keep their existing icons.";
        } catch (error) {
            if (editor === target && $("item-dialog").open) $("folder-favicon-status").textContent = error.message;
        } finally { target.faviconPending = false; if (editor === target) updateIconControls(); }
    });
    $("item-dialog").addEventListener("close", () => { if (!$("item-dialog").open) editor?.faviconAbort.abort(); });
    function download(content, name = "bookmarks.html", type = "text/html;charset=utf-8") {
        const url = URL.createObjectURL(new Blob([content], { type }));
        const anchor = make("a"); anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    let pendingRestore = null;
    $("export-zip").addEventListener("click", async () => {
        if (!data || loading || busy) return;
        setLoading(true); $("page-status").textContent = "Preparing ZIP backup…";
        try {
            const zip = await HomeTabArchive.create(M.clone(data), store, connected, revision);
            download(zip, "hometab-backup-" + new Date().toISOString().slice(0, 10) + ".zip", "application/zip");
            $("page-status").textContent = "ZIP backup prepared with bookmarks and favicons. Download started.";
        } catch (error) { $("page-status").textContent = error.message; }
        finally { setLoading(false); }
    });
    $("restore-zip").addEventListener("click", () => $("zip-file").click());
    $("zip-file").addEventListener("change", async event => {
        const file = event.target.files[0]; event.target.value = "";
        if (!file || !canEdit()) return;
        const expected = revision; setLoading(true); pendingRestore = null;
        try {
            if (file.size > 32 * 1024 * 1024) throw new Error("ZIP backups must be no larger than 32 MB.");
            const backup = await HomeTabArchive.parse(await file.arrayBuffer());
            pendingRestore = { ...backup, expected };
            $("restore-summary").textContent = file.name + " · " + M.entries(backup.data).filter(item => item.node.kind === "link").length + " links · " + backup.iconCount + " favicon files";
            $("restore-collections").replaceChildren(...backup.data.tabs.map(node => {
                const count = M.count(node); return make("li", null, node.title + ": " + count + (count === 1 ? " link" : " links"));
            }));
            $("restore-error").textContent = ""; $("restore-dialog").showModal();
        } catch (error) { $("page-status").textContent = "Backup not opened. " + error.message; }
        finally { setLoading(false); }
    });
    $("restore-confirm").addEventListener("click", async () => {
        if (!pendingRestore || busy) return;
        $("restore-confirm").disabled = true;
        try {
            if (await save(pendingRestore.restoreData, "ZIP backup restored. Undo is available.", pendingRestore.expected)) {
                pendingRestore = null; store.clearIcons(); render(); $("restore-dialog").close(); $("settings-toggle").focus();
            } else $("restore-error").textContent = $("collection-status").textContent;
        } finally { $("restore-confirm").disabled = false; }
    });
    // A queued close event from a previous preview must not clear a newly opened preview.
    $("restore-dialog").addEventListener("close", () => { if (!$("restore-dialog").open) pendingRestore = null; });
    $("connect-folder").addEventListener("click", async () => {
        setLoading(true);
        try { const snapshot = await store.connect(); applySnapshot(snapshot, true, store.writable ? "Connected to bookmarks.html · Changes save to this file." : "Connected to bookmarks.html · Read-only view."); }
        catch (error) { if (error.name !== "AbortError") connectionError(error.message); }
        finally { setLoading(false); }
    });
    $("open-html").addEventListener("click", () => $("html-file").click());
    $("html-file").addEventListener("change", async event => {
        const file = event.target.files[0]; event.target.value = ""; if (!file) return;
        setLoading(true);
        try { const bytes = await file.arrayBuffer(); applySnapshot({ data: H.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)), revision: await F.hash(bytes) }, false, file.name + " · Read-only view. Reopen the file to see changes."); }
        catch (error) { connectionError("File not opened. " + error.message); }
        finally { setLoading(false); }
    });
    $("reload-file").addEventListener("click", async () => {
        setLoading(true);
        try { applySnapshot(await store.read(), true, store.writable ? "Reloaded bookmarks.html · Editing available." : "Reloaded bookmarks.html · Read-only view."); }
        catch (error) { connectionError(error.message); }
        finally { setLoading(false); }
    });
    $("link-filter").addEventListener("input", () => { actions.clear(); render(); });
    $("link-filter").addEventListener("keydown", event => { if (event.key === "Escape" && event.target.value) { event.target.value = ""; actions.clear(); render(); event.preventDefault(); } });
    $("bookmark-tabs").addEventListener("keydown", event => {
        const list = tabs(), index = list.findIndex(tab => tab.id === active); if (!list.length) return;
        let next;
        if (event.key === "ArrowRight") next = (index + 1) % list.length;
        else if (event.key === "ArrowLeft") next = (index - 1 + list.length) % list.length;
        else if (event.key === "Home") next = 0; else if (event.key === "End") next = list.length - 1; else return;
        event.preventDefault(); selectTab(list[next].id, true);
    });
    document.querySelectorAll("[data-close]").forEach(button => button.addEventListener("click", () => $(button.dataset.close).close()));
    $("item-form").addEventListener("submit", async event => {
        event.preventDefault();
        if (editor?.faviconPending) return;
        const next = M.clone(data), title = $("item-title").value.trim(), parentId = $("item-parent").value;
        if (editor.kind !== "separator" && !title) { $("item-error").textContent = "Enter a title."; return; }
        try {
            let node;
            if (editor.id) {
                const found = M.find(next, editor.id); if (!found) throw new Error("The item is no longer available. Reload the file.");
                node = found.node;
                if (!editor.fixed && found.parent?.id !== parentId) M.move(next, editor.id, parentId);
                if (editor.offset) M.move(next, editor.id, parentId, editor.offset);
            } else {
                const parent = M.find(next, parentId)?.node; if (parent?.kind !== "folder") throw new Error("Choose an existing location first.");
                node = { id: "local-" + crypto.randomUUID(), kind: editor.kind, title };
                if (editor.kind === "folder") node.items = [];
                parent.items.push(node); if (parentId === "my-links") active = node.id;
            }
            node.title = title;
            if (node.kind === "link") {
                node.url = $("item-url").value.trim();
                for (const [field, input] of [["searchTemplate", "item-template"], ["description", "item-description"], ["icon", "item-icon"]]) {
                    const value = $(input).value.trim(); if (value) node[field] = value; else delete node[field];
                }
            }
            H.validate(next);
            for (const [id, captured] of editor.favicons) {
                const node = M.find(next, id)?.node;
                if (node?.url === captured.url) node.icon = captured.icon;
            }
            if (await save(next, "Saved to bookmarks.html.", editor.expected)) { $("item-dialog").close(); focusHome(editor.id); }
            else $("item-error").textContent = $("collection-status").textContent;
        } catch (error) { $("item-error").textContent = error.message; }
    });
    for (const [id, offset] of [["item-earlier", -1], ["item-later", 1]]) $(id).addEventListener("click", () => { editor.offset = offset; $("item-form").requestSubmit(); });
    $("item-delete").addEventListener("click", () => {
        const found = M.find(data, editor.id); if (!found || editor.fixed) return;
        $("confirm-title").textContent = "Remove from HomeTab?";
        $("confirm-message").textContent = 'Remove “' + (found.node.title || "separator") + '”' + (found.node.kind === "folder" ? " and its " + M.count(found.node) + " links" : "") + "? Undo is available until another change or reload.";
        $("confirm-action").onclick = async () => {
            $("confirm-dialog").close(); const next = M.clone(data), entry = M.find(next, editor.id);
            entry.parent.items.splice(entry.parent.items.indexOf(entry.node), 1);
            if (await save(next, "Removed from bookmarks.html. Undo is available.", editor.expected)) {
                $("item-dialog").close(); $("settings-toggle").focus({ preventScroll: true }); editor.restoreViewport();
            }
            else $("item-error").textContent = $("collection-status").textContent;
        };
        $("confirm-dialog").showModal();
    });
    $("undo-links").addEventListener("click", async () => { if (previous && await save(M.clone(previous), "Last change undone.", revision, false)) { previous = null; renderCollection(); } });
    $("export-links").addEventListener("click", () => { if (data) download(H.serialize(data)); });
    $("copy-bookmarklet").addEventListener("click", async () => {
        try { await navigator.clipboard.writeText($("bookmarklet-code").value); $("copy-bookmarklet").textContent = "Copied"; }
        catch { $("bookmarklet-code").focus(); $("bookmarklet-code").select(); $("copy-bookmarklet").textContent = "Press Ctrl+C to copy"; }
    });
    window.addEventListener("hometab-theme", async event => {
        if (!canEdit()) { $("appearance-status").textContent = "Preview only in this read-only view."; return; }
        const next = M.clone(data); next.theme = event.detail;
        if (!await save(next, "Appearance saved to bookmarks.html.")) { HomeTabAppearance.apply(data.theme); $("appearance-status").textContent = $("collection-status").textContent; }
        else $("appearance-status").textContent = "";
    });
    window.addEventListener("storage", event => {
        if (event.key === "hometab.lastSeenHash" && connected && event.newValue !== revision) status("Another page read a different file revision. Reload the file before editing.");
    });
    setLoading(true);
    (async () => {
        try {
            if (await store.restore()) applySnapshot(await store.read(), true, store.writable ? "Connected to bookmarks.html · Changes save to this file." : "Connected to bookmarks.html · Read-only view. Reconnect to grant editing in the extension.");
            else if (store.directory) {
                // A known but inaccessible file must not silently turn into the bundled starting collection.
                connectionError("Your connected bookmarks folder needs permission again. Choose Settings → Connect folder, or Open HTML for a read-only view.");
            }
            else if (location.protocol !== "file:") {
                const response = await fetch("bookmarks.html", { cache: "no-store" }); if (!response.ok) throw new Error("Could not load bookmarks.html.");
                const bytes = await response.arrayBuffer(); applySnapshot({ data: H.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)), revision: await F.hash(bytes) }, false, F.extension ? "Included bookmarks.html · Connect its folder to save edits." : "bookmarks.html · Read-only view.");
            }
        } catch (error) { connectionError("Could not load the bookmarks file. " + error.message); }
        finally { setLoading(false); }
    })();
})();
