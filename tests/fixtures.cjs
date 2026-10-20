const folder = (id, title, items = []) => ({ id, kind: 'folder', title, items });
const link = (id, title, url) => ({ id, kind: 'link', title, url });
const fixture = () => ({ version: 1, theme: 'os', tabs: [
    folder('search-engines', 'Search engines', [{ ...link('google', 'Google', 'https://www.google.com/'), searchTemplate: 'https://www.google.com/search?q={query}' }]),
    folder('quick-access', 'Quick access', [link('quick', 'Quick example', 'https://example.com/?x=1&y=2#part')]),
    folder('my-websites', 'My websites', [link('site', 'My site', 'https://example.org/')]),
    folder('my-links', 'My links', [
        folder('accounts', 'Accounts', [link('mail', 'Mail', 'https://mail.example.com/'), { id: 'separator', kind: 'separator', title: 'Tools' },
            folder('nested', 'Nested', [link('nested-link', 'Nested example', 'http://localhost:1234/path')])]),
        folder('reading', 'Reading', [link('article', 'Article', 'https://example.com/read')]),
        folder('inbox', 'Saved for later')
    ])
] });
const iconPNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAO0lEQVR4AezXsQkAQAgDQHH/SX6FH05HsBTkAunDdcl4vzabsRwDCBAgQIAAAQIECBAgQIDAfYHpfDcAAAD//+ZWfpsAAAAGSURBVAMAhGBMwSwhcw0AAAAASUVORK5CYII=';
module.exports = { fixture, folder, link, iconPNG };
