import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAuthContext } from '@/contexts/AuthContext';
import {
  sendPinpadAdm,
  pollPinpadStatus,
  confirmPinpadTransaction,
  checkPinpadActive,
  isPinpadConfigured,
  reprintLastReceipt,
} from '@/services/pinpadService';
import { useQuery } from '@tanstack/react-query';
import {
  Settings2,
  Loader2,
  Wifi,
  Printer,
  FileSpreadsheet,
  ListChecks,
  Activity,
  AlertCircle,
  CheckCircle2,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';

interface AdmAction {
  id: string;
  title: string;
  description: string;
  icon: typeof Wifi;
  /** Mensagem exibida durante a execução (orientação ao operador no PinPad). */
  hint: string;
}

const ADM_ACTIONS: AdmAction[] = [
  {
    id: 'comm-test',
    title: 'Teste de Comunicação',
    description: 'Verifica a conexão entre o sistema e o servidor da adquirente.',
    icon: Wifi,
    hint: 'No menu do PinPad, selecione "TESTE DE COMUNICAÇÃO" e siga as instruções.',
  },
  {
    id: 'reprint-closing',
    title: 'Reimpressão de Fechamento',
    description: 'Reimprime o último relatório de fechamento (lote) da adquirente.',
    icon: Printer,
    hint: 'No menu do PinPad, selecione "REIMPRESSÃO" → "FECHAMENTO" e confirme.',
  },
  {
    id: 'reprint-last',
    title: 'Reimpressão do Último Comprovante',
    description: 'Envia comando direto de reimpressão do último comprovante de venda ao PinPad.',
    icon: FileSpreadsheet,
    hint: 'O comando é enviado automaticamente. Aguarde o PinPad imprimir a 2ª via.',
  },
  {
    id: 'transactions-report',
    title: 'Relatório de Transações',
    description: 'Imprime o relatório resumido das transações pendentes na maquininha.',
    icon: ListChecks,
    hint: 'No menu do PinPad, selecione "RELATÓRIO" → "TRANSAÇÕES".',
  },
];

export default function TefAdm() {
  const { company } = useAuthContext();
  const [running, setRunning] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{
    actionId: string;
    success: boolean;
    message: string;
  } | null>(null);

  const { data: configured, isLoading: loadingConfig } = useQuery({
    queryKey: ['pinpad-configured', company?.id],
    queryFn: async () => (company?.id ? await isPinpadConfigured(company.id) : false),
    enabled: !!company?.id,
  });

  const handleAtv = async () => {
    if (!company?.id) return;
    setRunning('atv');
    try {
      const res = await checkPinpadActive(company.id);
      setLastResult({
        actionId: 'atv',
        success: res.active,
        message: res.active
          ? 'Gerenciador Padrão ativo e respondendo.'
          : res.message || 'Gerenciador Padrão não está ativo.',
      });
      if (res.active) toast.success('Gerenciador Padrão ativo');
      else toast.error(res.message || 'Falha no ATV');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro desconhecido';
      setLastResult({ actionId: 'atv', success: false, message: msg });
      toast.error(msg);
    } finally {
      setRunning(null);
    }
  };

  const handleAdm = async (action: AdmAction) => {
    if (!company?.id) return;
    setRunning(action.id);
    setLastResult(null);
    try {
      // Reimpressão do último comprovante usa comando direto RPR (CRT 800-001=8)
      // ao invés do menu ADM genérico.
      const start =
        action.id === 'reprint-last'
          ? await reprintLastReceipt(company.id)
          : await sendPinpadAdm(company.id);
      if (!start.success || !start.hash) {
        const msg =
          start.errorMessage ||
          (action.id === 'reprint-last'
            ? 'Falha ao solicitar reimpressão do último comprovante.'
            : 'Falha ao iniciar operação ADM no PinPad');
        setLastResult({ actionId: action.id, success: false, message: msg });
        toast.error(msg);
        setRunning(null);
        return;
      }

      toast.info(
        action.id === 'reprint-last'
          ? 'Reimpressão solicitada. Aguardando confirmação do PinPad...'
          : 'Menu ADM enviado ao PinPad. Siga as instruções no equipamento.'
      );

      // Aguarda finalização da operação (timeout 2 min)
      let lastStatus: string | null = null;
      for (let i = 0; i < 80; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        const status = await pollPinpadStatus(company.id, start.hash);
        lastStatus = status.status;

        if (status.status === 'approved') {
          // Confirma para liberar o gerenciador
          await confirmPinpadTransaction(company.id, {
            identificacao: String(Date.now()),
            rede: status.acquirer,
            nsu: status.nsu,
            finalizacao: status.finalizacao,
          });
          setLastResult({
            actionId: action.id,
            success: true,
            message: status.operatorMessage || 'Operação ADM concluída com sucesso.',
          });
          toast.success('Operação ADM concluída');
          setRunning(null);
          return;
        }
        if (['declined', 'error', 'cancelled'].includes(status.status)) {
          const msg =
            status.errorMessage ||
            status.operatorMessage ||
            'Operação ADM não foi concluída.';
          setLastResult({ actionId: action.id, success: false, message: msg });
          toast.error(msg);
          setRunning(null);
          return;
        }
      }

      const timeoutMsg = `Timeout aguardando resposta do PinPad (último status: ${lastStatus ?? 'pending'})`;
      setLastResult({ actionId: action.id, success: false, message: timeoutMsg });
      toast.error(timeoutMsg);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro desconhecido';
      setLastResult({ actionId: action.id, success: false, message: msg });
      toast.error(msg);
    } finally {
      setRunning(null);
    }
  };

  return (
    <AppLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-6 max-w-5xl">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
              <Settings2 className="w-7 h-7 text-primary" />
              TEF ADM (Manutenção)
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Funções administrativas do PinPad — Teste de comunicação, reimpressões e relatórios da adquirente.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleAtv} disabled={!configured || running === 'atv'}>
            {running === 'atv' ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Activity className="w-4 h-4 mr-2" />
            )}
            Verificar Gerenciador (ATV)
          </Button>
        </div>

        {/* Status de configuração */}
        {loadingConfig ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Verificando configuração...
          </div>
        ) : !configured ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>PinPad TEF não configurado</AlertTitle>
            <AlertDescription>
              Configure o Token, CNPJ e PDV em <strong>Configurações → Integrações → PinPad TEF</strong> antes de
              executar funções ADM.
            </AlertDescription>
          </Alert>
        ) : (
          <Alert>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <AlertTitle>PinPad configurado</AlertTitle>
            <AlertDescription>
              Pronto para executar funções administrativas. Mantenha o PinPad conectado e ligado.
            </AlertDescription>
          </Alert>
        )}

        {/* Resultado da última operação */}
        {lastResult && (
          <Alert variant={lastResult.success ? 'default' : 'destructive'}>
            {lastResult.success ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : (
              <AlertCircle className="h-4 w-4" />
            )}
            <AlertTitle>{lastResult.success ? 'Operação concluída' : 'Falha na operação'}</AlertTitle>
            <AlertDescription>{lastResult.message}</AlertDescription>
          </Alert>
        )}

        {/* Grid de funções ADM */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {ADM_ACTIONS.map((action) => {
            const Icon = action.icon;
            const isRunning = running === action.id;
            const isOtherRunning = !!running && !isRunning;
            return (
              <Card key={action.id} className={isRunning ? 'border-primary' : ''}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Icon className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{action.title}</CardTitle>
                      </div>
                    </div>
                    {isRunning && (
                      <Badge variant="outline" className="gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> Executando
                      </Badge>
                    )}
                  </div>
                  <CardDescription className="pt-2">{action.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-xs text-muted-foreground flex gap-2 bg-muted/50 rounded-md p-2">
                    <Info className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{action.hint}</span>
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => handleAdm(action)}
                    disabled={!configured || isRunning || isOtherRunning}
                  >
                    {isRunning ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Aguardando PinPad...
                      </>
                    ) : (
                      <>
                        <Icon className="w-4 h-4 mr-2" />
                        Executar
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Como funciona</AlertTitle>
          <AlertDescription className="text-xs space-y-1 mt-2">
            <p>
              Ao clicar em <strong>Executar</strong>, o sistema envia o comando ADM ao Gerenciador Padrão. O menu
              administrativo será aberto no PinPad para que o operador navegue até a opção desejada.
            </p>
            <p>
              Ao concluir a operação na maquininha, o sistema confirma automaticamente a transação com a adquirente
              (CNF) e libera o equipamento para novas vendas.
            </p>
          </AlertDescription>
        </Alert>
      </div>
    </AppLayout>
  );
}
