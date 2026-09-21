/**
 * Limite de espera das verificações de módulo por loja.
 *
 * Sem este limite, uma consulta lenta ou sem resposta deixa o usuário preso
 * em tela vazia, porque os guards de rota só renderizam depois que a
 * verificação termina. Ao estourar o limite, seguimos com o último valor
 * conhecido (cache local ou padrão do hook) e liberamos a tela.
 */
export const MODULE_FLAG_TIMEOUT_MS = 6000;

export function scheduleModuleFlagTimeout(
  moduleName: string,
  companyId: string,
  release: () => void,
): number {
  return window.setTimeout(() => {
    console.warn(
      `[modules] ${moduleName} sem resposta após ${MODULE_FLAG_TIMEOUT_MS}ms (loja ${companyId}) — liberando a tela com o último valor conhecido`,
    );
    release();
  }, MODULE_FLAG_TIMEOUT_MS);
}
