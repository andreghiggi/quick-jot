# Bon Appetit — corrigir a falha real após a abertura

## Diagnóstico confirmado

- A produção já entrega a versão **1.72.3-beta**; portanto, não é falta de atualização.
- O site e seus arquivos principais respondem normalmente. A mensagem da imagem vem da proteção nova, o que prova que o ComandaTech iniciou e capturou uma falha interna em vez de ficar branco.
- O erro `undefined is not an object` é a mensagem do Safari quando uma tela tenta ler uma informação que não existe naquele momento.
- O caminho mais provável está na montagem da área autenticada da Bon Appetit, especialmente `/pdv-v2` e seus dados iniciais. A proteção atual mostra apenas o começo da mensagem e não registra a linha completa em produção.
- A abertura pública e a tela de login funcionam em Chromium e WebKit. O defeito depende da sessão/dados carregados depois do login, não do aparelho nem do cache.

**Do I know what the issue is?** Sim quanto à categoria: é uma exceção de renderização depois do login, não queda do servidor ou versão antiga. Ainda não é seguro afirmar qual propriedade específica está ausente porque o pacote publicado não expõe a linha e a mensagem aparece cortada.

## Etapas de menor risco

1. **Capturar o ponto exato sem tocar em dados**
   - Registrar automaticamente tela, endereço, versão, mensagem completa e pilha técnica quando a proteção for acionada.
   - Acrescentar um código curto de diagnóstico visível para relacionar o aparelho ao registro, sem mostrar tokens, senha ou dados fiscais.

2. **Isolar a área que falha**
   - Separar a proteção do menu lateral, cabeçalho, caixa e lista de pedidos para identificar qual bloco quebra na Bon Appetit.
   - Manter uma saída funcional para a loja, sem apagar a sessão e sem provocar recarregamento infinito.

3. **Corrigir somente a causa comprovada**
   - Normalizar o dado ausente ou proteger o acesso à propriedade na origem identificada.
   - Não alterar registros de vendas, caixa, pedidos, impressão, configurações, TEF/PinPad ou NFC-e.
   - Não alterar regras das demais lojas; qualquer tratamento compartilhado será apenas defensivo e compatível com os dados atuais.

4. **Validar antes de liberar**
   - Testar a sessão autenticada em WebKit/iPhone e Chromium, incluindo entrada, PDV V2, caixa e listagem de pedidos.
   - Confirmar que o erro não reaparece e que nenhuma operação de pagamento, impressão ou fiscal foi executada durante o teste.

5. **Publicar com retorno automático**
   - Publicar uma versão corretiva na VPS usando a validação já existente.
   - Se a abertura falhar, retornar automaticamente ao pacote anterior.
   - Conferir a Bon Appetit no endereço de produção e registrar a correção em Novidades.

## Restrições

- Zero alterações manuais no banco.
- Zero emissão, reemissão, cancelamento ou inutilização fiscal.
- TEF/PinPad permanece congelado.
- Nenhuma parada ou ajuste operacional nas outras lojas.
