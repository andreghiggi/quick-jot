import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DEFAULT_MESSAGE_A, DEFAULT_MESSAGE_B, fetchCustomersCount } from '@/hooks/useSalesCampaigns';
import { Loader2, Users } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  company: { id: string; slug: string; name: string } | null | undefined;
  onCreate: (input: { name: string; message_a: string; message_b: string }) => Promise<void>;
}

export function NewCampaignDialog({ open, onOpenChange, company, onCreate }: Props) {
  const [name, setName] = useState('Atualização de Cardápio');
  const [messageA, setMessageA] = useState(DEFAULT_MESSAGE_A);
  const [messageB, setMessageB] = useState(DEFAULT_MESSAGE_B);
  const [count, setCount] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !company?.id) return;
    fetchCustomersCount(company.id).then(setCount);
  }, [open, company?.id]);

  const menuLink = company ? `${window.location.origin}/cardapio/${company.slug}` : '';
  const renderPreview = (tpl: string) => tpl
    .replace(/\{\{nome\}\}/g, 'Maria')
    .replace(/\{\{link_cardapio\}\}/g, menuLink);

  async function handleSubmit() {
    if (!name.trim() || !messageA.trim() || !messageB.trim()) return;
    setSubmitting(true);
    try {
      await onCreate({ name: name.trim(), message_a: messageA, message_b: messageB });
    } finally { setSubmitting(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Campanha</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Nome da campanha</Label>
            <Input value={name} onChange={e => setName(e.target.value)} />
          </div>

          <div>
            <Label>Mensagem (variação A)</Label>
            <Textarea value={messageA} onChange={e => setMessageA(e.target.value)} rows={5} />
            <p className="text-xs text-muted-foreground mt-1">
              Variáveis: <code className="bg-muted px-1 rounded">{'{{nome}}'}</code> e <code className="bg-muted px-1 rounded">{'{{link_cardapio}}'}</code>
            </p>
          </div>

          <div>
            <Label>Mensagem (variação B - alternada para evitar spam)</Label>
            <Textarea value={messageB} onChange={e => setMessageB(e.target.value)} rows={5} />
          </div>

          <div className="space-y-2">
            <Label>Pré-visualização</Label>
            <Card><CardContent className="p-3 space-y-2 text-sm">
              <div><strong>Variação A:</strong></div>
              <div className="whitespace-pre-wrap bg-muted/50 p-2 rounded">{renderPreview(messageA)}</div>
              <div><strong>Variação B:</strong></div>
              <div className="whitespace-pre-wrap bg-muted/50 p-2 rounded">{renderPreview(messageB)}</div>
            </CardContent></Card>
          </div>

          <div className="flex items-center gap-2 p-3 bg-muted/50 rounded">
            <Users className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm">
              Destinatários: <strong>{count ?? '...'}</strong> clientes ativos na base
              <span className="text-muted-foreground ml-1">(clientes sem telefone serão pulados automaticamente)</span>
            </span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={submitting || !count}>
            {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Criando...</> : 'Criar campanha'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
