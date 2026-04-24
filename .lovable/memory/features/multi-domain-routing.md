---
name: Multi-domain Routing
description: Sistema multi-domínio comandatech.com.br com subdomínio por loja, mantendo compatibilidade com appcomandatech.agilizeerp.com.br
type: feature
---
A partir da versão 1.27.0 o sistema suporta:

- **app.comandatech.com.br** → painel administrativo (todas as rotas atuais).
- **{loja}.comandatech.com.br** → cardápio público da loja (rota raiz "/" carrega o cardápio direto).
- **comandatech.com.br** raiz → redireciona para app.
- **appcomandatech.agilizeerp.com.br** → continua funcionando 100%, com redirect automático para o subdomínio quando a loja já tem subdomain configurado.

Implementação:
- Tabela `companies` ganhou coluna `subdomain` (text, único, validado por CHECK constraint `^[a-z0-9]{3,30}$` + lista de reservados).
- Função `assign_unique_subdomain(company_id, name)` gera subdomínio limpo automaticamente (remove acentos, símbolos, garante unicidade).
- Trigger `trg_set_company_subdomain` BEFORE INSERT em companies aplica subdomínio automaticamente em novas lojas.
- Migração inicial populou `subdomain` para todas as lojas existentes.
- `src/utils/domainRouting.ts` contém `detectDomainContext(hostname)` que retorna 'admin' | 'store' | 'root-redirect' | 'legacy'.
- `App.tsx` faz routing condicional: em `kind === 'store'` rota raiz "/" e qualquer outra rota carregam Menu diretamente.
- `Menu.tsx` busca a empresa por `subdomain` quando vem de subdomínio, ou por `slug` quando vem da rota `/cardapio/:slug`.
- Redirect automático em Menu.tsx: se acessou via /cardapio/:slug em domínio .com.br e a loja tem subdomain, redireciona para `https://{subdomain}.comandatech.com.br/`.

Lista de subdomínios reservados (não podem ser usados como subdomínio de loja): app, www, admin, api, cardapio, painel, mail, blog, ftp, webmail, comandatech, root, test, staging, dev, support, suporte, help, status, docs, assets, static, cdn, auth, login, dashboard, portal.

Configurações → Geral expõe campo "Endereço da sua loja (Comanda Tech)" para o lojista personalizar o subdomínio.
