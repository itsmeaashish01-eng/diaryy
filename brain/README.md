# Brain

A local-first personal dashboard and second brain. Tasks, notes, bookmarks and links live in one place, so you can save, organize and find them quickly. Everything stays on your computer, in a single SQLite file.

**Capture quickly → organize easily → find instantly.**

- **Home**: what's overdue, due today and coming up this week, plus pinned items, recent notes, recent bookmarks and a capture box.
- **Universal search** (`⌘K` / `Ctrl+K`): searches titles, note text, task descriptions, URLs, tags and folder paths as you type. Each result is labelled Task, Note, Bookmark, Link, Folder or Tag.
- **Tasks**: due date and time, priority, status, tags, folder, related URL, reminder, subtasks and repeats. Views: Today, Upcoming, Overdue, All, Completed and By category. You can check tasks off straight from any list.
- **Notes**: rich text with headings, lists, checklists, bold, italic, code, quotes and links. Type `[[` to link another item. Notes save as you type.
- **Bookmarks**: the title and icon are fetched for you, and you can open the site in one click. Views: favorites, recent, by category and by tag.
- **Links**: a vault for portals you use often. Each link can point to its login entry in your password manager. The password itself is never stored.
- **Folders** (nested, editable, reorderable), **tags**, **favorites**, **pinning**, **related items**, an **Inbox** for unsorted captures, an **archive**, and **export/restore**.
- Light, dark and system themes. Works on a Mac, an iPad and an iPhone.

## Requirements

- Node.js 20.19 or newer (22 LTS recommended)
- No other services. No account, no cloud.

## Install and run

```bash
cd brain
cp .env.example .env        # optional settings; the defaults work
npm install                 # installs dependencies and generates the database client
npm run db:migrate          # creates data/brain.db and applies all migrations
npm run dev                 # http://127.0.0.1:3000
```

For daily use, run a production build, which is faster:

```bash
npm run build
npm start                   # http://127.0.0.1:3000
```

`npm run setup` runs install and migrate in one step. After you pull an update, run `npm run db:migrate` again: migrations only ever move your data forward.

Both servers listen on `127.0.0.1` only, so other devices on your network cannot reach them. To use Brain from your iPhone or iPad, see [Using it from other devices](#using-it-from-other-devices).

## Using it

### Keyboard

| Keys | Action |
| --- | --- |
| `⌘K` / `Ctrl+K`, `/` | Search and command palette |
| `Q` | Quick add (task, note, bookmark, link, folder, reminder) |
| `T` `N` `B` `L` | New task, note, bookmark or link |
| `I` | Inbox (capture box focused) |
| `G` then `H` `I` `T` `A` `N` `B` `L` `F` `S` | Go to Home, Inbox, Today, Tasks, Notes, Bookmarks, Links, Favorites, Settings |
| `⌘/Ctrl+Enter` | Save a form |
| `[[` (in a note) | Link to another item |
| `?` | Show all shortcuts |

### Capturing to the Inbox

Paste or type anything into the capture box (on Home and in the Inbox), then press Enter:

- `https://…` on its own, or a title line followed by a URL, becomes a **bookmark**. Its page title and icon are fetched.
- `todo …`, `task: …`, `t: …` or `[] …` becomes a **task**.
- `idea: …` becomes a note tagged `#idea`. Anything else becomes a **note**: the first line is the title, the rest is the body.
- `#words` become tags.

Each Inbox row lets you change the item's type, file it into a folder, or mark it done.

### Linking items together

Every item has a **Related items** section. There are three ways to add to it:

1. Click **Link item** and search.
2. In a note, type `[[` and pick an item, or create a new note on the spot.
3. In a task description or bookmark notes, write `[[Exact Title]]`.

Links work in both directions. Links made in text stay in sync with the text: delete the `[[…]]` and the relation goes too.

### Search tips

Every word must match somewhere. `conrad 30` finds items with both words in the title, text, URL, tags or folder path. Put "exact phrases" in quotes. `#tag` matches tags. Title matches rank above body matches, and pinned and recent items get a small boost.

## Your data

- **Location:** `brain/data/brain.db`. Change it with `DATABASE_URL` in `.env`.
- **Export** (Settings → Export & backup):
  - **JSON**: the complete backup. It is documented, plain JSON (`format: "brain-export"`, `version: 1`) holding folders, items with their type-specific fields, tags, reminders and relations.
  - **Markdown (.zip)**: one `.md` file per item, in folders that mirror yours. Metadata is in YAML front matter and links are written as `[[Title]]`. It opens directly in Obsidian or any editor.
  - **CSV**: tasks, notes, bookmarks and links. Cells are protected against spreadsheet formula injection.
- **Restore** (Settings → Restore): choose a JSON backup, then *Merge* or *Replace*. A restore runs in one transaction, so a bad file changes nothing.
- **Database snapshots:** `npm run backup` writes a consistent copy of the database to `backups/` while the app is running, and keeps the newest 30. To restore one, stop the app and copy the snapshot over `data/brain.db`.

`data/`, `backups/` and `.env` are git-ignored. Your data never ends up in the repository.

## Security

- **Not a password manager.** Don't store passwords, recovery codes, card numbers or API keys here. Brain warns you when text looks like one. For logins, add the *password manager link* (for example `https://start.1password.com/open/i?…` or `bitwarden://…`) on a Link.
- **XSS:** note content is stored as structured JSON and rendered by the editor's schema. User text is never inserted as HTML. Every link passes an allow-list: `http`, `https`, `mailto`, `tel` and known password-manager schemes. `javascript:`, `data:` and similar schemes are rejected when saving and when rendering. A strict Content-Security-Policy and related headers are set.
- **Validation:** every API input is validated with zod before it reaches the database.
- **Requests from other sites:** any request that changes data must come from Brain's own origin.
- **Fetching page titles** is blocked for private and loopback addresses, so it cannot be used to probe your network. Favicons are stored inline, so displaying them later never contacts the site.
- **Secrets** live in `.env`, never in source. Passwords are stored only as scrypt hashes. Sessions are HMAC-signed, HttpOnly cookies.

### Using it from other devices

1. Generate credentials. You will be prompted for a password, which never appears in shell history:

   ```bash
   npm run hash-password
   ```

   Paste the two printed lines (`AUTH_PASSWORD_HASH`, `AUTH_SECRET`) into `.env`.

2. Start the server listening on your network: `npx next start --hostname 0.0.0.0 --port 3000`.

3. Open `http://<your-mac's-name>.local:3000` on the iPhone or iPad. In Safari, *Share → Add to Home Screen* gives it its own icon.

Use this only on a network you trust. Over plain HTTP, your password crosses the network unencrypted. For access from outside your home, put Brain behind an HTTPS tunnel or a VPN such as Tailscale rather than opening a port.

## Development

```bash
npm run dev             # dev server with hot reload
npm run lint            # ESLint (Next.js + TypeScript rules)
npm run typecheck       # tsc --noEmit (strict)
npm test                # Vitest: unit tests + workflow tests on a temporary SQLite database
npm run check           # all three
npm run db:migrate:dev  # after editing prisma/schema.prisma: creates a new migration
npm run db:studio       # browse the database
```

### Architecture

```
src/
  app/            Next.js App Router: pages under (app)/, JSON API under api/
  views/          one client component per page
  components/     UI: shell, sidebar, command palette, quick add, editor, rows
  client/         browser-side helpers: API client and query cache, autosave, toasts, theme
  server/         services: items, search, folders, tags, dashboard, backup, metadata, auth
  lib/            shared pure logic: validation, URL safety, dates, capture parsing, rich text
prisma/           schema and SQL migrations
scripts/          backup and hash-password
tests/            Vitest suites
```

- **One `Item` table** holds what every kind of thing shares: title, folder, tags, pin, favorite, inbox, archive, relations and a search index. One-to-one `Task`, `Note` and `Bookmark` rows hold type-specific fields; links reuse the `Bookmark` shape. This is why search, tags, relations and export work the same way across every type.
- Other tables: `User`, `Folder` (a tree), `Tag`, `ItemTag`, `ItemRelation` (`MANUAL` or `WIKILINK`) and `Reminder`. All ids are UUIDs, and rows carry `created_at` and `updated_at`, plus `archived_at` on items.
- **Search:** each item keeps a lower-cased `search_text` (title, body, URL, tags, folder path) that is rebuilt whenever any of those change, including when a folder is renamed or a tag is merged. The database narrows the candidates and `lib/search.ts` ranks them.
- **Due dates** are calendar days (`YYYY-MM-DD`). The browser sends its local "today", so Today and Overdue are always right for your time zone.
- **The UI** talks only to the JSON API. A future iOS app or sync client can use the same endpoints.

### Switching to PostgreSQL

The schema uses only portable column types, with no enums or JSON columns, so switching takes these steps:

1. In `prisma/schema.prisma`, set `provider = "postgresql"`.
2. Delete `prisma/migrations` and run `npm run db:migrate:dev -- --name init`.
3. In `src/server/db.ts`, swap the adapter for `@prisma/adapter-pg`.
4. Set `DATABASE_URL=postgresql://…`.
5. Move your data with a JSON export and restore.

### Toward sync across devices

All data already belongs to a `User`, every API call goes through one place (`src/server/user.ts`), and ids are UUIDs, so records made on different devices never collide. Adding accounts and sync means two things: replace the single local user with real sign-in, and run the same app against PostgreSQL on a server you control. The data model stays the same.

### Limitations

- Reminders appear while Brain is open in a browser tab, with a system notification if you allow it. There is no background push yet.
- Fetching page titles needs the page to be reachable from your computer. Some sites block automated requests; in that case you type the title yourself.
