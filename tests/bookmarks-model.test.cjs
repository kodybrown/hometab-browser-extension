const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { fixture, link, iconPNG } = require('./fixtures.cjs');
const context = vm.createContext({ URL });
for (const file of ['bookmarks-model.js', 'bookmarks-html.js']) vm.runInContext(readFileSync(path.join(__dirname, '../website', file), 'utf8'), context);
const M = context.HomeTabModel, H = context.HomeTabHTML;

test('bundled HTML is a small generic starter with the requested websites', () => {
    const html = readFileSync(path.join(__dirname, '../website/bookmarks.html'), 'utf8');
    const links = html.match(/<section data-id="my-links">([\s\S]*?)<\/section>/)[1];
    assert.equal((links.match(/<a /g) || []).length, 9);
    assert.equal((links.match(/^      <li data-id=/gm) || []).length, 3);
    const sites = html.match(/<section data-id="my-websites">([\s\S]*?)<\/section>/)[1];
    assert.deepEqual([...sites.matchAll(/href="([^"]+)"/g)].map(match => match[1]), [
        'http://wasatchwizard.com/', 'https://github.com/kodybrown/hometab-browser-extension'
    ]);
    assert(!/<script|<style|<link |href="javascript:/i.test(html));
    assert(!html.includes('data-icon='), 'The starter must not bundle website icons.');
    assert(!existsSync(path.join(__dirname, '../website/img')));
    assert(existsSync(path.join(__dirname, '../website/icons/32.png')));
});
test('moves preserve URL and every descendant when promoting a section to a tab', () => {
    const data = fixture(), original = JSON.stringify(M.find(data, 'nested').node);
    M.move(data, 'nested', 'my-links');
    assert.equal(JSON.stringify(M.find(data, 'nested').node), original);
    assert.equal(M.find(data, 'nested').parent.id, 'my-links');
    H.validate(data);
});
test('rejects self/descendant moves before mutating the tree', () => {
    for (const [id, destination] of [['accounts', 'nested'], ['accounts', 'accounts'], ['mail', 'missing']]) {
        const data = fixture(), original = JSON.stringify(data);
        assert.throws(() => M.move(data, id, destination));
        assert.equal(JSON.stringify(data), original);
    }
});
test('reorders without losing identity or nested links', () => {
    const data = fixture(); M.move(data, 'nested', 'accounts', -1);
    assert.equal(M.find(data, 'accounts').node.items[1].id, 'nested');
    M.move(data, 'accounts', 'my-links', 1);
    assert.equal(M.find(data, 'my-links').node.items[1].id, 'accounts');
    assert.equal(M.count(M.find(data, 'my-links').node), 3);
});
test('serializer escapes titles, addresses, attributes, and bookmarklet code', () => {
    const data = fixture(); const node = link('unsafe-title', '<img src=x onerror=alert(1)> & "literal"', 'https://example.com/?x=1&y=2#part');
    M.find(data, 'accounts').node.items.push(node, link('bookmarklet', 'Clip', 'javascript:alert("test & <markup>")'));
    const html = H.serialize(data);
    assert(html.includes('&lt;img src=x onerror=alert(1)&gt; &amp; &quot;literal&quot;'));
    assert(html.includes('href="https://example.com/?x=1&amp;y=2#part"'));
    assert(html.includes('data-bookmarklet="javascript:alert(&quot;test &amp; &lt;markup&gt;&quot;)"'));
    assert(!html.includes('href="javascript:'));
});
test('fixed sections and search templates are validated before serialization', () => {
    for (const change of [d => d.tabs.pop(), d => d.theme = 'unknown', d => d.tabs[0].items[0].searchTemplate = 'https://example.com/',
        d => d.tabs[0].items[0].searchTemplate = 'javascript:alert("{query}")', d => d.tabs[3].items.push(link('loose', 'Loose', 'https://example.com/'))]) {
        const data = fixture(); change(data); assert.throws(() => H.serialize(data));
    }
});
test('unsupported versions, repeated IDs, unsafe schemes, and malformed trees are rejected', () => {
    for (const change of [d => d.version = 99, d => d.tabs.push(d.tabs[0]), d => d.tabs[1].items[0].url = 'data:text/html,<script>alert(1)</script>',
        d => d.tabs[1].items[0].url = '/relative', d => delete d.tabs[0].items, d => d.tabs[1].items[0].icon = 'https://tracker.example/icon']) {
        const data = fixture(); change(data); assert.throws(() => H.validate(data));
    }
    assert.equal(M.urlKind('javascript:alert(1)'), 'bookmarklet');
    assert.equal(M.urlKind('codex://threads/new'), 'link');
});
test('canonical HTML serialization is deterministic', () => {
    const data = fixture(); assert.equal(H.serialize(data), H.serialize(JSON.parse(JSON.stringify(data))));
});

test('portable icons accept bounded 32px PNGs while rejecting remote and active image formats', () => {
    const data = fixture(); data.tabs[1].items[0].icon = iconPNG;
    assert(H.serialize(data).includes('data-icon="' + iconPNG + '"'));
    assert(H.isIcon('img/google.com_favicon.ico'));
    assert(H.isIconFile('favicons/' + 'a'.repeat(64) + '.png'));
    for (const icon of ['https://example.com/favicon.ico', 'data:image/svg+xml;base64,PHN2Zz4=',
        'data:text/html;base64,PHNjcmlwdD4=', iconPNG.replace('png', 'jpeg'), iconPNG + 'A'.repeat(16000),
        iconPNG.replace('iVBORw0KGgoAAAANSUhEUgAAACAAAAAg', 'iVBORw0KGgoAAAANSUhEUgAAQAAAAEAA'),
        'img/../outside.png', 'favicons/../outside.png', 'favicons/%2e%2e/x.png', 'favicons/icon.svg',
        'favicons/' + 'a'.repeat(64) + '.png?url=https://example.com', 123]) {
        data.tabs[1].items[0].icon = icon;
        assert.throws(() => H.validate(data));
    }
});

test('drop placement moves before an item and rejects cycles or permanent collection moves', () => {
    const data = fixture(); M.place(data, 'mail', 'reading', 'article');
    assert.equal(M.find(data, 'reading').node.items[0].id, 'mail');
    assert.equal(M.find(data, 'mail').node.url, 'https://mail.example.com/');
    M.place(data, 'reading', 'my-links', 'accounts');
    assert.equal(M.find(data, 'my-links').node.items[0].id, 'reading');
    for (const args of [['accounts', 'nested'], ['my-links', 'accounts'], ['mail', 'reading', 'missing']]) {
        const before = JSON.stringify(data); assert.throws(() => M.place(data, ...args)); assert.equal(JSON.stringify(data), before);
    }
    H.validate(data);
});

test('bulk moves preserve tree order, carry selected descendants once, and leave their source unchanged', () => {
    const data = fixture(), before = JSON.stringify(data);
    const moved = M.placeMany(data, ['nested-link', 'mail', 'nested'], 'reading', 'article');
    assert.equal(M.find(moved, 'reading').node.items.map(node => node.id).join(','), 'mail,nested,article');
    assert.equal(M.find(moved, 'nested-link').parent.id, 'nested');
    assert.equal(M.count(M.find(moved, 'nested').node), 1); H.validate(moved);
    assert.equal(JSON.stringify(data), before);
    const reordered = M.placeMany(data, ['reading', 'accounts'], 'my-links');
    assert.equal(M.find(reordered, 'my-links').node.items.map(node => node.id).join(','), 'inbox,accounts,reading');
    assert.equal(JSON.stringify(M.placeMany(data, ['mail', 'nested'], 'accounts', 'mail')), before);
});

test('bulk moves reject cycles, missing items, and fixed collections without partial mutation', () => {
    const data = fixture(), before = JSON.stringify(data);
    for (const args of [[['mail', 'accounts'], 'nested'], [['mail', 'missing'], 'reading'], [['quick-access', 'mail'], 'reading'], [['mail'], 'reading', 'missing']]) {
        assert.throws(() => M.placeMany(data, ...args)); assert.equal(JSON.stringify(data), before);
    }
    const invalid = M.placeMany(data, ['mail', 'nested'], 'search-engines');
    assert.throws(() => H.validate(invalid)); assert.equal(JSON.stringify(data), before);
});

test('bulk deletion removes selected subtrees once and protects permanent collections', () => {
    const data = fixture(), before = JSON.stringify(data);
    const removed = M.removeMany(data, ['nested-link', 'nested', 'mail']); H.validate(removed);
    assert.equal(M.find(removed, 'accounts').node.items.map(node => node.id).join(','), 'separator');
    assert.equal(M.find(removed, 'article').node.title, 'Article'); assert.equal(JSON.stringify(data), before);
    for (const ids of [[], ['missing'], ['my-links', 'mail']]) {
        assert.throws(() => M.removeMany(data, ids)); assert.equal(JSON.stringify(data), before);
    }
});
