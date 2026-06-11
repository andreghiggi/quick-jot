/**
 * Versão atual do Comanda Tech.
 * Incremente a cada release e adicione entrada em RELEASES (mais recente no topo).
 *
 * SemVer:
 *  - MAJOR: mudanças grandes / quebras
 *  - MINOR: nova feature
 *  - PATCH: correção de bug
 */
export const VERSION = "1.19.0-beta";
export const RELEASE_DATE = "2026-06-11"; // YYYY-MM-DD (America/Sao_Paulo)
export const CODENAME = "Frente de Caixa: rail fixo estilo Gweb + Receitas + Rel. fechamento ampliado";

export interface Release {
  version: string;
  date: string; // YYYY-MM-DD
  codename?: string;
  changes: string[];
}

export const RELEASES: Release[] = [
  {
    version: "1.19.0-beta",
    date: "2026-06-11",
    codename: "Frente de Caixa: rail fixo estilo Gweb + Receitas + Rel. fechamento ampliado",
    changes: [
      "Rail lateral direito do Frente de Caixa foi reorganizado para espelhar o PDV do Gweb: agora INICIA SEMPRE ABERTO (preferência persistida em localStorage 'frenteCaixa.menuOpen'), com toggle »/« para recolher manualmente e atalho F10 para alternar.",
      "Conteúdo enxuto e focado APENAS no fluxo de venda do PDV: card 'Acessar' (Lista, Relatórios, Recebimento, ECONF em stand-by), card 'Ações' (Inutilizar numeração, XML do mês, Contingência desativada, Sangria, Suprimento, Rel. de fechamento) e card 'Configurações' (Configurações do PDV).",
      "Itens globais (Pedidos, Clientes, Produtos, Estoque, NFC-e Monitor, Preferências, Formas de pagamento, Impressão, Configurações da NFC-e) foram REMOVIDOS do rail — continuam acessíveis pelo menu principal, sem duplicação.",
      "Nova tela 'Receitas' (rota /frente-caixa/recebimento) — equivalente ao Recebimento do Gweb. Lista entradas finalizadas combinando vendas internas do PDV (PV…) com NFC-e emitidas (NFCE…), mostrando Doc., Valor, datas de emissão/vencimento/recebimento e status (Recebida/Pendente/Cancelada). Busca por texto + filtros por Cliente, Status, Emissão inicial/final e Nº do documento (múltiplos por vírgula).",
      "Rel. de fechamento agora gera o PDF DIRETAMENTE pelo rail (item 'Rel. de fechamento'), sem precisar navegar até /relatorios/caixa. Usa o caixa aberto atual e adiciona 3 blocos vindos da análise do PDF do Gweb: (1) Cabeçalho fiscal completo (Fantasia/CNPJ/Endereço/Telefone), (2) Movimentações Manuais listando Suprimento e Sangria com motivo, (3) Caixa Físico com Calc. Sistema × Inf. Operador × Diferença por espécie.",
      "Mudança ISOLADA ao Frente de Caixa (módulo Mercado). PDV V2, Pedido Express, OrderCardChargeDialog, runMultiPayment, runTefPayment, pinpadService, tef-webservice, nfce-proxy, TEF v1.0/v1.1/v1.2-beta, Multi-Pagamento v1.6/v1.7, CashReport, PDVV2CloseCashDialog, impressão de produção/cupom e demais fluxos homologados NÃO foram tocados.",
    ],
  },
  {
    version: "1.18.2-beta",
    date: "2026-06-10",
    codename: "Frente de Caixa: busca/cadastro de cliente estilo Gweb",
    changes: [
      "Frente de Caixa (módulo Mercado) → tela 'Finalizando venda' → Etapa 2 Cliente: agora começa COLAPSADA com o estado 'Nenhum cliente vinculado' + botão 'INFORMAR CLIENTE' — espelha o PDV do Gweb. Os 3 campos abertos (Nome/Telefone/CPF) foram substituídos por um modal dedicado.",
      "Novo modal 'Buscar pessoas (clientes)': campo único que pesquisa CPF/CNPJ, nome OU telefone (debounce 280ms) sobre a base de clientes da loja. Lista resultados com nome + telefone + CPF, clique seleciona, duplo-clique já confirma.",
      "Botão 'CADASTRAR PESSOA' abre formulário rápido (Nome, Telefone, CPF) DENTRO do mesmo modal — sem sair do checkout. Ao salvar, o cliente é inserido em `customers` (multi-tenant via company_id) e já vinculado à venda.",
      "Quando o termo digitado tem 11+ dígitos e não retorna nada, aparece atalho 'Usar X como CPF/CNPJ no cupom' que preenche apenas o documento sem criar cadastro — preserva o fluxo de quem só quer o CPF na NFC-e.",
      "Cliente vinculado aparece como chip compacto na etapa 2 com botões 'Alterar' / 'Remover'. CPF/Telefone continuam fluindo para `runMultiPayment` e dali para o `nfce-proxy` exatamente como antes.",
      "Atalhos A–Z / Ctrl+1/2/3 / Home / Esc do checkout ficam SUSPENSOS enquanto o modal de cliente está aberto para não conflitar com a digitação.",
      "Mudança isolada: PDV V2, Pedido Express, OrderCardChargeDialog, runMultiPayment, nfce-proxy, TEF v1.0/v1.1/v1.2-beta, impressão e demais fluxos homologados não foram tocados.",
    ],
  },
  {
    version: "1.18.1-beta",
    date: "2026-06-10",
    codename: "Multi-pagamento v1.7.2 — auto-finalizar + trava até registrar",
    changes: [
      "Correção crítica no Multi-pagamento sequencial (PDV V2, Cobrar Comanda/Mesa, Pedido Express, Cobrar Pedido do Cardápio): quando o operador zerava o saldo restante (última cobrança TEF aprovada), o modal NÃO finalizava sozinho — esperava o clique manual em 'Finalizar venda (NFC-e)'. Se o operador fechava o modal/atualizava a tela nesse ponto, o PinPad já tinha cobrado o cliente mas a venda NUNCA era registrada no caixa, a NFC-e não saía e a comanda continuava em aberto (caso Bon Appetit / Mesa 11 / Comanda #268).",
      "Agora, assim que o restante chega a R$ 0,00, o modal AUTO-FINALIZA: dispara onConfirm (addSale + NFC-e quando aplicável) e só depois marca a cobrança como completed — sem depender do clique do operador.",
      "Trava de saída reforçada: o modal só libera o fechamento depois que markCompleted gravar status='completed' no servidor. Antes, com o restante zerado mas a venda ainda não registrada, o modal era 'fechável' — agora continua travado até a venda existir de fato.",
      "Se onConfirm falhar (ex.: erro de rede ao gravar a venda), o modal NÃO marca como completed: continua travado mostrando o erro, e o operador pode tentar finalizar de novo ou usar 'Cancelar e estornar tudo' (CNC automático nos TEFs aprovados).",
      "Nada de runTefPayment, pinpadService, tef-webservice, nfce-proxy, runMultiPayment, single-payment, splits por pessoas/itens, TEF v1.0/v1.1/v1.2-beta foi alterado — a mudança está isolada ao PDVV2SequentialPaymentDialog.",
    ],
  },
  {
    version: "1.18.0-beta",
    date: "2026-06-09",
    codename: "Frente de Caixa: menu de contexto e ajustes por item",
    changes: [
      "Frente de Caixa (módulo Mercado): novo MENU DE CONTEXTO ao clicar com o botão direito sobre qualquer item do carrinho — espelha o PDV do Gweb. Duas ações: 'Alterar preço' (atalho Home) e 'Editar detalhes' (atalho Ctrl+D). Atalhos agem sobre o último item tocado.",
      "Novo modal 'Alteração no preço do item': 3 modos selecionáveis com hotkeys — Desconto (−), Alteração no valor unitário (=) e Acréscimo (+). Tudo por linha, separado do desconto/acréscimo da venda toda. Múltiplas aplicações somam.",
      "Novo modal 'Editar detalhes' (aba IDENTIFICAÇÃO — aba ADICIONAIS ainda não disponível): edita quantidade, valor unitário e desconto da linha, mostra Código/GTIN, Quantidade convertida e Valor total recalculado em tempo real. Botão REMOVER (vermelho) no rodapé esquerdo descarta a linha.",
      "Cada linha do carrinho agora mostra o preço efetivo, com o preço original riscado quando há override, além de chips '− R$ X,XX desc.' / '+ R$ Y,YY acr.' separados. O Total da venda recalcula com tudo somado/abatido.",
      "Persistência: os ajustes por item são registrados em 'notes' da venda como linhas separadas ('Item N PRODUTO: preço A → B', 'Item N PRODUTO: desconto R$ X', 'Item N PRODUTO: acréscimo R$ Y') para auditoria. O pdv_sale_items grava unit_price efetivo da linha (override + desconto/acréscimo distribuídos).",
      "Nada de PDV V2, OrderCardChargeDialog, Pedido Express, TEF v1.0/v1.1/v1.2-beta, Multi-Pagamento v1.6/v1.7, NFC-e, impressão ou demais fluxos homologados foi tocado. Os novos diálogos vivem isolados em src/components/frente-caixa/.",
    ],
  },
  {
    version: "1.17.0-beta",
    date: "2026-06-09",
    codename: "Frente de Caixa: tela Finalizando venda",
    changes: [
      "Frente de Caixa (módulo Mercado): nova tela 'Finalizando venda' inspirada no PDV do Gweb, substituindo o diálogo de pagamento simples. Layout em 2 colunas — resumo financeiro à esquerda (produtos, desconto, acréscimo, total geral) e wizard de 3 etapas à direita.",
      "Etapa 1 — Pagamentos: multi-pagamento nativo com todas as formas ativas do canal PDV listadas, cada uma com atalho de letra (A, B, C, D…) para focar o campo de valor. Pressionar Enter com o campo vazio preenche automaticamente o saldo restante. Contador 'Pagamentos / Falta' em tempo real, com 'Falta' em vermelho enquanto > 0. SALVAR só habilita quando Falta = 0.",
      "Botão 'Desconto/Acréscimo (Home)' abre painel inline para informar valores em R$, recalculando o Total geral.",
      "Etapa 2 — Cliente (opcional, Ctrl+2): captura nome, telefone e CPF avulsos para a venda. Etapa 3 — Informações adicionais (opcional, Ctrl+3): observação livre. Ambas podem ser puladas.",
      "TEF integrado: linhas com forma TEF (PinPad/SmartPOS) disparam o PinPad pela engine runMultiPayment já homologada (v1.6) — tudo-ou-nada com estorno automático em caso de recusa parcial. NÃO altera pinpadService, tef-webservice, runTefPayment nem TEF v1.0/v1.1/v1.2-beta.",
      "Persistência: usa useCashRegister.addSale como antes, gravando combinedNotesFragment do multi-pagamento dentro de notes para auditoria e relatórios.",
      "Atalhos globais no modal: Ctrl+1/2/3 navega entre etapas, Home abre Desconto/Acréscimo, Esc fecha (com confirmação se houver valor alocado).",
      "Nada de PDV V2, OrderCardChargeDialog, Pedido Express, PDVV2PaymentDialog ou PDVV2MultiPaymentDialog foi tocado — a tela vive isolada em src/components/frente-caixa/FrenteCaixaCheckoutDialog.tsx e só é alcançável quando o módulo Mercado está ativo.",
      "NFC-e ainda NÃO é emitida automaticamente nesta tela (planejado para uma versão futura). Vendas ficam registradas no caixa normalmente.",
    ],
  },
  {
    version: "1.16.0-beta",
    date: "2026-06-09",
    codename: "Editar Pedido: entrega + forma de pagamento",
    changes: [
      "Editar Pedido (disponível em pedidos com status Pendente/Preparando) agora permite alterar TAMBÉM a forma de entrega e a forma de pagamento, além dos itens. Continua bloqueado a partir do status Pronto.",
      "Novo bloco 'Entrega' no diálogo: alterna entre Retirada e Entrega; quando Entrega, captura endereço livre e, em lojas que cobram por bairro, mostra select com a lista cadastrada. A taxa é recalculada na hora (modo bairro pega a fee do bairro escolhido; modo simples usa a taxa cidade configurada). Mudou para Retirada → taxa zera.",
      "Novo bloco 'Forma de pagamento': select com as formas ativas da loja. Dinheiro pede 'Troco para R$' (obrigatório). PIX mostra a chave configurada. A nova forma é gravada dentro de notes do pedido no mesmo formato lido pelo recibo (Pagamento: ... | Troco para R$ ... | Chave PIX: ...).",
      "Recibo é REIMPRESSO automaticamente quando entrega ou pagamento mudou (mesmo sem mexer em itens). A comanda de produção continua só saindo quando itens são adicionados/trocados — cozinha não recebe reimpressão desnecessária.",
      "Tag de auditoria expandida em notes: '[EDITADO HH:MM: itens+entrega+pagamento]' indica exatamente o que mudou.",
      "WhatsApp do cliente, quando ativo, agora menciona a mudança de modalidade (com endereço novo e taxa) e/ou a nova forma de pagamento.",
      "Nada de TEF (v1.0/v1.1/v1.2-beta), NFC-e, Multi-Pagamento, PDV V2 checkout, Pedido Express ou cardápio público foi alterado — a mudança fica isolada ao diálogo Editar Pedido.",
    ],
  },
  {
    version: "1.15.2-beta",
    date: "2026-06-06",
    codename: "Caixa: trava anti-duplo-clique na abertura",
    changes: [
      "Correção de bug: ao clicar duas vezes muito rápido em 'Abrir Caixa' (PDV V2, PDV V1 ou tela Caixas) o sistema criava DOIS caixas abertos simultâneos para a mesma loja, com um deles virando 'caixa fantasma' acumulando vendas que deveriam estar no outro.",
      "Trava tripla aplicada: (1) flag síncrona no hook impedindo segunda chamada antes da primeira terminar; (2) re-checagem no servidor antes do insert para impedir caixas vindos de outra aba/dispositivo; (3) índice único no banco (cash_registers_one_open_per_company) que garante que jamais existirão dois caixas com status='open' para a mesma loja, mesmo em condições extremas.",
      "Botão 'Abrir Caixa' agora fica desabilitado e mostra 'Abrindo...' enquanto a operação está em andamento, com o botão 'Cancelar' também travado para evitar fechamento acidental do diálogo no meio do processo.",
      "Nenhum fluxo de TEF, NFC-e, Pedido Express, Multi-Pagamento, impressão ou cardápio foi alterado.",
    ],
  },
  {
    version: "1.15.1-beta",
    date: "2026-06-06",
    codename: "Relatório de Vendas: comandas finalizadas",
    changes: [
      "Relatório de Vendas: vendas de comandas finalizadas agora deixam de aparecer como Balcão/PDV e passam a ser classificadas corretamente como Mesa (Garçom) ou Mesa QR.",
      "A identificação exibe o número da comanda e a origem mostra a mesa quando disponível, usando a venda já registrada no caixa para não duplicar faturamento.",
      "Correção isolada na aba Relatórios → Relatório de Vendas; PDV V2, Pedido Express, TEF, NFC-e, impressão e demais relatórios não foram alterados.",
    ],
  },
  {
    version: "1.15.0-beta",
    date: "2026-06-05",
    codename: "Menu lateral reorganizado: Cadastros + Ações de vendas",
    changes: [
      "Menu lateral 'Catálogo' renomeado para 'Cadastros' e reorganizado em dois sub-blocos: 'Produtos' (Categorias, Subcategorias, Produtos, Adicionais e — quando o módulo Mercado está ativo — Estoque) e 'Pessoas' (Clientes e Fornecedores).",
      "Novo menu 'Ações de vendas' agrupando Cupons, Campanhas de Vendas (quando o módulo está ativo) e Ver cardápio — antes esses itens ficavam misturados em Catálogo/Relatórios.",
      "Nova página 'Clientes' (rota /clientes) com CRUD completo (nome, telefone, CPF, data de nascimento, endereço, cidade/UF). O relatório existente em /relatorios/clientes continua intocado.",
      "Nova página 'Fornecedores' (rota /fornecedores) com CRUD completo (razão social, CNPJ/CPF, IE, contato, telefone, e-mail, endereço completo, observações, ativo/inativo). Nova tabela 'suppliers' isolada por empresa via RLS.",
      "Mudança válida para TODO o Comanda Tech (não restrita a quem tem mercado).",
      "Nenhum fluxo homologado foi alterado: TEF v1.0/v1.1/v1.2-beta, Multi-Pagamento, NFC-e, PDV V2, Pedido Express, impressão e cardápio público continuam idênticos.",
    ],
  },
  {
    version: "1.14.0-beta",
    date: "2026-06-05",
    codename: "Produtos: aba Mercado (Fase A) com tabela densa estilo Gdoor",
    changes: [
      "Página Produtos: quando o módulo Mercado está ativo, agora há duas abas — 'Cardápio' (visão atual, idêntica) e 'Mercado' (nova visão densa estilo Gdoor/Gweb).",
      "Aba Mercado: tabela paginada (50 itens por página) com colunas SKU, Produto, GTIN, Categoria, Unidade, Estoque, Mínimo, Preço e ação de editar. Busca única por nome/SKU/GTIN, filtro por categoria e filtro rápido 'Estoque ≤ mínimo' ou 'Sem GTIN'.",
      "Estoque é colorido por status (verde acima do mínimo, âmbar no mínimo, vermelho zerado, cinza sem controle) para localizar rupturas rapidamente, mesmo com 800+ itens.",
      "Edição reusa o mesmo diálogo existente — nenhum fluxo de cadastro, NFC-e, TEF, PDV V2 ou cardápio foi alterado. Quando o módulo Mercado está desligado, a página Produtos renderiza exatamente como antes.",
      "Próximas fases (não implementadas ainda): edição em página cheia tipo Gdoor, novos campos (peso, atacado, validade, CEST/ANP), sidebar de ações em massa.",
    ],
  },
  {
    version: "1.13.5-beta",
    date: "2026-06-04",
    codename: "NFC-e split: correção do colapso para 1 detPag",
    changes: [
      "Correção crítica no nfce-proxy (bloco pagamentos_split): a Fiscal Flow estava colapsando vendas multi-pagamento em um único <detPag> Dinheiro com o valor total (ex.: R$3 dinheiro + R$1 débito virava R$4 dinheiro na NFC-e). Causa: enviávamos o campo legado 'pagamento' (singular) junto com os arrays, e a Fiscal Flow priorizava o singular ignorando os arrays.",
      "Testes empíricos em homologação confirmaram: enviando apenas os arrays (pagamentos[], pag.detPag[], detPag[], formas_pagamento[]) a NFC-e sai com múltiplos <detPag> corretos. O fix removeu o campo 'pagamento' singular do bloco de split.",
      "Impacto: NFC-e de vendas com Dividir Formas passa a refletir corretamente cada forma cobrada (dinheiro + cartão + PIX, etc.) já a partir da próxima emissão.",
      "Não regrediu: single-payment (1 forma só), bloco TEF legado, runTefPayment, pinpadService, tef-webservice, TEF v1.0/v1.1/v1.2-beta, multi-pagamento sequencial v1.7, splits I9 — todos intocados. A mudança está isolada ao bloco 'if (pagamentos_split)' do nfce-proxy.",
    ],
  },
  {
    version: "1.13.4-beta",
    date: "2026-06-04",
    codename: "Multi-pagamento: valor manual + botão 'Usar restante'",
    changes: [
      "Modal 'Dividir formas de pagamento' (Pedido Express, Cobrar Pedido do Cardápio, Cobrar/Importar Comanda no PDV V2): o campo 'Valor' agora começa sempre VAZIO em cada cobrança. O operador escolhe a forma e digita o valor da linha — acabou o auto-preenchimento que fazia a 1ª forma absorver o total inteiro sem o operador perceber.",
      "Novo botão 'Usar restante (R$ X,XX)' abaixo do campo Valor: opcional, preenche o campo com o saldo restante em um clique — útil pra fechar a última linha sem digitar de novo.",
      "Permite dividir em 2, 3, 4 ou mais formas com segurança: cada linha exige escolha explícita de forma + valor.",
      "Nenhuma alteração em runTefPayment, pinpadService, tef-webservice, nfce-proxy, pagamentos_split, single-payment, splits por pessoas/itens, Importar Comanda, TEF v1.0/v1.1/v1.2-beta congelados ou reimpressão TEF.",
    ],
  },
  {
    version: "1.13.3-beta",
    date: "2026-06-04",
    codename: "Divisão por pessoas: NFC-e detalhada com itens rateados",
    changes: [
      "Cobrar pedido do cardápio + Pedido Express → Dividir por pessoas: a NFC-e parcial agora lista TODOS os itens do pedido com quantidade fracionada proporcional à parcela paga (ex.: pedido com 1× X-Burger dividido em 5 pessoas → cada parcela emite 0,200 × X-Burger), no lugar da linha única 'Parcela X - rachado'.",
      "Quantidade é fracionada (3 casas) e preço unitário preservado — somando as N parcelas o estoque baixa exatamente a quantidade original vendida (sem multiplicar a baixa pelo nº de pessoas).",
      "Centavos de arredondamento ajustados no último item de cada parcela para o somatório bater com o valor cobrado. Última parcela usa o saldo restante (remaining/totalPeople) para fechar 100% do pedido.",
      "A venda do caixa interno também passa a registrar os itens detalhados rateados — relatórios e ABC enxergam os produtos reais em vez de 'Divisão X/Y'.",
      "Nenhuma alteração em divisão por itens, PDV V2 comanda/mesa, TEF v1.0/v1.1/v1.2-beta, runTefPayment, pinpadService, nfce-proxy, multi-pagamento ou finalização do pedido.",
    ],
  },
  {
    version: "1.13.2-beta",
    date: "2026-06-04",
    codename: "Pedido Express: split por pessoas respeita nº de partes cobradas",
    changes: [
      "Pedido Express → Dividir por pessoas: corrigido bug em que o campo 'Cobrar quantas partes?' era ignorado no abatimento. Ex.: pedido R$170 dividido em 5 pessoas — ao cobrar 2 partes (R$68), o sistema só descontava 1 pessoa, permitindo que as mesmas partes fossem cobradas de novo.",
      "Agora o saldo restante é decrementado pelo número exato de partes pagas. Rótulo da venda, observação da NFC-e parcial e toast indicam o intervalo de pessoas cobradas (ex.: 'Pessoas 1–2/5').",
      "Nenhuma alteração em PDV V2 comanda/mesa, OrderCardChargeDialog (já corrigido na v1.13.1-beta), TEF v1.0/v1.1/v1.2-beta, runTefPayment, pinpadService, nfce-proxy, multi-pagamento sequencial ou rachar item.",
    ],
  },
  {
    version: "1.13.1-beta",
    date: "2026-06-04",
    codename: "Cobrar pedido: continuidade do split por pessoas",
    changes: [
      "Cobrar pedido do cardápio → Dividir por pessoas: ao reabrir a cobrança depois que uma ou mais pessoas já pagaram, o diálogo agora mostra automaticamente 'Pessoa X de N — restam Y' e o campo 'Cobrar quantas partes?' já vem limitado ao restante.",
      "Acabou o problema de o sistema esquecer o nº original de pessoas e tratar o saldo residual como um novo split (ex.: pedido R$170 dividido em 6 — depois de 4 pagamentos, o sistema mostrava 'Nº de pessoas: 2' como se fosse novo, em vez de reconhecer que faltam 2 das 6 originais).",
      "Estado do split persiste no próprio pedido (paid_items.split_state) e é limpo automaticamente quando o pedido é quitado.",
      "Nenhuma alteração em PDV V2 comanda/mesa, Pedido Express, runTefPayment, pinpadService, nfce-proxy, multi-pagamento, rachar item ou TEF v1.0/v1.1/v1.2-beta.",
    ],
  },
  {
    version: "1.13.0-beta",
    date: "2026-06-04",
    codename: "Dividir por pessoas: cobrar várias partes na mesma transação",
    changes: [
      "PDV V2 → Cobrar Comanda/Mesa → Dividir por pessoas: novo campo 'Cobrar agora quantas partes?' permite cobrar mais de uma pessoa de uma só vez (ex.: comanda de R$100 dividida em 4 — uma pessoa paga 3 partes = R$75 numa única cobrança e outra paga 1 parte = R$25).",
      "Funciona em todas as pessoas: na primeira pessoa o operador escolhe o nº de pessoas + quantas partes cobrar agora; nas pessoas seguintes o sistema mostra quantas restam e o campo já vem limitado ao restante.",
      "Cada cobrança gera uma única venda (com TEF próprio, se aplicável) e — quando o módulo fiscal está ativo — uma NFC-e parcial com observação automática ('pessoas X a Y de N').",
      "Caminho legado 'Distribuir entre os itens' (rachar) continua disponível e inalterado para quem prefere dividir item a item.",
      "Não foi alterado: runTefPayment, pinpadService, tef-webservice, nfce-proxy, single-payment, multi-pagamento sequencial (v1.7), rachar item, importar comanda single-payment, TEF v1.0/v1.1/v1.2-beta congelados.",
    ],
  },
  {
    version: "1.12.1-beta",
    date: "2026-06-04",
    codename: "Multi-pagamento v1.7.1 — NFC-e opcional quando não há TEF",
    changes: [
      "Correção no modal 'Dividir formas' (Pedido Express, Cobrar Pedido do Cardápio, Cobrar Comanda/Mesa no PDV V2): NFC-e não é mais emitida automaticamente quando a divisão é feita só em dinheiro/PIX manual.",
      "Agora o modal mostra o seletor 'Só Venda / Venda com NFC-e' — mesma lógica do pagamento de uma forma só. Padrão: Só Venda.",
      "Quando qualquer uma das cobranças é TEF (cartão), a NFC-e continua sendo emitida automaticamente (obrigatória por lei) — o seletor é substituído por um aviso informando isso.",
      "Lojas sem o módulo Fiscal não veem o seletor.",
      "Nada de TEF v1.0/v1.1/v1.2-beta, pinpadService, tef-webservice, nfce-proxy, pagamentos_split, single-payment ou splits I9 foi alterado.",
    ],
  },
  {
    version: "1.12.0-beta",
    date: "2026-06-04",
    codename: "Multi-pagamento sequencial v1.7 (modal travado + retomada)",
    changes: [
      "Multi-pagamento agora é SEQUENCIAL: ao clicar em 'Dividir formas' (Pedido Express, Cobrar Pedido do Cardápio, Importar/Cobrar Comanda/Mesa no PDV V2), o modal cobra uma forma de cada vez. Você escolhe a forma, informa o valor e clica em 'Cobrar' — a cobrança vai direto pro PinPad/registro e o restante atualiza. Repita até zerar.",
      "Quando a forma escolhida é TEF, agora aparece o seletor de modalidade (Crédito à vista, Débito, Parcelado com Nº de parcelas + ADM/Loja, ou PIX) ANTES da cobrança — igual ao fluxo single-payment do PDV V2.",
      "Modal TRAVADO enquanto houver valor restante: não dá pra fechar com X, clicar fora ou apertar ESC. A saída só libera depois de quitar 100% ou usar 'Cancelar e estornar tudo' (que faz CNC automático no PinPad em cada TEF aprovado).",
      "RETOMADA AUTOMÁTICA: se o sistema cair / o navegador fechar / faltar luz no meio da cobrança, ao reabrir o mesmo pedido/comanda/mesa o sistema reidrata as cobranças já aprovadas e mostra o restante exato para continuar de onde parou. Persistência via nova tabela 'pdv_v2_open_charges'.",
      "Recusa NÃO faz rollback automático: se a 3ª cobrança for negada, as 2 aprovadas continuam ativas e o operador escolhe outra forma/valor pro restante. Rollback só acontece se o operador clicar em 'Cancelar e estornar tudo'.",
      "NFC-e (quando módulo fiscal está ativo) só é emitida ao FINALIZAR com restante = 0, mantendo o mesmo formato 'pagamentos_split' com várias <detPag>.",
      "Liberado para TODAS as lojas com PDV V2.",
      "NÃO foi alterado: runTefPayment, pinpadService, tef-webservice, nfce-proxy, PDVV2PaymentDialog single-payment, splits I9 (por pessoa / por itens), Importar Comanda, TEF v1.0/v1.1/v1.2-beta congelados, reimpressão TEF.",
    ],
  },
  {
    version: "1.11.1-beta",
    date: "2026-06-03",
    codename: "Cupons: troca de Frete grátis por Cupom secreto",
    changes: [
      "No cadastro de Cupons, a opção 'Frete grátis' foi substituída pela opção 'Cupom secreto'. Cupons marcados como secretos NÃO aparecem no banner do topo do cardápio — só são aceitos quando o cliente digita o código manualmente.",
      "Removidos do banco os campos 'coupons.free_shipping' e 'orders.free_shipping_applied' (não estavam em uso por nenhuma loja em produção). Em troca, foi criada a coluna 'coupons.is_secret'.",
      "Nenhuma outra lógica do cardápio, checkout, PDV, TEF, NFC-e, impressão ou WhatsApp foi alterada.",
    ],
  },
  {
    version: "1.11.0-beta",
    date: "2026-06-03",
    codename: "Cupons de desconto (cardápio online) — beta",
    changes: [
      "Novo menu lateral 'Cupons' (em Catálogo): permite criar cupons de desconto para o cardápio online com código, tipo (percentual % ou valor fixo R$), valor mínimo do pedido (se em branco, vale pro cardápio todo), desconto máximo opcional, toggle de cupom secreto (não aparece no banner), validade inicial/final e limite de usos.",
      "Cardápio público mostra um banner clicável no topo (acima das categorias) sempre que houver cupom ativo. Ao tocar, abre uma janela com todos os cupons disponíveis, regras e botão de copiar código.",
      "No checkout do cardápio, o cupom é aplicado AUTOMATICAMENTE quando o cliente atinge as condições (subtotal ≥ valor mínimo). Aparece linha 'Desconto' verde no resumo e o total já desconta o cupom. Cliente também pode digitar/colar um código manualmente.",
      "Mensagem do WhatsApp do pedido agora inclui 1 linha 'Cupom: CODIGO  -R$ X,XX' quando há cupom aplicado. Sem cupom, a mensagem fica idêntica à atual.",
      "Pedidos passam a registrar 'coupon_code' e 'discount_amount' (campos opcionais e nullable — pedidos antigos continuam funcionando).",
      "Escopo desta fase: APENAS cardápio online. PDV, PDV V2, Pedido Express, Mesa QR, Garçom, TEF (v1.0/v1.1/v1.2-beta), Multi-Pagamento e NFC-e NÃO foram tocados.",
    ],
  },
  {
    version: "1.10.1-beta",
    date: "2026-06-03",
    codename: "Cadastro de produto para mercado — beta",
    changes: [
      "Fase 3.1 do módulo Mercado: o diálogo 'Novo Produto' agora exibe o bloco 'Dados de mercado' (GTIN, SKU, unidade de medida, regra de tributação, controle de estoque com saldo inicial e estoque mínimo) APENAS para lojas com o módulo Mercado ativo.",
        "Aviso amarelo educativo no diálogo lista o que está faltando ('Sem GTIN não bipa', 'Sem regra tributária NFC-e pode rejeitar'), sem bloquear o salvamento.",
      "Quando 'Controlar estoque' é marcado e há saldo inicial > 0, o sistema cria automaticamente um movimento do tipo 'initial' em stock_movements — o produto já aparece em /estoque com saldo e histórico correto.",
      "Lojas SEM o módulo Mercado não veem nenhuma diferença no cadastro de produtos — o diálogo continua exatamente como antes.",
      "Nenhum fluxo de PDV V2, Pedido Express, TEF (v1.0/v1.1/v1.2-beta), Multi-Pagamento, NFC-e ou impressão foi alterado.",
    ],
  },
  {
    version: "1.10.0-beta",
    date: "2026-06-03",
    codename: "Controle de Estoque (mercado) — beta",
    changes: [
      "Fase 3 do módulo Mercado: produtos agora podem ter controle de estoque individual. Em Produtos, ao editar um item, aparece a seção 'Controle de estoque' (apenas para lojas com módulo Mercado ativo) com saldo atual e estoque mínimo.",
      "Baixa automática no Frente de Caixa: cada venda dispara automaticamente o débito do estoque dos produtos com 'Controle de estoque' ativado, registrando o movimento no histórico. Produtos sem rastreio continuam vendendo normalmente, sem qualquer mudança de comportamento.",
      "Nova tela 'Estoque' (rota /estoque) no menu Catálogo, visível só com módulo Mercado: lista todos os produtos rastreados com saldo atual, alerta de mínimo (vermelho = zerado, amarelo = abaixo do mínimo, verde = OK), filtros por categoria/busca e exportação CSV.",
      "Ações por produto: Entrada manual (nota fiscal de fornecedor), Saída manual (perda/quebra), Ajuste de inventário (define um saldo novo direto) e Histórico completo de movimentos com data, tipo, quantidade, saldo resultante e observação.",
      "Nova tabela 'stock_movements' grava todo o histórico (vendas, entradas, saídas, ajustes). Função SQL 'apply_stock_movement' faz a baixa atomicamente — se o produto não tem rastreio ativo, é no-op silencioso.",
      "Não regressivo: lojas sem módulo Mercado não veem nada novo. Pedido Express, PDV V2, TEF v1.0/v1.1/v1.2-beta, Multi-Pagamento, NFC-e e impressão NÃO foram tocados. A baixa só ocorre via Frente de Caixa nesta fase — Pedido Express ainda não dá baixa (será fase seguinte se validado em piloto).",
    ],
  },
  {
    version: "1.9.0-beta",
    date: "2026-06-03",
    codename: "Frente de Caixa (mercado) — beta",
    changes: [
      "Nova tela 'Frente de Caixa' (rota /frente-caixa) disponível apenas para lojas com o módulo 'Mercado' ativo — pensada para mini mercados e lojas de conveniência que vendem produtos com código de barras.",
      "Operação 100% por leitor: input sempre focado, bipe → produto entra na lista, Enter adiciona, F2 finaliza, F4 remove o último item, Esc cancela a venda.",
      "Busca aceita GTIN exato, SKU exato ou nome parcial. Atalho '3*7891234567890' adiciona 3 unidades de uma vez. Feedback sonoro curto para sucesso/erro.",
      "Finalização reusa o diálogo de pagamento do PDV V2 (canal PDV) e registra a venda no caixa atual via fluxo já existente — nenhum dado novo no banco.",
      "TEF integrado ainda NÃO disponível na Frente de Caixa nesta versão beta; ao escolher uma forma TEF, o sistema avisa para usar o PDV V2. NFC-e/impressão automática virão na próxima iteração.",
      "Item 'Frente de Caixa' aparece no menu lateral apenas quando o módulo 'Mercado' está ativo. PDV V2, Pedido Express, Cobrança, TEF v1.0/v1.1/v1.2-beta e Multi-Pagamento NÃO foram alterados.",
      "Rollout isolado: módulo 'Mercado' continua desligado por padrão — ativar manualmente em Admin → Módulos da empresa apenas em lojas-piloto de mercado.",
    ],
  },
  {
    version: "1.8.5",
    date: "2026-06-02",
    codename: "Formas Entrega/Retirada para todas as lojas",
    changes: [
      "Divisão de formas de pagamento por modalidade (Entrega/Retirada) liberada para TODAS as lojas — antes era exclusivo da Lancheria I9 e Bon Appetit.",
      "Em Configurações → Formas de Pagamento, nas abas Cardápio Online e Pedido Express, agora aparecem os toggles 'Mostrar para Entrega' e 'Mostrar para Retirada' em cada forma.",
      "Cardápio Online e Pedido Express passam a filtrar automaticamente as formas conforme a modalidade escolhida pelo cliente. PDV (caixa) continua sem essa divisão.",
      "Padrão preservado: lojas existentes já tinham 'show_for_delivery' e 'show_for_pickup' = true por default, portanto nada some sem ação manual.",
      "Nenhum fluxo de TEF, NFC-e, Multi-Pagamento, impressão ou PDV V2 foi alterado.",
    ],
  },
  {
    version: "1.8.4-beta",
    date: "2026-06-02",
    codename: "Layout V3 densidade Agilize (beta)",
    changes: [
      "Layout V3 reaproximado da foto de referência: hierarquia única no PED #xxx (13pt bold) — nome da loja e demais textos em 8.5pt uniforme.",
      "Removida faixa de modalidade em texto invertido; agora usa 3 linhas literais de '#' espelhando o cupom Agilize.",
      "Densidade aumentada: line-height 0.95, padding 1mm, zero linhas em branco entre seções, cabeçalho da tabela cola direto nos itens.",
      "Quebra de página suprimida (page-break-inside: avoid) — recibo sai em fluxo contínuo numa única folha térmica.",
      "V1 e V2 permanecem 100% intactos. Mudança isolada ao V3 da Lancheria I9.",
    ],
  },
  {
    version: "1.8.3-beta",
    date: "2026-06-02",
    codename: "Layout V3 grade 48 cols (beta)",
    changes: [
      "Layout V3 do recibo agora usa grade FIXA de 48 colunas monoespaçadas (padrão ESC/POS Epson TM-T20/TM-T88 @ 80mm), fonte Courier New 9pt, line-height 1.0.",
      "Estrutura espelhada da foto de referência: PED #xxx centralizado, faixa de modalidade em texto invertido, tabela 'REF| DESCRICAO ... VALOR', itens com nome + preço unitário, complementos numerados '[N] item' indentados em 3 colunas e linha de subtotal 'Q X R$ X,XX = R$ X,XX' alinhada à direita.",
      "Totais com pipe a 17 colunas ('TOTAL ITENS | ... R$ X,XX'), TOTAL GERAL em negrito, metadados (COD/Criado em/Impresso em) no mesmo padrão pipe.",
      "Largura fixa 80mm, altura automática, sem centralização excessiva — apenas nome da loja, PED e modalidade são centralizados.",
      "Layouts V1 e V2 permanecem 100% intactos. Rollout V3 continua isolado por loja (atualmente só Lancheria da I9).",
    ],
  },
  {
    version: "1.8.2-beta",
    date: "2026-06-02",
    codename: "Layout V3 ESC/POS Epson (beta)",
    changes: [
      "Layout V3 do recibo (PDV V2 / Pedido Express / Cardápio Online) reescrito como template ESC/POS Epson TM-T20/TM-T88 — fonte Courier New única, line-height 1.0, ~40% menos espaçamento entre itens e alinhamento por colunas fixas (42 cols @ 80mm, 32 cols @ 58mm).",
      "Coluna VALOR sempre alinhada à direita em todas as linhas (descrição, totais e meta) usando padding por caractere.",
      "Faixa de modalidade (BALCAO/ENTREGA/RETIRADA) agora sai em texto invertido (fundo preto / texto branco), equivalente ao reverse video ESC/POS (GS B 1), substituindo os '#####' do V3 anterior.",
      "Separadores em ASCII ('-' repetido na largura total) no lugar de <hr> dashed.",
      "Layouts V1 e V2 permanecem 100% intactos. Rollout V3 continua isolado por loja (atualmente só Lancheria da I9).",
      "Nenhum fluxo de TEF (v1.0/v1.1/v1.2-beta), NFC-e, Multi-Pagamento, PDV V2 ou auto_printer.py foi alterado — mudança 100% no HTML gerado no lado web.",
    ],
  },
  {
    version: "1.8.1-beta",
    date: "2026-06-02",
    codename: "Layout V3 fiel ao Agilize (beta)",
    changes: [
      "Layout V3 de impressão reescrito do zero para replicar fielmente o recibo térmico Agilize: cabeçalho da loja (nome, endereço, CNPJ), PED #xxx centralizado, bloco cliente com Fones/endereço/Bairro/Ponto de referência, faixa de modalidade (TELE ENTREGA/MOTOBOY, RETIRADA NO LOCAL, BALCÃO, MESA) em ASCII, tabela REF|DESCRICAO|VALOR com adicionais numerados entre colchetes, TOTAL ITENS + FRETE + TOTAL GERAL separados, bloco de PAGAMENTO/TROCO, COD/Criado em/Impresso em, faixa PREVISTO e rodapé com URL do app.",
      "Fonte alterada para Lucida Console/Consolas com tamanhos compactos (8-11pt), eliminando os títulos gigantes do V3 anterior.",
      "Reescrita aplicada tanto no auto_printer.py (cardápio online / WhatsApp) quanto em pdvV2Print.ts (PDV V2 / Pedido Express) — versões visualmente idênticas.",
      "Layouts V1 e V2 permanecem 100% intactos. Nenhuma loja sem 'Layout V3' selecionado teve qualquer alteração.",
      "Nenhum fluxo de TEF (v1.0/v1.1/v1.2-beta), NFC-e, Multi-Pagamento ou banco de dados foi alterado.",
    ],
  },
  {
    version: "1.8.0-beta",
    date: "2026-06-02",
    codename: "Layout de impressão V3 (beta)",
    changes: [
      "Novo Layout V3 de impressão (beta) disponível em Configurações → Impressão → Layout de Impressão (visível apenas para Admin Master). Pode ser selecionado por loja sem afetar as demais.",
      "Comanda de produção V3: cabeçalho 'PEDIDO' gigante, separadores em ASCII, faixa de tipo do pedido (ENTREGA/RETIRADA/MESA/BALCÃO) em destaque, bloco 'Pronto até' com moldura e adicionais empilhados em caixa alta.",
      "Recibo V3 no auto_printer.py: layout denso inspirado no recibo V3 do PDV V2, com PED #, totais destacados e badge de Entrega/Retirada. Reimpressão a partir do Painel mantém o mesmo visual.",
      "Layouts V1 e V2 permanecem 100% intactos — nenhuma loja que não selecionar V3 manualmente terá qualquer alteração visual.",
      "Nenhum fluxo de TEF, NFC-e, PDV V2, Multi-Pagamento ou banco de dados foi alterado.",
    ],
  },
  {
    version: "1.7.1-beta",
    date: "2026-06-02",
    codename: "Taxas Cidade/Interior opcionais",
    changes: [
      "Configurações → Entrega: cada taxa (Cidade e Interior) agora tem um interruptor próprio. Lojas que não atendem interior podem desativar essa região e o campo de valor fica bloqueado.",
      "Cardápio Online e Pedido Express: regiões desativadas somem do checkout. Quando só uma região está ativa, o cliente vê apenas 'Entrega' (sem precisar escolher entre Cidade/Interior).",
      "Padrão preservado: lojas existentes continuam com as duas regiões ativas — nenhuma mudança visível até desligar manualmente.",
      "Nenhum fluxo de TEF, NFC-e, impressão, PDV V2 ou Multi-Pagamento foi alterado.",
    ],
  },
  {
    version: "1.7.0-beta",
    date: "2026-06-02",
    codename: "Múltiplos endereços por cliente",
    changes: [
      "Cardápio Online: clientes recorrentes agora podem manter mais de um endereço cadastrado. Ao digitar o telefone, aparece o seletor 'Endereços salvos' com botões 'Novo' (para cadastrar outro) e 'Gerenciar' (para escolher um padrão ou excluir).",
      "Comportamento atual preservado: o primeiro endereço continua sendo preenchido automaticamente como antes; quem só tem um endereço não vê nenhuma mudança no fluxo.",
      "Backfill automático: todos os endereços já cadastrados foram migrados para a nova base de múltiplos endereços, marcados como padrão.",
      "Nenhum fluxo de pedido, cobrança, NFC-e, impressão ou PDV foi alterado.",
    ],
  },
  {
    version: "1.6.2-beta",
    date: "2026-06-02",
    codename: "Filtros avançados em Pedidos",
    changes: [
      "Aba Pedidos: novos filtros por Forma de Entrega (Entrega/Retirada), Origem (Cardápio Online, Balcão/Express, Mesa, Mesa via QR) e Forma de Pagamento (lista dinâmica, incluindo 'Múltiplas formas' e 'Sem pagamento').",
      "Totalizadores reativos abaixo dos filtros: número de pedidos, faturamento, ticket médio e cancelados — recalculam conforme os filtros aplicados.",
      "Filtros são puramente de visualização: nenhum fluxo de cobrança, TEF, NFC-e, impressão ou banco de dados foi alterado.",
    ],
  },
  {
    version: "1.6.1-beta",
    date: "2026-06-02",
    codename: "Dividir formas em todos os checkouts (beta)",
    changes: [
      "Botão 'Dividir formas' movido para DENTRO do checkout de pagamento — agora aparece como um link discreto logo abaixo da seleção da forma de pagamento, em vez de ficar solto ao lado de 'Enviar para Cozinha'.",
      "Disponível em todos os checkouts: Pedido Express (Finalizar Pedido), Cobrar Pedido do Cardápio e Importar/Cobrar Comanda/Mesa no PDV V2.",
      "O link só aparece quando faz sentido: não é exibido quando a comanda está em divisão por pessoas ou por itens (TEF v1.1 congelado).",
      "Mesma lógica tudo-ou-nada: TEF recusado → estorno automático de todas as cobranças já aprovadas.",
      "Fluxos congelados (TEF v1.0/v1.1/v1.2-beta, pagamento simples, divisão por pessoas/itens) não foram alterados.",
    ],
  },
  {
    version: "1.6.0-beta",
    date: "2026-06-02",
    codename: "Dividir formas de pagamento (beta)",
    changes: [
      "Novo botão 'Dividir formas' no Pedido Express (etapa 5): permite cobrar a venda em várias formas de pagamento ao mesmo tempo (ex.: parte no TEF/cartão, parte em dinheiro, ou em vários cartões).",
      "Cobranças TEF são executadas em sequência no PinPad. Se qualquer uma for recusada, todas as já aprovadas são estornadas automaticamente e a venda não é registrada (modo tudo-ou-nada).",
      "Quando o módulo Fiscal está ativo, a NFC-e sai com várias formas de pagamento (detPag) em uma única nota.",
      "Rollout piloto: apenas Pedido Express. PDV V2, Cobrança de Pedido e Finalizar Venda virão em uma próxima atualização após validação.",
      "Fluxos congelados (TEF v1.0/v1.1/v1.2-beta, pagamento simples, comandas, mesas) não foram alterados.",
    ],
  },
  {
    version: "1.5.4",
    date: "2026-06-02",
    codename: "Desconto restaurado na cobrança",
    changes: [
      "Campo 'Desconto (R$)' restaurado no diálogo de pagamento — aparece novamente em Cobrar Pedido do Cardápio, Importar e Cobrar Mesa, Pedido Express e Finalizar Venda do PDV V2.",
    ],
  },
  {
    version: "1.5.3",
    date: "2026-06-02",
    codename: "Cobrança rachada por pessoas",
    changes: [
      "Cobrar pedido do cardápio (Lancheria I9) - divisão por pessoas: a parcela cobrada (ex.: R$ 7 de R$ 30) entra no caixa com o valor real e o pedido fica como 'parcial', mantendo o botão Cobrar disponível para o saldo restante até a quitação total.",
    ],
  },
  {
    version: "1.5.2",
    date: "2026-06-02",
    codename: "Correção de cobrança fracionada",
    changes: [
      "Cobrar pedido do cardápio (Lancheria I9): ao dividir um item e cobrar apenas uma fração na primeira cobrança, o sistema agora respeita o valor selecionado em vez de marcar o item inteiro como pago. O botão Cobrar continua disponível para o saldo restante.",
    ],
  },
  {
    version: "1.5.1",
    date: "2026-06-02",
    codename: "Quebra de texto no modal de cobrança",
    changes: [
      "Modal 'Cobrar pedido' (PDV V2): nomes longos de itens com muitos adicionais agora quebram em várias linhas em vez de truncar, evitando o corte visual do modal.",
    ],
  },
  {
    version: "1.5.0",
    date: "2026-06-01",
    codename: "TEF v1.1 + Pedido Express + Mesa QR",
    changes: [
      "Sistema de versionamento com badge discreto no canto inferior direito",
      "TEF v1.1 consolidado (Lancheria I9)",
      "Pedido Express com todas as formas de pagamento",
      "Cardápio Mesa QR (rota /mesa/:slug)",
      "Campanhas de vendas via WhatsApp",
    ],
  },
];

/** Formata data YYYY-MM-DD para DD/MM/YYYY (pt-BR). */
export function formatReleaseDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}