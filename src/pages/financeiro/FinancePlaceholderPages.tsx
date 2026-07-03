import { FinancePlaceholder } from '@/components/financeiro/FinanceModuleLayout';

export function ReceitasRelatorios() {
  return <FinancePlaceholder kind="receitas" title="Receitas" subtitle="Relatórios de Receitas"
    description="Análises consolidadas, agrupamentos por cliente, plano de contas e centro de custo, com filtros por período e exportação." />;
}
export function DespesasRelatorios() {
  return <FinancePlaceholder kind="despesas" title="Despesas" subtitle="Relatórios de Despesas"
    description="Análises consolidadas, agrupamentos por fornecedor, plano de contas e centro de custo, com filtros por período e exportação." />;
}
export function ReceitasConfiguracoes() {
  return <FinancePlaceholder kind="receitas" title="Receitas" subtitle="Configurações — Receitas"
    description="Numeração de documento, juros/multa padrão, dias de tolerância e conta financeira padrão para receitas." />;
}
export function DespesasConfiguracoes() {
  return <FinancePlaceholder kind="despesas" title="Despesas" subtitle="Configurações — Despesas"
    description="Numeração de documento, juros/multa padrão, dias de tolerância e conta financeira padrão para despesas." />;
}
export function PlanosDeContas() {
  return <FinancePlaceholder kind="receitas" title="Planos de contas" subtitle="Planos de contas"
    description="Cadastro hierárquico (grupo → subgrupo → conta) usado para classificar receitas e despesas." />;
}
export function CentrosDeCustos() {
  return <FinancePlaceholder kind="receitas" title="Centros de custos" subtitle="Centros de custos"
    description="Cadastro de centros de custos vinculáveis a lançamentos financeiros para análises segmentadas." />;
}