# Distribuição auto_printer.py v8.39+ (pós-migração VPS)

## Lojas prioritárias

| Loja | Subdomínio | Layout esperado | Ação |
|------|------------|-----------------|------|
| Cozinha da Ruiva | cozinhadaruiva | v2 | Reinstalar script |
| Lancheria I9 | lancheriada9 / i9 | v2 ou v3 | Reinstalar script |
| Margen / Império | margen / imperio | v2 | Reinstalar script v8.34+ (markers V2) |

## Como atualizar em cada PC Windows

1. No painel: **Configurações → Impressão** → baixar o pacote (embute `COMPANY_ID` e `PRINT_LAYOUT` atuais).
2. Ou copiar `scripts/auto_printer.py` (versão **v8.39.4+**) e definir:
   - `SUPABASE_URL=https://api.comandatech.com.br`
   - `COMPANY_ID` da loja
3. Executar `instalar_impressao.bat` (pywin32 + requests).
4. Reiniciar `iniciar_impressao.bat`.

## Verificação

- Log deve mostrar `SCRIPT_VERSION = v8.39.x` e URL `api.comandatech.com.br` (não `iwmrtxdzlkasuzutxvhh.supabase.co`).
- Imprimir comanda produção + recibo PDV e confirmar layout (V1/V2/V3) igual ao pré-migração.

## Snapshot de settings

Rodar no servidor ou local com service role:

```bash
node scripts/export-print-settings.mjs --out docs/print-settings-vps.json
```
