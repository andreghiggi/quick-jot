/**
 * Resolve o "autoPrint" do DANFE respeitando a configuração global
 * `pdv_settings.print_on_finish_mode`.
 *
 * Ordem de precedência (do mais explícito para o mais implícito):
 *
 *  1. `printDocument === true`  → sempre imprime (operador escolheu "Imprimir"
 *     no prompt da Lancheria I9, por exemplo).
 *  2. `printDocument === false` → nunca imprime (operador escolheu "Não").
 *  3. `printDocument === undefined` → usa a config da loja:
 *       - 'auto' → imprime automático
 *       - 'ask'  → não imprime automático; o `PostSaleDialog` exibe
 *                  o prompt "Deseja imprimir o DANFE?"
 *       - 'off'  → não imprime; operador pode confirmar/cancelar no prompt
 *
 * Ficar centralizado aqui evita cair no bug antigo em que
 * `printDocument !== false` fazia o DANFE sair automaticamente em qualquer
 * loja, ignorando o modo escolhido no menu Configurações do PDV.
 */
export type PrintOnFinishMode = 'off' | 'auto' | 'ask';

export function resolveAutoPrintDanfe(
  printDocument: boolean | undefined,
  mode: PrintOnFinishMode | null | undefined,
): boolean {
  if (printDocument === true) return true;
  if (printDocument === false) return false;
  return mode === 'auto';
}