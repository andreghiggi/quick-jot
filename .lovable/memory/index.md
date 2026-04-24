# Memory: index.md
Updated: now

# Project Memory

## Core
- System: Comanda Tech ('Anota Aí' style MVP). URL principal: https://app.comandatech.com.br (lojas em {slug}.comandatech.com.br). Domínio antigo appcomandatech.agilizeerp.com.br ainda redireciona via Nginx (quando DNS antigo apontar pra VPS).
- Hospedagem: VPS própria (153.75.244.221) com Nginx + SSL wildcard Let's Encrypt. Deploy automático via GitHub Actions on push to main (workflow .github/workflows/deploy-vps.yml). Backend continua sendo Lovable Cloud (Supabase) — nada migrado.
- Stack: Lovable Cloud, Supabase. Strict multi-tenancy isolation via `company_id` and RLS.
- Timezone: Always use 'America/Sao_Paulo' across frontend, edge functions, and python scripts.
- Visuals: Primary default #ef4444. Prices in green with comma. 85dvh for mobile viewports.
- IDs: Orders use 6-character hex identifiers (e.g., #AB7CAE), never sequential numbers.
- Workflow: Always document updates and new features in the 'Novidades' (Changelog) menu.
- Printing rollout must be isolated per store until validated; never change all stores at once.
- TEF v1.0 (Multiplus) está homologado e CONGELADO como beta — não alterar nada de TEF/PinPad sem autorização explícita.
- TEF v1.1 consolidado (Lancheria I9): TEF restaurado no PDV V2, reimpressão/via cancelada nos cards, formas de pagamento completas no Pedido Express e cancelamento de venda dispara estorno PinPad automático — não regredir.

## Memories
- [Role Hierarchy](mem://auth/role-hierarchy-and-permissions) — Permissions for super_admin, reseller, company_admin, waiter
- [Support Impersonation](mem://auth/modo-suporte-impersonation) — Super Admin login via sessionStorage with amber banner
- [Password Recovery](mem://auth/password-recovery) — Supabase Auth link sending to /reset-password
- [Product Optionals](mem://features/product-optionals) — Wizard flow, progress bars, and min/max selection logic
- [Product Deletion](mem://features/product-data-cleanup) — Ephemeral toggle for danger zone full product wipe
- [Dynamic Categories](mem://features/dynamic-categories) — Name syncing, static images, minimalist public UI
- [Print Architecture](mem://features/printer-installer-architecture) — Python `auto_printer.py` and batch installer
- [PDV Module](mem://features/pdv-module) — Localstorage mode, retroactive NFC-e generation
- [Delivery Fees](mem://features/delivery-fees-logic) — Simple vs Neighborhood granular dynamic fees
- [Print Logic](mem://features/automatic-printing-logic) — 5s polling, HTML/CSS layout, `printed` flags
- [Print RLS](mem://technical/printer-rls-configuration) — Anonymous public policy for local script access
- [Multi-tenancy](mem://technical/multi-tenancy-isolation) — Strict `company_id` filters on all Supabase queries
- [Onboarding](mem://features/onboarding-e-planos) — Auto-creation of company, owner, plan, and user_roles
