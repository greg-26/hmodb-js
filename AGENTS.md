# AGENTS.md — hmodb-js

## What this is

JavaScript/TypeScript library for the [Mass Times Protocol](https://masstimesprotocol.org).
Parses JSON-LD Mass schedules into typed objects and generates valid JSON-LD for parishes.

## Key rules

- **Always `git pull` before planning or implementing changes.** Remote can change between sessions.
- Run tests before committing: `npm test` (11 tests, all must pass)
- This is a public npm package (`hmodb`) — keep the public API stable and well-typed
- Protocol spec lives in [asopenag/hmodb](https://github.com/asopenag/hmodb); changes there may require updates here
