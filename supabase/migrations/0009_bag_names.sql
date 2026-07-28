-- Tabela de histórico de nomes de bolsas — usada pelo gerador de nomes
-- (Gemini) tanto pra não repetir um nome já usado quanto pra servir de
-- inspiração/estilo nas próximas gerações. Guarda TODO nome confirmado,
-- seja digitado manualmente ou escolhido a partir de uma sugestão do
-- Gemini (o campo `source` distingue os dois casos).
--
-- Regras (definidas pelo usuário):
-- * Editar o nome de uma bolsa já cadastrada ATUALIZA o registro existente
--   (mesmo product_id), nunca cria um segundo registro órfão.
-- * Excluir a bolsa NÃO libera o nome — o registro em bag_names permanece,
--   só perde o vínculo com o produto (fica com product_id apontando pra um
--   id que não existe mais no catálogo). Isso é intencional: o nome nunca
--   pode ser reaproveitado.
create table if not exists public.bag_names (
  id bigint generated always as identity primary key,
  name text not null,
  -- versão normalizada (minúsculo, sem acento) só pra checagem de
  -- duplicidade — nunca exibida, sempre recalculada no servidor.
  name_normalized text not null,
  syllable_count int,
  source text not null default 'manual' check (source in ('manual', 'gemini')),
  product_id bigint,
  created_at timestamptz not null default now()
);

-- Duplicidade é decidida pelo nome normalizado (ignora maiúscula/minúscula
-- e acentuação), não pelo texto exato.
create unique index if not exists bag_names_name_normalized_key
  on public.bag_names (name_normalized);

create index if not exists bag_names_product_id_idx
  on public.bag_names (product_id);
