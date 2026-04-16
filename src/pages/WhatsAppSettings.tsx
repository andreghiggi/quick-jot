import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuthContext } from '@/contexts/AuthContext';
import { useWhatsApp } from '@/hooks/useWhatsApp';
import { useCompanyModules } from '@/hooks/useCompanyModules';
import { useStoreSettings } from '@/hooks/useStoreSettings';
import { WhatsAppMessageTemplates } from '@/components/whatsapp/WhatsAppMessageTemplates';
import { WhatsAppAutoReplyInfo } from '@/components/whatsapp/WhatsAppAutoReplyInfo';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ArrowLeft,
  MessageCircle,
  QrCode,
  Wifi,
  WifiOff,
  Loader2,
  RefreshCw,
  Trash2,
  CheckCircle2,
  Star,
  Clock,
} from 'lucide-react';

export default function WhatsAppSettings() {
  const navigate = useNavigate();
  const { company } = useAuthContext();
  const { isModuleEnabled, toggleModule } = useCompanyModules({ companyId: company?.id });
  const { updateSetting } = useStoreSettings({ companyId: company?.id });
  const whatsappEnabled = isModuleEnabled('whatsapp');
  const [googleReviewUrl, setGoogleReviewUrl] = useState('');
  const [savingReviewUrl, setSavingReviewUrl] = useState(false);
  const [waitTime, setWaitTime] = useState('');
  const [savingWaitTime, setSavingWaitTime] = useState(false);
  const {
    instance,
    loading,
    qrCode,
    connecting,
    createInstance,
    getQRCode,
    checkStatus,
    disconnect,
    deleteInstance,
    resetInstance,
  } = useWhatsApp(company?.id);

  // whatsapp-reset-v1 rollout — explicit allow-list of company IDs.
  // To enable for another store, add its company_id to this array.
  const RESET_BUTTON_ALLOWED_COMPANIES = [
    'b2f97590-ff21-4951-95dc-e3e2b19d4ccb', // Rei do Açaí
  ];
  const showResetButton = !!company?.id && RESET_BUTTON_ALLOWED_COMPANIES.includes(company.id);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [polling, setPolling] = useState(false);

  // Load google review URL from store settings
  useEffect(() => {
    if (!company?.id) return;
    const loadReviewUrl = async () => {
      const { data } = await (await import('@/integrations/supabase/client')).supabase
        .from('store_settings')
        .select('value')
        .eq('company_id', company.id)
        .eq('key', 'google_review_url')
        .maybeSingle();
      if (data?.value) setGoogleReviewUrl(data.value);
    };
    const loadWaitTime = async () => {
      const { data } = await (await import('@/integrations/supabase/client')).supabase
        .from('store_settings')
        .select('value')
        .eq('company_id', company.id)
        .eq('key', 'estimated_wait_time')
        .maybeSingle();
      if (data?.value) setWaitTime(data.value);
    };
    loadReviewUrl();
    loadWaitTime();
  }, [company?.id]);

  async function saveGoogleReviewUrl() {
    setSavingReviewUrl(true);
    await updateSetting('google_review_url', googleReviewUrl);
    setSavingReviewUrl(false);
  }

  async function saveWaitTime() {
    setSavingWaitTime(true);
    await updateSetting('estimated_wait_time', waitTime);
    setSavingWaitTime(false);
  }

  // Auto-poll for connection status when QR is shown
  useEffect(() => {
    if (qrCode && !polling) {
      setPolling(true);
      pollRef.current = setInterval(async () => {
        const status = await checkStatus();
        if (status === 'connected') {
          if (pollRef.current) clearInterval(pollRef.current);
          setPolling(false);
        }
      }, 5000);
    }

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [qrCode]);

  const isConnected = instance?.status === 'connected';

  const headerActions = (
    <Button variant="outline" className="gap-2" onClick={() => navigate(-1)}>
      <ArrowLeft className="w-4 h-4" />
      Voltar
    </Button>
  );

  if (loading) {
    return (
      <AppLayout title="WhatsApp" actions={headerActions}>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="WhatsApp" actions={headerActions}>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Enable Module Card */}
        {!whatsappEnabled && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-green-600" />
                Módulo WhatsApp
              </CardTitle>
              <CardDescription>
                Habilite o módulo para enviar notificações automáticas de status dos pedidos via WhatsApp.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center py-6 space-y-4">
              <QrCode className="w-16 h-16 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                O módulo WhatsApp está desabilitado. Ative para conectar seu número e começar a enviar mensagens automáticas.
              </p>
              <Button onClick={() => toggleModule('whatsapp', true)} className="gap-2">
                <MessageCircle className="w-4 h-4" />
                Habilitar Módulo WhatsApp
              </Button>
            </CardContent>
          </Card>
        )}

        {whatsappEnabled && (
          <>
        {/* Status Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-green-600" />
              Conexão WhatsApp
            </CardTitle>
            <CardDescription>
              Conecte seu WhatsApp para enviar notificações automáticas de status dos pedidos
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!instance ? (
              <div className="text-center py-8 space-y-4">
                <QrCode className="w-16 h-16 mx-auto text-muted-foreground" />
                <div>
                  <p className="text-lg font-medium">Nenhuma instância conectada</p>
                  <p className="text-sm text-muted-foreground">
                    Clique abaixo para criar uma conexão e escanear o QR Code
                  </p>
                </div>
                <Button onClick={createInstance} disabled={connecting} className="gap-2">
                  {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
                  Conectar WhatsApp
                </Button>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Connection Status */}
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    {isConnected ? (
                      <Wifi className="w-5 h-5 text-green-600" />
                    ) : (
                      <WifiOff className="w-5 h-5 text-destructive" />
                    )}
                    <div>
                      <p className="font-medium">Status</p>
                      <p className="text-sm text-muted-foreground">
                        Instância: {instance.instance_name}
                      </p>
                    </div>
                  </div>
                  <Badge variant={isConnected ? 'default' : 'destructive'}>
                    {isConnected ? 'Conectado' : 'Desconectado'}
                  </Badge>
                </div>

                {/* QR Code Area */}
                {!isConnected && (
                  <div className="text-center py-6 space-y-4">
                    {qrCode ? (
                      <div className="space-y-3">
                        <p className="text-sm font-medium">Escaneie o QR Code com seu WhatsApp</p>
                        <div className="inline-block p-4 bg-white rounded-xl border shadow-sm">
                          <img
                            src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`}
                            alt="QR Code WhatsApp"
                            className="w-64 h-64 mx-auto"
                          />
                        </div>
                        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Aguardando conexão...
                        </div>
                        <Button variant="outline" size="sm" onClick={() => getQRCode()} className="gap-2">
                          <RefreshCw className="w-4 h-4" />
                          Atualizar QR Code
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                          Gere o QR Code para conectar seu WhatsApp
                        </p>
                        <Button onClick={() => getQRCode()} disabled={connecting} className="gap-2">
                          {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
                          Gerar QR Code
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {/* Connected actions */}
                {isConnected && (
                  <div className="text-center py-4 space-y-4">
                    <div className="flex items-center justify-center gap-2 text-green-600">
                      <CheckCircle2 className="w-6 h-6" />
                      <span className="font-medium">WhatsApp conectado e pronto!</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      As notificações de status dos pedidos serão enviadas automaticamente via WhatsApp.
                    </p>
                  </div>
                )}

                {/* Management Buttons */}
                <div className="flex gap-3 justify-end border-t pt-4 flex-wrap">
                  {showResetButton && (
                    <Button
                      variant="outline"
                      onClick={resetInstance}
                      disabled={connecting}
                      className="gap-2 border-amber-500 text-amber-700 hover:bg-amber-50"
                      title="Apaga e recria a conexão do zero (use quando o celular não consegue parear o QR Code)"
                    >
                      {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                      Resetar Conexão
                    </Button>
                  )}
                  {isConnected && (
                    <Button variant="outline" onClick={disconnect} className="gap-2">
                      <WifiOff className="w-4 h-4" />
                      Desconectar
                    </Button>
                  )}
                  <Button variant="destructive" onClick={deleteInstance} className="gap-2">
                    <Trash2 className="w-4 h-4" />
                    Remover Instância
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Auto Reply Info */}
        <WhatsAppAutoReplyInfo companySlug={company?.slug} />

        {/* Google Review Link */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Star className="w-4 h-4 text-yellow-500" />
              Link de Avaliação Google
            </CardTitle>
            <CardDescription>
              Adicione o link de avaliação do Google para incluir automaticamente na mensagem de pedido finalizado.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="google-review-url">URL de avaliação do Google</Label>
              <div className="flex gap-2">
                <Input
                  id="google-review-url"
                  placeholder="https://g.page/r/seu-link/review"
                  value={googleReviewUrl}
                  onChange={(e) => setGoogleReviewUrl(e.target.value)}
                />
                <Button onClick={saveGoogleReviewUrl} disabled={savingReviewUrl} size="sm">
                  {savingReviewUrl ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Cole aqui o link de avaliação do Google Maps do seu estabelecimento. Ele será incluído na mensagem de "Pedido Finalizado".
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Estimated Wait Time */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              Tempo Estimado de Preparo
            </CardTitle>
            <CardDescription>
              Informe o tempo médio de preparo. Esse tempo será enviado ao cliente quando o pedido entrar em preparo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="wait-time">Tempo estimado (ex: 20-40min)</Label>
              <div className="flex gap-2">
                <Input
                  id="wait-time"
                  placeholder="20-40min"
                  value={waitTime}
                  onChange={(e) => setWaitTime(e.target.value)}
                />
                <Button onClick={saveWaitTime} disabled={savingWaitTime} size="sm">
                  {savingWaitTime ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Esse tempo será incluído na mensagem automática de "Em Preparo" enviada ao cliente via WhatsApp.
              </p>
            </div>
          </CardContent>
        </Card>
        {/* Message Templates */}
        <WhatsAppMessageTemplates googleReviewUrl={googleReviewUrl} companyId={company?.id} updateSetting={updateSetting} />

        {/* Info Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Como funciona?</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>• Quando um pedido mudar de status, o cliente receberá uma mensagem automática no WhatsApp</p>
            <p>• O cliente precisa ter informado o telefone no pedido</p>
            <p>• As mensagens são enviadas de forma educada e profissional</p>
            <p>• Status suportados: confirmado, em preparo, pronto, saiu para entrega e finalizado</p>
          </CardContent>
        </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}
