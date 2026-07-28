-- ─── Remove a checagem fixa de categorias em bags/looks ─────────────────────
-- BUG ENCONTRADO: a tabela "bags" só aceitava cat in ('tote','shoulder',
-- 'clutch','mini') e "looks" só aceitava cat in ('colar','brinco','pulseira',
-- 'anel') — restrição definida na migração inicial (0001), quando essas eram
-- as únicas categorias que existiam.
--
-- Desde então, o painel admin passou a ter categorias extras fixas (bags:
-- crossbody, bucket, tiracolo, necessaire, sem-categoria) e, principalmente,
-- o botão "+ Nova Categoria", que deixa o admin criar categorias livres a
-- qualquer momento. Toda bolsa/peça salva com uma categoria fora da lista
-- original de 2024 era REJEITADA pelo Postgres nesse "check" — o
-- Promise.all(sbUpsertBag(...)) falhava, e o front (confirmSave em
-- index.html) engolia o erro silenciosamente, gravando só no localStorage do
-- navegador do admin. Resultado: a bolsa aparecia normalmente pra quem
-- cadastrou (cache local), mas nunca chegava no banco de verdade — por isso
-- nunca aparecia no My Favorite Match nem em qualquer outro navegador/
-- dispositivo, e as tabelas bags/looks ficavam vazias mesmo com cadastros
-- acontecendo.
--
-- A lista de categorias válidas agora vive inteiramente no admin
-- (CATS_LIST em index.html/looks.html) — o banco só garante que a categoria
-- não chegue vazia.
alter table public.bags  drop constraint if exists bags_cat_check;
alter table public.looks drop constraint if exists looks_cat_check;

alter table public.bags
  add constraint bags_cat_check  check (cat is not null and length(trim(cat)) > 0);
alter table public.looks
  add constraint looks_cat_check check (cat is not null and length(trim(cat)) > 0);
