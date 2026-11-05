// Bairros pré-carregados por cidade, identificada pelo CEP da loja.
// Para adicionar cidades, inclua um novo bloco com os CEPs (8 dígitos) da cidade.
export interface CityNeighborhoodPreset {
  city: string;
  state: string;
  ceps: string[];
  neighborhoods: string[];
}

export const CITY_NEIGHBORHOOD_PRESETS: CityNeighborhoodPreset[] = [
  {
    city: 'Guaporé',
    state: 'RS',
    ceps: ['99200000'],
    neighborhoods: [
      'Centro', 'Planalto', 'Santo André', 'São Cristóvão', 'Pinheirinho',
      'Nossa Senhora do Carmo', 'Fátima', 'Promorar', 'Bela Vista', 'Santa Rita',
      'União', 'São José', 'Triângulo', 'Bom Jesus', 'Scalabrini', 'Imigrante',
      'Conceição', 'Interior',
    ],
  },
];

const digits = (v?: string | null) => (v || '').replace(/\D/g, '');

export function presetForCep(cep?: string | null): CityNeighborhoodPreset | null {
  const d = digits(cep);
  if (d.length !== 8) return null;
  return CITY_NEIGHBORHOOD_PRESETS.find(p => p.ceps.includes(d)) || null;
}

/** Bairros configurados da loja têm prioridade; senão usa a base da cidade pelo CEP da loja. */
export function resolveStoreNeighborhoodNames(configured: string[], storeCep?: string | null): string[] {
  if (configured.length > 0) return configured;
  return presetForCep(storeCep)?.neighborhoods ?? [];
}
