import { describe, expect, it } from 'vitest';
import { nfeDanfeHtml } from './nfeDanfe';

describe('NF-e draft fiscal safety', () => {
  it('preview never uses persisted key or authorization protocol', () => {
    const key = '43261120846140000192550010000069121913666580';
    const html = nfeDanfeHtml({}, { chave_acesso: key, protocolo: '243260468959293' });
    expect(html.replace(/\s/g, '')).not.toContain(key);
    expect(html).not.toContain('243260468959293');
  });
  it('does not infer ICMS base or value from draft aliquots', () => {
    const html = nfeDanfeHtml({}, { itens: [{ quantidade: 1, valor_unitario: 100, icms_aliquot: 18, descricao: 'Produto' }], valor_total: 100 });
    expect(html).not.toContain('18,00</div>');
    expect(html).toContain('100,00');
  });
});