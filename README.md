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
│   ├── sync.js                Manual "Sync Now" orchestration (push/pull via window.cloudSync)
│   ├── journal.js            Entry model, dashboard/timeline/year/month/
│   │                         favorites/on-this-day/stats/detail (incl.
│   │                         Original/English/中文 translation tabs),
│   │                         the editor, autosave, demo data, draft recovery
│   ├── app.js                Router, render dispatcher, event binding, FAB, bootstrap
│   └── firebase-sync.js      Optional Firebase (Firestore+Storage+Auth) cloud sync — loaded
│                             as an ES module (<script type="module">), see "Cloud Sync" below
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

## Cloud Sync (Firebase)

Off by default — the diary stays local-only (IndexedDB) until you turn
this on. When you do, **Settings → Cloud Sync** lets you set a **Sync
Code** (a private passphrase you choose) and press **Sync Now**, which:

1. Pushes every local entry to Firestore, uploading any not-yet-uploaded
   photos/voice notes to Firebase Storage first (already-uploaded media
   is skipped on repeat syncs, so it stays cheap).
2. Pulls anything from the cloud that's missing locally or newer than
   your local copy (compared by each entry's last-edited time) and
   merges it in.

Use the **same Sync Code** on another device's copy of this app and
"Sync Now" there to bring your diary across. There's no automatic
background sync — you press the button when you want to sync, so
nothing happens without you asking.

**⚠️ Only works on a self-hosted copy (e.g. GitHub Pages), not the
Claude artifact link.** Firebase's SDK loads from `www.gstatic.com`,
and the Claude artifact preview's content-security policy blocks
scripts from that host. Settings will tell you this plainly instead of
just spinning forever.

**One-time Firebase console setup** (skip if you've done this for your
other apps' project, but this app uses its own project from the config
already wired into `js/firebase-sync.js`):

1. **Authentication → Sign-in method → Anonymous → Enable.** This app
   signs in anonymously purely so Firestore/Storage rules can require
   "must be signed in" — there's no email/password screen for you.
2. **Firestore Database → Rules**, paste:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /syncCodes/{code}/entries/{entryId} {
         allow read, write: if request.auth != null;
       }
     }
   }
   ```
3. **Storage → Rules**, paste:
   ```
   rules_version = '2';
   service firebase.storage {
     match /b/{bucket}/o {
       match /syncCodes/{code}/{allPaths=**} {
         allow read, write: if request.auth != null;
       }
     }
   }
   ```

**Security model, plainly:** your Sync Code is a shared secret, not a
login — anyone who learns it can read and write that code's data (the
rules above only check "is this a signed-in Firebase user", which
anonymous sign-in satisfies for anyone). This keeps out casual internet
crawlers, not a determined attacker who somehow learns your code. Pick
something you wouldn't post publicly, and treat it like a password.

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

By default, nothing about your journal leaves this device. There is no
analytics, no tracking, and no network calls except loading the two
Google Fonts and, optionally, a backup file you choose to export. If
you turn on **Cloud Sync** (see above) with your own Sync Code, entries
and media go to your own Firebase project — no other third party.
