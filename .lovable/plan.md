# Adicionais sumidos após a migração (Rei do Açaí e outras lojas)

## O que já está confirmado

- Os adicionais dependem de 4 tabelas: os grupos, os itens de cada grupo e **duas tabelas de vínculo** (grupo→categoria e grupo→produto). Se os vínculos não vierem, os grupos existem no cadastro mas **nenhum produto mostra adicionais**.
- No pacote de exportação usado na migração existem: 69 grupos, 642 itens, 97 vínculos por categoria e 193 vínculos por produto. Ou seja, o dado de origem está completo.
- O arquivo exportado **não traz nenhuma linha de permissão de acesso (GRANT)** — só as regras de visibilidade. Num servidor próprio, tabela sem GRANT simplesmente não responde para o site.
- Nos registros do espelho antigo aparecem falhas exatamente nessas tabelas: itens de grupo rejeitados por grupo inexistente e vínculos rejeitados por chave duplicada. Se a carga na VPS usou esse mesmo caminho, os vínculos ficaram parciais.
- No código, a tela busca os vínculos **sem filtrar loja e ignorando erro em silêncio**: se a leitura falhar ou vier vazia, a tela não mostra erro nenhum — só some o botão de adicionais. Isso explica o sintoma "sumiu sem aviso".

Ainda **não confirmado**: qual das causas é a real na VPS. O banco da nuvem está pausado e não tenho acesso ao banco da VPS a partir daqui, então o diagnóstico precisa de 4 consultas rodadas lá.

## Passo 1 — Diagnóstico (rodar na VPS, só leitura)

Para a loja Rei do Açaí (e repetir para as outras que reclamaram):

```sql
-- 1) grupos e itens existem?
select count(*) from optional_groups where company_id = '<ID_LOJA>';
select count(*) from optional_group_items where company_id = '<ID_LOJA>';

-- 2) vínculos existem? (aqui é onde eu espero zero)
select count(*) from optional_group_categories c
  join optional_groups g on g.id = c.group_id where g.company_id = '<ID_LOJA>';
select count(*) from optional_group_products p
  join optional_groups g on g.id = p.group_id where g.company_id = '<ID_LOJA>';

-- 3) permissões de leitura das 4 tabelas
select table_name, grantee, privilege_type from information_schema.role_table_grants
 where table_name like 'optional_group%';

-- 4) as funções usadas pelas regras de acesso existem?
select proname from pg_proc where proname in ('user_belongs_to_company','has_role');
```

Leitura do resultado:
- Grupos > 0 e vínculos = 0 → **dados de vínculo não migraram** (causa mais provável).
- Tudo > 0 mas sem GRANT para `anon`/`authenticated` → **permissão de acesso faltando**.
- Funções ausentes → **regras de acesso quebradas**, a leitura falha para usuário logado.

## Passo 2 — Correção conforme o resultado

- **Vínculos faltando:** recarregar apenas as duas tabelas de vínculo a partir do arquivo exportado, com inserção que ignora duplicados, sem tocar em grupos, itens, produtos ou pedidos.
- **Permissão faltando:** aplicar os GRANTs de leitura/escrita nas 4 tabelas para os papéis do site.
- **Funções ausentes:** recriar as duas funções auxiliares antes de qualquer outra coisa.

Nada disso mexe em NFC-e, TEF, impressão ou caixa.

## Passo 3 — Blindagem no aplicativo (opcional, recomendado)

Na busca dos adicionais, passar a **avisar em vez de silenciar**: se a leitura dos vínculos falhar, registrar o erro e mostrar aviso, em vez de tratar como "sem adicionais". Assim uma próxima falha aparece na hora, em vez de virar reclamação de loja.

## Detalhes técnicos

- Arquivos envolvidos: `src/hooks/useOptionalGroups.ts` (linhas 59-64 e 100-108, `catLinksRes.data || []` engole o erro; as duas consultas de vínculo não filtram `company_id` e dependem 100% de RLS).
- Tabelas: `optional_groups`, `optional_group_items` (têm `company_id`), `optional_group_categories`, `optional_group_products` (**não têm `company_id`** — o escopo vem por join com `optional_groups`, por isso são as mais sensíveis a RLS/GRANT no self-hosted).
- Políticas exportadas incluem `... viewable publicly` com `USING (true)` nos vínculos e `USING (active = true)` em grupos/itens; dependem de `public.user_belongs_to_company` e `public.has_role` para o caminho autenticado.
- Fonte de dados para recarga: `public_schema_data.sql.gz` no pacote de migração, seções `COPY public.optional_group_categories` e `COPY public.optional_group_products`.
