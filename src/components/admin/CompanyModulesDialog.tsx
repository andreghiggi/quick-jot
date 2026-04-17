import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CompanyModulesControl } from '@/components/admin/CompanyModulesControl';

interface Props {
  companyId: string | null;
  companyName?: string;
  onClose: () => void;
}

export function CompanyModulesDialog({ companyId, companyName, onClose }: Props) {
  return (
    <Dialog open={!!companyId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Módulos {companyName ? `— ${companyName}` : ''}</DialogTitle>
          <DialogDescription>
            Habilite ou desabilite os módulos para esta loja.
          </DialogDescription>
        </DialogHeader>
        {companyId && <CompanyModulesControl companyId={companyId} />}
      </DialogContent>
    </Dialog>
  );
}
