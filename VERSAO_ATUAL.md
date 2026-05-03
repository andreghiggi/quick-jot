# 📌 ComandaTech — Checkpoint de Versão Estável

> **Checkpoint criado antes do início do desenvolvimento do PDV V2.**
> Use este documento como referência para restaurar exatamente este estado, se necessário.

---

## 🕐 Data do Checkpoint

 - **Data/Hora:** 02/05/2026
 - **Mensagem de referência:** `versao funcional comandatech 02/05/2026`
- **Como restaurar:** Use o botão **"Revert"** abaixo da mensagem correspondente no chat do Lovable, ou acesse a aba **History** no topo do chat.

---

## 🏷️ Versão do Sistema

- **Stack:** React 18 + Vite 5 + TypeScript 5 + Tailwind CSS v3
- **Backend:** Lovable Cloud (Supabase)
- **Projeto Supabase ref:** `iwmrtxdzlkasuzutxvhh`
- **Projeto Lovable ID:** `aa48df58-5129-4fc5-b12f-f3e13098e2c6`

---

## 🛣️ Rotas Existentes

### Públicas
| Rota | Página |
|------|--------|
| `/auth` | Login / Cadastro |
| `/reset-password` | Recuperação de senha |
| `/cardapio/:slug` | Cardápio público da loja |
| `/sem-empresa` | Página informativa para usuários sem empresa |

### Protegidas (requireCompany)
| Rota | Página |
|------|--------|
| `/` | Dashboard (Index) |
| `/pedidos` | Gestão de Pedidos |
| `/produtos` | Cadastro de Produtos |
| `/categorias` | Categorias |
| `/subcategorias` | Subcategorias |
| `/adicionais` | Grupos de Adicionais |
| `/configuracoes` | Configurações da Loja |
| `/configuracoes/mesas` | Configuração de Mesas |
| `/configuracoes/garcons` | Configuração de Garçons |
| `/configuracoes/whatsapp` | WhatsApp Settings |
| `/configuracoes/integracoes` | Integrações (Asaas, etc.) |
| `/pdv` | **PDV (versão atual — V1)** |
| `/pos` | POS Smart Terminal (Android) |
| `/formas-pagamento` | Formas de Pagamento |
| `/financeiro/caixa` | Controle de Caixa |
| `/relatorios/vendas` | Relatório de Vendas |
| `/relatorios/clientes` | Relatório de Clientes |
| `/relatorios/curva-abc` | Curva ABC |
| `/campanhas` | Campanhas de Vendas (WhatsApp em massa) |
| `/fiscal` | Configuração Fiscal (NFC-e) |
| `/nfce` | Monitor de NFC-e |
| `/novidades` | Changelog |
| `/sugestoes` | Sugestões de melhoria |
| `/importar-cardapio` | Importação de cardápio via IA |
| `/garcom` | App do Garçom (mobile) |

### Admin (requiredRole: super_admin)
| Rota | Página |
|------|--------|
| `/admin` | Dashboard Admin |
| `/admin/empresa/:companyId/modulos` | Controle de Módulos por Empresa |
| `/admin/revendedores` | Gestão de Revendedores |
| `/admin/sugestoes` | Gestão de Sugestões |
| `/admin/dados-empresa` | Dados da Empresa Master |
| `/admin/campanhas-config` | Configuração Global de Campanhas |

### Revendedor (requiredRole: reseller)
| Rota | Página |
|------|--------|
| `/revendedor/home` | Home do Revendedor |
| `/revendedor/lojas` | Gestão de Lojas |
| `/revendedor/configuracoes` | Configurações do Revendedor |

### Redirects
- `/financeiro/relatorios` → `/relatorios/vendas`
- `/revendedor/financeiro` → `/revendedor/lojas`

---

## 🧩 Módulos Ativos do Sistema

Controlados via tabela `company_modules`:

- **Cardápio Online** (público)
- **Pedidos** (gestão de pedidos online)
- **PDV** (Ponto de Venda — versão V1)
- **POS Smart Terminal** (Android nativo via Capacitor)
- **Mesas e Comandas** (Garçom)
- **Caixa** (controle financeiro)
- **WhatsApp** (notificações + auto-resposta + campanhas)
- **NFC-e** (emissão fiscal)
- **Relatórios** (Vendas, Clientes, Curva ABC)
- **Importação por IA** (cardápio via Gemini Flash)
- **Campanhas de Vendas** (envio em massa WhatsApp)
- **Painel Revendedor** (multi-loja + faturamento Asaas)
- **Painel Super Admin** (gestão global)

---

## 🗄️ Tabelas do Banco de Dados

### Tenant / Auth
- `companies` — Lojas/empresas
- `company_users` — Vínculo usuário ↔ empresa
- `company_modules` — Módulos habilitados por empresa
- `company_plans` — Planos contratados
- `profiles` — Dados do usuário
- `user_roles` — Papéis (super_admin, reseller, company_admin, company_user, waiter)
- `admin_settings` — Dados da empresa master

### Catálogo
- `categories` — Categorias de produtos
- `subcategories` — Subcategorias
- `products` — Produtos
- `product_optionals` — Adicionais legados
- `optional_groups` — Grupos de adicionais
- `optional_group_items` — Itens de grupos
- `optional_group_categories` — Vínculo grupo ↔ categoria
- `optional_group_products` — Vínculo grupo ↔ produto
- `tax_rules` — Regras fiscais (CFOP, NCM, CSOSN)

### Pedidos
- `orders` — Pedidos do cardápio online
- `order_items` — Itens dos pedidos
- `customers` — Clientes
- `delivery_neighborhoods` — Bairros de entrega
- `business_hours` — Horários de funcionamento

### PDV / Caixa
- `cash_registers` — Sessões de caixa
- `pdv_sales` — Vendas PDV
- `pdv_sale_items` — Itens das vendas PDV
- `payment_methods` — Formas de pagamento
- `print_queue` — Fila de impressão
- `tables` — Mesas
- `tabs` — Comandas
- `tab_items` — Itens da comanda
- `waiters` — Garçons

### Fiscal
- `nfce_records` — Registros de NFC-e

### WhatsApp
- `whatsapp_instances` — Instâncias Evolution API
- `whatsapp_messages` — Histórico de mensagens
- `whatsapp_auto_reply_locks` — Trava de auto-resposta

### Campanhas
- `sales_campaigns` — Campanhas de venda
- `sales_campaign_messages` — Mensagens disparadas
- `campaign_settings` — Config global

### Revendedores / Faturamento
- `resellers` — Revendedores
- `reseller_companies` — Vínculo revendedor ↔ loja
- `reseller_settings` — Config (mensalidade, ativação, Asaas)
- `reseller_invoices` — Faturas
- `reseller_invoice_items` — Itens das faturas

### Outros
- `store_settings` — Configurações chave/valor por loja
- `suggestions` — Sugestões dos lojistas

---

## ⚡ Edge Functions Ativas

- `asaas-billing` — Cobranças Asaas
- `reseller-billing` — Faturamento de revendedores
- `create-reseller-user` — Criação de usuário revendedor
- `create-waiter` — Criação de garçom
- `extract-menu` — IA: extrai cardápio
- `extract-optionals` — IA: extrai adicionais
- `nfce-proxy` — Proxy NFC-e
- `nfce-webhook` — Webhook NFC-e
- `notify-store-order` — Notifica loja de novo pedido
- `pinpdv-payment` — Pinpad TEF
- `process-sales-campaigns` — Processa filas de campanha
- `send-whatsapp` — Envio WhatsApp
- `tef-webservice` — Webservice TEF Multiplus
- `whatsapp-evolution` — Integração Evolution API
- `whatsapp-followup` — Follow-up pós-venda
- `whatsapp-webhook` — Webhook recebimento

---

## 🔧 Funções de Banco (RPC)

- `generate_company_serial()` — Gera serial único da loja
- `generate_order_code()` — Trigger: gera código de pedido
- `get_next_daily_order_number()` — Sequencial diário de pedidos
- `get_reseller_id(_user_id)` — Retorna reseller do usuário
- `get_user_company_id(_user_id)` — Retorna company do usuário
- `has_role(_user_id, _role)` — Verifica papel
- `handle_new_user()` — Trigger: cria profile/empresa no signup
- `is_company_suspended(_company_id)` — Verifica suspensão
- `process_overdue_invoices()` — Marca vencidas, suspende e **reativa lojas regularizadas**
- `set_company_serial()` — Trigger: protege serial
- `set_daily_order_number()` — Trigger: define daily_number
- `update_updated_at_column()` — Trigger: atualiza updated_at
- `user_belongs_to_company(_user_id, _company_id)` — Verifica vínculo

---

## 📂 Estrutura Principal de Arquivos

### Roteamento
- `src/App.tsx` — Definição de todas as rotas e providers

### Contexts
- `src/contexts/AuthContext.tsx`
- `src/contexts/OrderContext.tsx`

### Hooks Principais
- `useAuth`, `useCompanies`, `useCompanyModules`, `useCompanyPlans`
- `useProducts`, `useCategories`, `useSubcategories`, `useOptionalGroups`
- `useOrders`, `useCashRegister`, `usePOS`, `usePaymentMethods`
- `useTables`, `useTabs`, `useWaiters`, `useBusinessHours`
- `useWhatsApp`, `useSalesCampaigns`, `useTaxRules`
- `useResellers`, `useResellerPortal`
- `useStoreSettings`, `useDeliveryNeighborhoods`, `useOrderNotificationSound`

### Páginas-chave do PDV (V1) — *a serem evoluídas no V2*
- `src/pages/PDV.tsx`
- `src/components/pdv/PDVOptionalsDialog.tsx`
- `src/services/posPayment.ts`
- `src/services/posStorage.ts`
- `src/services/posSync.ts`
- `src/services/pinpadService.ts`
- `src/services/multiplusCardService.ts`
- `src/services/nfceService.ts`

### Componentes de Layout
- `src/components/layout/AppLayout.tsx`
- `src/components/layout/AppSidebar.tsx`
- `src/components/admin/ImpersonationBanner.tsx`

---

## ✅ Como restaurar este checkpoint

 1. **Pelo Lovable:** Localize a mensagem do chat com o título *"versao funcional comandatech 02/05/2026"* e clique em **Revert** logo abaixo dela.
2. **Pela aba History:** Topo do chat → **History** → selecione esta versão.
 3. **Pelo GitHub** (se sincronizado): Use `git log` e identifique o commit pela data **02/05/2026**.

---

> ⚠️ **Não altere este arquivo.** Ele serve como referência fixa do estado pré-PDV V2.
