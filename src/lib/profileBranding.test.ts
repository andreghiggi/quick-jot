import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const bootstrap = readFileSync(new URL('../../public/profile-branding.js', import.meta.url), 'utf8');
const key = 'comandatech_tab_brand';

function boot(pathname: string, search = '', hint?: string, blocked = false) {
  const storage = new Map<string, string>(hint ? [[key, hint]] : []);
  const elements: Record<string, { name?: string; rel?: string }> = {};
  const document = {
    title: '',
    querySelector: (selector: string) => elements[selector] ?? null,
    createElement: () => ({}),
    head: { appendChild: (element: { name?: string; rel?: string }) => {
      elements[element.rel ? 'link[rel~="icon"]' : `meta[name="${element.name}"]`] = element;
    } },
  };
  const window = {
    location: { pathname, search },
    sessionStorage: {
      getItem: (k: string) => { if (blocked) throw new Error('blocked'); return storage.get(k) ?? null; },
      setItem: (k: string, v: string) => { if (blocked) throw new Error('blocked'); storage.set(k, v); },
      removeItem: (k: string) => { if (blocked) throw new Error('blocked'); storage.delete(k); },
    },
    ComandaTechBranding: undefined as undefined | {
      initialIsFlorist: () => boolean;
      remember: (companyId: string) => void;
      clear: () => void;
      read: () => { companyId: string; path: string } | null;
    },
  };
  vm.runInNewContext(bootstrap, { window, document, URLSearchParams });
  const api = window.ComandaTechBranding;
  if (!api) throw new Error('bootstrap did not initialize');
  return { api, window, storage };
}

describe('isolamento da indicação temporária de floricultura', () => {
  const hint = JSON.stringify({ companyId: 'florist-company', path: '/pdv-v2' });

  it('o link obrigatório ativa floricultura sem memória persistida', () => {
    expect(boot('/floricultura').api.initialIsFlorist()).toBe(true);
    expect(boot('/auth', '?perfil=floricultura').api.initialIsFlorist()).toBe(true);
  });

  it('o login tradicional ignora e remove a indicação da floricultura', () => {
    const { api, storage } = boot('/auth', '', hint);
    expect(api.initialIsFlorist()).toBe(false);
    expect(storage.has(key)).toBe(false);
  });

  it('recarregar a última rota retém somente a indicação da empresa floral', () => {
    expect(boot('/pdv-v2', '', hint).api.initialIsFlorist()).toBe(true);
  });

  it('uma rota diferente ou outra consulta não herda a marca', () => {
    expect(boot('/pedidos', '', hint).api.initialIsFlorist()).toBe(false);
    expect(boot('/pdv-v2', '?loja=outra', hint).api.initialIsFlorist()).toBe(false);
  });

  it('uma aba nova de restaurante não recebe indicação floral', () => {
    expect(boot('/pdv-v2').api.initialIsFlorist()).toBe(false);
  });

  it('a confirmação grava só empresa e rota; sair remove a indicação', () => {
    const { api } = boot('/pdv-v2');
    api.remember('florist-company');
    expect(JSON.parse(JSON.stringify(api.read()))).toEqual({ companyId: 'florist-company', path: '/pdv-v2' });
    api.clear();
    expect(api.read()).toBe(null);
    expect(api.initialIsFlorist()).toBe(false);
  });

  it('indicação inválida ou acesso bloqueado à memória não ativam floricultura', () => {
    expect(boot('/pdv-v2', '', '{invalid').api.initialIsFlorist()).toBe(false);
    expect(boot('/pdv-v2', '', JSON.stringify({ path: '/pdv-v2' })).api.initialIsFlorist()).toBe(false);
    expect(boot('/pdv-v2', '', hint, true).api.initialIsFlorist()).toBe(false);
    expect(boot('/floricultura', '', undefined, true).api.initialIsFlorist()).toBe(true);
  });
});
import { resolveFloristLook } from './profileBranding';

describe('florist look while modules load', () => {
  it('keeps the florist look only for the company this tab already confirmed', () => {
    expect(resolveFloristLook(false, true, 'florist-company', 'florist-company')).toBe(true);
    expect(resolveFloristLook(false, true, 'restaurant-company', 'florist-company')).toBe(false);
    expect(resolveFloristLook(false, true, 'restaurant-company', null)).toBe(false);
  });

  it('follows the confirmed profile once modules answered', () => {
    expect(resolveFloristLook(false, false, 'florist-company', 'florist-company')).toBe(false);
    expect(resolveFloristLook(true, false, 'florist-company', null)).toBe(true);
  });
});
