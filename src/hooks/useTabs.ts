import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface TabItem {
  id: string;
  tab_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  notes: string | null;
  created_at: string;
  created_by: string;
}

export interface Tab {
  id: string;
  company_id: string;
  table_id: string | null;
  tab_number: number;
  customer_name: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  created_by: string;
  items?: TabItem[];
  table?: {
    number: number;
  };
}

interface UseTabsOptions {
  companyId?: string;
}

export function useTabs(options: UseTabsOptions = {}) {
  const { companyId } = options;
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (companyId) {
      fetchTabs();
      
      // Subscribe to realtime changes
      const channel = supabase
        .channel('tabs-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'tabs',
            filter: `company_id=eq.${companyId}`
          },
          () => {
            fetchTabs();
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'tab_items'
          },
          () => {
            fetchTabs();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    } else {
      setLoading(false);
    }
  }, [companyId]);

  async function fetchTabs() {
    if (!companyId) return;

    try {
      const { data, error } = await supabase
        .from('tabs')
        .select(`
          *,
          table:tables(number),
          items:tab_items(*)
        `)
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTabs((data || []) as Tab[]);
    } catch (error) {
      console.error('Error fetching tabs:', error);
    } finally {
      setLoading(false);
    }
  }

  async function createTab(data: {
    tableId?: string;
    customerName?: string;
    notes?: string;
    userId: string;
    manualTabNumber?: number;
  }): Promise<Tab | null> {
    if (!companyId) return null;

    try {
      let tabNumber: number;

      if (data.manualTabNumber && data.manualTabNumber > 0) {
        // Check if manual tab number is already in use for open tabs
        const { data: existingTab } = await supabase
          .from('tabs')
          .select('id')
          .eq('company_id', companyId)
          .eq('tab_number', data.manualTabNumber)
          .eq('status', 'open')
          .maybeSingle();

        if (existingTab) {
          toast.error(`Comanda #${data.manualTabNumber} já está em uso`);
          return null;
        }
        tabNumber = data.manualTabNumber;
      } else {
        // Get next tab number
        const { data: lastTab } = await supabase
          .from('tabs')
          .select('tab_number')
          .eq('company_id', companyId)
          .order('tab_number', { ascending: false })
          .limit(1)
          .maybeSingle();

        tabNumber = (lastTab?.tab_number || 0) + 1;
      }

      const { data: newTab, error } = await supabase
        .from('tabs')
        .insert({
          company_id: companyId,
          table_id: data.tableId || null,
          tab_number: tabNumber,
          customer_name: data.customerName || null,
          notes: data.notes || null,
          created_by: data.userId,
          status: 'open'
        })
        .select()
        .single();

      if (error) throw error;

      // If table was selected, mark it as occupied
      if (data.tableId) {
        await supabase
          .from('tables')
          .update({ status: 'occupied' })
          .eq('id', data.tableId);
      }

      await fetchTabs();
      toast.success(`Comanda #${tabNumber} criada!`);
      return newTab as Tab;
    } catch (error) {
      console.error('Error creating tab:', error);
      toast.error('Erro ao criar comanda');
      return null;
    }
  }

  async function addItemToTab(tabId: string, item: {
    productId?: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    notes?: string;
    userId: string;
  }): Promise<TabItem | null> {
    try {
      const newItem: Partial<TabItem> = {
        id: crypto.randomUUID(),
        tab_id: tabId,
        product_id: item.productId || null,
        product_name: item.productName,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        total_price: item.quantity * item.unitPrice,
        notes: item.notes || null,
        created_by: item.userId,
        created_at: new Date().toISOString()
      };

      // Optimistic update - add item immediately to UI
      setTabs(prev => prev.map(tab => {
        if (tab.id === tabId) {
          return {
            ...tab,
            items: [...(tab.items || []), newItem as TabItem]
          };
        }
        return tab;
      }));

      const { data, error } = await supabase
        .from('tab_items')
        .insert({
          tab_id: tabId,
          product_id: item.productId || null,
          product_name: item.productName,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          total_price: item.quantity * item.unitPrice,
          notes: item.notes || null,
          created_by: item.userId
        })
        .select()
        .single();

      if (error) {
        // Rollback optimistic update
        await fetchTabs();
        throw error;
      }

      // Update with real ID from database
      setTabs(prev => prev.map(tab => {
        if (tab.id === tabId) {
          return {
            ...tab,
            items: tab.items?.map(i => 
              i.id === newItem.id ? (data as TabItem) : i
            )
          };
        }
        return tab;
      }));

      return data as TabItem;
    } catch (error) {
      console.error('Error adding item to tab:', error);
      toast.error('Erro ao adicionar item');
      return null;
    }
  }

  async function addMultipleItemsToTab(tabId: string, items: Array<{
    productId?: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    notes?: string;
    userId: string;
  }>): Promise<TabItem[]> {
    const addedItems: TabItem[] = [];
    
    // Optimistic update - add all items immediately
    const optimisticItems = items.map(item => ({
      id: crypto.randomUUID(),
      tab_id: tabId,
      product_id: item.productId || null,
      product_name: item.productName,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      total_price: item.quantity * item.unitPrice,
      notes: item.notes || null,
      created_by: item.userId,
      created_at: new Date().toISOString()
    } as TabItem));

    setTabs(prev => prev.map(tab => {
      if (tab.id === tabId) {
        return {
          ...tab,
          items: [...(tab.items || []), ...optimisticItems]
        };
      }
      return tab;
    }));

    try {
      for (const item of items) {
        const { data, error } = await supabase
          .from('tab_items')
          .insert({
            tab_id: tabId,
            product_id: item.productId || null,
            product_name: item.productName,
            quantity: item.quantity,
            unit_price: item.unitPrice,
            total_price: item.quantity * item.unitPrice,
            notes: item.notes || null,
            created_by: item.userId
          })
          .select()
          .single();

        if (error) throw error;
        addedItems.push(data as TabItem);
      }

      // Sync with database
      await fetchTabs();
      return addedItems;
    } catch (error) {
      console.error('Error adding items to tab:', error);
      toast.error('Erro ao adicionar itens');
      await fetchTabs(); // Rollback
      return [];
    }
  }

  async function removeItemFromTab(itemId: string): Promise<boolean> {
    // Optimistic update - remove item immediately from UI
    setTabs(prev => prev.map(tab => ({
      ...tab,
      items: tab.items?.filter(item => item.id !== itemId)
    })));

    try {
      const { error } = await supabase
        .from('tab_items')
        .delete()
        .eq('id', itemId);

      if (error) {
        // Rollback
        await fetchTabs();
        throw error;
      }

      return true;
    } catch (error) {
      console.error('Error removing item from tab:', error);
      toast.error('Erro ao remover item');
      return false;
    }
  }

  async function closeTab(tabId: string): Promise<boolean> {
    try {
      const tab = tabs.find(t => t.id === tabId);
      
      const { error } = await supabase
        .from('tabs')
        .update({ 
          status: 'closed',
          closed_at: new Date().toISOString()
        })
        .eq('id', tabId);

      if (error) throw error;

      // If tab had a table, mark it as available
      if (tab?.table_id) {
        await supabase
          .from('tables')
          .update({ status: 'available' })
          .eq('id', tab.table_id);
      }

      await fetchTabs();
      toast.success('Comanda fechada!');
      return true;
    } catch (error) {
      console.error('Error closing tab:', error);
      toast.error('Erro ao fechar comanda');
      return false;
    }
  }

  async function updateTabNotes(tabId: string, notes: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('tabs')
        .update({ notes })
        .eq('id', tabId);

      if (error) throw error;

      await fetchTabs();
      return true;
    } catch (error) {
      console.error('Error updating tab notes:', error);
      toast.error('Erro ao atualizar observações');
      return false;
    }
  }

  const openTabs = tabs.filter(t => t.status === 'open');
  const closedTabs = tabs.filter(t => t.status === 'closed');

  function getTabTotal(tab: Tab): number {
    return tab.items?.reduce((sum, item) => sum + item.total_price, 0) || 0;
  }

  return {
    tabs,
    openTabs,
    closedTabs,
    loading,
    createTab,
    addItemToTab,
    addMultipleItemsToTab,
    removeItemFromTab,
    closeTab,
    updateTabNotes,
    getTabTotal,
    refetch: fetchTabs
  };
}
