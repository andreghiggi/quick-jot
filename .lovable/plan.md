## Objetivo

Permitir, dentro do modo **"Cobrar itens selecionados"** do `PDVV2TabImportDialog`, rachar um item da comanda entre N pessoas via ícone ao lado da linha. Cobra-se a fração (1/N do valor unitário) preservando o produto real (NCM, CFOP, CSOSN) na NFC-e.

**Escopo:** apenas Lancheria da I9 (`company_id = 8c9e7a0e-dbb6-49b9-8344-c23155a71164`). Demais lojas mantêm o fluxo atual sem o ícone.

**Fora de escopo:** TEF/PinPad (congelado) e o modo "Dividir por pessoas" (continua como está).

---

## UX

Tela `mode === 'select_items'` ganha, em cada item não pago, um botão `Split` (lucide) ao lado do preço:

```text
☐  1x Refrigerante 2L           R$ 15,00   [⎇]
```

Ao clicar `[⎇]`, abre um popover/inline:

- "Dividir em quantas pessoas?" (default 2, min 2, max 10)
- "Quantas frações cobrar agora?" (default 1, max = pessoas)
- Resumo: "R$ 7,50 cada × 1 = R$ 7,50"
- Botões "Aplicar" / "Cancelar"

Aplicado, a linha mostra:

```text
☑  ½ × Refrigerante 2L (1 de 2 frações)   R$ 7,50   [editar] [✕]
```

O total selecionado soma normalmente. O botão "Cobrar R$ X" segue o fluxo já existente (`onPayPartial` → `confirmImportTabI9`).

---

## Mudanças técnicas

### 1. Migrations (database)

`tab_items.quantity` e `pdv_sale_items.quantity` hoje são `integer`. Para suportar frações:

```sql
ALTER TABLE public.tab_items     ALTER COLUMN quantity TYPE numeric(10,3);
ALTER TABLE public.pdv_sale_items ALTER COLUMN quantity TYPE numeric(10,3);
```

Compatível com inteiros existentes; SEFAZ aceita até 4 casas em `qCom`.

### 2. `PDVV2TabImportDialog.tsx`

- Apenas se `companyId === I9_ID` exibe o ícone `Split`.
- Estado `selectedIds: Set<string>` evolui para:
  ```ts
  type Sel = { itemId: string; paidQty: number; totalQty: number; unitPrice: number };
  const [selections, setSelections] = useState<Map<string, Sel>>(new Map());
  ```
- `paidQty` pode ser fracionário (ex.: `0.5`). `selectedTotal` = Σ `paidQty * unit_price`.
- Ao confirmar: `onPayPartial(itemsInfo)` envia `[{ id, paidQty }]` (já existe — só passa a aceitar frações).

### 3. `PDVV2PaymentDialog.tsx`

- `itemsInfo: Array<{ id; paidQty: number }>` já existe — só atualizar tipo/comentário. Sem mudança lógica.

### 4. `src/pages/PDVV2.tsx` — `confirmImportTabI9`

Já trata `paidQty` em `saleItems` (linha 674) e em `partialPays` (linha 730). **Funciona com frações sem mudança** — basta `tab_items.quantity` aceitar numeric. Apenas garantir arredondamento do `total_price` em 2 casas para evitar dízimas.

### 5. `nfceService` — emissão

`saleItems` vai com `quantity: 0.5, unit_price: 15.00, total: 7.50`. Já é serializado no `request_payload`. Sem mudança no edge `nfce-proxy`.

### 6. Última fração e fechamento

A lógica `allPaid` em `confirmImportTabI9` (linha 806) considera "pago" quando `paid=true`. Como a fração restante vira novo `tab_item` com `paid:false`, a comanda só fecha quando todas as frações forem cobradas — comportamento correto, sem mudança.

### 7. Arredondamento

Quando `15 / 3 = 5,0000` ok. Em `10 / 3 = 3,3333`, a última fração da comanda absorve o centavo na hora de cobrar — calculada como `total_restante - somaDasFraçõesAnteriores`. Implementar helper `computeFractionPrice(unit, n, fractionIndex)`.

---

## Validação

1. Fração de item integer existente continua aparecendo sem perda (ex.: 2 → 2.000).
2. NFC-e emitida com `quantity=0.5` autoriza em homologação.
3. Comanda só fecha quando soma das frações pagas = quantidade original.
4. Nada muda para outras lojas (sem ícone, fluxo atual intacto).

## Changelog

Adicionar entrada em "Novidades": "Rachar item da comanda entre pessoas — disponível na Lancheria da I9".

## Memória

Criar `mem://features/rachar-item-comanda-i9` registrando: escopo I9-only, dependência da migração `numeric(10,3)`, integração com NFC-e via item real (NCM preservado), TEF não afetado.
