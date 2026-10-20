chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({ id: "hometab-page", title: "Add page to HomeTab", contexts: ["page"] });
        chrome.contextMenus.create({ id: "hometab-link", title: "Add link to HomeTab", contexts: ["link"] });
    });
});
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (!["hometab-page", "hometab-link"].includes(info.menuItemId)) return;
    const url = info.menuItemId === "hometab-link" ? info.linkUrl : tab?.url || info.pageUrl;
    if (!url) return;
    const title = info.menuItemId === "hometab-link" ? url : tab?.title || url;
    // This opens a confirmation form; a context-menu click never writes the file by itself.
    chrome.tabs.create({ url: chrome.runtime.getURL("capture.html") + "?" + new URLSearchParams({ url, title }) });
});
