import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface CashRegister {
  id: string;
  company_id: string;
  opened_by: string;
  closed_by: string | null;
  opening_amount: number;
  closing_amount: number | null;
  expected_amount: number | null;
  difference: number | null;
  status: 'open' | 'closed';
  notes: string | null;
  opened_at: string;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PdvSale {
  id: string;
  company_id: string;
  cash_register_id: string;
  payment_method_id: string | null;
  total: number;
  discount: number;
  final_total: number;
  customer_name: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  payment_method?: {
    name: string;
  };
  items?: PdvSaleItem[];
}

export interface PdvSaleItem {
  id: string;
  sale_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

interface UseCashRegisterOptions {
  companyId?: string;
}

export function useCashRegister(options: UseCashRegisterOptions = {}) {
  const { companyId } = options;
  const [currentRegister, setCurrentRegister] = useState<CashRegister | null>(null);
  const [registers, setRegisters] = useState<CashRegister[]>([]);
  const [sales, setSales] = useState<PdvSale[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (companyId) {
      fetchCurrentRegister();
      fetchRegisters();
    } else {
      setLoading(false);
    }
  }, [companyId]);

  async function fetchCurrentRegister() {
    if (!companyId) return;

    try {
      const { data, error } = await supabase
        .from('cash_registers')
        .select('*')
        .eq('company_id', companyId)
        .eq('status', 'open')
        .order('opened_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      
      setCurrentRegister(data as CashRegister | null);
      
      if (data) {
        await fetchSales(data.id);
      } else {
        setSales([]);
      }
    } catch (error) {
      console.error('Error fetching current register:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchRegisters() {
    if (!companyId) return;

    try {
      const { data, error } = await supabase
        .from('cash_registers')
        .select('*')
        .eq('company_id', companyId)
        .order('opened_at', { ascending: false })
        .limit(30);

      if (error) throw error;
      setRegisters((data as CashRegister[]) || []);
    } catch (error) {
      console.error('Error fetching registers:', error);
    }
  }

  async function fetchSales(registerId: string) {
    try {
      const { data, error } = await supabase
        .from('pdv_sales')
        .select(`
          *,
          payment_method:payment_methods(name)
        `)
        .eq('cash_register_id', registerId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSales((data as PdvSale[]) || []);
    } catch (error) {
      console.error('Error fetching sales:', error);
    }
  }

  async function openRegister(openingAmount: number, userId: string): Promise<boolean> {
    if (!companyId) return false;

    // Check if there's already an open register
    if (currentRegister) {
      toast.error('Já existe um caixa aberto!');
      return false;
    }

    try {
      const { data, error } = await supabase
        .from('cash_registers')
        .insert({
          company_id: companyId,
          opened_by: userId,
          opening_amount: openingAmount,
          status: 'open'
        })
        .select()
        .single();

      if (error) throw error;

      setCurrentRegister(data as CashRegister);
      setSales([]);
      await fetchRegisters();
      toast.success('Caixa aberto com sucesso!');
      return true;
    } catch (error) {
      console.error('Error opening register:', error);
      toast.error('Erro ao abrir caixa');
      return false;
    }
  }

  async function closeRegister(closingAmount: number, userId: string, notes?: string): Promise<CashRegister | null> {
    if (!currentRegister) return null;

    try {
      // Calculate expected amount
      const salesTotal = sales.reduce((sum, sale) => sum + sale.final_total, 0);
      const expectedAmount = currentRegister.opening_amount + salesTotal;
      const difference = closingAmount - expectedAmount;

      const { data, error } = await supabase
        .from('cash_registers')
        .update({
          status: 'closed',
          closed_by: userId,
          closing_amount: closingAmount,
          expected_amount: expectedAmount,
          difference,
          notes,
          closed_at: new Date().toISOString()
        })
        .eq('id', currentRegister.id)
        .select()
        .single();

      if (error) throw error;

      const closedRegister = data as CashRegister;
      setCurrentRegister(null);
      setSales([]);
      await fetchRegisters();
      toast.success('Caixa fechado com sucesso!');
      return closedRegister;
    } catch (error) {
      console.error('Error closing register:', error);
      toast.error('Erro ao fechar caixa');
      return null;
    }
  }

  async function reopenRegister(registerId: string): Promise<boolean> {
    if (currentRegister) {
      toast.error('Feche o caixa atual antes de reabrir outro');
      return false;
    }

    try {
      const { data, error } = await supabase
        .from('cash_registers')
        .update({
          status: 'open',
          closed_by: null,
          closing_amount: null,
          expected_amount: null,
          difference: null,
          closed_at: null,
          notes: null
        })
        .eq('id', registerId)
        .select()
        .single();

      if (error) throw error;

      setCurrentRegister(data as CashRegister);
      await fetchSales(registerId);
      await fetchRegisters();
      toast.success('Caixa reaberto com sucesso!');
      return true;
    } catch (error) {
      console.error('Error reopening register:', error);
      toast.error('Erro ao reabrir caixa');
      return false;
    }
  }

  async function addSale(
    items: { product_id: string | null; product_name: string; quantity: number; unit_price: number }[],
    paymentMethodId: string,
    userId: string,
    discount: number = 0,
    customerName?: string,
    notes?: string
  ): Promise<string | null> {
    if (!currentRegister || !companyId) {
      toast.error('Nenhum caixa aberto!');
      return null;
    }

    try {
      const total = items.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);
      const finalTotal = total - discount;

      // Create sale
      const { data: saleData, error: saleError } = await supabase
        .from('pdv_sales')
        .insert({
          company_id: companyId,
          cash_register_id: currentRegister.id,
          payment_method_id: paymentMethodId,
          total,
          discount,
          final_total: finalTotal,
          customer_name: customerName || null,
          notes: notes || null,
          created_by: userId
        })
        .select()
        .single();

      if (saleError) throw saleError;

      // Create sale items
      const saleItems = items.map(item => ({
        sale_id: saleData.id,
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.unit_price * item.quantity
      }));

      const { error: itemsError } = await supabase
        .from('pdv_sale_items')
        .insert(saleItems);

      if (itemsError) throw itemsError;

      await fetchSales(currentRegister.id);
      toast.success('Venda registrada!');
      return saleData.id;
    } catch (error) {
      console.error('Error adding sale:', error);
      toast.error('Erro ao registrar venda');
      return null;
    }
  }

  async function deleteSale(saleId: string): Promise<boolean> {
    if (!currentRegister) return false;

    try {
      const { error } = await supabase
        .from('pdv_sales')
        .delete()
        .eq('id', saleId);

      if (error) throw error;

      await fetchSales(currentRegister.id);
      toast.success('Venda removida!');
      return true;
    } catch (error) {
      console.error('Error deleting sale:', error);
      toast.error('Erro ao remover venda');
      return false;
    }
  }

  const totalSales = sales.reduce((sum, sale) => sum + sale.final_total, 0);
  const salesCount = sales.length;

  return {
    currentRegister,
    registers,
    sales,
    loading,
    totalSales,
    salesCount,
    openRegister,
    closeRegister,
    reopenRegister,
    addSale,
    deleteSale,
    refetch: fetchCurrentRegister
  };
}
