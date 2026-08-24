# Amore Mio: toast rápido na Venda Rápida + duas impressoras

Escopo restrito à loja Amore Mio (`f5f9eec3-...`) e ao script de impressão. Nada de outras lojas, nada de mudança no layout V2 nem no `iniciar_impressao.cmd`.

## 1. Modal/toast ao adicionar item na Venda Rápida

Hoje o aviso "produto adicionado" usa a duração padrão (~4s). Ajuste: na Venda Rápida da Amore Mio, o toast passa a durar 1 segundo.

## 2. Como a impressão funciona hoje (mapeamento)

```text
Pedido finalizado (PDV / cardápio)
        v
printRouting.ts  -> agrupa itens por CATEGORIA
        v
categoria tem estação vinculada?  sim -> job com station_id
                                  não -> job com station_id = null
        v
tabela print_queue (html_content + station_id + printed=false)
        v
auto_printer.py (rodando pelo iniciar_impressao.cmd, a cada 5s)
        v
station_id -> nome da impressora Windows  (hoje: arquivo printer_map.json manual)
        v
sem mapeamento -> impressora PADRÃO do Windows
```

Situação atual da Amore Mio: existe 1 estação ("cozinha"), mas nenhuma categoria vinculada a ela, e nenhum `printer_map.json` preenchido — por isso tudo cai na impressora padrão. O caminho para duas impressoras já existe; falta apenas cadastrar o nome da impressora compartilhada pelo painel (sem editar JSON na mão) e o script consultar esse cadastro.

## 3. O que será implementado

**A. Nome da impressora no cadastro da estação (Configurações › Comanda de Produção)**
- Nova coluna `printer_name` em `print_stations`.
- No card "Estações de Impressão": campo para digitar/editar o nome exato da impressora compartilhada do Windows (ex.: `POS-58`, `\\PC-CAIXA\CREPE`), salvo por estação.
- O botão "Baixar Mapa (printer_map.json)" continua existindo como plano B, já preenchido com os nomes cadastrados.

**B. Vínculo categoria → estação** (já existe em Cadastros › Categorias): permanece igual. É onde se define "esta categoria imprime na impressora X".

**C. Script `auto_printer.py` escutando várias impressoras**
- Ao iniciar (e a cada 5 min), busca as estações da loja pela API e monta o mapa `station_id -> printer_name` automaticamente.
- Ordem de resolução por job: `printer_name` da estação → `printer_map.json` (fallback) → impressora padrão do Windows.
- Cada job da fila é impresso na sua impressora; jobs sem estação (comanda/recibo normal) continuam na impressora padrão.
- Nenhuma mudança no layout V2 nem no fluxo GDI já validado; só a escolha da impressora muda.
- O `iniciar_impressao.cmd` não muda — a loja só baixa o `auto_printer.py` novo.

## 4. Detalhes técnicos

- Migração: `ALTER TABLE public.print_stations ADD COLUMN printer_name text;` (RLS/grants existentes cobrem).
- `usePrintStations.ts`: incluir `printer_name` na interface e função `updateStationPrinter(id, name)`.
- `Settings.tsx`: input inline por estação com salvamento onBlur.
- `scripts/auto_printer.py` → v1.7.0: função `carregar_estacoes()` via REST (`/print_stations?company_id=eq.<id>`), cache em memória, e `get_printer_for_station()` consultando o cache antes do JSON.
- `PDVV2FastCheckout.tsx`: `toast.success(..., { duration: 1000 })` apenas no ramo Amore Mio.

## 5. Como a loja usa depois

1. Compartilha as impressoras no Windows.
2. Em Configurações › Comanda de Produção, cria as estações e digita o nome de cada impressora.
3. Em Categorias, vincula cada categoria à estação desejada.
4. Baixa o `auto_printer.py` novo e reabre o `iniciar_impressao.cmd`.
