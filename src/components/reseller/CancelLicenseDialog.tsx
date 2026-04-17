import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onClose: () => void;
  store: { id: string; name: string } | null;
  onSaved: () => void;
}

export function CancelLicenseDialog({ open, onClose, store, onSaved }: Props) {
  const [saving, setSaving] = useState(false);

  async function handleConfirm() {
    if (!store) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('companies')
      .update({
        license_status: 'canceled',
        license_canceled_at: new Date().toISOString(),
        license_canceled_by: user?.id ?? null,
        active: false,
      })
      .eq('id', store.id);
    setSaving(false);
    if (error) {
      toast.error('Erro ao cancelar: ' + error.message);
      return;
    }
    toast.success('Licença cancelada');
    onSaved();
    onClose();
  }

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Tem certeza que deseja cancelar essa licença?</AlertDialogTitle>
          <AlertDialogDescription>
            Todos os dados e informações da empresa <span className="font-semibold text-foreground">{store?.name}</span> serão
            apagados. Ao cadastrá-la novamente, a empresa iniciará zerada.
            <br /><br />
            O lojista e o revendedor perderão o acesso, e não serão mais geradas faturas para esta loja.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving}>Não cancelar licença</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); handleConfirm(); }}
            disabled={saving}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Sim, quero cancelar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
