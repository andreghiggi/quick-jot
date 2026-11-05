import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { resolveCepNeighborhood } from '@/lib/addressFormRules';

interface CepAddress { address: string; neighborhood: string; city: string; state: string }
export function AddressCepInput({ onFound, neighborhoodNames = [] }: { onFound: (address: CepAddress) => void; neighborhoodNames?: string[] }) {
  const [cep, setCep] = useState('');
  const [status, setStatus] = useState('');
  const latest = useRef({ onFound, neighborhoodNames });
  latest.current = { onFound, neighborhoodNames };
  useEffect(() => {
    const digits = cep.replace(/\D/g, '');
    if (digits.length !== 8) { setStatus(''); return; }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setStatus('Buscando CEP…');
      try {
        const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`, { signal: controller.signal });
        if (!response.ok) throw new Error('CEP');
        const data = await response.json();
        if (controller.signal.aborted) return;
        if (data.erro) { setStatus('CEP não encontrado.'); return; }
        const resolved = resolveCepNeighborhood(data.bairro, latest.current.neighborhoodNames);
        latest.current.onFound({ address: data.logradouro ?? '', neighborhood: resolved.neighborhood, city: data.localidade ?? '', state: data.uf ?? '' });
        setStatus(resolved.specific ? `CEP encontrado: ${resolved.neighborhood}.` : latest.current.neighborhoodNames.length ? 'CEP geral encontrado. Selecione o bairro.' : 'CEP geral encontrado. Informe o bairro.');
      } catch { if (!controller.signal.aborted) setStatus('Não foi possível buscar o CEP.'); }
    }, 400);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [cep]);
  return <div><Label>CEP (opcional)</Label><Input aria-label="CEP (opcional)" value={cep} inputMode="numeric" maxLength={9} placeholder="00000-000" className="text-base md:text-sm" onChange={e => { const d = e.target.value.replace(/\D/g, '').slice(0, 8); setCep(d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d); }} />{status && <p role="status" className="mt-1 text-xs text-muted-foreground">{status}</p>}</div>;
}