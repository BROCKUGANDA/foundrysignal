# Contributing

## Branches

- `dev` — integration branch for ongoing work.
- `staging` — release candidate; auto-promoted from `dev` after CI passes.
- `main` — production; auto-promoted from `staging` on a version tag.

Feature work targets `dev` via pull request. Do not push directly to `staging`
or `main`.

## Local development

```bash
bun install
cp .env.example .env   # fill in values
bun x prisma migrate deploy
bun run dev            # http://localhost:3000
bun test
bun run typecheck
bun run lint
```

## Commit messages

Use conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `security:`).
They drive automated versioning on `main`.

## Pull requests

All PRs must pass CI (typecheck, lint, tests, build) and receive review before
merge. Keep changes focused and small.