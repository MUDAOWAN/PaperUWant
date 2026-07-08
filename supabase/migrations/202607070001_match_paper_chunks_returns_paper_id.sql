-- PaperUWant RAG retrieval RPC.
-- Run this in Supabase SQL Editor or through the Supabase CLI after the
-- paper_chunks table and pgvector extension already exist.
--
-- PostgreSQL cannot change an existing function's table return shape through
-- create or replace, so drop the same signature first.

drop function if exists public.match_paper_chunks(vector, double precision, integer, uuid[]);

create or replace function public.match_paper_chunks(
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  p_paper_ids uuid[] default null
)
returns table (
  id uuid,
  paper_id uuid,
  content text,
  metadata jsonb,
  similarity float
)
language sql
stable
security invoker
as $$
  select
    pc.id,
    pc.paper_id,
    pc.content,
    pc.metadata,
    1 - (pc.embedding <=> query_embedding) as similarity
  from public.paper_chunks as pc
  where
    (
      p_paper_ids is null
      or array_length(p_paper_ids, 1) is null
      or pc.paper_id = any(p_paper_ids)
    )
    and 1 - (pc.embedding <=> query_embedding) > match_threshold
  order by pc.embedding <=> query_embedding
  limit match_count;
$$;
