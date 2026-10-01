export interface FunctionErrorInfo {
  message: string;
  code?: string | null;
}

/**
 * `supabase.functions.invoke()` em status HTTP não-2xx lança um
 * `FunctionsHttpError` cuja `.message` é SEMPRE a string genérica
 * "Edge Function returned a non-2xx status code" — o corpo JSON real
 * (onde nossas edge functions colocam `{ error: "...", code: "..." }`) só
 * existe em `error.context`, que é o próprio `Response` (precisa
 * `.json()`/`.text()` para ler; `.body` é um ReadableStream, nunca uma
 * string pronta).
 *
 * Use esta função em vez de `error.message` direto sempre que exibir ao
 * usuário o erro de uma chamada a edge function.
 */
export async function extractFunctionError(
  error: unknown,
  data: any,
  fallback: string,
): Promise<FunctionErrorInfo> {
  if (data?.error) return { message: data.error, code: data.code ?? null };

  const ctx = (error as any)?.context;
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = await ctx.clone().json();
      if (body?.error) return { message: body.error, code: body.code ?? null };
    } catch {
      // não era JSON — tenta como texto abaixo
    }
  }
  if (ctx && typeof ctx.text === 'function') {
    try {
      const text = await ctx.clone().text();
      const body = JSON.parse(text);
      if (body?.error) return { message: body.error, code: body.code ?? null };
    } catch {
      // corpo não era JSON válido
    }
  }

  return { message: (error as any)?.message || fallback, code: null };
}

/** Atalho quando só a mensagem importa (sem precisar do `code`). */
export async function extractFunctionErrorMessage(
  error: unknown,
  data: any,
  fallback: string,
): Promise<string> {
  return (await extractFunctionError(error, data, fallback)).message;
}
