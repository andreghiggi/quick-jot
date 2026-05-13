# Memory: index.md
Updated: today

# Project Memory

## Core
- System: Comanda Tech ('Anota Aí' style MVP). URL: https://appcomandatech.agilizeerp.com.br
- Stack: Lovable Cloud, Supabase. Strict multi-tenancy isolation via `company_id` and RLS.
- Timezone: Always use 'America/Sao_Paulo' across frontend, edge functions, and python scripts.
- Visuals: Primary default #ef4444. Prices in green with comma. 85dvh for mobile viewports.
- IDs: Orders use 6-character hex identifiers (e.g., #AB7CAE), never sequential numbers.
- Workflow: Always document updates and new features in the 'Novidades' (Changelog) menu.
- Printing rollout must be isolated per store until validated; never change all stores at once.
- TEF v1.0/1.1/1.2 (Multiplus) está homologado e CONGELADO — não alterar `pinpadService`, `tef-webservice`, `TefAdm`, `TefReport`, `tefOrderActions` sem autorização explícita.
- TEF Auto Print v1 (NOVO): impressão automática do comprovante TEF é módulo SEPARADO em `src/utils/tefAutoPrint.ts`, com allow-list por company_id e setting `tef_auto_print_vias`. Atualmente só Lancheria da I9.

## Memories
$(tail -n +12 /dev/null 2>/dev/null)
