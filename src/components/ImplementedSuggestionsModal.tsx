import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PartyPopper, Lightbulb } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthContext } from '@/contexts/AuthContext';

interface ImplementedSuggestion {
  id: string;
  title: string;
  description: string;
  admin_notes: string | null;
}

export function ImplementedSuggestionsModal() {
  const { company } = useAuthContext();
  const [suggestions, setSuggestions] = useState<ImplementedSuggestion[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!company?.id) return;
    checkImplementedSuggestions();
  }, [company?.id]);

  async function checkImplementedSuggestions() {
    // Check if we already showed today
    const storageKey = `implemented_suggestions_seen_${company!.id}`;
    const lastSeen = localStorage.getItem(storageKey);
    const today = new Date().toISOString().slice(0, 10);
    if (lastSeen === today) return;

    try {
      const { data, error } = await supabase
        .from('suggestions')
        .select('id, title, description, admin_notes')
        .eq('company_id', company!.id)
        .eq('status', 'implemented');
      if (error) throw error;

      // Filter: only show suggestions not yet "acknowledged" by the user
      const ackedKey = `implemented_suggestions_acked_${company!.id}`;
      const acked: string[] = JSON.parse(localStorage.getItem(ackedKey) || '[]');
      const unacked = (data || []).filter((s) => !acked.includes(s.id));

      if (unacked.length > 0) {
        setSuggestions(unacked);
        setOpen(true);
      }

      // Mark today as checked
      localStorage.setItem(storageKey, today);
    } catch (e) {
      console.error('Error checking implemented suggestions:', e);
    }
  }

  function handleClose() {
    // Acknowledge all shown suggestions
    const ackedKey = `implemented_suggestions_acked_${company!.id}`;
    const acked: string[] = JSON.parse(localStorage.getItem(ackedKey) || '[]');
    const newAcked = [...new Set([...acked, ...suggestions.map((s) => s.id)])];
    localStorage.setItem(ackedKey, JSON.stringify(newAcked));
    setOpen(false);
  }

  if (suggestions.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <PartyPopper className="w-5 h-5 text-primary" />
            Suas sugestões foram implementadas!
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 max-h-80 overflow-y-auto">
          <p className="text-sm text-muted-foreground">
            {suggestions.length === 1
              ? 'Uma sugestão que você enviou já está disponível no sistema:'
              : `${suggestions.length} sugestões que você enviou já estão disponíveis no sistema:`}
          </p>
          {suggestions.map((s) => (
            <div key={s.id} className="border rounded-lg p-3 space-y-1.5">
              <div className="flex items-start gap-2">
                <Lightbulb className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium">{s.title}</p>
                  <p className="text-xs text-muted-foreground">{s.description}</p>
                  {s.admin_notes && (
                    <p className="text-xs text-primary mt-1">💬 {s.admin_notes}</p>
                  )}
                </div>
              </div>
              <Badge className="bg-primary text-primary-foreground text-xs">Implementada ✅</Badge>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button onClick={handleClose} className="w-full">
            Entendi, obrigado! 🎉
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
