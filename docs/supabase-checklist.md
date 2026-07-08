# Supabase Checklist

Last updated: 2026-07-06

This document records how to verify the Supabase project used by PaperUWant.

## Current Confirmed Items

### Storage

- Bucket exists: `PaperUWant_PDFS`
- Visibility: public
- Policy count shown in dashboard: 4
- File size display: unset, shown as 50 MB effective limit
- Allowed MIME types: any

### Tables

Confirmed from dashboard screenshots:

- `papers`
- `folders`
- `paper_chunks`
- `chats`
- `messages`

Confirmed visible columns:

`papers`

- `id uuid`
- `user_id uuid`
- `file_name text`
- `storage_path text`
- `created_at timestamptz`
- `folder_id uuid`
- `is_pinned bool`

`folders`

- `id uuid`
- `user_id uuid`
- `name text`
- `created_at timestamptz`

`paper_chunks`

- `id uuid`
- `paper_id uuid`
- `content text`
- `embedding vector(1536)`
- `metadata jsonb`
- `created_at timestamptz`

`chats`

- `id uuid`
- `user_id uuid`
- `paper_id uuid`
- `created_at timestamptz`

`messages`

- `id uuid`
- `chat_id uuid`
- `role text`
- `content text`
- `created_at timestamptz`

## Need To Confirm

### 1. RPC Function: `match_paper_chunks`

Where to check:

- Supabase Dashboard -> Database -> Functions
- Select schema `public`
- Use the search box and search `match_paper_chunks`

Current screenshot only shows pgvector helper functions such as:

- `array_to_halfvec`
- `array_to_sparsevec`
- `array_to_vector`

These are not the project RAG function. The project code expects this function:

- `match_paper_chunks`

Expected usage from code:

```text
match_paper_chunks(
  query_embedding,
  match_threshold,
  match_count,
  p_paper_ids
)
```

Local migration to apply:

```text
supabase/migrations/202607070001_match_paper_chunks_returns_paper_id.sql
```

Expected return shape after applying the migration:

```text
TABLE(id uuid, paper_id uuid, content text, metadata jsonb, similarity float)
```

If the dashboard search does not show it, run this in Supabase SQL Editor:

```sql
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as return_type,
  p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'match_paper_chunks';
```

What to send back:

- Whether any row is returned.
- The `arguments` value.
- The `return_type` value.
- Whether `security_definer` is true or false.

Confirmed on 2026-07-06:

- Function exists: `match_paper_chunks`
- Dashboard shows two entries, likely overloaded variants.
- Security mode shown in dashboard: `Invoker`
- Return type starts with: `TABLE(id uuid, content text, metadata js...)`

Implication:

- Because the function runs as invoker, access to `paper_chunks` follows the caller's database permissions and RLS outcome.
- Since `paper_chunks` currently has RLS enabled and no visible policies, calls made with a normal user/anon client may not see rows.
- Calls made from `paper-backend` should use a server-only Supabase key with the required permission.

### 2. `paper_chunks.embedding` Vector Dimension

Why it matters:

- The vector column dimension must match the embedding vector length returned by MiniMax.
- If the dimensions differ, inserting rows into `paper_chunks` will fail.

Where to check:

- Supabase Dashboard -> Table Editor -> `paper_chunks`
- Open the `embedding` column details if the UI shows type details.

If the UI only shows `vector`, run this in Supabase SQL Editor:

```sql
select
  a.attname as column_name,
  format_type(a.atttypid, a.atttypmod) as column_type
from pg_attribute a
join pg_class c on c.oid = a.attrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'paper_chunks'
  and a.attname = 'embedding'
  and not a.attisdropped;
```

Expected examples:

```text
vector(768)
vector(1024)
vector(1536)
```

What to send back:

- The exact `column_type` value.

Confirmed on 2026-07-06:

- `paper_chunks.embedding`: `vector(1536)`

Next check:

- Confirm the MiniMax embedding endpoint used by `paper-backend` returns vectors with length `1536`.
- If it returns another length, inserting into `paper_chunks.embedding` will fail.

### 3. RLS And Table Policies

Where to check in the dashboard:

- Supabase Dashboard -> Authentication -> Policies
- Or: Supabase Dashboard -> Table Editor -> open table -> RLS / Policies area

Tables to check:

- `papers`
- `folders`
- `paper_chunks`
- `chats`
- `messages`

For each table, record:

- Whether RLS is enabled.
- Policy names.
- Allowed commands: `select`, `insert`, `update`, `delete`, or `all`.
- Policy expression, especially whether it contains `auth.uid()`.

Optional SQL query:

```sql
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('papers', 'folders', 'paper_chunks', 'chats', 'messages')
order by tablename, policyname;
```

Also check whether RLS is enabled:

```sql
select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('papers', 'folders', 'paper_chunks', 'chats', 'messages')
order by c.relname;
```

What to send back:

- A screenshot of the Policies page, or the SQL result rows.
- Sensitive values are not expected in these outputs.

Confirmed on 2026-07-06:

RLS state:

- `chats`: enabled, not forced
- `folders`: enabled, not forced
- `messages`: enabled, not forced
- `paper_chunks`: enabled, not forced
- `papers`: enabled, not forced

Visible policies from screenshot:

`chats`

- `Users can delete own chats`: `DELETE`, condition `(auth.uid() = user_id)`
- `Users can insert own chats`: `INSERT`, check `(auth.uid() = user_id)`
- `Users can view own chats`: `SELECT`, condition `(auth.uid() = user_id)`

`folders`

- `Users can manage own folders`: `ALL`, condition `(auth.uid() = user_id)`

`messages`

- `Users can insert messages to own chats`: `INSERT`, checks ownership through related `chats`
- `Users can view messages of own chats`: `SELECT`, checks ownership through related `chats`

`papers`

- `Users can delete own papers`: `DELETE`, condition `(auth.uid() = user_id)`
- `Users can insert own papers`: `INSERT`, check `(auth.uid() = user_id)`
- `Users can update own papers`: `UPDATE`, condition `(auth.uid() = user_id)`
- `Users can view own papers`: `SELECT`, condition `(auth.uid() = user_id)`

Important gap:

- `paper_chunks` has RLS enabled, but no `paper_chunks` policy row was visible in the provided policies result.
- The frontend does not directly write `paper_chunks`; `paper-backend` writes it through the Supabase Python client.
- Therefore `paper-backend` should use a server-only key with enough database permission, or explicit `paper_chunks` policies must be added for the intended write/read path.
- Never expose a server-only Supabase key to the frontend.

Confirmed on 2026-07-06:

- Querying `pg_policies` for `paper_chunks` returned no rows.
- Current status: RLS enabled, no visible table policies.

Recommended decision:

- Preferred short-term path: keep all `paper_chunks` writes and RAG reads inside `paper-backend`, using a server-only Supabase key.
- Frontend should continue calling `paper-backend` rather than reading `paper_chunks` directly.
- Later, if users need direct client-side access to chunks, add narrowly scoped `paper_chunks` policies tied to ownership through `papers.user_id`.

Confirmed on 2026-07-06:

- The key in `paper-backend/.env` was compared against Supabase Project Settings and matches the dashboard's Secret keys area.
- This is appropriate for server-side use in `paper-backend`.
- Keep this key out of `frontend/.env.local` and out of any `NEXT_PUBLIC_*` variable.

### 4. Storage Policies

Where to check:

- Supabase Dashboard -> Storage -> `PaperUWant_PDFS` -> Policies

Record:

- Policy names.
- Allowed operations.
- Whether paths are scoped to the current user's id.

The frontend currently writes files using this path pattern:

```text
{user_id}/{safe_file_name}.pdf
```

So expected Storage policy logic should allow a signed-in user to manage files under their own first path segment.

What to send back:

- Screenshot of bucket policies, or copied policy names and expressions.

## Recommended Next Documentation Work

After the above items are confirmed:

1. Create a SQL schema file under `supabase/` or `docs/`.
2. Record exact table definitions.
3. Record `match_paper_chunks` function definition.
4. Record Storage bucket setup.
5. Record environment variables required by each app component.
