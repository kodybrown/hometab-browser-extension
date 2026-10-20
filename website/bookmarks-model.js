(() => {
    "use strict";
    const clone = value => JSON.parse(JSON.stringify(value));
    const urlKind = value => {
        try {
            const protocol = new URL(value).protocol;
            if (protocol === "javascript:") return "bookmarklet";
            return ["https:", "http:", "file:", "codex:"].includes(protocol) ? "link" : null;
        } catch { return null; }
    };
    const validate = data => {
        if (!data || data.version !== 1 || !Array.isArray(data.tabs) || data.tabs.length > 200) {
            throw new Error("This is not a supported HomeTab backup.");
        }
        const ids = new Set();
        const visit = (node, depth) => {
            if (!node || depth > 20 || ids.size > 20000 || typeof node.id !== "string" ||
                !node.id || node.id.length > 120 || ids.has(node.id) ||
                typeof node.title !== "string" || node.title.length > 2000 ||
                (node.originalTitle !== undefined && typeof node.originalTitle !== "string")) {
                throw new Error("The collection contains invalid or repeated items.");
            }
            ids.add(node.id);
            if (node.kind === "folder" && Array.isArray(node.items)) {
                node.items.forEach(child => visit(child, depth + 1));
            } else if (node.kind === "link" && typeof node.url === "string" &&
                       node.url.length <= 100000 && urlKind(node.url)) {
                // Bookmarklet code is retained as data and is never put in an anchor's href.
            } else if (node.kind !== "separator") {
                throw new Error("The collection contains an unsupported link or item.");
            }
        };
        for (const tab of data.tabs) {
            if (tab.kind !== "folder") throw new Error("Every tab must be a folder.");
            visit(tab, 0);
        }
        return data;
    };
    const entries = data => {
        const result = [];
        const visit = (nodes, parent, path) => nodes.forEach(node => {
            result.push({ node, parent, path });
            if (node.kind === "folder") visit(node.items, node, [...path, node.title]);
        });
        visit(data.tabs, null, []);
        return result;
    };
    const count = node => node.kind === "link" ? 1 : (node.items || []).reduce((sum, child) => sum + count(child), 0);
    const find = (data, id) => entries(data).find(entry => entry.node.id === id);
    const move = (data, id, parentId, offset = null) => {
        const source = find(data, id);
        const target = parentId ? find(data, parentId)?.node : null;
        if (!source || (parentId && target?.kind !== "folder")) throw new Error("Choose an existing destination.");
        if (!parentId && source.node.kind !== "folder") throw new Error("Only folders can become tabs.");
        // Moving a folder into itself or a descendant would lose the tree's root.
        if (target && source.node.kind === "folder" &&
            (target.id === id || entries({ tabs: [source.node] }).some(entry => entry.node.id === parentId))) {
            throw new Error("A section cannot be moved inside itself.");
        }
        const from = source.parent ? source.parent.items : data.tabs;
        const to = target ? target.items : data.tabs;
        const index = from.indexOf(source.node);
        from.splice(index, 1);
        const position = offset !== null && from === to ? Math.max(0, Math.min(to.length, index + offset)) : to.length;
        to.splice(position, 0, source.node);
    };
    const place = (data, id, parentId, beforeId = null) => {
        const source = find(data, id), target = find(data, parentId)?.node;
        if (!source || data.tabs.includes(source.node)) throw new Error("Permanent homepage collections cannot be moved.");
        if (target?.kind !== "folder" || (beforeId && !target.items.some(node => node.id === beforeId))) throw new Error("Choose an existing destination.");
        if (id === beforeId && source.parent === target) return;
        move(data, id, parentId);
        if (beforeId) {
            const index = target.items.findIndex(node => node.id === id);
            const [node] = target.items.splice(index, 1);
            target.items.splice(target.items.findIndex(node => node.id === beforeId), 0, node);
        }
    };
    // Reduce a selection to its outermost nodes in database order. A selected folder
    // already carries its descendants, so they must never be moved/deleted twice.
    const selectionRoots = (data, ids) => {
        const selected = new Set(ids), all = entries(data), byId = new Map(all.map(entry => [entry.node.id, entry]));
        if (!selected.size || [...selected].some(id => !byId.has(id))) throw new Error("Choose existing items first.");
        if ([...selected].some(id => !byId.get(id).parent)) throw new Error("Permanent homepage collections cannot be changed this way.");
        return all.filter(entry => {
            if (!selected.has(entry.node.id)) return false;
            for (let parent = entry.parent; parent; parent = byId.get(parent.id)?.parent) if (selected.has(parent.id)) return false;
            return true;
        });
    };
    const placeMany = (data, ids, parentId, beforeId = null) => {
        const next = clone(data), sources = selectionRoots(next, ids), target = find(next, parentId)?.node;
        if (target?.kind !== "folder" || (beforeId && !target.items.some(node => node.id === beforeId))) throw new Error("Choose an existing destination.");
        const carried = new Set(sources.flatMap(({ node }) => entries({ tabs: [node] }).map(entry => entry.node.id)));
        if (carried.has(parentId)) throw new Error("A section cannot be moved inside itself or its descendants.");
        // Dropping onto an already selected sibling is a no-op, not a reshuffle.
        if (carried.has(beforeId) && sources.every(entry => entry.parent === target)) return next;
        if (carried.has(beforeId)) beforeId = target.items.slice(target.items.findIndex(node => node.id === beforeId) + 1).find(node => !carried.has(node.id))?.id || null;
        for (const { node } of sources) place(next, node.id, parentId, beforeId);
        return next;
    };
    const removeMany = (data, ids) => {
        const next = clone(data);
        for (const { node, parent } of selectionRoots(next, ids)) parent.items.splice(parent.items.indexOf(node), 1);
        return next;
    };
    globalThis.HomeTabModel = { clone, urlKind, validate, entries, count, find, move, place, selectionRoots, placeMany, removeMany };
})();
