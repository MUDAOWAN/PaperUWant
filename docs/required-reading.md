# PaperUWant Required Reading

Last updated: 2026-07-08

Read this before local development, committing, or pushing. This project uses Supabase and external AI API credentials. Real values must stay in local environment files or deployment provider settings only.

## Where To Change Keys

### Current RAG backend: `paper-backend`

Runtime file:

- `paper-backend/.env`

Template file:

- `paper-backend/.env.example`

Variables read by code:

- `SUPABASE_URL`
- `SUPABASE_KEY`
- `MINIMAX_API_KEY`
- `MINIMAX_GROUP_ID`

The new Supabase service role key should be written only to `paper-backend/.env` as `SUPABASE_KEY=...`. Do not put the real value in `.env.example`, docs, screenshots, chat logs, source code, or frontend files.

Code that reads these values:

- `paper-backend/services/chat_service.py`
- `paper-backend/services/vector_store.py`

### Frontend: `frontend`

Runtime file:

- `frontend/.env.local`

Variables read by code:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Only public browser-safe values may use `NEXT_PUBLIC_*`. Never place service role keys, MiniMax keys, OpenAI-compatible keys, personal tokens, or admin credentials in any `NEXT_PUBLIC_*` variable.

Code that reads these values:

- `frontend/src/lib/supabase.ts`

### Legacy/basic backend: `backend`

Runtime file:

- `backend/.env`

Variables read by code:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

Code that reads these values:

- `backend/core/config.py`

## Commit Rules

Do commit:

- Source code.
- SQL migrations.
- Documentation that uses placeholders.
- Example env files with placeholder values only.

Do not commit:

- `.env`, `.env.local`, `.env.*` files containing real local values.
- Supabase service role keys.
- MiniMax API keys or group IDs.
- OpenAI-compatible API keys.
- Personal access tokens, cookies, session strings, private keys, or local machine paths that grant tool access.
- Screenshots or logs that display real credentials.

## Before Every Commit Or Push

Run these checks from the repo root:

```powershell
git status --short --branch
git ls-files *env*
git grep -n -I -e "SERVICE_ROLE" -e "service_role" -e "SUPABASE_SERVICE" -e "eyJ" HEAD
```

Expected:

- `git ls-files *env*` should only show safe template files, currently `paper-backend/.env.example`.
- The `git grep` check should produce no real credential values. If it only finds documentation text, inspect it before committing.
- `.claude/settings.local.json` should remain local unless intentionally reviewed and approved.

## If A Real Key Was Committed

1. Rotate the exposed key in the provider dashboard immediately.
2. Remove the real value from the current working tree.
3. Remove the file or value from Git history.
4. Force-update the remote branch only after confirming the rewritten history is clean.
5. Ask collaborators to rebase or freshly clone after the history rewrite.

For Supabase service role key rotation, update your local `paper-backend/.env` afterward:

```env
SUPABASE_KEY=your-new-service-role-key
```

Never rely on Git history cleanup alone. A key that was pushed should be treated as no longer private.
