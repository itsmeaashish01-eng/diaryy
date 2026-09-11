# private

Nothing in this folder is committed, except this file. `.gitignore` sees
to that.

It's where the `study` agent expects your library:

```
agents/private/study/
  endocrine/dka-management.md
  cardiology/acs-pathway.md
  …
```

Notes are plain markdown. An optional header at the top is what makes the
agent useful rather than just a file counter:

```markdown
---
title: DKA — management
topic: endocrine
source: ADA Standards of Care
sourceDate: 2025-01-01
reviewed: 2026-08-14
tags: [algorithm, emergency]
---

Fluid resuscitation…
```

| Field | What the agent does with it |
|---|---|
| `reviewed` | Schedules the next review off it. Update the date when you've read it back |
| `source` | Without one, the note gets flagged — a note you can't trace is a note you can't check |
| `sourceDate` | Warns you when the guideline behind it is old enough to have moved on |
| `tags` | `algorithm`, `protocol`, `dosing` raise the weight of a missing source |
| `topic` | Groups the library so you can see where it's thin |

Because this folder isn't committed, the `study` agent can't run on
GitHub's machines — there'd be nothing there to read. Run it locally:

```bash
node agents/runner.mjs --only fellowship --force
```

If you'd rather it ran unattended, the folder would have to be committed
somewhere, and that's a decision worth making deliberately rather than by
leaving a default alone. A private repository is not the same as a safe
place for patient information.
