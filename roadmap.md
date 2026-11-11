# Roadmap — Retomada ComandaTech

## Frente de Caixa — NFC-e obrigatória com TEF
- [x] Ocultar pré-venda com TEF alocado e forçar fiscal no checkout/atalho e no registro da venda; 10 testes aprovados, build OK, sem alterar motor TEF, vendas existentes ou emitir notas.
- [ ] Validar checkout autenticado da loja — sessão disponível é de revendedor e redireciona Frente de Caixa para Home; sem cobrança real ou transmissão fiscal e sem publicação.

## NF-e modelo 55 — ajustes autorizados
- [x] Adicionar edição/exclusão protegidas das rejeitadas, duplicação, menu das autorizadas e cancelamento confirmado; 36 testes aprovados, sem emissão/evento fiscal real. Reabertura preserva snapshot e external_id; exclusão não permite chave/protocolo.
- [ ] Habilitar envio de e-mail e CC-e — bloqueado: endpoints/contrato do serviço fiscal não documentados ou acessíveis; opções exibem indisponibilidade, sem simular envio.
- [ ] Validar edição e ações com documentos reais da loja — bloqueado: sessão de revendedor retorna “Permissão negada” ao acessar Cozinha da Ruiva; não emitir testes.
- [x] Preparar espelho SQL da exclusão segura para deploy automático na VPS (pipeline inclui apenas novos arquivos *_auto.sql); implantação não disparada.
- [x] Corrigir código do produto no formulário e proxy NF-e (`codigo`/`cProd`), com fallback código → GTIN → identificador cadastrado e compatibilidade com rascunhos; 31 testes aprovados e produto real selecionado/visualizado na Cozinha da Ruiva, sem transmissão fiscal, gravação ou publicação.
- [x] Resolver IBGE por CEP ao selecionar cliente/reabrir rascunho, impedir transmissão com campos inválidos e exibir pendências e detalhes fiscais; 24 testes aprovados e painel/CEP real verificados no navegador, sem emissão nem publicação.
- [ ] Confirmar fluxo com cliente e produto reais na Cozinha da Ruiva após implantação — sessão de revendedor disponível não assumiu contexto da loja; transmissão fiscal não realizada.
- [x] Remover troco e preencher automaticamente total/saldo nas formas de pagamento, sem alterar NFC-e/TEF.
- [x] Exibir motivo real das falhas de transmissão, preservando erros de acesso; resposta HTTP 422 simulada mostrou o motivo, sem transmissão fiscal.
- [x] Implementar estrutura A4 da referência no espelho DANFE, mantendo pré-visualização sem chave/protocolo inventados; renderer XML autorizado em piloto Cozinha da Ruiva.
- [x] Validar seleção de produto real da Cozinha da Ruiva, total automático R$3,20 e pré-visualização no navegador; sem emitir notas ou publicar.
- [ ] Validar impressão física e XML autorizado da NF-e no piloto; requer documento autorizado disponível e implantação autorizada na VPS. Igualdade exata ao PDF ainda não confirmada.

## Cupom NFC-e — Cozinha da Ruiva
- [x] Corrigir leitura do XML persistido (`xml_content`, com fallback legado `xml_retorno`); 11 testes aprovados e cupom conferido no navegador com XML simulado R$10 dinheiro + R$5 PIX, sem emitir notas ou publicar.
- [x] Exibir pagamentos do XML com fallback ao payload e troco, somente no piloto Cozinha da Ruiva; sem alterar emissão, TEF ou XML.
- [x] Validar testes e layout digital: 8 testes aprovados e HTML real conferido no navegador com valores simulados R$ 10 dinheiro + R$ 5 PIX, sem emissão.
- [ ] Validar cupom de venda real e impressão física na Cozinha da Ruiva — depende de publicação autorizada e teste na impressora da loja; portal SEFAZ não foi alterado.

## Endereços — pacote aprovado
- [x] Ajustar CEP específico/geral no campo Bairro, feedback da busca e sugestões exclusivas Casa/Trabalho; ocultar Cidade/UF nos três formulários. 21 testes aprovados; formulário floral verificado no computador/celular com CEP simulado, sem pedido real.
- [ ] Realizar deploy dos ajustes de endereço na VPS conforme pedido atual — bloqueado: arquivos novos ainda ausentes no repositório GitHub (consulta confirmou 404); acesso direto à VPS não disponível nesta sessão. Não disparar deploy de versão anterior.
- [x] Isolar dados ao trocar telefone, cancelar respostas antigas e carregar o novo cadastro.
- [x] Novo, edição, apelidos, padrão, exclusão confirmada e prevenção de duplicados no catálogo e destinatário floral.
- [x] CEP opcional nos dois formulários; 21 testes aprovados e formulário floral verificado com dados simulados em desktop/celular, sem pedido/venda real.
- [ ] Validar leitura/gravação com cadastros reais na VPS após deploy autorizado — catálogo Terra Viva não disponível no preview; não publicado.

## Correção aprovada — divisão de mesas
- [x] Repassar valor parcial e forma inicial sem tratá-los como pagamento aprovado.
- [x] Preservar itens adicionais ao abrir Dividir formas e ao retomar cobrança persistida.
- [x] Impedir fechamento por itens enquanto houver itens ou saldo pendente, conferindo o estado persistido.
- [x] Exigir duas cobranças no fluxo de divisão e proteger contra duplo clique; 28 testes passaram e fluxo visual simulado R$ 50 + R$ 52 finalizou uma vez, sem venda ou nota real.
- [ ] Validar cobrança real dinheiro + TEF na Bon Appétit após deploy autorizado — bloqueado: sessão disponível é de revendedor e não dá acesso ao caixa da loja; PinPad físico não disponível.

## Perfil Floricultura
- [x] Ajustar origens para Balcão e Catálogo Online e padronizar a terminologia de catálogo nas telas da floricultura, sem alterar restaurantes; testes de isolamento aprovados, sem publicação.
- [x] Dashboard floral: títulos destacados, divisão das colunas, agenda única com tags, filtros data/turno e ordem por entrada no mesmo turno; 13 testes aprovados, sem publicação.
- [x] Turnos de entrega por dia da semana em Configurações > Horários (tabela company_delivery_shifts, catálogo filtra por dia; sem turnos no dia = sem entrega; sem cadastro = grade padrão 2h); 7 testes aprovados.
- [x] Aviso diário de agendamentos virou notificação no canto inferior direito, some em 5s (pausa com mouse em cima, botão ✕).
- [ ] Espelhar migração company_delivery_shifts na VPS antes de publicar (produção está na VPS).
- [ ] Validar os filtros na dashboard real da floricultura — Terra Viva não disponível entre as lojas da sessão autenticada do preview.
- [x] Criar perfil adicional isolado por empresa, com identidade verde e linguagem de catálogo
- [ ] Validar regressão em restaurante e piloto isolado antes de qualquer liberação geral

- [x] Preparar acionamento único 21/09/2026 00:00 BRT (somente diagnóstico + cópia de retorno do frontend)
- [x] Fixar uma única configuração de produção (publicação e validação usam só api.comandatech.com.br)
- [x] Retorno automático para a versão anterior se o teste após publicação falhar
- [x] Instaladores de impressão alinhados ao endereço de produção (ajustável por loja)
- [x] Versão 1.72.0-beta registrada em Novidades
- [x] Proteção independente contra tela branca e recuperação de arquivos antigos (1.72.3-beta)
- [x] Corrigir abertura do PDV no Safari/iPhone sem carregamento separado (1.72.4-beta)
- [x] Corrigir queda da Dashboard por pedido cancelado sem aparência definida (1.72.5-beta)
- [ ] Confirmar acesso efetivo à VPS (chave SSH não disponível nesta sessão) — bloqueado
- [ ] Inventário por loja e correção de divergências (etapa 4) — depende do acesso
- [ ] Piloto Lancheria da I9 (etapa 5) — depende do acesso e do responsável da loja
- [ ] Liberação gradual das demais lojas (etapa 6)
- [ ] Estabilização, contingência e relatório final (etapas 7-8)
- [ ] Validar impressão física piloto: Rei do Açaí com recibo V39 sem comanda; Bon Appetit com recibo + comanda — código validado, aguarda publicação e teste autorizado
- [x] Ajustar os sete detalhes visuais do recibo V39 do Rei do Açaí no programa v1.8.6; validação física ainda depende da loja
- [x] Ajustar separação entre produtos, troco e subtotal redundante no recibo do Rei do Açaí (sistema 1.74.11-beta / impressor 1.8.7); validação física ainda depende da loja
- [ ] Após validação física dos pilotos, liberar recibo obrigatório independente da comanda para as demais lojas

## Comanda individual (piloto I9) — plano v3.1 aprovado
- [ ] Banco: comanda_number, lista liberada, opção, reservas de fração, cobranças, funções com trava no servidor
- [ ] Opção nas configurações de Mesas (só lojas da lista)
- [ ] Garçom: número da comanda digitado ou lido pela câmera
- [ ] QR da mesa: número da comanda (só comanda aberta na mesma mesa; senão pendente)
- [ ] Janela "Cobrar Comanda" (várias comandas + importar fração) no Frente de Caixa / Mesas PDV V2
- [ ] Novidades + versão
- [ ] Espelhar banco na VPS antes de publicar — bloqueado: sem acesso à VPS nesta sessão
- [ ] Confirmar formato do código do cartão (leitura real) — aguarda usuário
- [ ] Decisões: frações, taxa de serviço, tempos — aguarda usuário

### Comanda individual — status da UI (piloto I9)
- [x] Opção nas configurações de Mesas (só lojas liberadas)
- [x] Garçom: número da comanda digitado ou pela câmera; transferência entre mesas
- [x] QR da mesa: campo do número da comanda (trava no servidor)
- [x] Cobrança: Frente de Caixa (menu lateral) e PDV V2 (lojas sem Frente de Caixa), várias comandas + importar 1/2, 1/4, 1/5, 1/8, 1/10
- [ ] Teste real na I9 (ligar a opção e testar com cartões) — aguarda usuário
- [ ] Espelhar banco e função do QR na VPS antes de publicar — sem acesso à VPS nesta sessão
- [ ] Novidades + versão 1.76.0-beta

- [x] Floricultura Etapa 1: tabela de dados do presente + regras (turnos 2h, cartão grátis, dedicatória manuscrita) — só perfil floricultura
- [ ] Floricultura Etapa 2: checkout guiado no catálogo
- [ ] Floricultura Etapa 3: destaque nos pedidos (copiar mensagem)
- [ ] Espelhar tabela order_gift_details na VPS antes de publicar

## Floricultura — destino por produto
- [x] Presente / para mim → retirada ou entrega no produto (após adicionais), data+turno, destinatário, endereço e cartão
- [x] Taxa por endereço de entrega distinto; endereço "para mim" preenche o cadastro
- [x] Popup de primeira compra; cupom oculto sem cupom ativo (só floricultura)
- [ ] Comanda de produção física separada por destino — itens já saem marcados "DESTINO N"; separar o papel exige ajuste na impressora, liberado só com autorização (regra de impressão por loja)
- [ ] Etapa 3: presente em destaque nos pedidos com botão Copiar
