type NfeProductIdentity = {
  codigo?: unknown;
  cProd?: unknown;
  code?: unknown;
  gtin?: unknown;
  product_id?: unknown;
  id?: unknown;
};

/** Preserve explicit codes; legacy drafts fall back to their registered product identity. */
export function nfeProductCode(item: NfeProductIdentity): string {
  for (const value of [item.codigo, item.cProd, item.code, item.gtin, item.product_id, item.id]) {
    if (typeof value !== 'string' && typeof value !== 'number') continue;
    const code = String(value).trim();
    if (code && code.toUpperCase() !== 'SEM GTIN') return code;
  }
  return '';
}

export function withNfeProductCode<T extends NfeProductIdentity>(item: T) {
  const codigo = nfeProductCode(item);
  return { ...item, code: codigo, codigo, cProd: codigo };
}