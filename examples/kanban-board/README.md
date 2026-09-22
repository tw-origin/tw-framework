# Kanban Board -- A Bigger Island with Modeled Columns

A three-column board where every interaction is a state expression:
moving a card, adding one, and the per-column counters.

## What it teaches

- Rich multi-column client state on one island
- Counters derived in the display expressions
- Column-scoped interactions (no event delegation tricks needed)

```sh
tw build && tw serve --port 8123 & sleep 2
# move cards, add cards, watch the counters
```
