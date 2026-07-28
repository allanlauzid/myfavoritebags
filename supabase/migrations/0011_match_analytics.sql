-- ─── Match Analytics — tabela de eventos anônimos do My Favorite Match ──────
-- Guarda 3 tipos de evento, gerados pelo tracking client-side em match.html:
--   'page_view'        → alguém abriu a página do Match (métrica de acesso).
--   'session_complete' → alguém chegou até o último card do baralho.
--   'match'            → alguém curtiu/favoritou uma peça (like ou super).
--
-- Não guarda NENHUM dado pessoal: `visitor_id` e `session_id` são UUIDs
-- gerados no navegador (visitor_id persiste via localStorage entre visitas;
-- session_id é novo a cada carregamento da página) — servem só pra agregar
-- métricas ("quantos visitantes únicos", "matches por usuário") no painel
-- Match Analytics do admin, sem identificar ninguém de verdade.
--
-- RLS: qualquer um pode INSERIR (é o próprio site, do navegador do
-- visitante, gravando o evento) — mas ninguém, a não ser o service_role
-- (usado só pela Edge Function admin-write, protegida por senha), consegue
-- LER. Sem policy de select pra anon/authenticated = leitura negada por
-- padrão.
create table if not exists public.match_events (
  id bigint generated always as identity primary key,
  event_type text not null check (event_type in ('page_view', 'session_complete', 'match')),
  visitor_id text not null,
  session_id text not null,
  item_id text,
  item_name text,
  item_brand text,
  created_at timestamptz not null default now()
);

create index if not exists match_events_type_created_idx on public.match_events (event_type, created_at);
create index if not exists match_events_visitor_idx      on public.match_events (visitor_id);
create index if not exists match_events_item_idx          on public.match_events (item_brand, item_name);

alter table public.match_events enable row level security;

drop policy if exists "match_events_public_insert" on public.match_events;
create policy "match_events_public_insert"
  on public.match_events
  for insert
  with check (true);
