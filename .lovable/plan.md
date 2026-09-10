# Conferência pós-retorno da VPS

## O que já verifiquei (dados reais de agora)

Funcionando normalmente:
- Backend (banco e login) no ar e respondendo.
- O app aponta para a nuvem correta (projeto `iwmrtxdzlkasuzutxvhh`).
- 13 empresas presentes, 11 ativas, com produtos, formas de pagamento e módulos.
- 34 usuários e 34 logins sociais/senha preservados.
- Pedidos: 10.427 no total, com movimento normal nos dias 07, 08 e 09/09.
- Opcionais completos: 69 grupos, 642 itens, 97 vínculos de categoria, 193 de produto.
- Versão do sistema intacta: 1.71.1-beta (06/09), com o histórico de Novidades completo.
- Auto printer: arquivo do script presente, com Amore Mio e Rei do Açaí no modo gráfico como antes.
- Todas as funções de servidor estão presentes (fiscal, TEF/PinPDV, WhatsApp, impressão, backup).

Pontos que NÃO estão como antes (precisam de decisão):

1. **Vendas de PDV, notas fiscais, TEF e fila de impressão pararam em 06–07/09**, enquanto os pedidos seguem até hoje:
   - última venda de PDV: 07/09 21:19
   - última NFC-e: 07/09 10:44
   - último log de TEF: 06/09 22:27
   - última fila de impressão: 06/09 22:30
   Ou seja: o que foi vendido no caixa/fiscal/cartão durante o período na VPS provavelmente ficou lá e não voltou junto com os pedidos.

2. **Estações de impressão: 0 registros** (roteamento de comanda por categoria está vazio).

3. **Terminais PinPDV: 0 registros** (cadastro de terminais TEF vazio).

Os itens 2 e 3 podem sempre ter sido assim (configuração feita direto na loja) ou podem ter sido perdidos na ida/volta da VPS — só o backup/dump confirma.

## Plano proposto

### Etapa 1 — Confirmar o que falta (somente leitura, sem alterar nada)
- Comparar as tabelas atuais com o dump/backup feito antes da migração: estações de impressão, terminais PinPDV, vendas de PDV, notas fiscais e logs de TEF.
- Levantar, por loja, quais vendas de caixa e notas do período 07–09/09 existem na VPS e não existem aqui.
- Entregar uma lista objetiva: "isto está igual", "isto falta", "isto nunca existiu".

### Etapa 2 — Restaurar apenas o que faltar
- Reinserir estações de impressão e terminais PinPDV a partir do backup, se realmente existiam.
- Trazer de volta vendas de caixa e movimentos financeiros do período da VPS, sempre com chave de idempotência para não duplicar.
- Notas fiscais: apenas registrar o histórico já autorizado; **nenhuma nota nova será emitida e nenhum número autorizado será inutilizado**.

### Etapa 3 — Validar em operação
- Conferir login em uma loja, abrir cardápio público com opcionais, abrir o PDV e a tela fiscal.
- Confirmar com você que o auto printer de cada loja voltou a alimentar a fila de impressão.

## Detalhes técnicos
- Comparações via `read_query` contra o dump em `/mnt/documents/migracao-vps` e, se disponível, contra a API da VPS.
- Reinserções por migration com `ON CONFLICT DO NOTHING/UPDATE`, sem `DELETE` e sem tocar em outras lojas.
- Nada será alterado em `nfce-proxy`, `tef-webservice`, numeração fiscal ou nos scripts de impressão já homologados.
