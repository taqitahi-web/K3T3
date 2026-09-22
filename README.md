# Pages From My Life

A private archive of ordinary days, small moments, people, places, and memories.

A personal life journal / daily commentary web app. Vanilla HTML5, CSS3 and
JavaScript (ES6+) — no build step, no backend, no API keys. Everything you
write is stored locally on your own device using IndexedDB; nothing is
uploaded anywhere unless you explicitly export a backup.

## Running it

No install needed. Two ways to use it:

1. **Locally:** open `index.html` directly in a modern browser (Chrome,
   Edge, Safari, Firefox). Voice recording requires either `https://` or
   `localhost` — opening the file directly (`file://`) will disable the
   microphone feature only; everything else works.
2. **Hosted (recommended):** push this folder to a GitHub repository and
   turn on GitHub Pages for it. Once served over `https://`, you can also
   install it to your phone's home screen as a standalone app (Add to
   Home Screen / Install App) thanks to `manifest.json` and
   `service-worker.js`.

## Project structure

```
pages-from-my-life/
├── index.html              Page shell — loads css/style.css and js/*.js
├── manifest.json            PWA manifest (installable, theme color, icons)
├── service-worker.js        Offline app-shell caching
├── css/
│   └── style.css            All styling — design tokens live in :root
├── js/
│   ├── database.js          IndexedDB layer (entries, photos, audio, settings, drafts)
│   ├── ui.js                DOM helpers, formatting, toast/modal/lightbox, colorful tag chips
│   ├── photos.js             Image compression + in-editor photo strip
│   ├── voice.js              MediaRecorder-based voice diary
│   ├── calendar.js           Month calendar view
│   ├── search.js             Full-journal search
│   ├── export.js             Backup export/import (JSON)
│   ├── share.js               Per-entry sharing: URL-encoded share link + standalone shareable HTML file
│   ├── journal.js            Entry model, dashboard/timeline/year/month/
│   │                         favorites/on-this-day/stats/detail (incl.
│   │                         Original/English/中文 translation tabs),
│   │                         the editor, autosave, demo data, draft recovery
│   └── app.js                Router, render dispatcher, event binding, FAB, bootstrap
└── assets/
    ├── icons/                PWA icons (placeholders — swap for your own)
    └── images/               (empty — for any images you add yourself)
```

The scripts are loaded as plain (non-module) `<script>` tags in `index.html`,
in the order listed above, so they share one global scope — no bundler
required. `app.js` is loaded last because it calls `init()` on load.

## Data model

Entries are stored in IndexedDB (`entries` object store) as:

```js
{
  id, date, time, title, content,
  mood, weather, temperature, location,
  people: [], tags: [],
  photoIds: [], audioIds: [],
  favorite: false, pinned: false,
  createdAt, updatedAt
}
```

Photos and audio are stored in their own stores (`photos`, `audio`), each
row carrying an `entryId` pointer back to the entry it belongs to — this
keeps large binary data (base64 image/audio strings) out of the entry
record itself.

## Backup format

**Settings → Export Journal** downloads a single `.json` file containing
`entries`, `photos`, and `audio` arrays (photos/audio embedded as base64
data URLs). **Import Journal** reads that file back in; entries with a
matching `id` are overwritten, everything else is added.

## PIN lock

Adding, editing, or deleting an entry now asks for a 4+ digit PIN first —
the default is **9625**. Change it any time in **Settings → Security**
(enter a new PIN twice to confirm). It's stored in this browser's
IndexedDB settings, not synced anywhere, so it only protects against
someone picking up this device — it isn't encryption.

## Translation tabs

Opening an entry shows three tabs: **Original**, **🌐 English**, **🌐 中文**.
The English/Chinese tabs are a place to paste your own translation (from
wherever you like — a translator app, a friend, whatever) — type or paste
a title and body and hit save. It's stored on that entry and shown
straight away next time, with **Edit translation** / **Remove
translation** to change it later. There's no AI or external API call
involved, so it works identically whether you're using the published
Claude artifact link or this self-hosted copy.

## Themes

Settings → Appearance now has these options: System, Light, Dark, and
four colorful variants:

- **Colorful — Sunset** *(default for new installs)* — warm coral/orange
- **Colorful — Dusk Berry** — plum/magenta on a dark charcoal background
- **Colorful — Monsoon Green** — deep green/teal on a soft off-white background
- **Colorful — Rangpur Morning** — mustard-yellow and terracotta

Tags also get a small colorful touch everywhere: each tag name always
renders in the same hue (computed from the tag text), so `#Cycling` is
always the same color across the whole app, in every theme.

## Sharing a single entry

Opening an entry (Original tab) has two share options — this app has no
server, so these are the only two ways to give someone else a copy of
one entry without them needing this app or your data already:

- **🔗 Share Link** — encodes that entry's text (title, date,
  mood/weather/tags, body) straight into a URL after `#share=`. Sending
  that link to someone opens this same page in a read-only mode that
  decodes and shows it — no account, no data on their end. Uses the
  device's native share sheet when available, otherwise copies the link
  to the clipboard. Deliberately **excludes photos and voice notes**,
  since embedding those would make the link too long to share reliably
  through chat apps — use Share as File for an entry with media.
- **📄 Share as File** — builds one small, fully self-contained `.html`
  file for that entry, with any photos/voice notes embedded, and hands
  it to the native share sheet (or downloads it) so it can be sent as a
  normal file attachment and opened by anyone, offline, no app needed.

Both only ever include the one entry you shared from — never your whole
diary.

## Customizing

- Colors, fonts and spacing are CSS custom properties at the top of
  `css/style.css` (`--background`, `--accent`, `--serif`, etc.) — change
  them there rather than hunting through individual rules.
- `assets/icons/icon-192.png` and `icon-512.png` are plain placeholders;
  replace them with your own artwork (same filenames, same sizes) and the
  manifest will pick them up automatically.
- Demo data (Settings → Load Demo Data) is fictional and tagged internally
  so **Clear Demo Data** can remove it without touching your real entries.

## Privacy

Nothing about your journal is sent anywhere. There is no analytics, no
tracking, and no network calls except loading the two Google Fonts and,
optionally, a backup file you choose to export.
