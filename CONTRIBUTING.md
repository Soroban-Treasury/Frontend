# Contributing

Thanks for helping. This is the web app of Stellar Treasury.

> This repository is a read-only mirror. The work happens in the Soroban-Treasury monorepo, in the `frontend/` folder, and is split into this repository on every push. Open pull requests against the monorepo.

## Setup

```
npm install
npm run typecheck
npm test
npm run build
```

## Rules

- No literal colours outside the variables at the top of `globals.css`.
- Every field has a visible label; errors are linked with `aria-describedby`.
- State is written in words, never colour alone.
- New components have tests for their states (empty, loading, error).
- Folders do not import each other by relative path; use declared dependencies.

## Open tasks

Marked in the code as `TODO(wave: ...)` or listed in the README under "Not built yet":

| Marker | Task |
|---|---|
| `app-1` | Policy simulator preview before proposing |
| medium | Batch payment CSV upload |
| trivial | Empty, loading and error states |
| medium | Keyboard and screen-reader audit |

## Pull requests

Describe what changed and why, list the tests you added, and keep a pull request to one change.

## Conduct

Be kind and be specific. See the [Code of Conduct](CODE_OF_CONDUCT.md).
