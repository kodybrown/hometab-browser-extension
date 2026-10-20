const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const vm = require('node:vm');
const zipTools = require('fflate');
const { fixture, iconPNG } = require('./fixtures.cjs');
const website = path.resolve(__dirname, '../website');
const context = vm.createContext({ URL });
for (const name of ['bookmarks-model.js', 'bookmarks-html.js']) vm.runInContext(fs.readFileSync(path.join(website, name), 'utf8'), context);
const fixtureHTML = context.HomeTabHTML.serialize(fixture());
const sourceHTML = fs.readFileSync(path.join(website, 'bookmarks.html'), 'utf8');
const browserPath = process.env.HOMETAB_BROWSER || [
    'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/usr/bin/brave-browser', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', chromium.executablePath()
].find(p => fs.existsSync(p));
const output = path.join(os.tmpdir(), 'hometab-extension-tests');
fs.mkdirSync(output, { recursive: true });
const allNodes = data => context.HomeTabModel.entries(data);

test('extension, portable HTML, and standalone browser behavior', { timeout: 180000 }, async t => {
    assert(browserPath, 'Install a Chromium browser or set HOMETAB_BROWSER to its executable path.');
    const browser = await chromium.launchPersistentContext('', {
        executablePath: browserPath, headless: true, viewport: { width: 1440, height: 1000 }, acceptDownloads: true,
        ignoreDefaultArgs: ['--disable-extensions'],
        args: ['--disable-extensions-except=' + website, '--load-extension=' + website, '--enable-features=FileSystemAccessAPI']
    });
    t.after(() => browser.close());
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => { if (!/^https?:/.test(page.url())) errors.push(error.message); });
    await page.goto('chrome://newtab/');
    await page.locator('#collection-total').filter({ hasText: '9 links' }).waitFor();
    const base = new URL('.', page.url()).href;
    const fileURL = pathToFileURL(path.join(website, 'index.html')).href;
    const chooseTab = name => page.getByRole('tab', { name: new RegExp('^' + name + '\\d*$') }).click();
    const openSettings = async (p = page) => { if (await p.locator('#settings-panel').isHidden()) await p.locator('#settings-toggle').click(); };
    const settingClick = async (selector, p = page) => { await openSettings(p); await p.locator(selector).click(); };
    const chooseTheme = async (theme, p = page) => {
        await openSettings(p);
        if (await p.locator('#appearance-menu').getAttribute('open') === null) await p.locator('#appearance-menu > summary').click();
        await p.locator('.theme-options label').filter({ hasText: theme }).click();
    };
    const enableEditing = async () => { if (await page.locator('#edit-toggle').getAttribute('aria-pressed') === 'false') await settingClick('#edit-toggle'); };
    const reloadFile = async () => { await settingClick('#reload-file'); await page.locator('#reload-file:not([disabled])').waitFor({ state: 'attached' }); };
    const editItem = async (name, p = page) => {
        await p.getByRole('button', { name: 'Actions for ' + name, exact: true }).first().click();
        await p.getByRole('menuitem', { name: 'Edit', exact: true }).click();
    };
    const readFile = () => page.evaluate(async () => (await (await (await navigator.storage.getDirectory()).getFileHandle('bookmarks.html')).getFile()).text());
    const readData = async () => page.evaluate(text => HomeTabHTML.parse(text), await readFile());
    const saveEditor = async () => { await page.locator('#item-form [type="submit"]').click(); await page.locator('#item-dialog').waitFor({ state: 'hidden' }); };
    const add = async (kind, title, url, location) => {
        await enableEditing();
        const parent = location || (kind === 'tab' ? 'my-links' : 'accounts');
        await page.locator('[data-node-id="' + parent + '"]').first().click({ button: 'right' });
        await page.getByRole('menuitem', { name: ({link: 'Add bookmark', folder: 'Add section', separator: 'Add separator', tab: 'Add tab'})[kind], exact: true }).click();
        await page.locator('#item-title').fill(title);
        if (url) await page.locator('#item-url').fill(url);
        if (location) await page.locator('#item-parent').selectOption(location);
        await saveEditor();
    };
    // Native picker UI is supplied at this boundary. The handles, IndexedDB, locks, streams, and files below
    // are real browser filesystem APIs in this disposable profile's private filesystem, never the user's files.
    const installPicker = async (p, html = fixtureHTML) => p.evaluate(async text => {
        const directory = await navigator.storage.getDirectory();
        const handle = await directory.getFileHandle('bookmarks.html', { create: true });
        const writable = await handle.createWritable(); await writable.write(text); await writable.close();
        window.showDirectoryPicker = async () => directory;
    }, html);

    await t.test('extension starts read-only with all supplied content, no data cache or external asset requests', async () => {
        assert.equal(await page.title(), 'HomeTab');
        assert.equal(await page.locator('[role="tab"]').count(), 3);
        assert.equal(await page.locator('.search-card').count(), 6);
        assert.equal(await page.locator('#edit-toggle').isDisabled(), true);
        assert.equal(await page.locator('#settings-panel #connect').count(), 1);
        assert.equal(await page.locator('#settings-toggle svg.bi-gear-fill').count(), 1);
        assert.equal(await page.locator('.quick-links a').count(), 4);
        assert.equal(await page.locator('.quick-links a[href="https://chatgpt.com/"]').count(), 1);
        assert.deepEqual(await page.evaluate(() => Object.keys(localStorage)), []);
        const loaded = await page.evaluate(text => HomeTabHTML.parse(text), sourceHTML);
        assert.equal(context.HomeTabModel.count(loaded.tabs.find(n => n.id === 'my-links')), 9);
        assert.equal(await page.evaluate(text => HomeTabHTML.serialize(HomeTabHTML.parse(text)), sourceHTML), sourceHTML);
        const requests = [];
        page.on('request', request => requests.push(request.url()));
        await page.reload(); await page.locator('#collection-total').filter({ hasText: '9 links' }).waitFor();
        assert(!requests.some(url => /^https?:/.test(url)));
    });
    await t.test('header search excludes engines and settings supports keyboard and small screens', async () => {
        assert.equal(await page.locator('#settings-panel').isHidden(), true);
        assert(await page.locator('#link-filter').evaluate(input => input.getBoundingClientRect().top < document.getElementById('main').getBoundingClientRect().top));
        await page.locator('#link-filter').fill('Dictionary.com'); assert.equal(await page.locator('.bookmark-row').count(), 0);
        assert.equal(await page.locator('.search-section').isHidden(), true);
        await page.locator('#link-filter').fill('stackoverflow.com'); assert.equal(await page.locator('.bookmark-row').count(), 1);
        await page.locator('#link-filter').fill('wasatchwizard'); assert.equal(await page.locator('.bookmark-row').count(), 1);
        await page.locator('#link-filter').fill('Google'); assert.equal(await page.locator('.bookmark-row').count(), 5);
        await page.locator('#link-filter').press('Escape'); assert.equal(await page.locator('.search-section').isVisible(), true);
        await page.locator('.collection > summary').click();
        await page.locator('#link-filter').fill('Wikipedia'); assert.equal(await page.locator('.collection').getAttribute('open'), '');
        await page.locator('#link-filter').press('Escape'); assert.equal(await page.locator('.collection').getAttribute('open'), null);
        await page.locator('.collection > summary').click();
        await page.screenshot({ path: path.join(output, 'header-desktop.png'), fullPage: true });
        await openSettings(); await page.locator('#appearance-menu > summary').click(); await page.keyboard.press('Escape');
        assert.equal(await page.locator('#appearance-menu').getAttribute('open'), null);
        assert.equal(await page.locator('#settings-panel').isVisible(), true);
        await page.keyboard.press('Escape'); assert.equal(await page.locator('#settings-panel').isHidden(), true);
        assert.equal(await page.locator('#settings-toggle').evaluate(node => node === document.activeElement), true);
        await page.setViewportSize({ width: 320, height: 812 }); await openSettings(); await page.locator('#appearance-menu > summary').click();
        assert(await page.locator('#settings-panel').evaluate(panel => panel.getBoundingClientRect().right <= innerWidth));
        await page.screenshot({ path: path.join(output, 'header-settings-mobile.png'), fullPage: true });
        await page.locator('.brand').click(); await page.locator('#collection-total').filter({ hasText: '9 links' }).waitFor();
        await page.setViewportSize({ width: 1440, height: 1000 });
    });
    await t.test('standalone file opens the starter database read-only, without extension APIs or a server', async () => {
        const standalone = await browser.newPage(); await standalone.goto(fileURL);
        assert.equal(await standalone.locator('#edit-toggle').isDisabled(), true);
        assert.deepEqual(await standalone.locator('#quick-access > a').evaluateAll(links => links.map(link => link.href)), [
            'https://www.google.com/', 'https://mail.google.com/mail/#inbox', 'https://outlook.live.com/mail/', 'https://chatgpt.com/'
        ]);
        assert.deepEqual(await standalone.locator('#my-websites > a').evaluateAll(links => links.map(link => link.href)), [
            'http://wasatchwizard.com/', 'https://github.com/kodybrown/hometab-browser-extension'
        ]);
        await standalone.locator('#html-file').setInputFiles(path.join(website, 'bookmarks.html'));
        await standalone.locator('#collection-total').filter({ hasText: '9 links' }).waitFor();
        assert.equal(await standalone.locator('[role="tab"]').count(), 3);
        assert.equal(await standalone.locator('#edit-toggle').isDisabled(), true);
        const guard = await standalone.evaluate(async () => {
            const store = new HomeTabFiles.FileStore(); store.writable = true;
            try { await store.write({}, 'hash'); return 'unexpected write'; } catch (error) { return error.message; }
        });
        assert.match(guard, /read-only/);
        await chooseTheme('Neon', standalone);
        assert.equal(await standalone.locator('html').getAttribute('data-theme'), 'neon');
        assert.match(await standalone.locator('#appearance-status').innerText(), /Preview only/);
        assert(await standalone.locator('#appearance-status').evaluate(el => el.getBoundingClientRect().bottom <= document.getElementById('main').getBoundingClientRect().top));
        assert.equal(await standalone.evaluate(() => localStorage.getItem('hometab.appearance')), null);
        await standalone.close();
    });
    await t.test('malformed HTML and embedded resources are rejected without execution or requests', async () => {
        const requests = []; page.on('request', r => requests.push(r.url()));
        const result = await page.evaluate(text => {
            const results = [];
            for (const bad of [text.replace('<body>', '<body><img src="https://example.invalid/tracker">'),
                text.replace('<body>', '<body><script>window.__injected = true</script>'),
                text.replace('data-id="accounts"', 'data-id="reading"'), text.replace('content="1"', 'content="99"')]) {
                try { HomeTabHTML.parse(bad); results.push(false); } catch { results.push(true); }
            }
            return { results, injected: Boolean(window.__injected) };
        }, fixtureHTML);
        assert.deepEqual(result.results, [true, true, true, true]); assert.equal(result.injected, false);
        assert(!requests.some(url => /^https?:/.test(url)));
    });
    await t.test('connect remembers only the directory handle, then restores it after reload', async () => {
        await installPicker(page);
        await page.evaluate(() => {
            window.normalPicker = window.showDirectoryPicker;
            window.showDirectoryPicker = async () => { throw new Error('Folder unavailable'); };
        });
        await settingClick('#connect-folder');
        await page.locator('#collection-status').filter({ hasText: 'Folder unavailable' }).waitFor();
        assert.equal(await page.locator('#settings-panel').isHidden(), true);
        assert(await page.locator('#collection-status').evaluate(el => el.getBoundingClientRect().bottom <= document.getElementById('main').getBoundingClientRect().top));
        await page.evaluate(() => { window.showDirectoryPicker = window.normalPicker; });
        await settingClick('#connect-folder'); await page.locator('#edit-toggle:not([disabled])').waitFor({ state: 'attached' });
        assert.match(await page.locator('#connection-status').textContent(), /Changes save/);
        assert.equal(await page.locator('#settings-panel #connect').count(), 1);
        assert.equal(await page.locator('#collection-total').innerText(), '3 links');
        const before = await readFile();
        await page.reload(); await page.locator('#edit-toggle:not([disabled])').waitFor({ state: 'attached' });
        assert.equal(await page.locator('#settings-panel #connect').count(), 1);
        assert.equal(await readFile(), before);
        const metadata = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
        assert.deepEqual(Object.keys(metadata), ['hometab.lastSeenHash']);
        assert.match(metadata['hometab.lastSeenHash'], /^[a-f0-9]{64}$/);
    });
    await t.test('revoked permission does not silently substitute the bundled starting collection', async () => {
        const denied = await browser.newPage();
        await denied.addInitScript(() => { FileSystemDirectoryHandle.prototype.queryPermission = async () => 'prompt'; });
        await denied.goto(base + 'index.html');
        await denied.locator('#collection-status').filter({ hasText: 'needs permission again' }).waitFor();
        assert.equal(await denied.locator('#settings-panel').isHidden(), true);
        assert.equal(await denied.locator('[role="tab"]').count(), 0);
        assert.equal(await denied.locator('#edit-toggle').isDisabled(), true);
        await denied.close();
    });
    await t.test('filter rerenders cannot re-enable editing while a file reload is pending', async () => {
        await page.evaluate(() => {
            window.originalRead = HomeTabFiles.FileStore.prototype.read;
            HomeTabFiles.FileStore.prototype.read = async function () { await new Promise(resolve => setTimeout(resolve, 500)); return window.originalRead.call(this); };
        });
        await settingClick('#reload-file');
        await page.locator('#link-filter').fill('Nested');
        assert.equal(await page.locator('#edit-toggle').isDisabled(), true);
        await page.locator('#reload-file:not([disabled])').waitFor({ state: 'attached' });
        await page.evaluate(() => { HomeTabFiles.FileStore.prototype.read = window.originalRead; });
        await page.locator('#link-filter').fill('');
        assert.equal(await page.locator('#edit-toggle').isDisabled(), false);
    });
    await t.test('add, edit, move, and reorder persist in HTML and preserve the previous exact file', async () => {
        const before = await readFile();
        await add('link', 'A test link', 'https://example.com/test?q=a%26b#part', 'accounts');
        const backup = await page.evaluate(async () => (await (await (await navigator.storage.getDirectory()).getFileHandle('bookmarks.previous.html')).getFile()).text());
        assert.equal(backup, before);
        await page.locator('#link-filter').fill('A test link');
        await editItem('A test link');
        await page.locator('#item-title').fill('<img src=x> Literal title'); await page.locator('#item-parent').selectOption('reading'); await saveEditor();
        await page.locator('#link-filter').fill('Literal title'); assert.equal(await page.locator('.bookmark-row img').count(), 0);
        let item = allNodes(await readData()).find(entry => entry.node.title === '<img src=x> Literal title');
        assert.equal(item.parent.id, 'reading'); assert.equal(item.node.url, 'https://example.com/test?q=a%26b#part');
        await editItem('<img src=x> Literal title');
        await page.locator('#item-title').fill('Reordered link'); await page.locator('#item-earlier').click(); await page.locator('#item-dialog').waitFor({ state: 'hidden' });
        assert.equal((await readData()).tabs[3].items[1].items[0].title, 'Reordered link');
    });
    await t.test('sections, separators, new tabs, confirmation, and undo retain the tree', async () => {
        await page.locator('#link-filter').fill(''); await chooseTab('Accounts');
        await add('folder', 'Test section', null, 'accounts'); await add('separator', 'Daily tools', null, 'accounts'); await add('tab', 'Test tab');
        assert.equal(await page.getByRole('tab', { name: /^Test tab/ }).count(), 1);
        await chooseTab('Accounts');
        await editItem('Test section'); await page.locator('#item-parent').selectOption('my-links'); await saveEditor();
        await chooseTab('Test section'); await editItem('Test section');
        const before = await readFile(); await page.locator('#item-delete').click();
        assert.match(await page.locator('#confirm-message').innerText(), /0 links/); assert.equal(await readFile(), before);
        await page.locator('#confirm-action').click(); await page.locator('#item-dialog').waitFor({ state: 'hidden' });
        assert.equal(await page.getByRole('tab', { name: /^Test section/ }).count(), 0);
        await settingClick('#undo-links'); await page.getByRole('tab', { name: /^Test section/ }).waitFor();
        assert.equal(await readFile(), before);
    });
    await t.test('search engines, quick access, websites, and appearance all save to the same HTML', async () => {
        // Homepage items are edited in place, even with My links collapsed.
        await page.locator('.collection > summary').click();
        assert.equal(await page.getByRole('button', { name: 'Actions for Google', exact: true }).isVisible(), true);
        await page.locator('.collection > summary').click();
        await editItem('Google');
        await page.locator('#item-title').fill('Custom search'); await page.locator('#item-template').fill('https://example.com/find/{query}'); await saveEditor();
        assert.equal(await page.locator('.search-card').getAttribute('aria-label'), 'Custom search');

        await editItem('Quick example'); await page.locator('#item-description').fill('Portable description'); await saveEditor();
        assert.match(await page.locator('#quick-access').innerText(), /Portable description/);

        await editItem('My site'); await page.locator('#item-title').fill('Renamed website'); await saveEditor();
        assert.match(await page.locator('#my-websites').innerText(), /Renamed website/);
        await chooseTheme('Neon');
        await page.waitForFunction(() => document.querySelector('#collection-status').textContent.includes('Appearance saved'));
        await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
        assert.equal(await page.locator('#settings-panel').isHidden(), true);
        assert(await page.locator('#collection-status').evaluate(el => el.getBoundingClientRect().bottom <= document.getElementById('main').getBoundingClientRect().top));
        await page.screenshot({ path: path.join(output, 'header-editing-feedback.png'), fullPage: true });
        await page.setViewportSize({ width: 320, height: 812 });
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.screenshot({ path: path.join(output, 'header-editing-mobile.png'), fullPage: true });
        await page.setViewportSize({ width: 1440, height: 1000 });
        assert.equal((await readData()).theme, 'neon');
        await page.reload(); await page.locator('#edit-toggle:not([disabled])').waitFor({ state: 'attached' }); assert.equal(await page.locator('html').getAttribute('data-theme'), 'neon');
    });
    await t.test('favicon capture saves deduplicated data-folder files and preserves edits on failures', async () => {
        await enableEditing();
        await page.locator('#link-filter').fill('Mail');
        await editItem('Mail');
        const before = await readFile();
        // Supply only the permission prompt and icon response boundaries; canvas, image decoding,
        // the HTML database, writes, reloads, and standalone rendering run in the real browser.
        await page.evaluate(png => {
            window.originalPermissionRequest = chrome.permissions.request;
            window.OriginalImage = Image;
            window.allowFavicon = false; window.failFavicon = false; window.faviconRequests = [];
            chrome.permissions.request = async options => { window.faviconRequests.push(options); return window.allowFavicon; };
            window.Image = class extends window.OriginalImage {
                set src(value) { super.src = value.includes('/_favicon/') ? (window.failFavicon ? 'data:image/png;base64,broken' : png) : value; }
                get src() { return super.src; }
            };
        }, iconPNG);
        await page.locator('#get-favicon').click();
        await page.locator('#item-icon-status').filter({ hasText: 'not granted' }).waitFor();
        assert.equal(await page.locator('#item-icon').inputValue(), ''); assert.equal(await readFile(), before);
        await page.evaluate(() => { window.allowFavicon = true; });
        await page.locator('#get-favicon').click(); await page.locator('#item-icon-status').filter({ hasText: 'Icon ready' }).waitFor();
        const embedded = await page.locator('#item-icon').inputValue(); assert.match(embedded, /^data:image\/png;base64,/);
        assert.equal(await page.locator('#item-icon-preview').evaluate(img => img.naturalWidth), 32);
        assert.equal(await readFile(), before, 'Getting an icon must not save the form.');
        assert.deepEqual(await page.evaluate(() => window.faviconRequests), [{ permissions: ['favicon'] }, { permissions: ['favicon'] }]);
        await page.setViewportSize({ width: 375, height: 812 });
        assert(await page.locator('#item-dialog').evaluate(dialog => dialog.scrollWidth <= dialog.clientWidth));
        await page.screenshot({ path: path.join(output, 'favicon-editor-mobile.png'), fullPage: true });
        await page.setViewportSize({ width: 1440, height: 1000 }); await saveEditor();
        const reference = allNodes(await readData()).find(entry => entry.node.id === 'mail').node.icon;
        assert.match(reference, /^favicons\/[a-f0-9]{64}\.png$/);
        const bytes = await page.evaluate(async reference => [...new Uint8Array(await (await (await (await navigator.storage.getDirectory()).getDirectoryHandle('favicons')).getFileHandle(reference.slice(9))).getFile().then(file => file.arrayBuffer()))], reference);
        assert.deepEqual(Buffer.from(bytes), Buffer.from(embedded.split(',')[1], 'base64'));
        const portableHTML = await readFile();
        assert(!portableHTML.includes('data:image/'));
        const standalone = await browser.newPage(); await standalone.goto(fileURL);
        await standalone.locator('#html-file').setInputFiles({ name: 'bookmarks.html', mimeType: 'text/html', buffer: Buffer.from(portableHTML) });
        await standalone.locator('#collection-total').filter({ hasText: '4 links' }).waitFor();
        assert.equal(await standalone.locator('.bookmark-link.has-icon img').count(), 0, 'Opening HTML alone cannot grant access to sibling images.');
        assert.equal(await standalone.locator('#edit-toggle').isDisabled(), true); await standalone.close();
        const hosted = await browser.newPage();
        await hosted.route('https://hometab.test/**', route => {
            const name = new URL(route.request().url()).pathname.slice(1);
            if (name === 'bookmarks.html') return route.fulfill({ contentType: 'text/html', body: portableHTML });
            if (name === reference) return route.fulfill({ contentType: 'image/png', body: Buffer.from(bytes) });
            if (!/^(index\.html|[a-z-]+\.(js|css)|icons\/32\.png|vendor\/fflate-0\.8\.3\.js)$/.test(name)) return route.abort();
            return route.fulfill({ path: path.join(website, name) });
        });
        await hosted.goto('https://hometab.test/index.html');
        await hosted.locator('.bookmark-link.has-icon img').waitFor();
        assert.equal(await hosted.locator('.bookmark-link.has-icon img').evaluate(img => img.decode().then(() => img.naturalWidth)), 32);
        assert.equal(await hosted.locator('#edit-toggle').isDisabled(), true);
        await installPicker(hosted, portableHTML);
        await hosted.evaluate(async ({ reference, bytes }) => {
            const folder = await (await navigator.storage.getDirectory()).getDirectoryHandle('favicons', { create: true });
            const stream = await (await folder.getFileHandle(reference.slice(9), { create: true })).createWritable();
            await stream.write(new Uint8Array(bytes)); await stream.close();
        }, { reference, bytes });
        await settingClick('#connect-folder', hosted); await hosted.locator('#connection-status').filter({ hasText: 'Connected' }).waitFor({ state: 'attached' });
        await hosted.locator('.bookmark-link.has-icon img').waitFor(); assert.equal(await hosted.locator('#edit-toggle').isDisabled(), true);
        await hosted.evaluate(async reference => { const folder = await (await navigator.storage.getDirectory()).getDirectoryHandle('favicons'); await folder.removeEntry(reference.slice(9)); }, reference);
        await settingClick('#reload-file', hosted); await hosted.locator('#reload-file:not([disabled])').waitFor({ state: 'attached' });
        assert.equal(await hosted.locator('.bookmark-link.has-icon img').count(), 0);
        assert.equal(await hosted.getByRole('link', { name: /^Mail/ }).count(), 1);
        await hosted.evaluate(async reference => {
            const folder = await (await navigator.storage.getDirectory()).getDirectoryHandle('favicons');
            const stream = await (await folder.getFileHandle(reference.slice(9), { create: true })).createWritable();
            await stream.write('Corrupt icon'); await stream.close();
        }, reference);
        await settingClick('#reload-file', hosted); await hosted.locator('#reload-file:not([disabled])').waitFor({ state: 'attached' });
        assert.equal(await hosted.locator('.bookmark-link.has-icon img').count(), 0); await hosted.close();
        await reloadFile(); await enableEditing();
        await editItem('Mail');
        await page.evaluate(() => { window.failFavicon = true; });
        await page.locator('#get-favicon').click(); await page.locator('#item-icon-status').filter({ hasText: 'Could not get' }).waitFor();
        assert.equal(await page.locator('#item-icon').inputValue(), reference);
        assert.equal(await readFile(), portableHTML);
        await page.evaluate(() => {
            window.originalGetFavicon = HomeTabFavicons.get;
            HomeTabFavicons.get = () => new Promise(resolve => { window.finishFavicon = resolve; });
        });
        await page.locator('#get-favicon').click();
        assert.equal(await page.locator('#item-form [type="submit"]').isDisabled(), true);
        await page.locator('#item-url').fill('https://changed.example/');
        await page.evaluate(png => window.finishFavicon(png), iconPNG);
        await page.locator('#item-icon-status').filter({ hasText: 'address changed' }).waitFor();
        assert.equal(await page.locator('#item-icon').inputValue(), reference);
        await page.locator('#get-favicon').click(); await page.locator('[data-close="item-dialog"]').click();
        await editItem('Mail');
        await page.locator('#clear-icon').click(); await page.evaluate(png => window.finishFavicon(png), iconPNG);
        assert.equal(await page.locator('#item-icon').inputValue(), '', 'A late response must not populate a reopened editor.');
        await saveEditor(); assert.equal(allNodes(await readData()).find(entry => entry.node.id === 'mail').node.icon, undefined);
        await settingClick('#undo-links'); await page.locator('#collection-status').filter({ hasText: 'undone' }).waitFor();
        assert.equal(allNodes(await readData()).find(entry => entry.node.id === 'mail').node.icon, reference);
        await page.evaluate(() => { chrome.permissions.request = window.originalPermissionRequest; window.Image = window.OriginalImage; HomeTabFavicons.get = window.originalGetFavicon; });
        await page.locator('#link-filter').fill('');
    });
    await t.test('folder favicons recurse, share files, stage until Save, preserve failed icons, and reject stale edits', async () => {
        await enableEditing(); await chooseTab('Accounts');
        await page.evaluate(png => {
            window.originalPermissionRequest = chrome.permissions.request; window.OriginalImage = Image;
            window.batchPNG = png; window.failNested = false; window.batchPermissionCalls = 0;
            chrome.permissions.request = async () => { window.batchPermissionCalls++; return true; };
            window.Image = class extends window.OriginalImage {
                set src(value) {
                    if (value.includes('/_favicon/')) {
                        const nested = new URL(value).searchParams.get('pageUrl').includes('localhost');
                        super.src = window.failNested && nested ? 'data:image/png;base64,broken' : window.batchPNG;
                    } else super.src = value;
                }
                get src() { return super.src; }
            };
        }, iconPNG);
        const before = await readFile();
        const getFolder = async () => {
            await editItem('Accounts');
            await page.locator('#get-folder-favicons').click();
            await page.locator('#folder-favicon-status').filter({ hasText: 'bookmark icons ready' }).waitFor();
        };
        await getFolder(); assert.match(await page.locator('#folder-favicon-status').innerText(), /2 bookmark icons ready/);
        await page.setViewportSize({ width: 375, height: 812 });
        assert(await page.locator('#item-dialog').evaluate(dialog => dialog.scrollWidth <= dialog.clientWidth));
        await page.screenshot({ path: path.join(output, 'folder-favicons-mobile.png'), fullPage: true });
        await page.setViewportSize({ width: 1440, height: 1000 });
        assert.equal(await readFile(), before);
        await page.locator('[data-close="item-dialog"]').click(); assert.equal(await readFile(), before);
        await getFolder(); await saveEditor();
        let data = await readData(); const nested = allNodes(data).find(item => item.node.id === 'nested-link').node.icon;
        assert.match(nested, /^favicons\/[a-f0-9]{64}\.png$/);
        assert.equal(allNodes(data).find(item => item.node.id === 'mail').node.icon, nested);
        assert.equal(await page.evaluate(async () => { let count = 0; for await (const file of (await (await navigator.storage.getDirectory()).getDirectoryHandle('favicons')).values()) count++; return count; }), 1);
        assert.equal(await page.evaluate(() => window.batchPermissionCalls), 2, 'One permission request per batch, not per link.');
        await page.evaluate(() => {
            const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
            canvas.getContext('2d').fillRect(0, 0, 32, 32); window.batchPNG = canvas.toDataURL(); window.failNested = true;
        });
        await getFolder(); assert.match(await page.locator('#folder-favicon-status').innerText(), /1 failed/); await saveEditor();
        data = await readData(); assert.equal(allNodes(data).find(item => item.node.id === 'nested-link').node.icon, nested);
        assert.notEqual(allNodes(data).find(item => item.node.id === 'mail').node.icon, nested);
        await page.evaluate(() => { window.failNested = false; }); await getFolder();
        await page.evaluate(async () => { const store = new HomeTabFiles.FileStore(); await store.restore(); const current = await store.read(); current.data.tabs[1].items[0].description = 'Concurrent edit'; await store.write(current.data, current.revision); });
        const external = await readFile(); await page.locator('#item-form [type="submit"]').click();
        await page.locator('#item-error').filter({ hasText: 'changed since' }).waitFor(); assert.equal(await readFile(), external);
        await page.locator('[data-close="item-dialog"]').click();
        await page.evaluate(() => { chrome.permissions.request = window.originalPermissionRequest; window.Image = window.OriginalImage; });
        await reloadFile();
    });
    await t.test('batch favicon requests deduplicate addresses, bound concurrency, and stop on cancellation', async () => {
        const result = await page.evaluate(async png => {
            const originalRequest = chrome.permissions.request, OriginalImage = Image;
            let requested = 0, images = 0; const controller = new AbortController();
            chrome.permissions.request = async () => { requested++; return true; };
            window.Image = class extends OriginalImage {
                set src(value) { if (value.includes('/_favicon/')) images++; else super.src = value; }
                get src() { return super.src; }
            };
            try {
                const urls = Array.from({ length: 10 }, (_, i) => 'https://example.com/' + i);
                const promise = HomeTabFavicons.getMany([...urls, ...urls], null, controller.signal).catch(error => error.name);
                await new Promise(resolve => setTimeout(resolve, 20)); controller.abort();
                const cancelled = { requested, images, result: await promise };
                requested = images = 0;
                window.Image = class extends OriginalImage {
                    set src(value) { if (value.includes('/_favicon/')) { images++; super.src = png; } else super.src = value; }
                    get src() { return super.src; }
                };
                const collected = await HomeTabFavicons.getMany([urls[0], urls[0], urls[1]]);
                return { cancelled, completed: { requested, images, count: collected.icons.size } };
            } finally { chrome.permissions.request = originalRequest; window.Image = OriginalImage; }
        }, iconPNG);
        assert.deepEqual(result, { cancelled: { requested: 1, images: 4, result: 'AbortError' }, completed: { requested: 1, images: 2, count: 2 } });
    });
    await t.test('an icon write failure preserves HTML and its backup, and a retry repairs an incomplete icon', async () => {
        const result = await page.evaluate(async () => {
            const store = new HomeTabFiles.FileStore(); await store.restore(); const before = await store.read();
            const previous = await (await store.directory.getFileHandle('bookmarks.previous.html')).getFile().then(file => file.text());
            const next = HomeTabModel.clone(before.data);
            const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
            const drawing = canvas.getContext('2d'); drawing.fillStyle = '#ff00ff'; drawing.fillRect(0, 0, 32, 32);
            next.tabs[1].items[0].icon = canvas.toDataURL();
            const original = FileSystemFileHandle.prototype.createWritable;
            FileSystemFileHandle.prototype.createWritable = function (...args) {
                if (this.name.endsWith('.png')) throw new DOMException('Icon access denied', 'NotAllowedError');
                return original.apply(this, args);
            };
            let message = '';
            try { await store.write(next, before.revision); } catch (error) { message = error.message; }
            finally { FileSystemFileHandle.prototype.createWritable = original; }
            const unchanged = (await store.read()).revision === before.revision;
            const backupUnchanged = previous === await (await store.directory.getFileHandle('bookmarks.previous.html')).getFile().then(file => file.text());
            const saved = await store.write(next, before.revision);
            const reference = saved.data.tabs[1].items[0].icon;
            const loaded = await store.iconURL(reference);
            await store.write(before.data, saved.revision); store.clearIcons();
            return { message, unchanged, backupUnchanged, repaired: Boolean(loaded), reference };
        });
        assert.match(result.message, /Icon access denied/); assert(result.unchanged); assert(result.backupUnchanged); assert(result.repaired);
        assert.match(result.reference, /^favicons\/[a-f0-9]{64}\.png$/);
        await reloadFile();
    });
    await t.test('a second page cannot make a stale editor valid by refreshing the shared hash', async () => {
        await enableEditing();
        await editItem('Quick example'); await page.locator('#item-title').fill('Stale overwrite');
        const second = await browser.newPage(); await second.goto(base + 'index.html'); await second.locator('#edit-toggle:not([disabled])').waitFor({ state: 'attached' });
        await second.evaluate(async () => { const store = new HomeTabFiles.FileStore(); await store.restore(); const loaded = await store.read(); loaded.data.tabs[1].items[0].title = 'Newer edit'; await store.write(loaded.data, loaded.revision); });
        await second.reload(); await second.locator('#edit-toggle:not([disabled])').waitFor({ state: 'attached' });
        const newer = await readFile();
        await page.locator('#item-form [type="submit"]').click();
        await page.locator('#item-error').filter({ hasText: 'changed since this page loaded' }).waitFor();
        assert.equal(await page.locator('#item-title').inputValue(), 'Stale overwrite'); assert.equal(await readFile(), newer);
        await page.locator('[data-close="item-dialog"]').click(); await second.close();
        await reloadFile(); await page.locator('#edit-toggle:not([disabled])').waitFor({ state: 'attached' });
    });
    await t.test('external file replacement and failed writes cannot overwrite the current file', async () => {
        await enableEditing();
        await editItem('Newer edit'); await page.locator('#item-title').fill('Another stale edit');
        await page.evaluate(async () => {
            const d = await navigator.storage.getDirectory(), f = await d.getFileHandle('bookmarks.html');
            const original = await (await f.getFile()).text(), w = await f.createWritable(); await w.write(original.replace('Newer edit', 'Synced replacement')); await w.close();
        });
        const external = await readFile(); await page.locator('#item-form [type="submit"]').click();
        await page.locator('#item-error').filter({ hasText: 'changed since' }).waitFor(); assert.equal(await readFile(), external);
        await page.locator('[data-close="item-dialog"]').click(); await reloadFile(); await enableEditing();
        await editItem('Synced replacement');
        await page.locator('#item-title').fill('Write will fail');
        await page.evaluate(() => {
            window.originalCreateWritable = FileSystemFileHandle.prototype.createWritable;
            FileSystemFileHandle.prototype.createWritable = function (...args) {
                if (this.name === 'bookmarks.html') throw new DOMException('Permission revoked', 'NotAllowedError');
                return window.originalCreateWritable.apply(this, args);
            };
        });
        await page.locator('#item-form [type="submit"]').click(); await page.locator('#item-error').filter({ hasText: 'Permission revoked' }).waitFor();
        assert.equal(await readFile(), external); assert.equal(await page.locator('#item-title').inputValue(), 'Write will fail');
        await page.evaluate(() => { FileSystemFileHandle.prototype.createWritable = window.originalCreateWritable; });
        await page.evaluate(() => {
            FileSystemFileHandle.prototype.createWritable = function (...args) {
                if (this.name === 'bookmarks.previous.html') throw new DOMException('Backup is read-only', 'NotAllowedError');
                return window.originalCreateWritable.apply(this, args);
            };
        });
        await page.locator('#item-form [type="submit"]').click(); await page.locator('#item-error').filter({ hasText: 'Backup is read-only' }).waitFor();
        assert.equal(await readFile(), external);
        await page.evaluate(() => { FileSystemFileHandle.prototype.createWritable = window.originalCreateWritable; });
        await page.locator('[data-close="item-dialog"]').click();
    });
    await t.test('capture saves to the chosen folder, prevents duplicates, and rejects a stale popup', async () => {
        const capture = await browser.newPage(); await capture.goto(base + 'capture.html?' + new URLSearchParams({ url: 'https://example.net/captured?q=a%26b#part', title: 'Captured page' }));
        await capture.locator('#capture-save:not([disabled])').waitFor(); assert.equal(await capture.locator('#capture-location').inputValue(), 'inbox');
        await capture.locator('#capture-form [type="submit"]').click(); await capture.locator('#capture-status').filter({ hasText: 'Saved to bookmarks.html' }).waitFor();
        assert(allNodes(await readData()).some(entry => entry.node.title === 'Captured page' && entry.parent.id === 'inbox'));
        const before = await readFile(); await capture.locator('#capture-form [type="submit"]').click();
        await capture.locator('#capture-status').filter({ hasText: 'already saved' }).waitFor(); assert.equal(await readFile(), before);
        await capture.locator('#capture-title').fill('Conflicting capture'); await capture.locator('#capture-url').fill('https://example.net/other');
        await reloadFile(); await enableEditing();
        await editItem('Synced replacement'); await page.locator('#item-title').fill('Capture conflict trigger'); await saveEditor();
        const updated = await readFile(); await capture.locator('#capture-form [type="submit"]').click();
        await capture.locator('#capture-status').filter({ hasText: 'changed since' }).waitFor(); assert.equal(await readFile(), updated); await capture.close();
    });
    await t.test('exclusive filesystem streams block simultaneous writers', async () => {
        const result = await page.evaluate(async () => {
            const store = new HomeTabFiles.FileStore(); await store.restore(); const before = await store.read();
            const handle = await store.directory.getFileHandle('bookmarks.html'), first = await handle.createWritable({ mode: 'exclusive' });
            let error = '';
            try { const second = await handle.createWritable({ mode: 'exclusive' }); await second.abort(); } catch (e) { error = e.name; }
            await first.abort(); return { error, unchanged: (await store.read()).revision === before.revision };
        });
        assert.equal(result.error, 'NoModificationAllowedError'); assert.equal(result.unchanged, true);
    });
    await t.test('the registered toolbar action opens its capture form', async () => {
        const web = await browser.newPage();
        await web.route('https://example.test/**', route => route.fulfill({ contentType: 'text/html', body: '<title>Toolbar capture title</title><p>Example page</p>' }));
        await web.goto('https://example.test/capture'); await web.bringToFront();
        const worker = browser.serviceWorkers()[0] || await browser.waitForEvent('serviceworker');
        await worker.evaluate(() => chrome.action.openPopup());
        // Browser toolbar popups are CDP targets, but are not ordinary tabs exposed by Playwright.
        const session = await browser.browser().newBrowserCDPSession();
        const target = (await session.send('Target.getTargets')).targetInfos.find(target => target.url === base + 'capture.html');
        assert(target, 'Toolbar popup target was not opened.');
        await session.send('Target.closeTarget', { targetId: target.targetId }); await session.detach(); await web.close();
        // Programmatic openPopup does not grant activeTab. Supply that browser-permission boundary here;
        // the real toolbar click and native directory permission prompt remain manual acceptance checks.
        const capture = await browser.newPage();
        await capture.addInitScript(() => { chrome.tabs.query = async () => [{ title: 'Toolbar capture title', url: 'https://example.test/capture' }]; });
        await capture.goto(base + 'capture.html'); await capture.locator('#capture-save:not([disabled])').waitFor();
        assert.equal(await capture.locator('#capture-title').inputValue(), 'Toolbar capture title');
        assert.equal(await capture.locator('#capture-url').inputValue(), 'https://example.test/capture');
        await capture.close();
    });
    await t.test('keyboard tabs, filtering, nested groups, and narrow layouts remain usable', async () => {
        await reloadFile();
        await page.getByRole('tab', { name: /^Accounts/ }).focus(); await page.keyboard.press('ArrowRight');
        assert.match(await page.locator('[role="tab"][aria-selected="true"]').innerText(), /^Reading/);
        await page.keyboard.press('End'); await page.keyboard.press('Home');
        await page.locator('#link-filter').fill('Nested example'); assert.equal(await page.locator('.bookmark-row').count(), 1); await page.locator('#link-filter').fill('');
        for (const theme of ['light', 'dark', 'neon']) {
            await page.evaluate(theme => HomeTabAppearance.apply(theme), theme);
            for (const width of [320, 375, 768, 1024, 1440]) {
                await page.setViewportSize({ width, height: 1000 });
                await page.locator('.bookmark-group').evaluateAll(nodes => nodes.forEach(node => { node.open = true; }));
                assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), theme + ' overflow at ' + width);
            }
            await page.screenshot({ path: path.join(output, theme + '-desktop.png'), fullPage: true });
        }
        await page.setViewportSize({ width: 375, height: 812 }); await page.screenshot({ path: path.join(output, 'neon-mobile.png'), fullPage: true });
    });
    await t.test('custom search templates encode queries and standalone HTML remains script-free', async () => {
        await reloadFile();
        await page.route('https://example.com/find/**', route => route.fulfill({ contentType: 'text/html', body: '<title>Search captured</title>' }));
        await page.locator('#search-engines input[type="search"]').fill('C# & café');
        await Promise.all([page.waitForURL('https://example.com/find/**'), page.locator('#search-engines input[type="search"]').press('Enter')]);
        assert.equal(new URL(page.url()).pathname, '/find/C%23%20%26%20caf%C3%A9');
        const plain = await browser.newPage(); await plain.goto(pathToFileURL(path.join(website, 'bookmarks.html')).href);
        assert.equal(await plain.locator('script').count(), 0); assert.equal(await plain.locator('section').count(), 4);
        assert.equal(await plain.locator('a[href^="javascript:"]').count(), 0); await plain.close();
        assert.deepEqual(errors, []);
    });
    await t.test('capture searches folders, remembers its destination, and saves when an optional icon fails', async () => {
        await page.goto(base + 'index.html'); await page.locator('#edit-toggle:not([disabled])').waitFor({ state: 'attached' });
        const capture = await browser.newPage();
        await capture.goto(base + 'capture.html?' + new URLSearchParams({ url: 'https://example.net/remembered', title: 'Remembered capture' }));
        await capture.locator('#capture-save:not([disabled])').waitFor();
        await capture.locator('#capture-folder-filter').fill('no such folder'); assert.equal(await capture.locator('#capture-save').isDisabled(), true);
        await capture.locator('#capture-folder-filter').fill('Reading'); assert.equal(await capture.locator('#capture-location option').count(), 1);
        await capture.locator('#capture-location').selectOption('reading'); await capture.locator('#capture-favicon').check();
        await capture.setViewportSize({ width: 375, height: 812 });
        await capture.screenshot({ path: path.join(output, 'capture-folders-mobile.png'), fullPage: true });
        await capture.evaluate(png => { HomeTabFavicons.get = async () => png; }, iconPNG);
        await capture.locator('#capture-save').click(); await capture.locator('#capture-status').filter({ hasText: 'Saved to bookmarks.html.' }).waitFor();
        const first = allNodes(await readData()).find(item => item.node.title === 'Remembered capture');
        assert.equal(first.parent.id, 'reading'); assert.match(first.node.icon, /^favicons\/[a-f0-9]{64}\.png$/); await capture.close();
        const again = await browser.newPage();
        await again.goto(base + 'capture.html?' + new URLSearchParams({ url: 'https://example.net/no-icon', title: 'Capture without icon' }));
        await again.locator('#capture-save:not([disabled])').waitFor();
        assert.equal(await again.locator('#capture-location').inputValue(), 'reading'); assert.equal(await again.locator('#capture-favicon').isChecked(), true);
        await again.evaluate(() => { HomeTabFavicons.get = async () => { throw new Error('Unavailable test icon'); }; });
        await again.locator('#capture-save').click(); await again.locator('#capture-status').filter({ hasText: 'Favicon unavailable' }).waitFor();
        assert(allNodes(await readData()).some(item => item.node.title === 'Capture without icon' && !item.node.icon));
        await again.close();
        const stale = await browser.newPage(); await stale.goto(base + 'capture.html?' + new URLSearchParams({ url: 'https://example.net/stale-capture', title: 'Stale capture' }));
        await stale.locator('#capture-save:not([disabled])').waitFor(); await stale.locator('#capture-favicon').uncheck(); await stale.locator('#capture-location').selectOption('inbox');
        await stale.evaluate(async () => { const store = new HomeTabFiles.FileStore(); await store.restore(); const loaded = await store.read(); loaded.data.tabs[1].items[0].description = 'After capture opened'; await store.write(loaded.data, loaded.revision); });
        await stale.locator('#capture-save').click(); await stale.locator('#capture-status').filter({ hasText: 'changed since' }).waitFor();
        assert.equal((await stale.evaluate(() => HomeTabFiles.capturePreferences())).folderId, 'reading');
        assert(!allNodes(await readData()).some(item => item.node.title === 'Stale capture')); await stale.close();
    });
    await t.test('drag-and-drop moves links between tabs, reorders items and tabs, and rejects cycles and stale drops', async () => {
        await page.goto(base + 'index.html'); await page.locator('#edit-toggle:not([disabled])').waitFor({ state: 'attached' });
        await page.setViewportSize({ width: 1440, height: 1000 }); await enableEditing(); await chooseTab('Accounts');
        const original = await readData();
        await page.evaluate(() => { document.getElementById('collection-status').textContent = ''; });
        await page.locator('[data-item-id="mail"] .drag-handle').dragTo(page.getByRole('tab', { name: /^Reading/ }));
        await page.locator('#collection-status').filter({ hasText: 'Item moved' }).waitFor();
        assert.equal(allNodes(await readData()).find(item => item.node.id === 'mail').parent.id, 'reading');
        await chooseTab('Reading');
        await page.evaluate(() => { document.getElementById('collection-status').textContent = ''; });
        await page.locator('[data-item-id="mail"] .drag-handle').dragTo(page.locator('[data-item-id="article"]'));
        await page.locator('#collection-status').filter({ hasText: 'Item moved' }).waitFor();
        const order = (await readData()).tabs[3].items.find(item => item.id === 'reading').items.map(item => item.id);
        assert.equal(order.indexOf('mail') + 1, order.indexOf('article'));
        await chooseTab('Accounts'); const beforeCycle = await readFile();
        await page.evaluate(() => { document.getElementById('collection-status').textContent = ''; });
        await page.locator('.tab-item[data-node-id="accounts"] .drag-handle').dragTo(page.locator('.bookmark-group > summary').filter({ hasText: 'Nested' }));
        await page.locator('#collection-status').filter({ hasText: 'inside itself' }).waitFor(); assert.equal(await readFile(), beforeCycle);
        await page.evaluate(() => { document.getElementById('collection-status').textContent = ''; });
        await page.locator('.tab-item[data-node-id="reading"] .drag-handle').dragTo(page.getByRole('tab', { name: /^Accounts/ }));
        await page.locator('#collection-status').filter({ hasText: 'Item moved' }).waitFor();
        assert.equal((await readData()).tabs[3].items[0].id, 'reading');
        await chooseTab('Reading'); const transfer = await page.evaluateHandle(() => new DataTransfer());
        await page.locator('[data-item-id="mail"] .drag-handle').dispatchEvent('dragstart', { dataTransfer: transfer });
        await page.evaluate(async () => { const store = new HomeTabFiles.FileStore(); await store.restore(); const loaded = await store.read(); loaded.data.theme = loaded.data.theme === 'dark' ? 'light' : 'dark'; await store.write(loaded.data, loaded.revision); });
        const external = await readFile(); await page.getByRole('tab', { name: /^Accounts/ }).dispatchEvent('drop', { dataTransfer: transfer });
        await page.locator('#collection-status').filter({ hasText: 'changed since' }).waitFor(); assert.equal(await readFile(), external); await transfer.dispose();
        await page.evaluate(async original => { const store = new HomeTabFiles.FileStore(); await store.restore(); await store.write(original, (await store.read()).revision); }, original);
        await reloadFile();
    });
    await t.test('persistent edit mode, local creation, and keyboard/right-click menus work without a global collection selector', async () => {
        await reloadFile(); await chooseTab('Accounts'); await enableEditing();
        const before = await readFile();
        await settingClick('#edit-toggle');
        assert.equal(await page.locator('.node-gear').count(), 0);
        assert.equal(await readFile(), before);
        await page.locator('[data-item-id="mail"] a').click({ button: 'right' });
        assert.equal(await page.getByRole('menuitem', { name: 'Edit', exact: true }).isVisible(), true);
        await page.keyboard.press('End'); assert.match(await page.locator(':focus').innerText(), /Delete/);
        await page.keyboard.press('Escape'); assert.equal(await page.locator('#item-menu').isHidden(), true);
        // Shift-right-click and search text fields keep their native browser menus.
        assert.equal(await page.locator('[data-item-id="mail"] a').evaluate(el => !el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, shiftKey: true }))), false);
        assert.equal(await page.locator('#search-engines input[type="search"]').evaluate(el => !el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))), false);
        await page.locator('[data-item-id="mail"] a').focus(); await page.keyboard.press('Shift+F10');
        await page.getByRole('menuitem', { name: 'Select', exact: true }).click();
        assert.equal(await page.locator('#selection-count').innerText(), '1 selected');
        assert.equal(await page.locator('[data-item-id="mail"] .node-select').isChecked(), true);
        assert.equal(await page.locator('.node-gear').count(), 0);
        await page.locator('#selection-clear').click();
        await enableEditing();
        await page.reload(); await page.locator('#edit-toggle:not([disabled])').waitFor({ state: 'attached' });
        assert.equal(await page.locator('#edit-toggle').getAttribute('aria-pressed'), 'true');
        assert.equal(await page.evaluate(() => localStorage.getItem('hometab.editMode')), 'true');
        assert.equal(await readFile(), before);
        const peer = await browser.newPage(); await peer.goto(base + 'index.html');
        await peer.locator('#edit-toggle[aria-pressed="true"]').waitFor({ state: 'attached' });
        await settingClick('#edit-toggle'); await peer.locator('#edit-toggle[aria-pressed="false"]').waitFor({ state: 'attached' });
        await enableEditing(); await peer.locator('#edit-toggle[aria-pressed="true"]').waitFor({ state: 'attached' }); await peer.close();
        await chooseTab('Accounts');
        await page.locator('[data-add="link"][data-parent="accounts"]').click();
        assert.equal(await page.getByRole('menuitem', { name: 'Add section', exact: true }).isVisible(), true);
        assert.equal(await page.getByRole('menuitem', { name: 'Add separator', exact: true }).isVisible(), true);
        await page.getByRole('menuitem', { name: 'Add bookmark', exact: true }).click();
        assert.equal(await page.locator('#item-parent').inputValue(), 'accounts');
        await page.locator('#item-dialog [data-close]').click();
        await page.locator('[data-add="link"][data-parent="search-engines"]').click();
        assert.equal(await page.locator('#item-parent').inputValue(), 'search-engines'); assert.equal(await page.locator('#template-label').isVisible(), true);
        await page.locator('#item-dialog [data-close]').click();
        await page.locator('[data-add="tab"]').click(); assert.equal(await page.locator('#item-parent').inputValue(), 'my-links');
        await page.locator('#item-dialog [data-close]').click();
        await page.getByRole('button', { name: 'Actions for My links', exact: true }).click();
        assert.equal(await page.getByRole('menuitem', { name: /^Delete/ }).count(), 0);
        assert.equal(await page.getByRole('menuitem', { name: /^Move/ }).count(), 0);
        await page.keyboard.press('Escape');
        await page.setViewportSize({ width: 320, height: 812 });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await page.locator('[data-item-id="mail"] a').click({ button: 'right' });
        await page.locator('#item-menu').waitFor({ timeout: 5000 });
        assert(await page.locator('#item-menu').evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; }));
        await page.screenshot({ path: path.join(output, 'item-menu-mobile.png') });
        await page.keyboard.press('Escape'); await page.setViewportSize({ width: 1440, height: 1000 });
    });
    await t.test('multi-selection moves and deletes atomically, supports Undo, and rejects invalid or stale batches', async () => {
        await reloadFile(); await chooseTab('Accounts'); await enableEditing();
        const original = await readData();
        const replace = async data => page.evaluate(async data => { const store = new HomeTabFiles.FileStore(); await store.restore(); await store.write(data, (await store.read()).revision); }, data);
        try {
            await replace(fixture()); await reloadFile(); await chooseTab('Accounts');
            await page.getByRole('checkbox', { name: 'Select Mail', exact: true }).check();
            await page.locator('.bookmark-group > summary').filter({ hasText: 'Nested' }).getByRole('checkbox').check();
            const nested = page.locator('summary[data-node-id="nested"]');
            if (await nested.evaluate(el => !el.parentElement.open)) await nested.click();
            await page.getByRole('checkbox', { name: 'Select Nested example', exact: true }).check();
            assert.equal(await page.locator('#selection-count').innerText(), '3 selected');
            const before = await readFile();
            await page.locator('[data-item-id="mail"] .drag-handle').dragTo(page.getByRole('tab', { name: /^Reading/ }));
            await page.locator('#collection-status').filter({ hasText: 'Items moved' }).waitFor();
            assert.equal((await readData()).tabs[3].items.find(node => node.id === 'reading').items.map(node => node.id).join(','), 'article,mail,nested');
            assert.equal(allNodes(await readData()).filter(item => item.node.id === 'nested-link').length, 1);
            await settingClick('#undo-links'); await page.locator('#collection-status').filter({ hasText: 'undone' }).waitFor(); assert.equal(await readFile(), before);
            await chooseTab('Accounts');
            await page.getByRole('checkbox', { name: 'Select Mail', exact: true }).check();
            await page.locator('.bookmark-group > summary').filter({ hasText: 'Nested' }).getByRole('checkbox').check();
            const invalidBefore = await readFile();
            await page.locator('[data-item-id="mail"] .drag-handle').dragTo(page.locator('#search-heading'));
            await page.locator('#collection-status').filter({ hasText: 'ordinary links' }).waitFor(); assert.equal(await readFile(), invalidBefore);
            await page.locator('#selection-move').click();
            assert.equal(await page.locator('#move-parent option[value="nested"]').count(), 0);
            assert.equal(await page.locator('#move-parent option[value="search-engines"]').count(), 0);
            await page.locator('#move-parent').selectOption('reading'); await page.locator('#move-form [type="submit"]').click();
            await page.locator('#move-dialog').waitFor({ state: 'hidden' });
            await settingClick('#undo-links'); await page.locator('#collection-status').filter({ hasText: 'undone' }).waitFor();
            await chooseTab('Accounts');
            await page.locator('[data-item-id="mail"] a').click({ modifiers: ['Control'] });
            await page.locator('.bookmark-group > summary').filter({ hasText: 'Nested' }).getByRole('checkbox').check();
            await page.locator('#selection-delete').click();
            assert.match(await page.locator('#confirm-message').innerText(), /Mail.*Nested \(1 links/);
            assert.equal(await readFile(), before);
            await page.locator('#confirm-dialog [data-close]').click(); assert.equal(await readFile(), before);
            await page.locator('#selection-delete').click(); await page.locator('#confirm-action').click();
            await page.locator('#confirm-dialog').waitFor({ state: 'hidden' });
            assert(!allNodes(await readData()).some(item => ['mail', 'nested', 'nested-link'].includes(item.node.id)));
            await settingClick('#undo-links'); await page.locator('#collection-status').filter({ hasText: 'undone' }).waitFor(); assert.equal(await readFile(), before);
            await chooseTab('Accounts');
            await page.getByRole('checkbox', { name: 'Select Mail', exact: true }).check();
            await page.locator('[data-node-id="separator"] .node-select').click({ modifiers: ['Shift'] });
            assert.equal(await page.locator('#selection-count').innerText(), '2 selected');
            await page.locator('#link-filter').fill('Mail'); assert.equal(await page.locator('#selection-toolbar').isHidden(), true);
            await page.locator('#link-filter').fill('');
            await page.getByRole('checkbox', { name: 'Select Mail', exact: true }).check();
            await chooseTab('Reading'); assert.equal(await page.locator('#selection-toolbar').isHidden(), true);
            await chooseTab('Accounts');
            await page.getByRole('checkbox', { name: 'Select Mail', exact: true }).check();
            await page.locator('.bookmark-group > summary').filter({ hasText: 'Nested' }).getByRole('checkbox').check();
            await page.locator('#selection-delete').click();
            const external = fixture(); external.theme = 'dark'; await replace(external);
            const externalHTML = await readFile(); await page.locator('#confirm-action').click();
            await page.locator('#confirm-message').filter({ hasText: 'changed since' }).waitFor(); assert.equal(await readFile(), externalHTML);
            await page.locator('#confirm-dialog [data-close]').click(); await reloadFile(); await chooseTab('Accounts');
            await page.getByRole('checkbox', { name: 'Select Mail', exact: true }).check();
            await page.locator('[data-node-id="separator"] .node-select').check();
            await page.locator('#selection-move').click(); await page.locator('#move-parent').selectOption('reading');
            external.theme = 'light'; await replace(external); const newerHTML = await readFile();
            await page.locator('#move-form [type="submit"]').click(); await page.locator('#move-error').filter({ hasText: 'changed since' }).waitFor(); assert.equal(await readFile(), newerHTML);
            await page.locator('#move-dialog [data-close]').click(); await reloadFile(); await chooseTab('Accounts');
            await page.getByRole('checkbox', { name: 'Select Mail', exact: true }).check();
            await page.locator('[data-node-id="separator"] .node-select').check();
            await page.setViewportSize({ width: 320, height: 812 });
            assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            await page.screenshot({ path: path.join(output, 'bulk-selection-mobile.png'), fullPage: true });
        } finally {
            await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach(el => el.close()));
            await replace(original); await reloadFile(); await page.setViewportSize({ width: 1440, height: 1000 });
        }
    });
    await t.test('single, editor, and bulk deletion retain page scroll, clamping only when content becomes shorter', async () => {
        await reloadFile(); await enableEditing(); const original = await readData();
        const replace = async data => page.evaluate(async data => { const store = new HomeTabFiles.FileStore(); await store.restore(); await store.write(data, (await store.read()).revision); }, data);
        const position = () => page.evaluate(() => ({ x: scrollX, y: scrollY }));
        const settledPosition = async () => {
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            return position();
        };
        const openDeleteMenu = async id => {
            const item = page.locator('[data-node-id="' + id + '"]').first();
            await item.scrollIntoViewIfNeeded(); await item.click({ button: 'right' });
            const before = await position(); assert(before.y > 300, 'Deletion must start well down the page.');
            await page.getByRole('menuitem', { name: /^Delete/ }).click(); return before;
        };
        try {
            await page.setViewportSize({ width: 1440, height: 800 });
            const long = fixture(), items = long.tabs[3].items[0].items;
            for (let i = 0; i < 120; i++) items.push({ id: 'scroll-' + i, kind: 'link', title: 'Scroll link ' + i, url: 'https://example.com/' + i });
            items.push({ id: 'scroll-tail', kind: 'folder', title: 'Long final section', items: Array.from({ length: 60 }, (_, i) => ({ id: 'tail-' + i, kind: 'link', title: 'Tail ' + i, url: 'https://example.org/' + i })) });
            await replace(long); await reloadFile(); await chooseTab('Accounts');
            const singleBefore = await openDeleteMenu('scroll-60');
            await page.locator('#confirm-action').click(); await page.locator('#confirm-dialog').waitFor({ state: 'hidden' });
            assert.deepEqual(await settledPosition(), singleBefore);
            assert(!allNodes(await readData()).some(entry => entry.node.id === 'scroll-60'));
            const editorItem = page.locator('[data-node-id="scroll-65"]'); await editorItem.scrollIntoViewIfNeeded();
            const editorBefore = await position(); assert(editorBefore.y > 300);
            await editItem('Scroll link 65'); await page.locator('#item-delete').click(); await page.locator('#confirm-action').click();
            await page.locator('#item-dialog').waitFor({ state: 'hidden' });
            assert.deepEqual(await settledPosition(), editorBefore);
            assert(!allNodes(await readData()).some(entry => entry.node.id === 'scroll-65'));
            await page.locator('[data-node-id="scroll-70"] .node-select').check();
            await page.locator('[data-node-id="scroll-71"] .node-select').check();
            const bulkBefore = await openDeleteMenu('scroll-70');
            await page.locator('#confirm-action').click(); await page.locator('#confirm-dialog').waitFor({ state: 'hidden' });
            assert.deepEqual(await settledPosition(), bulkBefore);
            assert(!allNodes(await readData()).some(entry => ['scroll-70', 'scroll-71'].includes(entry.node.id)));
            const tail = page.locator('summary[data-node-id="scroll-tail"]');
            if (await tail.evaluate(el => !el.parentElement.open)) await tail.click();
            const tailBefore = await openDeleteMenu('scroll-tail');
            await page.locator('#confirm-action').click(); await page.locator('#confirm-dialog').waitFor({ state: 'hidden' });
            const tailAfter = await settledPosition(), max = await page.evaluate(() => Math.max(0, document.documentElement.scrollHeight - innerHeight));
            assert(max > 300); assert(tailBefore.y > max, 'Deleting the final section must shorten the available scroll range.');
            assert.equal(tailAfter.y, max); assert.equal(tailAfter.x, tailBefore.x);
        } finally {
            await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach(el => el.close()));
            await replace(original); await reloadFile(); await page.setViewportSize({ width: 1440, height: 1000 });
        }
    });
    await t.test('ZIP backup downloads icons, previews restore, rejects stale restore, and supports undo', async () => {
        await reloadFile();
        const downloadEvent = page.waitForEvent('download'); await settingClick('#export-zip'); const download = await downloadEvent;
        const backupPath = path.join(output, 'hometab-backup.zip'); await download.saveAs(backupPath);
        const bytes = fs.readFileSync(backupPath), files = zipTools.unzipSync(bytes);
        assert(files['bookmarks.html']); assert(Object.keys(files).some(name => /^favicons\/[a-f0-9]{64}\.png$/.test(name)));
        assert(Object.keys(files).every(name => name === 'bookmarks.html' || /^favicons\/[a-f0-9]{64}\.png$/.test(name)));
        const original = await page.evaluate(text => HomeTabHTML.parse(text), Buffer.from(files['bookmarks.html']).toString('utf8'));
        await page.evaluate(async () => { const store = new HomeTabFiles.FileStore(); await store.restore(); const loaded = await store.read(); loaded.data.tabs[1].items[0].title = 'Before ZIP restore'; await store.write(loaded.data, loaded.revision); });
        await reloadFile(); const before = await readFile();
        const openBackup = async () => { await page.locator('#zip-file').setInputFiles({ name: 'hometab-backup.zip', mimeType: 'application/zip', buffer: bytes }); await page.locator('#restore-dialog').waitFor({ state: 'visible' }); };
        await openBackup(); assert.match(await page.locator('#restore-summary').innerText(), /favicon files/); assert.equal(await readFile(), before);
        await page.screenshot({ path: path.join(output, 'zip-restore-preview.png'), fullPage: true });
        await page.locator('[data-close="restore-dialog"]').click(); assert.equal(await readFile(), before);
        await openBackup();
        await page.evaluate(async () => { const store = new HomeTabFiles.FileStore(); await store.restore(); const loaded = await store.read(); loaded.data.theme = loaded.data.theme === 'light' ? 'dark' : 'light'; await store.write(loaded.data, loaded.revision); });
        const latest = await readFile(); await page.locator('#restore-confirm').click(); await page.locator('#restore-error').filter({ hasText: 'changed since' }).waitFor(); assert.equal(await readFile(), latest);
        await page.locator('[data-close="restore-dialog"]').click(); await reloadFile(); await openBackup();
        await page.locator('#restore-confirm').click(); await page.locator('#restore-dialog').waitFor({ state: 'hidden' });
        assert.deepEqual(await readData(), original);
        assert.equal(await page.evaluate(async () => (await (await (await navigator.storage.getDirectory()).getFileHandle('bookmarks.previous.html')).getFile()).text()), latest);
        await settingClick('#undo-links'); await page.locator('#collection-status').filter({ hasText: 'undone' }).waitFor();
        assert.equal((await readData()).tabs[1].items[0].title, 'Before ZIP restore');
        const htmlEvent = page.waitForEvent('download'); await settingClick('#export-links'); assert.equal((await htmlEvent).suggestedFilename(), 'bookmarks.html');
    });
    await t.test('ZIP validation rejects unsafe paths, missing images, hash mismatches, and false size declarations', async () => {
        const html = Buffer.from(await readFile());
        const invalid = [
            zipTools.zipSync({ 'bookmarks.html': html, '../escape.txt': Buffer.from('bad') }),
            zipTools.zipSync({ 'bookmarks.html': html }),
            zipTools.zipSync({ 'bookmarks.html': html, ['favicons/' + '0'.repeat(64) + '.png']: Buffer.from(iconPNG.split(',')[1], 'base64') }),
            zipTools.zipSync({ 'bookmarks.html': Buffer.from(fixtureHTML.replace('<body>', '<body><script>alert(1)</script>')) })
        ];
        const liar = zipTools.zipSync({ 'bookmarks.html': new Uint8Array(2 * 1024 * 1024) });
        const central = Buffer.from(liar).indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])); new DataView(liar.buffer, liar.byteOffset).setUint32(central + 24, 1, true); invalid.push(liar);
        const before = await readFile();
        for (const bytes of invalid) {
            await page.locator('#zip-file').setInputFiles({ name: 'invalid.zip', mimeType: 'application/zip', buffer: Buffer.from(bytes) });
            await page.locator('#page-status').filter({ hasText: 'Backup not opened' }).waitFor();
            assert.equal(await page.locator('#restore-dialog').isVisible(), false); assert.equal(await readFile(), before);
            await page.evaluate(() => { document.getElementById('page-status').textContent = ''; });
        }
        const failure = await page.evaluate(async () => {
            const store = new HomeTabFiles.FileStore(); await store.restore(); const loaded = await store.read();
            const reference = HomeTabModel.entries(loaded.data).find(item => HomeTabHTML.isIconFile(item.node.icon)).node.icon;
            const bytes = await store.iconBytes(reference), folder = await store.directory.getDirectoryHandle('favicons'); await folder.removeEntry(reference.slice(9));
            let message = '';
            try { await HomeTabArchive.create(loaded.data, store, true, loaded.revision); } catch (error) { message = error.message; }
            finally { const stream = await (await folder.getFileHandle(reference.slice(9), { create: true })).createWritable(); await stream.write(bytes); await stream.close(); }
            return message;
        });
        assert.match(failure, /could not include/); assert.equal(await readFile(), before);
        assert.deepEqual(errors, []);
    });
    await t.test('the real browser favicon service works without website host permissions', async () => {
        // Grant the optional permission in this disposable extension fixture: the native permission
        // dialog is a manual UI boundary. The favicon endpoint and canvas conversion are not mocked.
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hometab-favicon-test-'));
        const extension = path.join(directory, 'extension'); fs.cpSync(website, extension, { recursive: true });
        const manifest = JSON.parse(fs.readFileSync(path.join(extension, 'manifest.json'), 'utf8'));
        manifest.permissions.push('favicon'); delete manifest.optional_permissions;
        assert.equal(manifest.host_permissions, undefined);
        fs.writeFileSync(path.join(extension, 'manifest.json'), JSON.stringify(manifest));
        const actual = await chromium.launchPersistentContext('', {
            executablePath: browserPath, headless: true, ignoreDefaultArgs: ['--disable-extensions'],
            args: ['--disable-extensions-except=' + extension, '--load-extension=' + extension]
        });
        try {
            const home = await actual.newPage(); await home.goto('chrome://newtab/');
            await home.waitForFunction(() => globalThis.HomeTabFavicons);
            const icon = await home.evaluate(() => HomeTabFavicons.get('https://example.invalid/'));
            assert(context.HomeTabHTML.isIcon(icon));
            assert.equal(await home.evaluate(async icon => { const img = new Image(); img.src = icon; await img.decode(); return img.naturalWidth; }, icon), 32);
            assert.equal(await home.evaluate(() => chrome.permissions.contains({ permissions: ['favicon'] })), true);
        } finally {
            await actual.close();
            assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
            fs.rmSync(directory, { recursive: true });
        }
    });
});
