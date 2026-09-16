# private

Nothing in this folder is committed, except this file. `.gitignore` sees
to that, and it matters more here than usual: two scheduled workflows in
this repository push commits back to it every hour, so anything tracked
gets published without anyone deciding to publish it.

Your notebooks live in `library/`, one directory each:

```
notebook/private/library/<notebook>/
  notebook.json          title, sources, notes, chat history
  sources/<id>.pdf       exactly the bytes you added
  sources/<id>.txt       the extracted text, pages separated by a form feed
  index/<id>.json        chunks and their vectors
  out/                   decks, diagrams, players, videos
```

Plain files, all of them. You can read any of it with `cat`, copy the
directory to another machine, back it up, or delete a notebook with
`rm -r` and leave nothing behind pointing at it.

`MARGINALIA_HOME` moves the library somewhere else — an encrypted volume,
or a synced folder if you have decided that is what you want:

```bash
MARGINALIA_HOME=~/Documents/marginalia node notebook/server/server.mjs
```
