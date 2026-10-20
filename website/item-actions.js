(() => {
    "use strict";
    const M = HomeTabModel, H = HomeTabHTML;
    const $ = id => document.getElementById(id);
    const button = (text, action) => {
        const el = document.createElement("button"); el.type = "button"; el.textContent = text;
        el.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); action(event); });
        return el;
    };
    function preserveViewport() {
        const left = window.scrollX, top = window.scrollY;
        // Capture before opening a modal. Closing it and rebuilding the list can
        // move focus/scroll anchors; restore after both, clamped to the new page size.
        return () => window.scrollTo({ left, top, behavior: "instant" });
    }
    function create(api) {
        let editing = false, anchor = null, menuOrigin = null, pendingMove = null;
        let selectionRevision = null;
        const selected = new Set(), menu = $("item-menu"), bindings = new WeakMap();
        // This preference contains no collection data and never writes the user's file.
        try { editing = localStorage.getItem("hometab.editMode") === "true"; } catch { /* Session-only when browser storage is unavailable. */ }
        const allowed = () => api.canEdit();
        function closeMenu(focus = false) {
            menu.hidden = true;
            if (menuOrigin?.isConnected) {
                menuOrigin.setAttribute("aria-expanded", "false");
                if (focus) menuOrigin.focus();
            }
            menuOrigin = null;
        }
        function update() {
            for (const id of [...selected]) if (!api.data() || !M.find(api.data(), id)) selected.delete(id);
            $("selection-toolbar").hidden = !selected.size || !allowed();
            $("selection-count").textContent = selected.size + " selected";
            for (const el of document.querySelectorAll("[data-node-id]")) {
                const checked = selected.has(el.dataset.nodeId);
                el.classList.toggle("is-selected", checked);
                for (const input of el.querySelectorAll(':scope > .node-actions > .node-select')) input.checked = checked;
            }
        }
        function clear() { selected.clear(); anchor = null; selectionRevision = null; update(); }
        function select(id, range = false, force = null) {
            if (!allowed() || H.sections.includes(id)) return;
            const hadControls = editing || selected.size > 0;
            if (!selected.size) selectionRevision = api.revision();
            const visible = [...new Set([...document.querySelectorAll("[data-node-id]")].filter(el => el.getClientRects().length && !H.sections.includes(el.dataset.nodeId)).map(el => el.dataset.nodeId))];
            if (range && anchor && visible.includes(anchor) && visible.includes(id)) {
                const a = visible.indexOf(anchor), b = visible.indexOf(id);
                visible.slice(Math.min(a, b), Math.max(a, b) + 1).forEach(value => selected.add(value));
            } else if (force === true || (force === null && !selected.has(id))) selected.add(id);
            else selected.delete(id);
            anchor = id;
            if (!selected.size) selectionRevision = null;
            // Preserve checkbox focus and native range gestures when controls already exist.
            if (hadControls === (editing || selected.size > 0)) update(); else api.render();
        }
        function summary(entries) {
            return entries.map(({ node }) => (node.title || "Separator") + (node.kind === "folder" ? " (" + M.count(node) + " links in this folder)" : "")).join("; ");
        }
        function deleteItems(ids = [...selected], expected = selectionRevision ?? api.revision()) {
            if (!allowed()) return;
            const restoreViewport = preserveViewport();
            try {
                const entries = M.selectionRoots(api.data(), ids);
                $("confirm-title").textContent = entries.length === 1 ? "Delete item?" : "Delete " + entries.length + " items?";
                $("confirm-message").textContent = summary(entries) + ". Selected folders include their contents. Undo is available until another change or reload.";
                $("confirm-action").onclick = async () => {
                    if (!allowed()) return;
                    const next = M.removeMany(api.data(), ids); H.validate(next);
                    $("confirm-action").disabled = true;
                    try {
                        if (await api.save(next, "Deleted from bookmarks.html. Undo is available.", expected)) {
                            clear(); api.render(); $("confirm-dialog").close();
                            $("settings-toggle").focus({ preventScroll: true }); restoreViewport();
                        } else $("confirm-message").textContent = api.message();
                    } finally { $("confirm-action").disabled = false; }
                };
                $("confirm-dialog").showModal();
            } catch (error) { api.status(error.message); }
        }
        function openMove(ids = [...selected], expected = selectionRevision ?? api.revision()) {
            if (!allowed()) return;
            try {
                const entries = M.selectionRoots(api.data(), ids), select = $("move-parent"); select.replaceChildren();
                // Only offer destinations that accept the entire selection. Repeat validation on submit.
                for (const { node, path } of M.entries(api.data()).filter(entry => entry.node.kind === "folder")) {
                    try { H.validate(M.placeMany(api.data(), ids, node.id)); }
                    catch { continue; }
                    select.append(new Option([...path, node.title].join(" / "), node.id));
                }
                pendingMove = { ids: [...ids], expected };
                $("move-summary").textContent = summary(entries);
                $("move-error").textContent = "";
                $("move-dialog").showModal(); select.focus();
            } catch (error) { api.status(error.message); }
        }
        $("move-form").addEventListener("submit", async event => {
            event.preventDefault(); if (!pendingMove || !allowed()) return;
            const target = pendingMove;
            try {
                const next = M.placeMany(api.data(), target.ids, $("move-parent").value); H.validate(next);
                if (await api.save(next, "Items moved. Undo is available.", target.expected)) {
                    pendingMove = null; clear(); api.render(); $("move-dialog").close(); $("settings-toggle").focus();
                } else $("move-error").textContent = api.message();
            } catch (error) { $("move-error").textContent = error.message; }
        });
        $("move-dialog").addEventListener("close", () => { if (!$("move-dialog").open) pendingMove = null; });
        function showMenu(node, origin, point = null, createOnly = false) {
            closeMenu(); menuOrigin = origin; menu.replaceChildren();
            if (origin && !origin.matches("a,button,input,[tabindex]")) origin.tabIndex = -1;
            origin?.setAttribute("aria-expanded", "true");
            function item(label, action) {
                const el = button(label, () => { closeMenu(); action(); }); el.setAttribute("role", "menuitem"); el.tabIndex = -1; menu.append(el);
            }
            if (!createOnly && node.kind === "link") {
                if (M.urlKind(node.url) !== "bookmarklet") item("Open in new tab", () => window.open(node.url, "_blank", "noopener,noreferrer"));
                item("Copy address", async () => {
                    try { await navigator.clipboard.writeText(node.url); api.status("Address copied."); }
                    catch { api.status("Could not copy the address. Open Edit to copy it manually."); }
                });
            }
            if (allowed()) {
                if (!createOnly) item(node.kind === "separator" ? "Edit label" : "Edit", () => api.edit(node.id));
                if (!createOnly && (node.kind === "folder" || (node.kind === "link" && /^https?:\/\//i.test(node.url)))) item(node.kind === "folder" ? "Get favicons…" : "Get favicon…", () => {
                    api.edit(node.id); $(node.kind === "folder" ? "get-folder-favicons" : "get-favicon").click();
                });
                if (node.kind === "folder") {
                    if (node.id === "my-links") item("Add tab", () => api.edit(null, "tab", node.id));
                    else {
                        item(node.id === "search-engines" ? "Add search engine" : "Add bookmark", () => api.edit(null, "link", node.id));
                        if (!H.sections.includes(node.id)) {
                            item("Add section", () => api.edit(null, "folder", node.id));
                            item("Add separator", () => api.edit(null, "separator", node.id));
                        }
                    }
                }
                if (!createOnly && !H.sections.includes(node.id)) {
                    item(selected.has(node.id) ? "Deselect" : "Select", () => select(node.id));
                    const ids = selected.has(node.id) ? [...selected] : [node.id];
                    const expected = selected.has(node.id) ? selectionRevision : api.revision();
                    item(ids.length > 1 ? "Move selected…" : "Move…", () => openMove(ids, expected));
                    item(ids.length > 1 ? "Delete selected…" : "Delete…", () => deleteItems(ids, expected));
                }
            }
            if (!menu.children.length) { closeMenu(); return; }
            menu.hidden = false;
            const rect = origin?.getBoundingClientRect();
            menu.style.left = Math.max(8, Math.min(point?.x ?? rect?.left ?? 8, innerWidth - menu.offsetWidth - 8)) + "px";
            menu.style.top = Math.max(8, Math.min(point?.y ?? rect?.bottom ?? 8, innerHeight - menu.offsetHeight - 8)) + "px";
            menu.firstElementChild.focus();
        }
        function decorate(el, node, { controls = true } = {}) {
            // Headers survive rerenders; replace their handlers rather than accumulating them.
            bindings.get(el)?.abort();
            const controller = new AbortController(); bindings.set(el, controller);
            const listenerOptions = { signal: controller.signal };
            el.dataset.nodeId = node.id;
            el.addEventListener("contextmenu", event => {
                // Shift-right-click leaves the browser's native link/text menu available.
                if (event.shiftKey || (!allowed() && node.kind !== "link") || event.target.closest("input,textarea,select") || event.target.closest("[data-node-id]") !== el) return;
                event.preventDefault(); event.stopPropagation(); showMenu(node, el, { x: event.clientX, y: event.clientY });
            }, listenerOptions);
            el.addEventListener("keydown", event => {
                if ((event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) && event.target.closest("[data-node-id]") === el) {
                    event.preventDefault(); event.stopPropagation(); showMenu(node, el);
                }
            }, listenerOptions);
            el.addEventListener("click", event => {
                if (!allowed() || !(event.ctrlKey || event.metaKey || event.shiftKey) || event.target.closest(".node-actions,input,textarea,select,button:not(.tab):not(.bookmark-link)")) return;
                if (event.target.closest("[data-node-id]") !== el || H.sections.includes(node.id)) return;
                event.preventDefault(); event.stopPropagation(); select(node.id, event.shiftKey);
            }, listenerOptions);
            if (!controls || !allowed() || (!editing && !selected.size)) return;
            const tools = document.createElement("span"); tools.className = "node-actions";
            if (!H.sections.includes(node.id)) {
                const check = document.createElement("input"); check.type = "checkbox"; check.className = "node-select";
                check.setAttribute("aria-label", "Select " + (node.title || "separator")); check.checked = selected.has(node.id);
                check.addEventListener("click", event => { event.stopPropagation(); select(node.id, event.shiftKey, check.checked); }); tools.append(check);
                const handle = button("⠿", () => {}); handle.className = "drag-handle"; handle.title = "Drag " + (node.title || "separator");
                handle.setAttribute("aria-label", handle.title); handle.dataset.dragId = node.id; tools.append(handle);
            }
            if (editing) {
                const gear = button("", event => showMenu(node, event.currentTarget)); gear.className = "node-gear";
                gear.setAttribute("aria-label", "Actions for " + (node.title || "separator")); gear.setAttribute("aria-haspopup", "menu"); gear.setAttribute("aria-expanded", "false");
                gear.append($("settings-toggle").querySelector("svg").cloneNode(true)); tools.append(gear);
            }
            el.append(tools);
        }
        function addButton(parentId, kind = "link") {
            const names = { link: parentId === "search-engines" ? "Add search engine" : "Add bookmark", folder: "Add section", separator: "Add separator", tab: "Add tab" };
            const choices = kind === "link" && !H.sections.includes(parentId);
            const el = button("+", event => {
                if (choices) showMenu(M.find(api.data(), parentId).node, event.currentTarget, null, true);
                else api.edit(null, kind, parentId);
            }); el.className = "local-add";
            el.dataset.add = kind; el.dataset.parent = parentId; el.title = choices ? "Add to " + M.find(api.data(), parentId).node.title : names[kind]; el.setAttribute("aria-label", el.title);
            if (choices) { el.setAttribute("aria-haspopup", "menu"); el.setAttribute("aria-expanded", "false"); }
            el.hidden = !editing || !allowed(); return el;
        }
        function sync() {
            closeMenu();
            $("edit-toggle").disabled = !allowed();
            $("edit-toggle").setAttribute("aria-pressed", String(editing));
            $("edit-toggle").textContent = "Edit mode: " + (editing ? "on" : "off");
            update();
        }
        $("edit-toggle").addEventListener("click", () => {
            if (!allowed()) return;
            editing = !editing; clear();
            try { localStorage.setItem("hometab.editMode", String(editing)); } catch { /* Keep the current session usable. */ }
            api.render();
        });
        window.addEventListener("storage", event => {
            if (event.key !== "hometab.editMode") return;
            editing = event.newValue === "true"; clear(); api.render();
        });
        $("selection-clear").addEventListener("click", () => { clear(); api.render(); });
        $("selection-move").addEventListener("click", () => openMove());
        $("selection-delete").addEventListener("click", () => deleteItems());
        document.addEventListener("pointerdown", event => { if (!menu.hidden && !menu.contains(event.target) && event.target !== menuOrigin) closeMenu(); });
        document.addEventListener("keydown", event => {
            if (menu.hidden) return;
            const items = [...menu.children], index = items.indexOf(document.activeElement);
            if (event.key === "Escape" || event.key === "Tab") { closeMenu(event.key === "Escape"); if (event.key === "Escape") event.preventDefault(); }
            else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
                event.preventDefault(); items[event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length].focus();
            }
        });
        window.addEventListener("resize", () => closeMenu());
        // Browser focus/scroll-into-view can dispatch delayed scroll events while
        // a menu opens. Dismiss on a user's outside scroll gesture instead.
        document.addEventListener("wheel", event => { if (!menu.contains(event.target)) closeMenu(); }, { passive: true });
        document.addEventListener("touchmove", event => { if (!menu.contains(event.target)) closeMenu(); }, { passive: true });
        return { decorate, addButton, sync, clear, openMove, deleteItems,
            get selecting() { return editing || selected.size > 0; },
            dragSelection(id) { return selected.has(id) ? { ids: [...selected], expected: selectionRevision } : { ids: [id], expected: api.revision() }; }
        };
    }
    globalThis.HomeTabItemActions = { create, preserveViewport };
})();
