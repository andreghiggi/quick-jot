# Cozinha da Ruiva — demora de 40s a 1min para imprimir após o TEF

## O que os dados mostram

Fiz a análise dos logs reais da loja (TEF, proxy fiscal e notas emitidas). O gargalo **não é o PinPad nem o navegador do operador**.

**1. O TEF está rápido.** Os registros de comunicação com a Multiplus nos últimos 7 dias mostram média de ~70 ms por consulta de status e ~300–400 ms para iniciar a transação. Nenhum indício de lentidão do lado do pinpad.

**2. O gargalo é a emissão da NFC-e.** As chamadas ao nosso proxy fiscal hoje tiveram mediana de ~2 s, mas com casos de 4 s, 12 s e uma de **73 segundos** — exatamente a faixa que a loja relatou.

**3. Hoje há um problema ativo e crítico:** as 4 últimas tentativas de nota voltaram com **"Invalid or expired API key"** (token da API fiscal inválido/expirado) e 1 nota ficou presa em "processando" após timeout. Ou seja, além da lentidão, a loja está sem conseguir emitir hoje. Até 02/09 as notas saíam normalmente (nº 14343 a 14379, todas autorizadas).

**4. O desenho atual soma esperas.** Quando a emissão demora, o pior caso encadeia: 20 s de timeout da emissão + 10 s da chamada de "abortar online" + 20 s da reemissão em contingência. Só depois disso a tela libera a impressão. E hoje o **comprovante do TEF só é impresso junto com a nota** — se a nota demora, o comprovante do cartão espera junto, mesmo já estando pronto desde o primeiro segundo.

## Plano de ação

### 1. Destravar a emissão (urgente, hoje)
- Validar/renovar o token da API fiscal da loja e confirmar que a nota volta a autorizar.
- Reconciliar a nota presa em "processando" pelo Monitor NFC-e (sem gerar nova numeração).

### 2. Imprimir o comprovante do TEF imediatamente (fim do "espera junto")
Assim que o pagamento é aprovado no pinpad, as vias do TEF vão para impressão na hora, sem aguardar a NFC-e. O DANFE sai em seguida, quando a SEFAZ responder. Percepção do operador cai para poucos segundos.

### 3. Reduzir o pior caso da emissão
- Baixar o timeout da emissão online de 20 s para 8–10 s, e o do "abortar online" de 10 s para 5 s. Pior caso cai de ~50–70 s para ~20–25 s.
- Em erro de autenticação (401), falhar imediatamente em vez de percorrer todo o fluxo de contingência — hoje uma chave inválida custa mais de 10 s por venda.

### 4. Acelerar a confirmação na tela
- Primeira consulta de status em 800 ms (hoje 2 s) e consultas em todas as rodadas iniciais, em vez de alternadas.
- Aproveitar o webhook fiscal como caminho principal de atualização, com a consulta apenas como rede de segurança.

### 5. Sinalizar corretamente ao operador
- Mostrar no overlay o tempo decorrido e a etapa ("aguardando SEFAZ há 12s"), para o operador não achar que o sistema travou.
- Aviso claro e imediato quando o erro for de token/credencial, com orientação de acionar o suporte — em vez da nota cair silenciosamente em contingência.

## Sobre "falha do usuário"
Não há evidência de que tempo logado ou falta de refresh causem isso. A sessão é renovada automaticamente e as chamadas lentas foram lentas do lado do servidor fiscal, não do navegador.

## Detalhes técnicos
- Arquivos envolvidos: `supabase/functions/nfce-proxy/index.ts` (timeouts `EMIT_TIMEOUT_MS`, tratamento de 401 antes do fluxo de contingência), `src/components/frente-caixa/FrenteCaixaPostSaleDialog.tsx` (desacoplar impressão TEF da resolução da NFC-e, intervalo de polling), `src/pages/FrenteCaixa.tsx` (overlay `silentPhase` com tempo decorrido).
- Alterações restritas ao fluxo da Frente de Caixa; nenhuma mudança em TEF/PinPad (mantido congelado) e nenhuma alteração de numeração ou de idempotência por `external_id`.
