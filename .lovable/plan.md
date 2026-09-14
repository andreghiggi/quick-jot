# Plano — Correções dos 6 alertas do Project monitoring

Corrigir somente os seis fluxos confirmados, sem alterar dados, emitir/reemitir notas ou ampliar lojas-piloto.

## Alterações

1. **Comanda sem nome**
   - Aceitar pedidos sem nome de cliente na fila de impressão, usando um rótulo neutro.
   - Tratar explicitamente falhas de enfileiramento no PDV V2.

2. **Vias TEF e início da NFC-e**
   - Manter o diálogo pós-venda acessível sempre que houver TEF, mesmo após a tentativa antecipada.
   - Disparar a tentativa de impressão sem aguardá-la antes de iniciar a NFC-e.
   - Tratar o retorno como envio solicitado, não como confirmação física, preservando a reimpressão.

3. **Cardápio e adicionais**
   - Só liberar cardápio e pedidos após configurações, adicionais, bairros e horários concluírem a carga.

4. **Recuperação fiscal segura**
   - Atualizar apenas campos realmente retornados pela consulta fiscal.
   - Aceitar os mesmos formatos de chave, QR e XML usados pelos outros fluxos.
   - Condicionar a gravação ao estado e à versão originalmente lidos, impedindo sobrescrita concorrente de nota autorizada.
   - Separar notas em contingência do fluxo geral de notas presas.

5. **Quantidades após pagamento parcial**
   - Impedir que o último item seja removido na tela de pagamento, evitando mudança dos índices usados pelos marcadores pagos.

6. **Registro e validação**
   - Registrar as correções em Novidades e atualizar a versão.
   - Validar tipos, build e fluxos afetados sem executar operação fiscal real.
   - Marcar cada alerta como corrigido somente após a validação.

## Detalhes técnicos

- Nenhuma migração ou alteração de dados será executada.
- A função fiscal será corrigida apenas no código; implantação dependerá do Lovable Cloud disponível.
- Comunicação com PinPad, autorização fiscal, numeração e `external_id` permanecem inalterados.
