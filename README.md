# HomeTab

A browser new-tab extension and standalone read-only homepage. Homepage configuration
is stored in a plain **bookmarks.html** file, with favicon images alongside it.
There is no server, Python process,
database engine, or runtime build step.

Clone the source into any directory:

```sh
git clone https://github.com/kodybrown/hometab-browser-extension.git
cd hometab-browser-extension
```

HomeTab is available under the [MIT license](LICENSE). Bundled fflate and Bootstrap
Icons retain their MIT notices in [website/vendor](website/vendor/README.md).

## Install the extension

1. In Brave, enable **File System Access API** at
   `brave://flags/#file-system-access-api`, then relaunch the browser. Chrome and
   Edge normally expose this API without that flag. Browser support is detected
   at runtime; the flag is not changed by HomeTab or its installer.
2. Open `brave://extensions` (or `chrome://extensions` / `edge://extensions`),
   enable **Developer mode**, and choose **Load unpacked**.
3. Select the **website** directory inside your cloned repository.
4. Open a new tab. The included `bookmarks.html` is displayed read-only until you
   connect a folder.
5. Copy `website/bookmarks.html` into a dedicated data directory, then choose
   **Settings → Connect folder** and select that directory. Keep it separate from source code.
   Grant read/write access, and persistent access if the browser offers it.
6. Pin HomeTab's extension icon for **Add to HomeTab**.

The runtime is JavaScript inside the extension. No scheduled task, background OS
service, native helper, or listening network port is required. Permission grants
and their persistence are browser-specific; reconnect the folder when requested.

For long-term use, copy `website/bookmarks.html` into your synced/backed-up data
folder and connect that folder. The connected file is authoritative; the bundled
file is just the starting collection. A remembered connection that has lost
permission does not silently fall back to that starting collection.

The directory handle is stored in IndexedDB (`hometab.files`) as connection
metadata. Losing a browser profile means reconnecting the folder, not losing
your links. No homepage content is saved in localStorage or IndexedDB.

After source updates, reload the extension on its extensions page and reopen the
new tab.

File status, **Connect folder**, **Open HTML**, **Reload file**, and **Plain links**
are always inside the **Settings** cog. Connection errors appear below the header
so they remain visible when Settings closes.

## Use HomeTab for new tabs, the Home button, and startup

These are three separate browser behaviors. Installing the extension sets the
new-tab page; the Home button and startup page are optional browser settings.

1. **New tabs:** Follow **Install the extension** above, then press **Ctrl+T**
   (Windows/Linux) or **Command+T** (macOS). The enabled extension automatically
   replaces the new-tab page with HomeTab; no custom URL is needed. Accept any
   browser prompt to keep HomeTab as your new-tab page. If another extension
   controls new tabs, disable its new-tab override so HomeTab can take over.
2. **Home button in Brave:** Open `brave://settings/appearance`. Under **Toolbar**,
   enable **Show home button**, then select **New Tab page**. Clicking the browser's
   Home button now opens HomeTab through its new-tab override.
3. **When Brave starts:** Open `brave://settings/getStarted`. Under **On startup**,
   choose **Open the New Tab page**. Choosing **Continue where you left off**
   instead restores your previous tabs.

Alternatively, set the Home button's custom address to
`chrome-extension://<extension-id>/index.html`. Find HomeTab's ID at
`brave://extensions` with **Developer mode** enabled and replace `<extension-id>`
with it. Prefer **New Tab page**, which keeps working if the extension ID changes.

## Standalone read-only use

```powershell
# From the cloned repository folder:
Start-Process .\website\index.html
```

Choose **Settings → Open HTML** and select your `bookmarks.html`. It renders the same search
cards, quick links, websites, tabs, separators, and expandable sections. Reopen
the file to see subsequent external changes. Where supported, **Connect folder**
can remember read access; standalone mode never enables editing or writing.
Appearance choices are temporary previews in standalone mode.

Without a server or extension, browsers cannot reliably fetch an adjacent HTML
file automatically. The file chooser is therefore the universal direct-file
fallback. The static search/quick-link defaults remain available before a file
is opened; they are not presented as your connected saved collection.

When served by a static host on localhost or HTTPS, `index.html` can load the adjacent
`bookmarks.html` automatically and remains read-only. No editing API is used.
Opening `bookmarks.html` itself displays plain nested links, without scripts,
styles, extension access, or any dependency on HomeTab.

## Edit the homepage

The header's **Find saved links** box filters Quick access, My websites, and all
bookmark folders by title, original title, description, address, or folder path.
Search engines are excluded. While filtering, results replace the search-engine
cards and homepage grids. Clear the field (or press Escape) to return to the page.

The **Settings** cog opens editing, Undo, HTML/ZIP downloads, ZIP restore, and file
connection controls. The icon is Bootstrap Icons' MIT-licensed gear-fill SVG,
embedded locally; attribution and license are in `website/vendor`.
**Appearance** expands a theme submenu with OS, Light, Dark, and Neon. The panel
closes when you click outside; Escape closes the theme submenu and then Settings.

In the connected extension, choose **Settings → Edit mode** to show a small gear,
selection checkbox, and drag handle beside each item. Edit mode stays on across
reloads and new tabs until you turn it off. Its browser-local preference contains
no bookmark content; it does not modify `bookmarks.html`. There is no separate
collection selector or Done editing step. Edit search engines, quick links,
websites, tabs, sections, and separators directly where they appear.

Click an item's gear or **right-click** it to open the same contextual menu,
whether edit mode is on or off. **Edit** opens its title, destination, optional
description/icon, and location fields. Menus also offer favicon capture, Move,
Delete, and creation actions as appropriate. Link menus include Open in new tab
and Copy address. **Shift-right-click** preserves the browser's own context menu;
search textboxes retain their normal text menu. Keyboard users can use the gear
or **Shift+F10 / Menu key**, arrow keys, Home/End, Enter, and Escape.

In edit mode, **+** beside the tabs adds a tab; **+** beside Search engines, Quick
access, or My websites adds an item there. **+** beside a tab's contents or nested
section offers Add bookmark, Add section, and Add separator with that destination
already selected. Action feedback, save confirmations, and appearance messages
remain directly below the main header. Read-only views retain link menus but hide
editing controls.

In a link's editor, **Get favicon** asks for the optional browser favicon permission
the first time you use it, then previews a 32px icon from the browser's favicon
service. The browser may return a generic icon for an unknown site; visit the
website, then try again. **Save** commits the icon along with the other form edits;
Cancel leaves the database unchanged. **Clear icon** removes it on the next save.
This is available for HTTP(S) links in all four homepage collections.

In a folder or tab's editor, **Get favicons** collects icons for its HTTP(S)
bookmarks, including subfolders. It shows progress, requests permission once per
batch, and limits concurrent requests to four. **Save** applies the successful
results together using the page's original file revision. Failed requests preserve
existing icons; Cancel/closing the editor stops the batch and leaves files alone.

Newly captured icons save as 32px PNGs in a **favicons** subfolder beside your
connected `bookmarks.html`, for example `HomeTab-data/favicons` in your data directory.
The HTML stores relative `data-icon="favicons/<sha256>.png"` references. Names are
hashes of image bytes, so identical images share a file even across different
bookmarks. New images are written before their HTML references; existing identical
images are not rewritten. Images are retained for previous-file backups and Undo,
so deleting a bookmark does not automatically delete its image.

Sync or back up **bookmarks.html and favicons together**. **Download HTML** downloads
the link database only; copy the favicons directory alongside it to retain images.
The standalone viewer displays images with a connected read-only folder, or when
served beside the data by a static HTTP host. **Open HTML** alone cannot access
sibling image files and displays letter marks instead. Missing, unreadable, or
corrupt icons also fall back to letters without breaking the links.

No website favicons are bundled with the extension; `website/icons` contains only
HomeTab's own application icons. Old packaged icon references remain readable but
display letters until replaced through Get favicon. Existing embedded PNGs remain
viewable and are moved to favicon files on the next changed save; loading a file
never converts or rewrites it. No browser-local content store, website host
permission, or external favicon provider is needed. Only a button click retrieves
icons from the browser; page loads read saved local images.
The browser feature is documented in [Chrome's favicon guide](https://developer.chrome.com/docs/extensions/how-to/ui/favicons).

- Search engines also have an HTTP(S) URL template containing `{query}`.
  For example: `https://www.google.com/search?q={query}` or
  `https://www.dictionary.com/browse/{query}`. Input is URL-encoded before use.
- Folders directly inside My links are tabs. Nested folders are expandable
  sections. Separators break ordered link lists into visual blocks and can have
  labels. The four main collections have permanent IDs, so renaming their visible
  headings does not break the layout.
- Use an item's menu → **Edit** to rename, change its location, move earlier or
  later, or remove it. Deleting a folder confirms its nested link count. Undo
  restores the last change until another edit or reload.
- Drag an item's **handle** into a tab or section, or onto another link to
  place it before that link. Drag tab handles onto other tabs to reorder them. Folder
  cycles, invalid destinations, and stale drops are rejected before saving.
  The existing location and move-earlier/later controls remain available for
  keyboard and touch use. Ordinary link dragging retains its browser behavior.
- Appearance changes in the connected extension save to the same HTML file.
  OS is the default; Light, Dark, and hackfx-inspired Neon are available.
- The header filter searches saved links across all collections except Search engines.
  Tab navigation supports arrow keys, Home, and End.

### Select, move, or delete multiple items

Use checkboxes in edit mode, **Ctrl-click** (Windows/Linux) or **Command-click**
(macOS) to toggle selection, or **Shift-click** to select a visible range. With
edit mode off, an item's context menu → **Select** reveals temporary selection
controls. Normal clicks still open links or expand sections.

The bar below the header shows the selected count and **Move…**, **Delete**, and
**Clear**. Drag any selected item's handle to move the selection together, retaining
database order. Selected folders carry their descendants once, even if those
descendants are selected too. The Move dialog offers only destinations that
accept the entire batch. Permanent homepage sections cannot be moved/deleted;
invalid combinations, cycles, and stale file revisions reject the entire change.

Delete previews the selected names and the link counts inside folders. Cancel
leaves the file alone. A successful batch saves once and has one **Settings → Undo
last change** operation. Single-item and bulk deletion preserve the page's scroll
position; if the remaining page is shorter, the position stops at its new bottom.
Selection is temporary: normal tab changes, filter
changes, and reloads clear it. Dropping onto another tab moves the selected batch
without needing to change tabs first. Touch users can use checkboxes and Move…
instead of dragging.

Saving updates only the connected HTML file. It never modifies browser bookmarks.
The six imported clipping bookmarklets are retained as copyable code, not
executable anchors. No external favicons, fonts, or scripts are fetched on load.

## Capture the current page

Click the pinned HomeTab icon. Its popup prefills the current page title and URL.
Use **Find a folder**, choose a tab/section, optionally change the title, and
**Save**. The last successfully used destination is remembered in each browser;
**Saved for later** is the fallback when that tab exists. An exact URL already in that
folder is not added again. A disconnected popup links to HomeTab for setup;
folder permissions are obtained in the full HomeTab page, not the transient popup.

**Include favicon** optionally gets the browser icon before saving the bookmark.
If retrieval fails or permission is declined, the bookmark still saves and the
status explains the missing icon. A concurrent database change still blocks the
whole save. The last folder ID and favicon checkbox are optional IndexedDB
connection preferences; bookmark content and appearance remain in the HTML file.

The extension requests `activeTab` and `contextMenus`, with `favicon` optional
when Get favicon is used. It reads the current tab
only when invoked, without blanket website access. It also provides:

- **Right-click → Add page to HomeTab**.
- **Right-click a link → Add link to HomeTab**, opening a confirmation form.
- **Alt+Shift+H**, the suggested popup shortcut. Change it at the browser's
  extensions shortcuts page if it conflicts with another shortcut.

Internal browser pages may not supply capturable metadata; the form allows a web
address to be entered manually. The standalone homepage has no current-tab
capture capability. A bookmarklet entry point is not included in this version.

## Database, backups, and conflicts

**Settings → Download ZIP backup** downloads the displayed database and every
referenced favicon file in one archive. Missing/unreadable images stop the export
with an error so the ZIP is not presented as a complete backup. Connected backups
verify the page's file revision before and after reading images.

**Settings → Restore ZIP backup** validates the ZIP and previews its collection,
link, and image counts before any write. **Restore backup** replaces the connected
database through the same revision checks, image commits, and previous-file backup
as normal edits; Undo is available afterward. Cancel makes no changes. Restore is
disabled in standalone/read-only mode. Archive paths, duplicate entries, PNG hashes,
HTML structure, and both declared and actual decompressed sizes are validated.
Limits are 32 MB compressed, 40 MB expanded, 10 MB HTML, and 12 KB per PNG.

ZIP support uses a locally bundled, pinned MIT-licensed fflate 0.8.3 library in
`website/vendor`, with its license. No CDN, worker, runtime installation, or build
is required. Only the current database and its referenced images enter the ZIP;
other files in your connected folder are not included.

`bookmarks.html` contains four `<section data-id="...">` elements:
`search-engines`, `quick-access`, `my-websites`, and `my-links`. Headings and nested
`<ul>/<li>` elements provide structure; links use ordinary anchors, separators
use `<hr>`, and inert bookmarklet spans use `data-bookmarklet`. Stable item IDs
and optional link metadata are stored in `data-*` attributes. The saved appearance
is a `hometab-theme` meta tag. Saves use deterministic UTF-8/LF formatting; custom
markup and formatting are not maintained as a source-preserving HTML editor.

The bundled database is a small starter: six search engines, four quick links,
wasatchwizard.com and the HomeTab repository under My websites, and three generic
tabs (Everyday, Reading, Tools) with three links each. A connected database remains
authoritative; the starter does not replace or merge into it. If you already edited
the old localStorage version, retain its JSON export before switching: this
version does not automatically adopt browser-local collections or JSON backups.

Each loaded page holds its own SHA-256 revision. Before a save, HomeTab obtains
an exclusive browser filesystem write stream, rereads the file by name, and
compares its actual bytes with that page's revision. A mismatch rejects the save
and leaves the pending form intact. Refreshing another page's last-seen hash
cannot make an old page's data current. Changes are committed only on stream close.

Each successful changed save first copies the exact old bytes into
**bookmarks.previous.html** in the same folder. A backup failure prevents the
primary write. **Download HTML** also creates a portable copy of the displayed
configuration. Restore a previous file by copying it over `bookmarks.html`, then
reload HomeTab. No file is repaired or rewritten merely by opening it.

`localStorage` holds the informational `hometab.lastSeenHash` and browser-only
`hometab.editMode` preference, never bookmark content or an authoritative save
precondition. Web Locks coordinate extension pages in
one browser origin. Exclusive streams and an additional hash check protect local
writes, but external programs and independent browsers/machines do not share all
these locks. Syncthing conflict handling remains the user's responsibility.

## Development and verification

No installation is necessary to run the extension or standalone viewer. Node.js
and Playwright are development/test dependencies only.

```powershell
# From the cloned repository folder:
npm ci --ignore-scripts
npm test
git diff --check
Start-Process .\website\index.html
```

The suite discovers an installed Brave, Edge, Chrome, or Chromium. Override the
executable when needed:

```powershell
$env:HOMETAB_BROWSER = 'C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe'
npm test
```

On Linux/macOS, set `HOMETAB_BROWSER` to the appropriate Chromium browser path,
or run `npx playwright install chromium` to install the test browser. Browser
artifacts go under the OS temporary directory (`hometab-extension-tests`).

Automated coverage includes thirteen model/serialization tests and twenty-nine browser
scenarios. Tests use isolated profiles and real browser handles, IndexedDB,
streams, and locks in the browser's private test filesystem. The native directory
picker boundary is supplied by the tests. Programmatic popup opening does not
grant activeTab, so active-tab metadata is supplied at that permission boundary
in the popup test. The real folder chooser/permission grant and pinned-icon click
remain manual acceptance checks. Tests never edit the user's native bookmark file.
Favicon tests supply the optional-permission dialog and image-response boundaries
for editor scenarios, and separately exercise the real browser favicon service
in a disposable extension fixture with that permission pre-granted. Sidecar PNG
files, deduplication, clear/undo, read-only folder/static-host rendering, missing
and corrupt images, denied writes and retry, recursive batches, cancellation,
failed requests, and stale editors are covered using real filesystem APIs.
Header search/settings, native drag-and-drop, capture defaults, ZIP downloads,
restore preview/cancel/undo, concurrent restore conflicts, unsafe ZIP paths, missing
images, and false archive size declarations are also exercised. Persistent edit
mode, context menus and keyboard access, local creation, range selection, bulk
move/delete/cancel/undo, parent/child deduplication, and stale batch rejection are
covered too.

For a manual end-to-end check: install the extension, connect a disposable folder
with a copy of `bookmarks.html`, edit a link and reload, confirm the adjacent
previous-file backup, then visit a webpage and capture it through the pinned icon.
Open two HomeTab tabs, edit in one, and confirm a stale editor in the other refuses
to save. Try Open HTML from standalone `index.html` and confirm editing is disabled.
