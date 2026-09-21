# Tela branca geral na Bon Appetit — correção com impacto mínimo

## Situação confirmada

- A versão **1.72.2-beta** já está publicada em `app.comandatech.com.br`.
- Em navegador limpo, a tela de entrada e o cardápio da Bon Appetit abrem normalmente, sem erro de página ou falha de carregamento.
- Na loja, a tela branca ocorre em computador e celular usando o endereço principal.
- Portanto, a falha que falta reproduzir depende do estado do navegador, da sessão ou do caminho após entrar; a causa exata ainda será confirmada antes da correção.

## Etapa 1 — Tornar qualquer falha visível antes do aplicativo abrir

- Manter uma tela de carregamento independente do aplicativo até a primeira tela realmente aparecer.
- Capturar falhas que acontecem antes da proteção atual conseguir iniciar.
- Trocar qualquer retorno vazio durante redirecionamentos e verificações por uma tela visível com **Recarregar**.
- Evitar recargas automáticas repetidas; cada navegador poderá tentar a recuperação automática apenas uma vez.

## Etapa 2 — Isolar o estado antigo nos aparelhos afetados

- Detectar arquivos antigos misturados com a versão atual e remover somente o cache técnico do aplicativo.
- Preservar sessão, preferências operacionais e todos os dados da loja.
- Se a sessão salva estiver inválida, mostrar a tela de entrada em vez de deixar a página branca.

## Etapa 3 — Reproduzir o caminho autenticado da Bon Appetit

- Testar a abertura pelo endereço principal com a sessão da Bon Appetit.
- Conferir entrada, redirecionamento inicial e primeira tela da loja.
- Registrar o erro exato no navegador sem exibir dados sensíveis.
- Corrigir somente o ponto confirmado, sem alterar regras de venda ou configurações de outras lojas.

## Etapa 4 — Publicar com retorno seguro

- Publicar uma versão de correção com verificação automática do site, entrada e cardápio da Bon Appetit.
- Validar em tamanhos de computador e celular.
- Se a verificação falhar, retornar automaticamente à versão anterior.
- Registrar a correção em **Novidades** e confirmar a versão efetivamente entregue pelo servidor.

## Limites de segurança

- Nenhum dado será apagado, regravado ou sincronizado.
- Nenhuma venda, caixa, pedido ou fila de impressão será alterada.
- Nenhuma NFC-e será emitida, reemitida, cancelada ou inutilizada.
- TEF/PinPad não será alterado nem testado.
- As demais lojas continuarão operando durante a publicação.
