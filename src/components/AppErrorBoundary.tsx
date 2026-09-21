import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  componentStack: string;
}

/**
 * Evita a "tela branca": qualquer erro de renderização passa a mostrar uma
 * mensagem legível com a opção de recarregar, em vez de apagar a tela.
 *
 * Erros de carregamento de trecho do aplicativo (comuns logo após uma
 * atualização, quando o navegador ainda tem a versão antiga em memória)
 * recarregam a página automaticamente uma única vez.
 */
const RELOAD_FLAG = "comandatech:chunk-reload";

function hasReloaded(): boolean {
  try {
    return sessionStorage.getItem(RELOAD_FLAG) === "1";
  } catch {
    return false;
  }
}

function markReload(): void {
  try {
    sessionStorage.setItem(RELOAD_FLAG, "1");
  } catch {
    // O navegador pode bloquear sessionStorage; a tela de erro continua acessível.
  }
}

function clearReloadMark(): void {
  try {
    sessionStorage.removeItem(RELOAD_FLAG);
  } catch {
    // Sem storage, basta recarregar normalmente.
  }
}

function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error ?? "");
  return /Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
    message,
  );
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: "" };

  static getDerivedStateFromError(error: Error): State {
    return { error, componentStack: "" };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[app] erro de renderização", error, info.componentStack);
    this.setState({ componentStack: info.componentStack });
    if (isChunkLoadError(error) && !hasReloaded()) {
      markReload();
      window.location.reload();
    }
  }

  render() {
    const { error, componentStack } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-lg border border-destructive/30 bg-card p-6 text-center space-y-3">
          <h1 className="text-lg font-semibold text-foreground">Não foi possível abrir esta tela</h1>
          <p className="text-sm text-muted-foreground">
            O sistema continua funcionando. Recarregue a página para tentar de novo. Se continuar,
            informe o suporte com a mensagem abaixo.
          </p>
          <pre className="text-xs text-left text-muted-foreground bg-muted rounded p-2 whitespace-pre-wrap break-words overflow-auto max-h-32">
            {[error.name, error.message, componentStack.trim().split("\n")[0]].filter(Boolean).join(" · ")}
          </pre>
          <button
            type="button"
            onClick={() => {
               clearReloadMark();
              window.location.reload();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Recarregar
          </button>
        </div>
      </div>
    );
  }
}
