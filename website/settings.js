(() => {
    "use strict";
    const button = document.getElementById("settings-toggle"), panel = document.getElementById("settings-panel");
    const appearance = document.getElementById("appearance-menu");
    function close(focus = false) {
        panel.hidden = true; button.setAttribute("aria-expanded", "false"); appearance.open = false;
        if (focus) button.focus();
    }
    button.addEventListener("click", () => {
        if (!panel.hidden) close();
        else { panel.hidden = false; button.setAttribute("aria-expanded", "true"); }
    });
    document.getElementById("link-filter").addEventListener("focus", () => close());
    document.addEventListener("click", event => { if (!panel.hidden && !event.target.closest(".header-tools")) close(); });
    document.addEventListener("keydown", event => {
        if (event.key !== "Escape" || panel.hidden) return;
        if (appearance.open) { appearance.open = false; appearance.querySelector("summary").focus(); }
        else close(true);
        event.preventDefault(); event.stopPropagation();
    });
    panel.addEventListener("click", event => { if (event.target.closest("button")) close(); });
    globalThis.HomeTabSettings = { close };
})();
