# Changelog

## 2026-10-20

- Added an MIT license for HomeTab and documented the bundled third-party license
  notices. Verified all 43 tests, dependency audit, and the source-only secret scan
  for the clean initial public snapshot.

- Aligned the standalone page's initial quick links and websites with the generic
  starter database, and made clone/setup documentation independent of a specific
  user's checkout paths. Verified all 43 tests, including the standalone view
  before a database is opened, and checked the publishable source snapshot.

- Preserved the pre-dialog page scroll position after single-item, editor, and
  bulk deletion. Focus restoration no longer scrolls to Settings; deleting a large
  final section clamps naturally to the shorter page's bottom. Verified all 43
  tests, including long-page deletion and scroll-range regression scenarios.

- Replaced the temporary editing workflow and collection selector with persistent
  browser-local Edit mode, per-item gear/context menus, and local creation buttons
  across the homepage. Right-click and keyboard menus work with edit mode off;
  native text menus and Shift-right-click remain available. Read-only views hide
  editing controls. No bookmark data is cached in browser storage.
- Added checkbox/modifier/range selection, a header selection bar, handle-based
  batch drag-and-drop, a destination picker, and confirmed bulk deletion. Batches
  retain database order, carry descendants once, save once with Undo, and reject
  invalid destinations, cycles, fixed-root changes, and stale revisions without
  partial writes. Ordinary links retain their native dragging behavior.
- Verified all 42 tests, including persistent mode, contextual creation, menu
  keyboard access, bulk move/delete/cancel/undo, parent/child deduplication,
  selection clearing, invalid/stale batches, and existing file/favicons/ZIP
  regressions. Reviewed desktop/mobile editing, menus, and selection screenshots.

- Clarified README setup with a dedicated section for HomeTab's automatic new-tab
  override, Brave's Home button, and browser startup, including the custom
  extension URL alternative. Reviewed the documentation and passed Git whitespace
  checks; no runtime behavior changed.

- Moved the editing collection selector, Done editing, and page/save/appearance
  feedback directly below the main header. File connection status and controls
  now stay inside Settings; connection errors remain visible outside the menu.
  Replaced the cog with the locally embedded Bootstrap Icons gear-fill SVG and
  included its MIT license. Documented Brave's Home-button and startup settings.
  Verified all 37 tests, including collapsed-collection editing, top-of-page
  feedback, connection actions, and narrow layouts; reviewed desktop/mobile
  screenshots.

- Moved saved-link filtering into the header and grouped editing, Undo, HTML/ZIP
  downloads, restore, and appearance under a settings cog with a theme submenu.
  Filtering includes Quick access, My websites, and bookmark folders while
  excluding search engines, and displays results in place of homepage grids.
- Added complete ZIP backup and previewed restore with referenced favicon files,
  revision checks, previous-file backup, and Undo. Validated archive paths, image
  hashes, duplicate entries, and declared/actual expansion limits. Bundled pinned
  MIT-licensed fflate locally, without a runtime build or remote scripts.
- Added searchable capture destinations, remembered browser capture defaults, and
  optional favicon capture that preserves a successful bookmark save if the icon
  fails. Added drag-and-drop moves and link/tab reordering while
  retaining keyboard move controls and protecting against cycles and stale drops.
- Verified all 37 tests, including header keyboard/responsive behavior, full ZIP
  downloads and restore/cancel/undo, hostile archives, capture preferences, native
  drag-and-drop, stale-file rejection, and existing regression scenarios. Reviewed
  header/settings, capture, and restore screenshots. User data folders were not
  modified by implementation or tests.

- Removed all 45 legacy packaged website image assets and their starter/default
  references; kept HomeTab's own application icons. New favicons save in a favicons
  subfolder beside bookmarks.html, with relative, content-hashed PNG references
  that deduplicate identical images. HTML commits follow successful image writes;
  retained immutable images support backups and undo. Missing/corrupt images render
  letter marks. Existing embedded icons remain readable and move to sidecar files
  on an explicit changed save; user data is never rewritten at load.
- Added Get favicons to folder/tab editors, recursively collecting HTTP(S) bookmark
  icons with progress, bounded concurrency, and cancellation. Results stage until
  one revision-checked Save; failures keep existing icons. Documented syncing the
  database and image folder together and read-only folder/static-host behavior.
  Verified all 31 tests, including deduplication, PNG integrity, image write failure
  and retry, recursive batches, cancellation, stale editors, and responsive layouts.

- Added Get favicon, preview, and Clear icon to link editors across the homepage.
  Favicon access is an optional browser permission requested on a button click;
  no website host access or external icon provider is required. New icons save as
  bounded 32px PNGs inside bookmarks.html, retaining single-file portability and
  standalone rendering. Packaged icons remain in website/img. Cancel, denied
  permission, failed images, and late responses preserve existing bookmark data.
  Updated documentation and verified all 28 tests, including the real browser
  favicon endpoint, editor save/clear/undo, portable rendering, unsafe image
  rejection, and mobile layout. Visually reviewed the icon editor.

- Corrected the starter's HomeTab repository URL to
  https://github.com/kodybrown/hometab-browser-extension. Moved the entire file
  connection section below the bookmarks whenever a directory is connected,
  preserving matching visual and keyboard order. Unconnected setup stays at the
  top. Verified all 25 tests, including connected/restored section placement,
  responsive layouts, and whitespace checks.

- Replaced the bundled personal bookmark collection with a basic starter database:
  retained the same six search engines, added four generic quick links, limited
  My websites to wasatchwizard.com and the HomeTab repository, and provided three
  generic tabs with three links each. OS remains the default appearance. Connected
  user databases and their backups are untouched.
- Updated the database documentation and existing starter checks. Verified all
  25 model/browser tests, exact preservation of the search section, canonical HTML
  round trips, and whitespace checks.

## 2026-10-19

- Created the extension source checkout, preserving the previous installation.
  Replaced browser-local
  content storage with one plain, script-free bookmarks.html database containing
  Search engines, Quick access, My websites, and My links. All 683 imported URLs
  remain, with their 16 tabs, nested sections, separators, and inert bookmarklets.
- Added a JavaScript-only extension filesystem layer: explicit folder connection,
  IndexedDB handle metadata, per-page SHA-256 revisions, exclusive browser write
  streams, same-origin write coordination, a second precommit hash check, and exact
  previous-file backups. Stale or failed writes preserve the source and pending
  form. Revoked connection permissions do not silently load the starting database.
- Made search engines, quick links, personal sites, bookmark structure, and saved
  appearance editable in the connected extension. Standalone index.html opens
  the same HTML read-only through a file chooser or remembered read-only connection;
  static HTTP hosting can load adjacent HTML automatically. No server or Python
  runtime is required. Browser storage contains no homepage content.
- Added the pinned-icon capture form, suggested Alt+Shift+H shortcut, and right-click
  actions for pages and links. Captures select a folder, check duplicates there,
  and use the same file revision protections as the homepage editor.
- Verified 8 model/serialization tests and 16 browser scenarios (25 reported tests
  including their container) in isolated Brave profiles, plus default-Brave flag
  guidance and its read-only file fallback. Covered content counts, HTML round trips,
  markup/resource rejection, edits and all homepage settings, previous-file backups,
  undo, stale shared-hash regression, external replacement, permission/write failures,
  capture conflicts, exclusive writers, toolbar popup creation, keyboard behavior,
  encoded search URLs, and 320–1440px layouts in Light/Dark/Neon. Visually reviewed
  the resulting layouts. Native folder picking/permission and real toolbar-click
  metadata grants remain manual acceptance checks; automated I/O used real browser
  filesystem APIs in a disposable private test filesystem and supplied those UI
  boundaries. No normal browser profile or original installation was modified.

- Added editable tabbed link collections from the supplied Brave export: all
  683 addresses retained in 16 descriptively named tabs, including all 60 loose
  links in Saved for later. Preserved nested folder order, two separator folders,
  and six inert/copyable bookmarklets; omitted two empty folders and moved the
  learning collection into Reading. Original browser bookmarks/export untouched.
- Added cross-tab filtering and controls to add, rename, move, reorder, remove,
  and undo links, expandable sections, separators, and tabs. Edits save only on
  explicit changes; stale dialogs cannot overwrite another tab's edits, failed
  writes leave data unchanged, and unreadable stored data is protected. JSON
  backup export/import keeps the collection portable without a server.
- Changed search to three desktop columns and added ChatGPT/Grok prompt handoffs,
  web/desktop ChatGPT quick links, tighter spacing, and a reusable bookmark-export
  converter. The desktop protocol was confirmed registered and documented;
  the actual desktop session was not launched during testing.
- Verified six collection-model tests, two importer tests, an exact comparison
  of all 683 exported addresses, 20 collection browser check groups, and 14
  appearance/search/extension regression groups in isolated Edge/Chromium
  profiles. Covered edits, nesting, order, confirmation/undo, backups, markup
  safety, bookmarklets, failed/corrupt storage, cross-tab conflicts, all six search
  URL handoffs, keyboard controls, and responsive Light/Dark/Neon layouts from
  320 to 1440 pixels. Search navigation was intercepted; no live AI prompts or
  browser bookmark deletions were performed.

- Replaced the old table/float layout with responsive search cards, quick-access
  links, personal websites, and collapsible work/development shortcuts. Preserved
  the original internal addresses, corrected the malformed C# search link, and
  updated primary search/mail destinations. Replaced a broken Bricksoft favicon
  with a local text mark.
- Added OS (default), Light, Dark, and hackfx-inspired Neon appearances. Explicit
  choices persist in localStorage, synchronize across tabs, and apply before the
  first paint. OS follows system changes; denied storage leaves a usable picker
  with a message explaining that the current choice could not be saved.
- Kept direct-file operation, local assets, and native GET search forms. Added an
  optional permission-free Manifest V3 new-tab extension wrapper and documented
  installation, homepage setup, storage limitations, and customization.
- Verified JavaScript syntax and whitespace checks; 14 automated browser check
  groups using isolated Edge/Chromium profiles covered default/invalid settings,
  reload and full-browser-restart persistence, cross-tab synchronization, system
  appearance changes, storage read/write failures, keyboard controls, local asset
  loading without network requests, disabled JavaScript, and layouts at 320,
  375, 768, 1024, and 1440 pixels in Light/Dark/Neon. Visually reviewed desktop
  and mobile captures. Verified the extension's new-tab override and persistence.
  Search destination/encoding checks intercepted external navigation; legacy
  services and live third-party search results were not availability-tested.
