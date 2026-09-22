# Countdown -- An Island Timer

A pure client-side timer: the button mutates state, the display derives
from it, and no request ever leaves the page.

## What it teaches

- Island state beyond a counter: a modeled value (seconds) plus display
- Expression guards in handlers
- The zero-network property of islands (watch the devtools tab)

```sh
tw build && tw serve --port 8123 & sleep 2
# open http://127.0.0.1:8123/ -- click Start
```
