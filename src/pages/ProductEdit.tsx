import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ArrowLeft, ChevronDown, ChevronRight, Tag, DollarSign, Eye, FileText, Package } from 'lucide-react';
import { useAuthContext } from '@/contexts/AuthContext';
import { useProducts } from '@/hooks/useProducts';
import { useCompanyModules } from '@/hooks/useCompanyModules';
import { cn } from '@/lib/utils';

/**
 * Página de cadastro/edição de produto (Fase B — Passo 1).
 *
 * Rotas:
 *   /produtos/novo        → cadastro
 *   /produtos/:id         → edição
 *
 * Este é o ESQUELETO. Ainda não substitui o modal antigo em Products.tsx —
 * a página antiga continua funcionando normalmente. Os blocos abaixo serão
 * preenchidos no Passo 2 do plano.
 */
export default function ProductEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { company } = useAuthContext();
  const { products, loading } = useProducts({ companyId: company?.id });
  const { isModuleEnabled } = useCompanyModules({ companyId: company?.id });

  const isNew = !id || id === 'novo';
  const product = useMemo(
    () => (isNew ? null : products.find((p) => p.id === id) ?? null),
    [products, id, isNew],
  );

  const mercadoEnabled = isModuleEnabled('mercado');

  // Estado de abertura dos blocos. Identificação aberta por padrão.
  const [open, setOpen] = useState({
    identificacao: true,
    preco: false,
    visibilidade: false,
    fiscal: false,
    estoque: false,
  });

  // Edição com id inválido → volta pra lista
  if (!isNew && !loading && !product) {
    return <Navigate to="/produtos" replace />;
  }

  const title = isNew ? 'Novo produto' : product?.name || 'Editar produto';

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto p-4 space-y-4">
        {/* Cabeçalho fixo: voltar + título + ações */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/produtos')}
              aria-label="Voltar"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-semibold truncate">{title}</h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" onClick={() => navigate('/produtos')}>
              Cancelar
            </Button>
            <Button disabled title="Disponível no próximo passo">
              Salvar
            </Button>
          </div>
        </div>

        <Block
          icon={<Tag className="h-4 w-4" />}
          title="Identificação"
          description="Nome, categoria, descrição e imagem"
          open={open.identificacao}
          onToggle={() => setOpen((s) => ({ ...s, identificacao: !s.identificacao }))}
        >
          <Placeholder>Campos serão migrados no próximo passo.</Placeholder>
        </Block>

        <Block
          icon={<DollarSign className="h-4 w-4" />}
          title="Preço e custo"
          description="Preço de venda, custo e margem"
          open={open.preco}
          onToggle={() => setOpen((s) => ({ ...s, preco: !s.preco }))}
        >
          <Placeholder>Campos serão migrados no próximo passo.</Placeholder>
        </Block>

        <Block
          icon={<Eye className="h-4 w-4" />}
          title="Visibilidade"
          description="Onde o produto aparece (cardápio, PDV, garçom, destaque)"
          open={open.visibilidade}
          onToggle={() => setOpen((s) => ({ ...s, visibilidade: !s.visibilidade }))}
        >
          <Placeholder>Campos serão migrados no próximo passo.</Placeholder>
        </Block>

        <Block
          icon={<FileText className="h-4 w-4" />}
          title="Fiscal"
          description="Regra de tributação, GTIN, unidade"
          open={open.fiscal}
          onToggle={() => setOpen((s) => ({ ...s, fiscal: !s.fiscal }))}
        >
          <Placeholder>Campos serão migrados no próximo passo.</Placeholder>
        </Block>

        {mercadoEnabled && (
          <Block
            icon={<Package className="h-4 w-4" />}
            title="Estoque"
            description="Controle de estoque, saldo atual e mínimo"
            open={open.estoque}
            onToggle={() => setOpen((s) => ({ ...s, estoque: !s.estoque }))}
          >
            <Placeholder>Campos serão migrados no próximo passo.</Placeholder>
          </Block>
        )}

        <p className="text-xs text-muted-foreground text-center pt-2">
          Esta é a nova página de cadastro/edição (em construção). O cadastro pelo modal antigo continua funcionando normalmente em <strong>/produtos</strong>.
        </p>
      </div>
    </AppLayout>
  );
}

function Block({
  icon,
  title,
  description,
  open,
  onToggle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <Collapsible open={open} onOpenChange={onToggle}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-muted/40 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center text-muted-foreground shrink-0">
                {icon}
              </div>
              <div className="min-w-0">
                <div className="font-medium">{title}</div>
                <div className="text-xs text-muted-foreground truncate">{description}</div>
              </div>
            </div>
            {open ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className={cn('border-t p-4')}>{children}</div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-sm text-muted-foreground italic py-6 text-center">
      {children}
    </div>
  );
}