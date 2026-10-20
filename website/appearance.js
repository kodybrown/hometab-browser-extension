(() => {
    "use strict";
    const themes = ["os", "light", "dark", "neon"];
    function apply(value) {
        const theme = themes.includes(value) ? value : "os";
        document.documentElement.dataset.theme = theme;
        document.querySelectorAll('input[name="theme"]').forEach(input => { input.checked = input.value === theme; });
    }
    // The database owns the saved appearance; opening a page never writes browser preferences.
    apply("os");
    globalThis.HomeTabAppearance = { apply };
    document.addEventListener("DOMContentLoaded", () => {
        const picker = document.getElementById("appearance");
        if (!picker) return;
        picker.disabled = false;
        picker.addEventListener("change", event => {
            if (!event.target.matches('input[name="theme"]')) return;
            apply(event.target.value);
            window.dispatchEvent(new CustomEvent("hometab-theme", { detail: event.target.value }));
        });
    });
})();
