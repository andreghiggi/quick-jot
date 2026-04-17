import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface SalesCampaign {
  id: string;
  company_id: string;
  name: string;
  message_a: string;
  message_b: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'canceled';
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  skipped_count: number;
  last_sent_at: string | null;
  sent_today: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface CampaignMessage {
  id: string;
  campaign_id: string;
  customer_name: string;
  customer_phone: string | null;
  status: 'pending' | 'sent' | 'failed' | 'skipped';
  variation: string | null;
  message_text: string | null;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
}

export const DEFAULT_MESSAGE_A = `Olá {{nome}}! 😊 Temos novidades pra você!
Acesse nosso cardápio digital atualizado e confira nossas opções:
{{link_cardapio}}
Estamos te esperando! 🛵`;

export const DEFAULT_MESSAGE_B = `{{nome}}, que bom ter você aqui! 🎉
Nosso cardápio digital foi atualizado com novidades incríveis!
Dá uma olhada: {{link_cardapio}}`;

export function useSalesCampaigns(companyId?: string) {
  const [campaigns, setCampaigns] = useState<SalesCampaign[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCampaigns = useCallback(async () => {
    if (!companyId) { setLoading(false); return; }
    const { data, error } = await supabase
      .from('sales_campaigns').select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });
    if (error) console.error(error);
    setCampaigns((data as SalesCampaign[]) || []);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { fetchCampaigns(); }, [fetchCampaigns]);

  useEffect(() => {
    if (!companyId) return;
    const ch = supabase.channel(`campaigns-${companyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales_campaigns', filter: `company_id=eq.${companyId}` },
        () => fetchCampaigns())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [companyId, fetchCampaigns]);

  async function createCampaign(input: {
    name: string; message_a: string; message_b: string;
  }) {
    if (!companyId) return null;
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) { toast.error('Sessão inválida'); return null; }

    // Fetch active customers with phone
    const { data: customers, error: cErr } = await supabase
      .from('customers').select('id, name, phone')
      .eq('company_id', companyId);
    if (cErr) { toast.error('Erro ao carregar clientes'); return null; }

    const recipients = (customers || []).filter(c => c.name);
    if (recipients.length === 0) {
      toast.error('Nenhum cliente cadastrado');
      return null;
    }

    const { data: campaign, error } = await supabase
      .from('sales_campaigns').insert({
        company_id: companyId,
        name: input.name,
        message_a: input.message_a,
        message_b: input.message_b,
        total_recipients: recipients.length,
        created_by: user.user.id,
      }).select().single();
    if (error || !campaign) { toast.error('Erro ao criar campanha'); return null; }

    // Insert messages in batches of 500
    const rows = recipients.map(c => ({
      campaign_id: campaign.id,
      company_id: companyId,
      customer_id: c.id,
      customer_name: c.name,
      customer_phone: c.phone,
    }));
    for (let i = 0; i < rows.length; i += 500) {
      const slice = rows.slice(i, i + 500);
      const { error: mErr } = await supabase.from('sales_campaign_messages').insert(slice);
      if (mErr) console.error('insert messages chunk', mErr);
    }

    toast.success(`Campanha criada com ${recipients.length} destinatários`);
    fetchCampaigns();
    return campaign as SalesCampaign;
  }

  async function setStatus(id: string, status: SalesCampaign['status']) {
    const patch: any = { status };
    if (status === 'running') patch.started_at = new Date().toISOString();
    if (status === 'completed' || status === 'canceled') patch.completed_at = new Date().toISOString();
    const { error } = await supabase.from('sales_campaigns').update(patch).eq('id', id);
    if (error) toast.error('Erro ao atualizar status');
    else fetchCampaigns();
  }

  async function deleteCampaign(id: string) {
    const { error } = await supabase.from('sales_campaigns').delete().eq('id', id);
    if (error) toast.error('Erro ao excluir');
    else { toast.success('Campanha excluída'); fetchCampaigns(); }
  }

  return { campaigns, loading, createCampaign, setStatus, deleteCampaign, refetch: fetchCampaigns };
}

export async function fetchCustomersCount(companyId: string) {
  const { count } = await supabase
    .from('customers').select('*', { count: 'exact', head: true })
    .eq('company_id', companyId);
  return count || 0;
}

export async function fetchCampaignMessages(campaignId: string): Promise<CampaignMessage[]> {
  const all: CampaignMessage[] = [];
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('sales_campaign_messages').select('*')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error || !data) break;
    all.push(...(data as CampaignMessage[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}
