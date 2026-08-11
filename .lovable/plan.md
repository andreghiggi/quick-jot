# Plan - Implement real printing logic in auto_printer.py

The script `auto_printer.py` currently shows "PEDIDOS IMPRESSOS HOJE: 0" because its data fetching functions are empty mocks. I will implement real calls to the Supabase API to fetch and process orders and the print queue.

## Proposed Changes

### Backend (Python Script)
- Update `scripts/auto_printer.py` to:
    - Implement `buscar_pedidos_nao_impressos` using the `orders` table.
    - Implement `processar_fila` using the `print_queue` table.
    - Add `marcar_como_impresso` to update the database after successful printing.
    - Enhance `processar_pedido` to handle both HTML (from `print_queue`) and structured order data.
    - Add `requests` headers for Supabase authentication (using the project's anon key).

### Frontend (UI)
- Update `src/pages/Settings.tsx` to:
    - Inject the Supabase `anon_key` into the generated Python script.
    - Ensure the `COMPANY_ID` is correctly passed to the script during download.

## Technical Details
- The script will use the existing `API_URL`.
- Authentication will use the `apiKey` and `Authorization` headers.
- Filter criteria: `printed=false` and `company_id=eq.{id}`.
- For `print_queue`, the script will download the `html_content` and use `win32print` (via a helper if needed) to send to the thermal printer.

## Security Note
- The `anon_key` will be embedded in the downloaded script. Since this script is only accessible to the store owner via the admin panel and the key is already public in the frontend, this maintains the current security posture.
