import { useState } from 'react';
import { useTaxRules, TaxRule, TaxRuleFormData } from '@/hooks/useTaxRules';
import { useCompanyModules } from '@/hooks/useCompanyModules';
import { useAuthContext } from '@/contexts/AuthContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Plus, Pencil, Trash2, FileText, Loader2, Receipt } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

const CSOSN_OPTIONS = [
  { value: '101', label: '101 - Tributada com permissão de crédito' },
  { value: '102', label: '102 - Tributada sem permissão de crédito' },
  { value: '103', label: '103 - Isenção do ICMS para faixa de receita bruta' },
  { value: '201', label: '201 - Tributada com permissão de crédito e com cobrança do ICMS por ST' },
  { value: '202', label: '202 - Tributada sem permissão de crédito e com cobrança do ICMS por ST' },
  { value: '203', label: '203 - Isenção do ICMS para faixa de receita bruta e com cobrança do ICMS por ST' },
  { value: '300', label: '300 - Imune' },
  { value: '400', label: '400 - Não tributada' },
  { value: '500', label: '500 - ICMS cobrado anteriormente por ST ou por antecipação' },
  { value: '900', label: '900 - Outros' },
];

const ICMS_ORIGIN_OPTIONS = [
  { value: '0', label: '0 - Nacional' },
  { value: '1', label: '1 - Estrangeira (importação direta)' },
  { value: '2', label: '2 - Estrangeira (adquirida no mercado interno)' },
  { value: '3', label: '3 - Nacional com conteúdo de importação > 40%' },
  { value: '4', label: '4 - Nacional (processos produtivos básicos)' },
  { value: '5', label: '5 - Nacional com conteúdo de importação ≤ 40%' },
  { value: '6', label: '6 - Estrangeira (importação direta, sem similar nacional)' },
  { value: '7', label: '7 - Estrangeira (adquirida no mercado interno, sem similar nacional)' },
  { value: '8', label: '8 - Nacional com conteúdo de importação > 70%' },
];

const PIS_COFINS_CST_OPTIONS = [
  { value: '01', label: '01 - Operação tributável (BC = valor da operação)' },
  { value: '02', label: '02 - Operação tributável (BC = valor da operação - alíquota diferenciada)' },
  { value: '04', label: '04 - Operação tributável (monofásica - revenda a alíquota zero)' },
  { value: '06', label: '06 - Operação tributável (alíquota zero)' },
  { value: '07', label: '07 - Operação isenta da contribuição' },
  { value: '08', label: '08 - Operação sem incidência da contribuição' },
  { value: '09', label: '09 - Operação com suspensão da contribuição' },
  { value: '49', label: '49 - Outras operações de saída' },
  { value: '99', label: '99 - Outras operações' },
];

const CFOP_COMMON = [
  { value: '5101', label: '5101 - Venda de produção do estabelecimento' },
  { value: '5102', label: '5102 - Venda de mercadoria adquirida' },
  { value: '5103', label: '5103 - Venda de produção efetuada fora do estabelecimento' },
  { value: '5104', label: '5104 - Venda de mercadoria adquirida efetuada fora do estabelecimento' },
  { value: '5405', label: '5405 - Venda de mercadoria adquirida sujeita ao regime de ST' },
  { value: '5656', label: '5656 - Venda de combustível/lubrificante adquiridos' },
  { value: '5933', label: '5933 - Prestação de serviço tributada pelo ISSQN' },
];

const EMPTY_FORM: TaxRuleFormData = {
  name: '',
  cfop: '5102',
  ncm: '',
  csosn: '102',
  icms_origin: '0',
  icms_aliquot: 0,
  pis_cst: '49',
  pis_aliquot: 0,
  cofins_cst: '49',
  cofins_aliquot: 0,
  ipi_cst: '99',
  ipi_aliquot: 0,
  cest: null,
  description: null,
  active: true,
};

export default function Fiscal() {
  const { company } = useAuthContext();
  const { taxRules, loading, addTaxRule, updateTaxRule, deleteTaxRule } = useTaxRules({ companyId: company?.id });
  const { isModuleEnabled, toggleModule } = useCompanyModules({ companyId: company?.id });
  const fiscalEnabled = isModuleEnabled('fiscal');

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<TaxRule | null>(null);
  const [form, setForm] = useState<TaxRuleFormData>(EMPTY_FORM);

  function openNew() {
    setEditingRule(null);
    setForm(EMPTY_FORM);
    setIsDialogOpen(true);
  }

  function openEdit(rule: TaxRule) {
    setEditingRule(rule);
    setForm({
      name: rule.name,
      cfop: rule.cfop,
      ncm: rule.ncm,
      csosn: rule.csosn,
      icms_origin: rule.icms_origin,
      icms_aliquot: rule.icms_aliquot,
      pis_cst: rule.pis_cst,
      pis_aliquot: rule.pis_aliquot,
      cofins_cst: rule.cofins_cst,
      cofins_aliquot: rule.cofins_aliquot,
      ipi_cst: rule.ipi_cst,
      ipi_aliquot: rule.ipi_aliquot,
      cest: rule.cest,
      description: rule.description,
      active: rule.active,
    });
    setIsDialogOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error('Informe o nome da regra');
      return;
    }
    if (!form.ncm.trim()) {
      toast.error('Informe o NCM');
      return;
    }

    let success: boolean;
    if (editingRule) {
      success = await updateTaxRule(editingRule.id, form);
    } else {
      success = await addTaxRule(form);
    }

    if (success) {
      setIsDialogOpen(false);
      setEditingRule(null);
      setForm(EMPTY_FORM);
    }
  }

  if (loading) {
    return (
      <AppLayout title="Fiscal">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (!fiscalEnabled) {
    return (
      <AppLayout title="Fiscal">
        <Card className="max-w-lg mx-auto">
          <CardContent className="py-12 text-center">
            <Receipt className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-lg font-semibold mb-2">Módulo Fiscal</h2>
            <p className="text-muted-foreground mb-6">
              O módulo fiscal permite configurar regras tributárias para emissão de NFC-e (Simples Nacional).
            </p>
            <Button onClick={() => toggleModule('fiscal', true)}>
              Habilitar Módulo Fiscal
            </Button>
          </CardContent>
        </Card>
      </AppLayout>
    );
  }

  const headerActions = (
    <Button onClick={openNew}>
      <Plus className="h-4 w-4 mr-2" />
      Nova Regra Tributária
    </Button>
  );

  return (
    <AppLayout title="Fiscal" actions={headerActions}>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Regras Tributárias - Simples Nacional
            </CardTitle>
            <CardDescription>
              Configure as regras tributárias para emissão de NFC-e. Após criar, associe aos produtos na tela de Produtos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {taxRules.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Nenhuma regra tributária cadastrada</p>
                <Button className="mt-4" onClick={openNew}>
                  <Plus className="h-4 w-4 mr-2" />
                  Criar primeira regra
                </Button>
              </div>
            ) : (
              <ScrollArea className="w-full">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>CFOP</TableHead>
                      <TableHead>NCM</TableHead>
                      <TableHead>CSOSN</TableHead>
                      <TableHead>Origem</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {taxRules.map((rule) => (
                      <TableRow key={rule.id}>
                        <TableCell className="font-medium">{rule.name}</TableCell>
                        <TableCell>{rule.cfop}</TableCell>
                        <TableCell>{rule.ncm}</TableCell>
                        <TableCell>{rule.csosn}</TableCell>
                        <TableCell>{rule.icms_origin}</TableCell>
                        <TableCell>
                          <Badge variant={rule.active ? 'default' : 'secondary'}>
                            {rule.active ? 'Ativo' : 'Inativo'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(rule)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Excluir regra "{rule.name}"?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Produtos vinculados a esta regra ficarão sem grupo tributário.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => deleteTaxRule(rule.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                    Excluir
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tax Rule Form Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{editingRule ? 'Editar Regra Tributária' : 'Nova Regra Tributária'}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh] pr-4">
            <div className="space-y-6">
              {/* Basic Info */}
              <div className="space-y-4">
                <h3 className="font-semibold text-sm text-muted-foreground">Informações Gerais</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Nome da regra *</Label>
                    <Input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="Ex: Alimentos - Revenda"
                    />
                  </div>
                  <div>
                    <Label>Descrição</Label>
                    <Input
                      value={form.description || ''}
                      onChange={(e) => setForm({ ...form, description: e.target.value || null })}
                      placeholder="Descrição opcional"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={form.active}
                    onCheckedChange={(v) => setForm({ ...form, active: v })}
                  />
                  <Label>Regra ativa</Label>
                </div>
              </div>

              <Separator />

              {/* CFOP & NCM */}
              <div className="space-y-4">
                <h3 className="font-semibold text-sm text-muted-foreground">CFOP, NCM e CEST</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label>CFOP *</Label>
                    <Select value={form.cfop} onValueChange={(v) => setForm({ ...form, cfop: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CFOP_COMMON.map((c) => (
                          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>NCM *</Label>
                    <Input
                      value={form.ncm}
                      onChange={(e) => setForm({ ...form, ncm: e.target.value.replace(/\D/g, '').slice(0, 8) })}
                      placeholder="00000000"
                      maxLength={8}
                    />
                    <p className="text-xs text-muted-foreground mt-1">8 dígitos</p>
                  </div>
                  <div>
                    <Label>CEST</Label>
                    <Input
                      value={form.cest || ''}
                      onChange={(e) => setForm({ ...form, cest: e.target.value.replace(/\D/g, '').slice(0, 7) || null })}
                      placeholder="0000000"
                      maxLength={7}
                    />
                    <p className="text-xs text-muted-foreground mt-1">7 dígitos (opcional)</p>
                  </div>
                </div>
              </div>

              <Separator />

              {/* ICMS */}
              <div className="space-y-4">
                <h3 className="font-semibold text-sm text-muted-foreground">ICMS (Simples Nacional)</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label>Origem *</Label>
                    <Select value={form.icms_origin} onValueChange={(v) => setForm({ ...form, icms_origin: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ICMS_ORIGIN_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>CSOSN *</Label>
                    <Select value={form.csosn} onValueChange={(v) => setForm({ ...form, csosn: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CSOSN_OPTIONS.map((c) => (
                          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Alíquota ICMS (%)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={form.icms_aliquot}
                      onChange={(e) => setForm({ ...form, icms_aliquot: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* PIS */}
              <div className="space-y-4">
                <h3 className="font-semibold text-sm text-muted-foreground">PIS</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>CST PIS</Label>
                    <Select value={form.pis_cst} onValueChange={(v) => setForm({ ...form, pis_cst: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PIS_COFINS_CST_OPTIONS.map((c) => (
                          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Alíquota PIS (%)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={form.pis_aliquot}
                      onChange={(e) => setForm({ ...form, pis_aliquot: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* COFINS */}
              <div className="space-y-4">
                <h3 className="font-semibold text-sm text-muted-foreground">COFINS</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>CST COFINS</Label>
                    <Select value={form.cofins_cst} onValueChange={(v) => setForm({ ...form, cofins_cst: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PIS_COFINS_CST_OPTIONS.map((c) => (
                          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Alíquota COFINS (%)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={form.cofins_aliquot}
                      onChange={(e) => setForm({ ...form, cofins_aliquot: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* IPI */}
              <div className="space-y-4">
                <h3 className="font-semibold text-sm text-muted-foreground">IPI</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>CST IPI</Label>
                    <Input
                      value={form.ipi_cst}
                      onChange={(e) => setForm({ ...form, ipi_cst: e.target.value })}
                      placeholder="99"
                    />
                  </div>
                  <div>
                    <Label>Alíquota IPI (%)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={form.ipi_aliquot}
                      onChange={(e) => setForm({ ...form, ipi_aliquot: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                </div>
              </div>

              <Button onClick={handleSave} className="w-full">
                {editingRule ? 'Salvar Alterações' : 'Criar Regra Tributária'}
              </Button>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
