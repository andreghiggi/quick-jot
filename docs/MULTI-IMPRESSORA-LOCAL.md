# Multi-impressora local (branch Cursor)

Implementação **somente dev local** — Supabase externo + extensão unpacked. Sem deploy Lovable/produção.

## 1. Schema no espelho

Migration: `supabase/migrations/20260812000000_print_stations_multi_printer.sql`

Aplicar no SQL Editor do projeto externo `vyotbtmnnosiejyltlxc` ou via script com `.env.backup`.

## 2. App React (localhost:8080)

1. Login no espelho (`.env.local`)
2. **Configurações → Impressão → Estações** — criar Cozinha, Bar, Caixa
3. **Cadastros → Categorias** — select "Imprimir em" por categoria
4. Pedido no cardápio / garçom / express → N jobs em `print_queue` com `station_id`

Sem estações configuradas = 1 job (comportamento antigo).

## 3. Host Python

`scripts/auto_printer.py` lê `%LOCALAPPDATA%\ComandaTech\printer_map.json`:

```json
{
  "station_printers": { "uuid-cozinha": "Nome Impressora Windows" },
  "fallback_printer": "EPSON TM-T20"
}
```

Rodar: `iniciar_impressao.cmd` ou `python scripts/auto_printer.py`

## 4. Extensão Chrome (unpacked)

1. `chrome://extensions` → Modo desenvolvedor → **Carregar sem compactação** → pasta `extension/`
2. Editar `extension/native/comandatech_native_host.json` (path absoluto + extension ID)
3. Registrar:

```powershell
reg add "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.comandatech.print_host" /ve /t REG_SZ /d "C:\xampp\htdocs\comandatech\extension\native\comandatech_native_host.json" /f
```

4. Opções da extensão → Supabase URL + Company ID → mapear impressoras → Salvar

Native host: `scripts/comandatech_native_host.py`

## 5. Verificação SQL

```sql
SELECT label, station_id, job_type, printed
FROM print_queue
ORDER BY created_at DESC
LIMIT 10;
```

## Arquivos

| Arquivo | Função |
|---------|--------|
| `src/utils/printRouting.ts` | Split + enqueue |
| `src/hooks/usePrintStations.ts` | CRUD estações |
| `src/components/settings/PrintStationsSettings.tsx` | UI Settings |
| `scripts/auto_printer.py` | Multi-impressora |
| `extension/` | Chrome MV3 |
