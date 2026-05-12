## Objetivo

Adicionar botão **"Trocar de mesa"** dentro do diálogo de detalhes da comanda, na tela do **Garçom** (`src/pages/Waiter.tsx`), permitindo mover uma comanda aberta de uma mesa para **outra mesa livre**, sem alterar nenhum fluxo existente.

**Rollout:** apenas **Lancheria da I9** nesta v1 (mesmo gating do `isI9` já usado na página).

## Decisões confirmadas

1. **Mesa destino:** apenas mesas **livres** (sem comanda aberta). Mesa ocupada não aparece na lista.
2. **Escopo:** transfere a comanda **inteira** (todos os itens, incluindo já enviados à cozinha). Histórico fica íntegro pois apenas o `table_id` da `tabs` muda.
3. **Permissão:** qualquer **garçom logado** (ou admin) pode mover qualquer comanda aberta da empresa.
4. **Cozinha:** **não reimprime nada**. Mudança é administrativa.
5. **Auditoria:** registra no campo `notes` da comanda uma linha tipo `[Transferida Mesa 3 → Mesa 7 em 12/05 21:50 por João]`. Sem nova coluna no banco.

## Mudanças

### 1. `src/pages/Waiter.tsx` (única alteração relevante)

- Importar `Sheet`/`Dialog` simples de seleção de mesa (reutilizar `Dialog` já em uso).
- Dentro do diálogo de detalhes da comanda aberta, **adicionar um botão secundário** "Trocar de mesa" ao lado de "+ Adicionar Itens", visível apenas quando:
  - `isI9 === true` (mesmo gating já existente)
  - comanda tem `table_id` (ou seja, está vinculada a uma mesa)
  - comanda está `open`
- Ao clicar:
  1. Abre dialog "Selecionar nova mesa"
  2. Lista as mesas da empresa filtrando: `status === 'available'` **e** sem comanda aberta vinculada
  3. Garçom seleciona → confirmação rápida ("Mover comanda #N da Mesa X para Mesa Y?")
  4. Executa transferência

### 2. Função de transferência (frontend, sem hook novo)

Função local em `Waiter.tsx`, chamando Supabase diretamente (segue o padrão da página). Operações sequenciais:

```text
1. UPDATE tables  SET status='available' WHERE id = mesa_origem
2. UPDATE tables  SET status='occupied'  WHERE id = mesa_destino
3. UPDATE tabs    SET table_id = mesa_destino,
                      notes    = COALESCE(notes,'') || E'\n[Transferida ...]'
                  WHERE id = comanda_id
4. refetch
```

Toast de sucesso e fecha o sub-dialog. Em caso de erro, toast destrutivo (sem rollback complexo: a próxima ação corrige).

### 3. Não mexer

- **Nada** em `useTabs.ts`, `MesaQR.tsx`, PDV V1/V2, hooks de pedidos, impressão, TEF, WhatsApp.
- Nenhum item de menu novo, nenhum módulo novo, nenhuma migration.
- Nenhuma alteração de RLS — as policies atuais de `tabs`/`tables` já permitem `update` por usuários da empresa.

## Detalhes técnicos

- **Gating Lancheria I9:** mesma constante/condição `isI9` já usada na página para mostrar `PDVV2CategoryBrowser`.
- **Lista de mesas livres:** `useTables({ companyId })` já existe; cruzar com `openTabs` (de `useTabs`) para excluir mesas com comanda aberta.
- **Auditoria simples** no `notes` evita migration. Formato:
  `[Transferida Mesa {origem} → Mesa {destino} em {dd/MM HH:mm} por {profile.full_name || email}]` (timezone America/Sao_Paulo).
- **Sem reimpressão:** nenhuma chamada para `printProductionTicket` ou afins.
- **UX:** botão `variant="outline"`, ícone `ArrowLeftRight` do `lucide-react`. Tamanho idêntico ao "+ Adicionar Itens" para alinhar.

## Changelog

Adicionar entrada em **Novidades** (regra do projeto):
> "Garçom (Lancheria I9): novo botão **Trocar de mesa** dentro da comanda — move a comanda inteira para outra mesa livre, com registro automático nas observações."

## Fora de escopo (v1)

- Mesclar comandas ao mover para mesa ocupada.
- Coluna dedicada de auditoria (`transfer_log` jsonb).
- Limitar transferência por dono da comanda.
- Reimpressão na cozinha.
- Liberar para outras lojas (só após validação na I9).
