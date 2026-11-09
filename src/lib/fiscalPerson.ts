// Helpers compartilhados de cadastro de pessoas (clientes/transportadores) para documentos fiscais.

export const onlyDigits = (v: string | null | undefined) => (v || '').replace(/\D/g, '');

export function formatCpfCnpj(v: string | null | undefined): string {
  const d = onlyDigits(v).slice(0, 14);
  if (d.length <= 11) {
    return d
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

export function formatCep(v: string | null | undefined): string {
  const d = onlyDigits(v).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

export const IND_IE_OPTIONS = [
  { value: '1', label: 'Contribuinte ICMS' },
  { value: '2', label: 'Contribuinte isento' },
  { value: '9', label: 'Não contribuinte' },
] as const;

/** Regra fiscal: contribuinte ICMS (1) exige inscrição estadual; isento/não contribuinte não informam IE. */
export function validateIndIE(indIE: string, ie: string): string | null {
  if (indIE === '1' && !ie.trim()) return 'Informe a inscrição estadual para contribuinte ICMS.';
  return null;
}

export type CepResult = { logradouro: string; bairro: string; cidade: string; uf: string; ibge: string };

export async function lookupCep(cep: string): Promise<CepResult | null> {
  const d = onlyDigits(cep);
  if (d.length !== 8) return null;
  try {
    const r = await fetch(`https://viacep.com.br/ws/${d}/json/`);
    const j = await r.json();
    if (!j || j.erro) return null;
    return { logradouro: j.logradouro || '', bairro: j.bairro || '', cidade: j.localidade || '', uf: j.uf || '', ibge: j.ibge || '' };
  } catch {
    return null;
  }
}
