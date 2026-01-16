import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type TableStatus = 'available' | 'occupied' | 'reserved';

export interface Table {
  id: string;
  company_id: string;
  number: number;
  status: TableStatus;
  capacity: number;
  created_at: string;
  updated_at: string;
}

interface UseTablesOptions {
  companyId?: string;
}

export function useTables(options: UseTablesOptions = {}) {
  const { companyId } = options;
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (companyId) {
      fetchTables();
      
      // Subscribe to realtime changes
      const channel = supabase
        .channel('tables-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'tables',
            filter: `company_id=eq.${companyId}`
          },
          () => {
            fetchTables();
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

  async function fetchTables() {
    if (!companyId) return;

    try {
      const { data, error } = await supabase
        .from('tables')
        .select('*')
        .eq('company_id', companyId)
        .order('number', { ascending: true });

      if (error) throw error;
      
      // Type assertion since we know the data matches our interface
      setTables((data || []) as Table[]);
    } catch (error) {
      console.error('Error fetching tables:', error);
    } finally {
      setLoading(false);
    }
  }

  async function createTables(count: number): Promise<boolean> {
    if (!companyId) return false;

    try {
      // Get existing tables
      const existingNumbers = tables.map(t => t.number);
      const maxNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0;

      // Create new tables
      const newTables = [];
      for (let i = 1; i <= count; i++) {
        const tableNumber = maxNumber + i;
        if (!existingNumbers.includes(tableNumber)) {
          newTables.push({
            company_id: companyId,
            number: tableNumber,
            status: 'available' as TableStatus,
            capacity: 4
          });
        }
      }

      if (newTables.length === 0) {
        toast.info('Todas as mesas já existem');
        return true;
      }

      const { error } = await supabase
        .from('tables')
        .insert(newTables);

      if (error) throw error;

      await fetchTables();
      toast.success(`${newTables.length} mesa(s) criada(s)!`);
      return true;
    } catch (error) {
      console.error('Error creating tables:', error);
      toast.error('Erro ao criar mesas');
      return false;
    }
  }

  async function updateTableStatus(tableId: string, status: TableStatus): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('tables')
        .update({ status })
        .eq('id', tableId);

      if (error) throw error;

      await fetchTables();
      return true;
    } catch (error) {
      console.error('Error updating table status:', error);
      toast.error('Erro ao atualizar status da mesa');
      return false;
    }
  }

  async function deleteTable(tableId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('tables')
        .delete()
        .eq('id', tableId);

      if (error) throw error;

      await fetchTables();
      toast.success('Mesa removida!');
      return true;
    } catch (error) {
      console.error('Error deleting table:', error);
      toast.error('Erro ao remover mesa');
      return false;
    }
  }

  async function updateTableCapacity(tableId: string, capacity: number): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('tables')
        .update({ capacity })
        .eq('id', tableId);

      if (error) throw error;

      await fetchTables();
      return true;
    } catch (error) {
      console.error('Error updating table capacity:', error);
      toast.error('Erro ao atualizar capacidade');
      return false;
    }
  }

  const availableTables = tables.filter(t => t.status === 'available');
  const occupiedTables = tables.filter(t => t.status === 'occupied');
  const reservedTables = tables.filter(t => t.status === 'reserved');

  return {
    tables,
    loading,
    availableTables,
    occupiedTables,
    reservedTables,
    createTables,
    updateTableStatus,
    updateTableCapacity,
    deleteTable,
    refetch: fetchTables
  };
}
