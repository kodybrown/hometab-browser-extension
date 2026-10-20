(() => {
    "use strict";
    const M = HomeTabModel;
    const sections = ["search-engines", "quick-access", "my-websites", "my-links"];
    // Embedded icons are bounded 32px PNGs, matching our canvas output. Reject active data URLs and remote image URLs.
    const isEmbeddedIcon = value => typeof value === "string" && value.length <= 16000 &&
        /^data:image\/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAg[A-Za-z0-9+/]*={0,2}$/.test(value);
    const isIconFile = value => typeof value === "string" && /^favicons\/[a-f0-9]{64}\.png$/.test(value);
    // Old packaged paths remain readable, but missing icons render as letters. New saves use data-folder files.
    const isIcon = value => isEmbeddedIcon(value) || isIconFile(value) ||
        (typeof value === "string" && value.length <= 4000 && /^img\/[a-zA-Z0-9_. -]+$/.test(value));
    const escape = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    function validate(data) {
        M.validate(data);
        if (!sections.every(id => data.tabs.some(node => node.id === id)) || data.tabs.length !== 4 ||
            !["os", "light", "dark", "neon"].includes(data.theme)) throw new Error("Expected the four HomeTab sections and a valid appearance.");
        for (const root of data.tabs) {
            if (root.id === "my-links") {
                if (root.items.some(node => node.kind !== "folder")) throw new Error("My links must contain folders (tabs).");
            } else if (root.items.some(node => node.kind !== "link" || M.urlKind(node.url) !== "link")) {
                throw new Error("Search engines, Quick access, and My websites must contain ordinary links.");
            }
        }
        for (const { node } of M.entries(data)) {
            if (!/^[a-zA-Z0-9._:-]+$/.test(node.id)) throw new Error("Item IDs must contain only letters, numbers, dots, dashes, underscores, or colons.");
            for (const field of ["description", "searchTemplate"]) {
                if (node[field] !== undefined && (typeof node[field] !== "string" || node[field].length > 4000)) throw new Error("Invalid link metadata.");
            }
            if (node.icon !== undefined && node.icon !== "" && !isIcon(node.icon)) throw new Error("Icons must reference a favicon file or contain a small PNG from Get favicon.");
        }
        for (const engine of data.tabs.find(node => node.id === "search-engines").items) {
            if (!engine.searchTemplate?.includes("{query}") || !/^https?:$/.test(new URL(engine.searchTemplate.replaceAll("{query}", "test")).protocol)) {
                throw new Error("Each search engine needs an http(s) search template containing {query}.");
            }
        }
        return data;
    }
    function serialize(data) {
        validate(data);
        const lines = ['<!doctype html>', '<html lang="en">', '<head>', '  <meta charset="utf-8">', '  <meta name="hometab-version" content="1">',
            '  <meta name="hometab-theme" content="' + escape(data.theme) + '">', '  <title>HomeTab bookmarks</title>', '</head>', '<body>', '  <h1>HomeTab bookmarks</h1>'];
        function item(node, indent) {
            const pad = " ".repeat(indent);
            lines.push(pad + '<li data-id="' + escape(node.id) + '">');
            if (node.kind === "folder") {
                lines.push(pad + '  <h3>' + escape(node.title) + '</h3>', pad + '  <ul>');
                node.items.forEach(child => item(child, indent + 4));
                lines.push(pad + '  </ul>');
            } else if (node.kind === "separator") {
                lines.push(pad + '  <hr>');
                if (node.title) lines.push(pad + '  <span>' + escape(node.title) + '</span>');
            } else {
                const bookmarklet = M.urlKind(node.url) === "bookmarklet";
                const tag = bookmarklet ? "span" : "a";
                let attrs = (bookmarklet ? ' data-bookmarklet="' : ' href="') + escape(node.url) + '"';
                for (const field of ["originalTitle", "description", "searchTemplate", "icon"]) {
                    if (node[field]) attrs += ' data-' + field.replace(/[A-Z]/g, c => '-' + c.toLowerCase()) + '="' + escape(node[field]) + '"';
                }
                lines.push(pad + '  <' + tag + attrs + '>' + escape(node.title) + '</' + tag + '>');
            }
            lines.push(pad + '</li>');
        }
        for (const section of data.tabs) {
            lines.push('  <section data-id="' + escape(section.id) + '">', '    <h2>' + escape(section.title) + '</h2>', '    <ul>');
            section.items.forEach(node => item(node, 6));
            lines.push('    </ul>', '  </section>');
        }
        lines.push('</body>', '</html>', '');
        return lines.join("\n");
    }
    function parse(text) {
        if (text.length > 10000000) throw new Error("The bookmarks file is larger than 10 MB.");
        // A template keeps imported markup inert, including resource-loading elements. Never attach it.
        const template = document.createElement("template");
        template.innerHTML = text;
        const doc = template.content;
        const allowed = new Set(["HTML", "HEAD", "BODY", "META", "TITLE", "H1", "SECTION", "H2", "UL", "LI", "H3", "HR", "SPAN", "A"]);
        for (const element of doc.querySelectorAll("*")) {
            if (!allowed.has(element.tagName) || [...element.attributes].some(attribute => /^on/i.test(attribute.name) || attribute.name === "style" || attribute.name === "http-equiv")) {
                throw new Error("The database must contain plain bookmark HTML, without scripts or embedded content.");
            }
        }
        if (doc.querySelectorAll('meta[name="hometab-version"]').length !== 1 || doc.querySelectorAll('meta[name="hometab-theme"]').length !== 1) throw new Error("Expected one database version and appearance setting.");
        if (doc.querySelector('meta[name="hometab-version"]')?.getAttribute("content") !== "1") throw new Error("This is not a supported HomeTab bookmarks.html file.");
        function list(element) {
            if (!element || element.tagName !== "UL") throw new Error("Expected a nested bookmark list.");
            return [...element.children].map(li => {
                if (li.tagName !== "LI") throw new Error("Unexpected element in a bookmark list.");
                const children = [...li.children];
                const first = children[0];
                const node = { id: li.getAttribute("data-id"), title: "", kind: "link" };
                if (first?.tagName === "H3" && children[1]?.tagName === "UL" && children.length === 2) {
                    node.kind = "folder"; node.title = first.textContent; node.items = list(children[1]);
                } else if (first?.tagName === "HR" && children.length <= 2 && (!children[1] || children[1].tagName === "SPAN")) {
                    node.kind = "separator"; node.title = children[1]?.textContent || "";
                } else if (children.length === 1 && (first.tagName === "A" || (first.tagName === "SPAN" && first.hasAttribute("data-bookmarklet")))) {
                    node.title = first.textContent;
                    node.url = first.getAttribute(first.tagName === "A" ? "href" : "data-bookmarklet");
                    if ((first.tagName === "SPAN") !== (M.urlKind(node.url) === "bookmarklet")) throw new Error("Bookmarklet code must use an inert data-bookmarklet span, not a clickable address.");
                    for (const field of ["originalTitle", "description", "searchTemplate", "icon"]) {
                        const value = first.getAttribute('data-' + field.replace(/[A-Z]/g, c => '-' + c.toLowerCase()));
                        if (value !== null) node[field] = value;
                    }
                } else throw new Error("Unexpected bookmark structure; no changes were saved.");
                return node;
            });
        }
        const roots = [...doc.querySelectorAll("section")];
        if (roots.length !== 4) throw new Error("Expected exactly four HomeTab sections.");
        const data = { version: 1, theme: doc.querySelector('meta[name="hometab-theme"]')?.getAttribute("content") || "os", tabs: roots.map(section => {
            const children = [...section.children];
            if (children.length !== 2 || children[0].tagName !== "H2") throw new Error("Invalid HomeTab section.");
            return { id: section.getAttribute("data-id"), kind: "folder", title: children[0].textContent, items: list(children[1]) };
        }) };
        return validate(data);
    }
    globalThis.HomeTabHTML = { sections, validate, parse, serialize, isIcon, isEmbeddedIcon, isIconFile };
})();
