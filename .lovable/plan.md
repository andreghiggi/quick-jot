# Plano — Perfil Floricultura isolado por empresa

Criar o módulo **Floricultura** como um perfil visual e de linguagem adicional. Ele só altera empresas onde estiver explicitamente habilitado; restaurantes continuam com o comportamento, as cores e os nomes atuais.

## 1. Ativação segura por empresa
- Adicionar **Floricultura** à lista de módulos do painel administrativo, desligado por padrão.
- Tratar o módulo como adicional: não desligar nem alterar PDV, pedidos, fiscal, financeiro, impressão, TEF ou outros módulos.
- Criar uma leitura central e reutilizável do estado do módulo, com cache separado por empresa e atualização imediata ao ativar/desativar.
- Manter o padrão atual quando a configuração estiver ausente, evitando qualquer mudança nas empresas existentes.

## 2. Identidade visual verde
- Usar como cor principal do perfil Floricultura o verde escuro extraído da logo que será anexada.
- Aplicar o verde somente à identidade visual: botões principais, destaques, links, seleções, navegação e elementos que hoje usam a cor principal do ComandaTech.
- Preservar vermelho em erros, exclusões, cancelamentos e alertas perigosos.
- Respeitar a personalização de cor já existente no catálogo público: definir uma precedência clara entre a cor salva pela loja e o padrão verde da Floricultura, sem alterar lojas de restaurante.
- Garantir contraste e legibilidade nos temas claro e escuro.

## 3. Linguagem “Catálogo” somente para floriculturas
- Criar uma camada central de terminologia por empresa, em vez de substituir textos globalmente.
- Para Floricultura ativa, apresentar **Catálogo**, **Catálogo online**, **Ver catálogo** e **Importar catálogo** nos textos visíveis correspondentes.
- Para restaurantes, manter **Cardápio**, **Cardápio online**, **Ver cardápio** e **Importar cardápio** exatamente como hoje.
- Aplicar a terminologia nas áreas administrativas e públicas pertinentes: menu lateral, configurações, produtos, importação, pedidos, mensagens, títulos, botões e avisos.
- Não renomear rotas, chaves internas, tabelas ou integrações que já usam `cardapio`; links como `/cardapio/...` continuarão funcionando para não quebrar favoritos, QR Codes e integrações existentes.
- Não substituir ocorrências técnicas ou palavras não relacionadas, evitando alterações acidentais.

## 4. Catálogo público preparado para evolução
- Fazer o catálogo público reconhecer o perfil Floricultura e receber a identidade/terminologia corretas.
- Nesta etapa, manter compra, carrinho, checkout, preços, adicionais, entrega e retirada sem mudanças funcionais.
- Deixar um ponto central de extensão para as diferenças futuras do catálogo de flores, sem duplicar todo o cardápio atual.

## 5. Validação e proteção contra regressões
- Adicionar testes pequenos para garantir que:
  - empresa sem Floricultura continua vermelha e usa “Cardápio”;
  - empresa com Floricultura usa verde e “Catálogo”;
  - alertas destrutivos continuam vermelhos;
  - ativar Floricultura não altera os demais módulos;
  - links públicos existentes continuam válidos.
- Conferir as principais telas em uma empresa de teste com o módulo ligado e em uma empresa restaurante com o módulo desligado, em computador e celular.
- Verificar que não houve impacto em TEF, fiscal, impressão, pedidos ou checkout.

## Detalhes técnicos
- O módulo será identificado internamente como `floricultura` em `company_modules`, seguindo o padrão modular já usado pelo sistema.
- Um contexto/helper central fornecerá o perfil da empresa, os termos visíveis e os tokens de identidade; as telas consumirão esse ponto único.
- A cor final ficará pendente apenas até o envio da logo. Depois dela, o tom será extraído e confirmado visualmente antes da implementação.
- Nenhuma entrada será criada em **Novidades** e nada será publicado sem ordem explícita.