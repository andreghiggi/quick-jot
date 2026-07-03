import { ReactNode, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, List, BarChart3, FolderTree, Building2, Settings2, Menu as MenuIcon, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Kind = 'receitas' | 'despesas';

interface Props {
  kind: Kind;
  title: string;
  children: ReactNode;
}

interface Item {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
}

function buildGroups(kind: Kind): { label: string; items: Item[] }[] {
  const base = `/financeiro/${kind}`;
  return [
    {
      label: 'Acessos',
      items: [
        { label: 'Lista', to: base, icon: List },
        { label: 'Relatórios', to: `${base}/relatorios`, icon: BarChart3 },
      ],
    },
    {
      label: 'Auxiliares',
      items: [
        { label: 'Planos de contas', to: '/financeiro/planos-de-contas', icon: FolderTree },
        { label: 'Centros de custos', to: '/financeiro/centros-de-custos', icon: Building2 },
      ],
    },
    {
      label: `Configurações ${kind === 'receitas' ? 'Receitas' : 'Despesas'}`,
      items: [
        { label: 'Configurações', to: `${base}/configuracoes`, icon: Settings2 },
      ],
    },
  ];
}

function MenuList({ kind, onNavigate }: { kind: Kind; onNavigate?: () => void }) {
  const groups = buildGroups(kind);
  const { pathname } = useLocation();
  return (
    <nav className="space-y-4">
      {groups.map((g) => (
        <div key={g.label}>
          <div className="px-3 py-1.5 text-[11px] uppercase tracking-wider text-muted-foreground bg-muted/40 rounded">
            {g.label}
          </div>
          <ul className="mt-1 space-y-0.5">
            {g.items.map((it) => {
              const active = pathname === it.to || (it.to !== `/financeiro/${kind}` && pathname.startsWith(it.to));
              return (
                <li key={it.to}>
                  <NavLink
                    to={it.to}
                    onClick={onNavigate}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 rounded text-sm border-l-2 transition-colors',
                      active
                        ? 'border-primary bg-primary/10 text-foreground font-medium'
                        : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50',
                    )}
                  >
                    <it.icon className="h-4 w-4" />
                    <span>{it.label}</span>
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function FinanceModuleLayout({ kind, title, children }: Props) {
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="container max-w-7xl py-4">
      <div className="flex items-center gap-2 mb-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-semibold flex-1">{title}</h1>
        <Button
          variant="outline"
          size="icon"
          className="lg:hidden"
          onClick={() => setMobileOpen(true)}
          aria-label="Abrir menu"
        >
          <MenuIcon className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex gap-4">
        <div className="flex-1 min-w-0 space-y-3">{children}</div>

        {/* Desktop right rail */}
        <aside className="hidden lg:block w-56 shrink-0">
          <div className="sticky top-4">
            <MenuList kind={kind} />
          </div>
        </aside>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="absolute right-0 top-0 h-full w-64 bg-background border-l border-border p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">Menu {title}</span>
              <Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <MenuList kind={kind} onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}

/** Placeholder page for modules under construction. */
export function FinancePlaceholder({
  kind, title, subtitle, description,
}: { kind: Kind; title: string; subtitle: string; description: string }) {
  return (
    <FinanceModuleLayout kind={kind} title={title}>
      <div className="rounded-lg border border-dashed border-border bg-muted/20 p-10 text-center">
        <h2 className="text-lg font-medium mb-1">{subtitle}</h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">{description}</p>
        <p className="mt-4 text-xs text-muted-foreground">Em breve — Fase 2+ do módulo Financeiro.</p>
      </div>
    </FinanceModuleLayout>
  );
}