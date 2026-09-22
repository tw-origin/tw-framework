# Quiz App -- A Multi-Step State Machine on an Island

One question at a time, client-side: score, step, and selection live in
state; the buttons are pure expressions.

## What it teaches

- Multi-field state machine (step, score, chosen) in one island
- Conditional display driven by state
- A results screen with zero extra routes

```sh
tw build && tw serve --port 8123 & sleep 2
# answer the three questions
```
