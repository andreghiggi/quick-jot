import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface WhatsAppInstance {
  id: string;
  company_id: string;
  instance_name: string;
  instance_id: string | null;
  status: string;
  phone_number: string | null;
}

export function useWhatsApp(companyId?: string) {
  const [instance, setInstance] = useState<WhatsAppInstance | null>(null);
  const [loading, setLoading] = useState(true);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  const fetchInstance = useCallback(async () => {
    if (!companyId) { setLoading(false); return; }
    try {
      const { data, error } = await supabase
        .from('whatsapp_instances')
        .select('*')
        .eq('company_id', companyId)
        .maybeSingle();
      if (error) throw error;
      setInstance(data as WhatsAppInstance | null);
    } catch (e) {
      console.error('Error fetching WhatsApp instance:', e);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { fetchInstance(); }, [fetchInstance]);

  async function createInstance() {
    if (!companyId) return;
    setConnecting(true);
    try {
      const instanceName = `ct-${companyId.slice(0, 8)}`;
      const { data, error } = await supabase.functions.invoke('whatsapp-evolution', {
        body: { action: 'create_instance', instanceName, companyId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      await fetchInstance();
      toast.success('Instância criada! Escaneie o QR Code.');

      // Auto-fetch QR code
      await getQRCode(instanceName);
    } catch (e: any) {
      console.error('Error creating instance:', e);
      toast.error(e.message || 'Erro ao criar instância');
    } finally {
      setConnecting(false);
    }
  }

  async function getQRCode(name?: string) {
    const instanceName = name || instance?.instance_name;
    if (!instanceName) return;
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-evolution', {
        body: { action: 'get_qrcode', instanceName },
      });
      if (error) throw error;
      
      // Evolution API returns base64 QR code
      const qr = data?.base64 || data?.qrcode?.base64 || data?.code || null;
      setQrCode(qr);
    } catch (e) {
      console.error('Error getting QR code:', e);
      toast.error('Erro ao obter QR Code');
    } finally {
      setConnecting(false);
    }
  }

  async function checkStatus() {
    if (!instance?.instance_name || !companyId) return;
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-evolution', {
        body: { action: 'get_status', instanceName: instance.instance_name, companyId },
      });
      if (error) throw error;

      const state = data?.instance?.state;
      if (state === 'open') {
        setQrCode(null);
        await fetchInstance();
        toast.success('WhatsApp conectado com sucesso!');
        return 'connected';
      }
      return state || 'disconnected';
    } catch (e) {
      console.error('Error checking status:', e);
      return 'error';
    }
  }

  async function disconnect() {
    if (!instance?.instance_name || !companyId) return;
    try {
      await supabase.functions.invoke('whatsapp-evolution', {
        body: { action: 'disconnect', instanceName: instance.instance_name },
      });
      await supabase.from('whatsapp_instances')
        .update({ status: 'disconnected' })
        .eq('company_id', companyId);
      setQrCode(null);
      await fetchInstance();
      toast.success('WhatsApp desconectado');
    } catch (e) {
      console.error('Error disconnecting:', e);
      toast.error('Erro ao desconectar');
    }
  }

  async function deleteInstance() {
    if (!instance?.instance_name || !companyId) return;
    try {
      await supabase.functions.invoke('whatsapp-evolution', {
        body: { action: 'delete_instance', instanceName: instance.instance_name, companyId },
      });
      setInstance(null);
      setQrCode(null);
      await fetchInstance();
      toast.success('Instância removida');
    } catch (e) {
      console.error('Error deleting instance:', e);
      toast.error('Erro ao remover instância');
    }
  }

  async function sendMessage(phone: string, message: string, orderId?: string) {
    if (!instance?.instance_name || !companyId) return false;
    if (instance.status !== 'connected') {
      console.warn('WhatsApp not connected');
      return false;
    }
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-evolution', {
        body: {
          action: 'send_message',
          instanceName: instance.instance_name,
          phone,
          message,
          companyId,
          orderId,
        },
      });
      if (error) throw error;
      return data?.success || false;
    } catch (e) {
      console.error('Error sending WhatsApp message:', e);
      return false;
    }
  }

  return {
    instance,
    loading,
    qrCode,
    connecting,
    createInstance,
    getQRCode,
    checkStatus,
    disconnect,
    deleteInstance,
    sendMessage,
    refetch: fetchInstance,
  };
}
