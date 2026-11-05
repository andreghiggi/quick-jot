export function normalizeNeighborhood(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
}

export function resolveCepNeighborhood(bairro: string | undefined, names: string[]) {
  const name = bairro?.trim() ?? '';
  if (!name) return { neighborhood: '', specific: false };
  return { neighborhood: names.find(n => normalizeNeighborhood(n) === normalizeNeighborhood(name)) ?? name, specific: true };
}

export function neighborhoodOptions(names: string[], value: string) {
  return [...new Set([...names, ...(value.trim() ? [value] : [])])];
}

export function toggleAddressLabel(current: string, suggestion: string) {
  return current === suggestion ? '' : suggestion;
}

export function addressLabelDisabled(current: string, suggestion: string) {
  return ['Casa', 'Trabalho'].includes(current) && current !== suggestion;
}