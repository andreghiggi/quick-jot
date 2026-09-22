# Atualização automática (Bon Appetit e Rei do Açaí)

## O que foi verificado agora (somente leitura)

- O servidor de avisos automáticos da VPS está **no ar**: a conexão abre normalmente e aceita escuta de pedidos, mesas, comandas e itens de comanda (teste feito agora, sem tocar em dados).
- Portanto o problema não é o servidor estar desligado — é o **app não manter/renovar essa escuta** durante o uso.

## Pontos encontrados no app

1. **A escuta não é renovada quando a sessão do usuário se renova.** O app nunca avisa a conexão de avisos sobre o novo acesso. Quando a credencial vence (cerca de 1 hora), a conexão fica muda até alguém recarregar a página — exatamente o sintoma relatado.
2. **Mesas e comandas usam um "canal" de nome fixo.** Se duas telas abertas usam o mesmo nome ao mesmo tempo, a segunda escuta é recusada e nenhum aviso de mesa chega. É o caso da Bon Appetit (mesa nova só aparece recarregando).
3. **Mesas e comandas não têm rede de segurança.** Pedidos têm recarga automática a cada 15 segundos quando a escuta cai; mesas e comandas não têm nada.
4. **Itens de pedido não emitem aviso no banco.** O app tenta escutar essa tabela, o que faz a escuta inteira de pedidos falhar em alguns casos.
5. **Voltar para a aba / reconectar a internet não dispara recarga.** Depois de uma queda de internet (que já aparece nos registros do Rei do Açaí), a tela fica parada.

## O que será feito

1. Avisar a conexão de tempo real sempre que a sessão for criada ou renovada, e reconectar quando necessário.
2. Dar nome único por loja/tela aos canais de mesas e comandas, evitando recusa por nome repetido.
3. Criar rede de segurança em mesas e comandas: recarregar sozinho a cada 15 segundos enquanto a escuta não estiver ativa.
4. Recarregar dados ao voltar para a aba e ao a internet voltar (pedidos, mesas e comandas).
5. Ajustar a escuta de itens de pedido para não derrubar a escuta de pedidos (escutar só o que o banco realmente publica).
6. Subir a versão, registrar em Novidades e publicar na VPS.

## Detalhes técnicos

- `src/integrations/supabase/client.ts` não pode ser editado: a chamada de `supabase.realtime.setAuth(token)` entra em `src/hooks/useAuth.ts`, dentro de `onAuthStateChange` (eventos `SIGNED_IN`, `TOKEN_REFRESHED`, `INITIAL_SESSION`).
- `src/hooks/useTables.ts` e `src/hooks/useTabs.ts`: canal passa a `tables-changes-${companyId}-${uid aleatório}` / `tabs-changes-${companyId}-${uid}`; ler o `status` do `.subscribe()` num ref e adicionar `setInterval` de 15 s com refetch condicional, igual ao padrão já usado em `src/hooks/useOrders.ts`.
- `src/hooks/useOrders.ts`: remover a escuta de `public.order_items` (essa tabela não está na publicação `supabase_realtime`; só `orders`, `tables`, `tabs`, `tab_items` estão) e manter o refetch por `orders`, que já traz os itens.
- Listeners de `document.visibilitychange` e `window.online` chamando o refetch com debounce nos três hooks.
- Sem alterações em banco, migrações, TEF/PinPad, NFC-e, caixa ou impressão.

## Validação

- Abrir duas telas (dashboard e mesas) e confirmar que um novo pedido e uma nova mesa aparecem sozinhos.
- Deixar a tela aberta mais de 1 hora e repetir o teste (valida a renovação da sessão).
- Desligar e religar a internet e confirmar que a tela se atualiza sozinha.
