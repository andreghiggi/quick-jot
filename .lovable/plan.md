# Gaveta de Caixa — Elgin/Bematech (Amore Mio)

Acionamento da gaveta de dinheiro em **qualquer tela de cobrança**, não apenas na Frente de Caixa (que a Amore Mio não usa).

## O que já existe

- **Agente local `auto_printer.py`** rodando na máquina da loja, com servidor HTTP na porta **8081** (hoje usado para ler o peso da balança Wind D3 em `/peso`). É o canal ideal para mandar o pulso da gaveta.
- **Fila `print_queue`** (company_id + html_content + label + printed) que o agente já consome a cada 5s — serve de fallback quando o navegador não alcança o localhost.
- **Configurações da loja** em `store_settings` (chave/valor), já com aba "Balança" no padrão exato que a gaveta vai seguir.
- Um toggle antigo `auto_open_drawer_cash` em `pdv_settings`, exclusivo da Frente de Caixa e **sem nenhuma lógica de hardware** por trás. Não será reaproveitado.

## Como a gaveta funciona (padrão de mercado)

Gavetas Elgin e Bematech não têm conexão própria com o PC: ligam por cabo **RJ11 na impressora térmica**. Quem abre a gaveta é a impressora, ao receber um comando ESC/POS de pulso:

```text
ESC p m t1 t2   ->   27, 112, 0, 25, 250
```

Para abrir a gaveta o sistema manda um "trabalho de impressão" contendo apenas o pulso — sem imprimir papel. Elgin e Bematech aceitam o padrão Epson; muda só o pino usado (m = 0 ou 1) e a duração do pulso, que ficarão configuráveis.

## O que vamos implementar

### 1. Aba "Gaveta" nas Configurações
Nova aba em Configurações (mesmo padrão da aba Balança):
- Ativar gaveta (on/off)
- Modelo: Elgin, Bematech, Epson/Genérica ESC/POS
- Pino do conector: Pino 2 (padrão) ou Pino 5
- Duração do pulso: Curto / Médio / Longo
- Botão **"Testar abertura"** — dispara o pulso na hora para validar a instalação

### 2. Regras de acionamento (o coração do pedido)
A gaveta abre automaticamente em **toda finalização de venda**, em qualquer card de cobrança:

| Situação | Quando abre |
|---|---|
| Dinheiro com troco | Na confirmação do pagamento, para o operador tirar o troco |
| Dinheiro sem troco | Ao finalizar a venda, para guardar a cédula |
| Cartão / TEF / SmartPOS | Após finalizar, para guardar o comprovante |
| PIX | Após finalizar, para guardar o comprovante |
| Multi-pagamento | Uma única abertura, na confirmação final |

Sempre **uma só abertura por venda** — nunca dois pulsos na mesma finalização.

### 3. Cobertura de telas
Disparo centralizado num único utilitário chamado por todos os pontos de cobrança existentes:
- PDV V2 — diálogo de pagamento e multi-pagamento
- Venda Rápida lateral (caminho principal da Amore Mio)
- Cobrança de pedido pelo card (OrderCard)
- Pedido Express
- Frente de Caixa (lojas que a usam, mantendo o comportamento atual)

### 4. Abertura manual
Botão **"Abrir gaveta"** no menu do PDV V2, para sangria/suprimento ou conferência, visível só quando a gaveta está ativa.

## Detalhes técnicos

- Novo `src/utils/cashDrawer.ts`: monta o comando ESC/POS conforme modelo/pino/pulso e envia via `POST http://localhost:8081/gaveta`, timeout curto (2s).
- Fallback: se o agente local não responder, grava um job na `print_queue` com label `DRAWER_PULSE`, que o `auto_printer.py` interpreta como comando de abertura em vez de HTML.
- Novo hook `useCashDrawer()` lê a configuração da loja e expõe `openDrawer(reason)` — falha em silêncio (só log) para **nunca** travar a finalização de uma venda por problema de hardware.
- Novas chaves em `store_settings`: `drawer_enabled`, `drawer_model`, `drawer_pin`, `drawer_pulse`.
- Nada de TEF, PinPad, SmartPOS, NFC-e, layout de cupom ou fluxo fiscal é tocado — a chamada entra depois que a venda já está confirmada.

## Dependência externa

O `auto_printer.py` instalado na loja precisa de atualização para expor a rota `/gaveta` e tratar o label `DRAWER_PULSE`. O sistema já sai pronto para os dois caminhos; a atualização do script é entregue junto.
