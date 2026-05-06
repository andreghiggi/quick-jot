import { useState, useRef, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuthContext } from '@/contexts/AuthContext';
import { LANCHERIA_I9_COMPANY_ID } from '@/components/pdv-v2/_format';
import { useOptionalGroups, OptionalGroup } from '@/hooks/useOptionalGroups';
import { useCategories } from '@/hooks/useCategories';
import { useProducts } from '@/hooks/useProducts';
import { supabase } from '@/integrations/supabase/client';
import { uploadCompressedImage } from '@/utils/imageUtils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Plus, Trash2, Pencil, Upload, Loader2, FileImage, Eye, Check, Package, Layers, Camera, ImageIcon, LayoutList, LayoutGrid, ChevronUp, ChevronDown, Copy } from 'lucide-react';

interface ExtractedGroup {
  name: string;
  items: { name: string; price: number }[];
  selected: boolean;
}

export default function OptionalGroups() {
  const { company } = useAuthContext();
  const { groups, loading, addGroup, updateGroup, duplicateGroup, deleteGroup, addItem, addItemsBulk, updateItem, deleteItem, setCategoryLinks, setProductLinks, moveGroup } = useOptionalGroups({ companyId: company?.id });
  const { categories } = useCategories({ companyId: company?.id });
  const { products } = useProducts({ companyId: company?.id });

  // Dialog states
  const [isNewGroupOpen, setIsNewGroupOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<OptionalGroup | null>(null);
  const [isAssociateOpen, setIsAssociateOpen] = useState(false);
  const [associatingGroup, setAssociatingGroup] = useState<OptionalGroup | null>(null);
  const [isAddItemOpen, setIsAddItemOpen] = useState(false);
  const [addItemGroupId, setAddItemGroupId] = useState<string | null>(null);

  // New group form
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupMin, setNewGroupMin] = useState(0);
  const [newGroupMax, setNewGroupMax] = useState(0);
  const [newGroupMaxPerItem, setNewGroupMaxPerItem] = useState(1);
  const isI9 = company?.id === LANCHERIA_I9_COMPANY_ID;

  // New item form
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');

  // Edit item state
  const [editingItem, setEditingItem] = useState<{ id: string; name: string; price: string; active: boolean } | null>(null);

  // Association state
  const [selectedCatIds, setSelectedCatIds] = useState<string[]>([]);
  const [selectedProdIds, setSelectedProdIds] = useState<string[]>([]);
  const [prodOverrides, setProdOverrides] = useState<Record<string, { min: number | null; max: number | null }>>({});

  // Import state
  const [importStep, setImportStep] = useState<'idle' | 'preview' | 'review'>('idle');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreviewUrl, setImportPreviewUrl] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [extractedGroups, setExtractedGroups] = useState<ExtractedGroup[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // --- Handlers ---

  async function handleCreateGroup() {
    if (!newGroupName.trim()) {
      toast.error('Informe o nome do grupo');
      return;
    }
    const groupData: any = { name: newGroupName.trim(), minSelect: newGroupMin, maxSelect: newGroupMax };
    if (isI9) groupData.maxQuantityPerItem = newGroupMaxPerItem;
    await addGroup(groupData);
    setNewGroupName('');
    setNewGroupMin(0);
    setNewGroupMax(0);
    setNewGroupMaxPerItem(1);
    setIsNewGroupOpen(false);
  }

  async function handleUpdateGroup() {
    if (!editingGroup) return;
    const updateData: any = {
      name: editingGroup.name,
      minSelect: editingGroup.minSelect,
      maxSelect: editingGroup.maxSelect,
      active: editingGroup.active,
      layout: editingGroup.layout,
    };
    if (isI9) updateData.maxQuantityPerItem = (editingGroup as any).maxQuantityPerItem ?? 1;
    updateData.waiterOnly = editingGroup.waiterOnly ?? false;
    await updateGroup(editingGroup.id, updateData);
    setEditingGroup(null);
  }

  async function handleAddItem() {
    if (!addItemGroupId || !newItemName.trim()) {
      toast.error('Informe o nome do item');
      return;
    }
    await addItem(addItemGroupId, { name: newItemName.trim(), price: parseFloat(newItemPrice) || 0 });
    setNewItemName('');
    setNewItemPrice('');
    setIsAddItemOpen(false);
    setAddItemGroupId(null);
  }

  async function handleEditItem() {
    if (!editingItem) return;
    if (!editingItem.name.trim()) {
      toast.error('Informe o nome do item');
      return;
    }
    await updateItem(editingItem.id, {
      name: editingItem.name.trim(),
      price: parseFloat(editingItem.price) || 0,
      active: editingItem.active,
    });
    setEditingItem(null);
  }

  function openAssociate(group: OptionalGroup) {
    setAssociatingGroup(group);
    setSelectedCatIds([...group.categoryIds]);
    setSelectedProdIds([...group.productIds]);
    // Load existing overrides
    const overridesMap: Record<string, { min: number | null; max: number | null }> = {};
    group.productOverrides?.forEach(o => {
      overridesMap[o.productId] = { min: o.minSelectOverride, max: o.maxSelectOverride };
    });
    setProdOverrides(overridesMap);
    setIsAssociateOpen(true);
  }

  async function handleSaveAssociations() {
    if (!associatingGroup) return;
    await setCategoryLinks(associatingGroup.id, selectedCatIds);
    await setProductLinks(associatingGroup.id, selectedProdIds, prodOverrides);
    toast.success('Associações salvas!');
    setIsAssociateOpen(false);
    setAssociatingGroup(null);
  }

  function toggleCatId(id: string) {
    setSelectedCatIds(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  }

  function toggleProdId(id: string) {
    setSelectedProdIds(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
    // Clean overrides when removing
    if (selectedProdIds.includes(id)) {
      setProdOverrides(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  }

  // --- Import handlers ---

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setImportFile(f);
    if (f.type.startsWith('image/')) {
      setImportPreviewUrl(URL.createObjectURL(f));
    } else {
      setImportPreviewUrl(null);
    }
    setImportStep('preview');
  }

  async function handleExtract() {
    if (!importFile || !company?.id) return;
    setIsExtracting(true);
    try {
      const fileExt = importFile.name.split('.').pop();
      const fileName = `optionals-import/${company.id}/${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('product-images').upload(fileName, importFile);
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(fileName);

      const { data, error } = await supabase.functions.invoke('extract-optionals', {
        body: { imageUrl: publicUrl }
      });
      if (error) throw error;

      if (data?.groups && Array.isArray(data.groups)) {
        setExtractedGroups(data.groups.map((g: any) => ({
          name: g.name || 'Sem nome',
          items: (g.items || []).map((i: any) => ({ name: i.name || '', price: parseFloat(i.price) || 0 })),
          selected: true,
        })));
        setImportStep('review');
        toast.success(`${data.groups.length} grupos encontrados!`);
      } else {
        toast.error('Não foi possível extrair adicionais');
      }
    } catch (error: any) {
      console.error('Error extracting optionals:', error);
      toast.error(error.message || 'Erro ao processar');
    } finally {
      setIsExtracting(false);
    }
  }

  async function handleImport() {
    const selected = extractedGroups.filter(g => g.selected);
    if (selected.length === 0) {
      toast.error('Selecione pelo menos um grupo');
      return;
    }
    setIsImporting(true);
    try {
      for (const eg of selected) {
        const groupId = await addGroup({ name: eg.name, minSelect: 0, maxSelect: 0 });
        if (groupId && eg.items.length > 0) {
          await addItemsBulk(groupId, eg.items);
        }
      }
      toast.success('Adicionais importados!');
      resetImport();
    } catch {
      toast.error('Erro ao importar');
    } finally {
      setIsImporting(false);
    }
  }

  function resetImport() {
    setImportFile(null);
    setImportPreviewUrl(null);
    setExtractedGroups([]);
    setImportStep('idle');
  }

  // Group products by category for the association dialog
  const productsByCategory = useMemo(() => {
    const map: Record<string, typeof products> = {};
    products.forEach(p => {
      if (!map[p.category]) map[p.category] = [];
      map[p.category].push(p);
    });
    return map;
  }, [products]);

  if (loading) {
    return (
      <AppLayout title="Grupos de Adicionais">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  const headerActions = (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={() => cameraInputRef.current?.click()}>
        <Camera className="h-4 w-4 mr-2" />
        <span className="hidden sm:inline">Foto</span>
      </Button>
      <input
        type="file"
        accept="image/*"
        capture="environment"
        ref={cameraInputRef}
        onChange={handleFileSelect}
        className="hidden"
      />
      <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
        <Upload className="h-4 w-4 mr-2" />
        <span className="hidden sm:inline">Arquivo</span>
      </Button>
      <input
        type="file"
        accept="image/*,.pdf,.jpg,.jpeg,.png,.webp"
        ref={fileInputRef}
        onChange={handleFileSelect}
        className="hidden"
      />
      <Button onClick={() => setIsNewGroupOpen(true)}>
        <Plus className="h-4 w-4 mr-2" />
        <span className="hidden sm:inline">Novo Grupo</span>
      </Button>
    </div>
  );

  return (
    <AppLayout title="Grupos de Adicionais" actions={headerActions}>
      <div className="space-y-6">
        {/* Import flow */}
        {importStep === 'preview' && importFile && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Eye className="w-5 h-5" /> Preview do Arquivo
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {importPreviewUrl && (
                <div className="max-h-72 overflow-auto rounded border">
                  <img src={importPreviewUrl} alt="Preview" className="w-full" />
                </div>
              )}
              {!importPreviewUrl && (
                <div className="bg-muted p-6 rounded-lg text-center">
                  <FileImage className="w-12 h-12 mx-auto text-muted-foreground mb-2" />
                  <p className="font-medium">{importFile.name}</p>
                </div>
              )}
              <div className="flex gap-3">
                <Button variant="outline" onClick={resetImport}>Cancelar</Button>
                <Button onClick={handleExtract} disabled={isExtracting}>
                  {isExtracting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processando...</> : <><Eye className="w-4 h-4 mr-2" />Extrair Adicionais</>}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {importStep === 'review' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Check className="w-5 h-5" /> Revisar Adicionais Extraídos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ScrollArea className="max-h-[50vh]">
                <div className="space-y-4">
                  {extractedGroups.map((eg, gi) => (
                    <div key={gi} className={`border rounded-lg p-4 ${!eg.selected ? 'opacity-50' : ''}`}>
                      <div className="flex items-center gap-3 mb-3">
                        <Checkbox checked={eg.selected} onCheckedChange={() => setExtractedGroups(prev => prev.map((g, i) => i === gi ? { ...g, selected: !g.selected } : g))} />
                        <Input
                          value={eg.name}
                          onChange={(e) => setExtractedGroups(prev => prev.map((g, i) => i === gi ? { ...g, name: e.target.value } : g))}
                          className="h-8 font-semibold"
                        />
                      </div>
                      <div className="space-y-1 ml-8">
                        {eg.items.map((item, ii) => (
                          <div key={ii} className="flex items-center gap-2 text-sm">
                            <span className="flex-1">{item.name}</span>
                            <span className="text-muted-foreground">R$ {item.price.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={resetImport}>Cancelar</Button>
                <Button onClick={handleImport} disabled={isImporting || extractedGroups.filter(g => g.selected).length === 0}>
                  {isImporting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Importando...</> : <><Check className="w-4 h-4 mr-2" />Importar {extractedGroups.filter(g => g.selected).length} Grupos</>}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Groups list */}
        {groups.length === 0 && importStep === 'idle' && (
          <Card>
            <CardContent className="py-12 text-center">
              <Layers className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-medium">Nenhum grupo de adicionais</p>
              <p className="text-muted-foreground mt-1">Crie grupos como "Molhos", "Bordas", "Proteínas" e associe a categorias ou produtos.</p>
            </CardContent>
          </Card>
        )}

        <Accordion type="multiple" className="space-y-3">
          {groups.map(group => (
            <AccordionItem key={group.id} value={group.id} className="border rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-1 mr-2" onClick={(e) => e.stopPropagation()}>
                  <div className="relative group">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveGroup(group.id, 'up')} disabled={groups.indexOf(group) === 0}>
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-xs text-white bg-gray-800 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">Mover para cima</span>
                  </div>
                  <div className="relative group">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveGroup(group.id, 'down')} disabled={groups.indexOf(group) === groups.length - 1}>
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-xs text-white bg-gray-800 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">Mover para baixo</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-1 text-left">
                  <span className="font-semibold">{group.name}</span>
                   {!group.active && <Badge variant="secondary">Inativo</Badge>}
                   <Badge variant="outline" className="text-xs">
                     {group.items.length} {group.items.length === 1 ? 'item' : 'itens'}
                   </Badge>
                   {group.minSelect > 0 || group.maxSelect > 0 ? (
                     <Badge variant="outline" className="text-xs">
                       {group.minSelect > 0 ? `mín ${group.minSelect}` : ''}{group.minSelect > 0 && group.maxSelect > 0 ? ' / ' : ''}{group.maxSelect > 0 ? `máx ${group.maxSelect}` : ''}
                     </Badge>
                   ) : null}
                   {group.layout === 'horizontal' && (
                     <Badge variant="outline" className="text-xs gap-1">
                       <LayoutGrid className="h-3 w-3" /> Visual
                     </Badge>
                   )}
                  <div className="flex gap-1">
                    {group.categoryIds.length > 0 && (
                      <Badge className="text-xs bg-primary/10 text-primary border-primary/20">
                        {group.categoryIds.length} cat.
                      </Badge>
                    )}
                    {group.productIds.length > 0 && (
                      <Badge className="text-xs bg-primary/10 text-primary border-primary/20">
                        {group.productIds.length} prod.
                      </Badge>
                    )}
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 pb-2">
                  {/* Items */}
                  {group.items.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum item neste grupo.</p>
                  ) : (
                    <div className="space-y-1">
                     {group.items.map(item => (
                        <div key={item.id} className="flex items-center justify-between py-1 px-2 rounded hover:bg-muted/50">
                          <div className="flex items-center gap-2">
                            {item.imageUrl ? (
                              <img src={item.imageUrl} alt={item.name} className="w-8 h-8 rounded object-cover flex-shrink-0" />
                            ) : null}
                            <span className="text-sm">{item.name}</span>
                            {!item.active && <Badge variant="secondary" className="text-xs">Inativo</Badge>}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">R$ {item.price.toFixed(2)}</span>
                            <label className="cursor-pointer">
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  const path = `optional-items/${item.id}.webp`;
                                  const result = await uploadCompressedImage(supabase, 'product-images', path, file, { upsert: true });
                                  if (!result) { toast.error('Erro ao enviar imagem'); return; }
                                  await updateItem(item.id, { image_url: result.publicUrl + '?t=' + Date.now() });
                                  toast.success('Imagem atualizada!');
                                }}
                              />
                              <ImageIcon className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground transition-colors" />
                            </label>
                            <div className="relative group">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingItem({ id: item.id, name: item.name, price: item.price.toFixed(2), active: item.active })}>
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-xs text-white bg-gray-800 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">Editar opcional</span>
                            </div>
                            <div className="relative group">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteItem(item.id)}>
                                <Trash2 className="h-3 w-3 text-destructive" />
                              </Button>
                              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-xs text-white bg-gray-800 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">Excluir opcional</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2 pt-2 border-t">
                    <Button size="sm" variant="outline" onClick={() => { setAddItemGroupId(group.id); setIsAddItemOpen(true); }}>
                      <Plus className="h-3 w-3 mr-1" /> Item
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => openAssociate(group)}>
                      <Package className="h-3 w-3 mr-1" /> Associar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingGroup({ ...group })}>
                      <Pencil className="h-3 w-3 mr-1" /> Editar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => duplicateGroup(group.id)}>
                      <Copy className="h-3 w-3 mr-1" /> Duplicar
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="outline" className="text-destructive border-destructive/30">
                          <Trash2 className="h-3 w-3 mr-1" /> Excluir
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir grupo "{group.name}"?</AlertDialogTitle>
                          <AlertDialogDescription>Isso removerá o grupo e todos os itens. Essa ação não pode ser desfeita.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteGroup(group.id)}>Excluir</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>

      {/* New Group Dialog */}
      <Dialog open={isNewGroupOpen} onOpenChange={setIsNewGroupOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo Grupo de Adicionais</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome do grupo</Label>
              <Input placeholder="Ex: Molhos, Bordas, Proteínas" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Seleção mínima</Label>
                <Input type="number" min={0} value={newGroupMin} onChange={(e) => setNewGroupMin(parseInt(e.target.value) || 0)} />
                <p className="text-xs text-muted-foreground mt-1">0 = opcional</p>
              </div>
              <div>
                <Label>Seleção máxima</Label>
                <Input type="number" min={0} value={newGroupMax} onChange={(e) => setNewGroupMax(parseInt(e.target.value) || 0)} />
                <p className="text-xs text-muted-foreground mt-1">0 = sem limite</p>
              </div>
            </div>
            {isI9 && (
              <div>
                <Label>Máx. por item</Label>
                <Input type="number" min={1} value={newGroupMaxPerItem} onChange={(e) => setNewGroupMaxPerItem(Math.max(1, parseInt(e.target.value) || 1))} />
                <p className="text-xs text-muted-foreground mt-1">Quantas vezes o mesmo adicional pode ser selecionado (1 = checkbox)</p>
              </div>
            )}
            <Button onClick={handleCreateGroup} className="w-full">Criar Grupo</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Group Dialog */}
      <Dialog open={!!editingGroup} onOpenChange={() => setEditingGroup(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Grupo</DialogTitle></DialogHeader>
          {editingGroup && (
            <div className="space-y-4">
              <div>
                <Label>Nome</Label>
                <Input value={editingGroup.name} onChange={(e) => setEditingGroup({ ...editingGroup, name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Seleção mínima</Label>
                  <Input type="number" min={0} value={editingGroup.minSelect} onChange={(e) => setEditingGroup({ ...editingGroup, minSelect: parseInt(e.target.value) || 0 })} />
                </div>
                <div>
                  <Label>Seleção máxima</Label>
                  <Input type="number" min={0} value={editingGroup.maxSelect} onChange={(e) => setEditingGroup({ ...editingGroup, maxSelect: parseInt(e.target.value) || 0 })} />
                </div>
              </div>
              {isI9 && (
                <div>
                  <Label>Máx. por item</Label>
                  <Input type="number" min={1} value={editingGroup.maxQuantityPerItem ?? 1} onChange={(e) => setEditingGroup({ ...editingGroup, maxQuantityPerItem: Math.max(1, parseInt(e.target.value) || 1) })} />
                  <p className="text-xs text-muted-foreground mt-1">Quantas vezes o mesmo adicional pode ser selecionado (1 = checkbox)</p>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Switch checked={editingGroup.active} onCheckedChange={(v) => setEditingGroup({ ...editingGroup, active: v })} />
                <Label>Ativo</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={editingGroup.waiterOnly ?? false} onCheckedChange={(v) => setEditingGroup({ ...editingGroup, waiterOnly: v })} />
                <Label>Somente garçom</Label>
                <p className="text-xs text-muted-foreground">Este grupo não aparecerá no cardápio online nem no pedido express</p>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Layout no cardápio</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={editingGroup.layout === 'vertical' ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1 gap-2"
                    onClick={() => setEditingGroup({ ...editingGroup, layout: 'vertical' })}
                  >
                    <LayoutList className="h-4 w-4" /> Lista
                  </Button>
                  <Button
                    type="button"
                    variant={editingGroup.layout === 'horizontal' ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1 gap-2"
                    onClick={() => setEditingGroup({ ...editingGroup, layout: 'horizontal' })}
                  >
                    <LayoutGrid className="h-4 w-4" /> Visual (cards)
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {editingGroup.layout === 'horizontal' 
                    ? 'Exibe itens em cards horizontais com imagens grandes. Ideal para sabores com fotos.'
                    : 'Layout padrão em lista vertical com checkboxes.'}
                </p>
              </div>
              <Button onClick={handleUpdateGroup} className="w-full">Salvar</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Item Dialog */}
      <Dialog open={isAddItemOpen} onOpenChange={(v) => { setIsAddItemOpen(v); if (!v) setAddItemGroupId(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adicionar Item</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome</Label>
              <Input placeholder="Ex: Cheddar, Bacon, Catupiry" value={newItemName} onChange={(e) => setNewItemName(e.target.value)} />
            </div>
            <div>
              <Label>Preço (R$)</Label>
              <Input type="number" step="0.01" placeholder="0.00" value={newItemPrice} onChange={(e) => setNewItemPrice(e.target.value)} />
            </div>
            <Button onClick={handleAddItem} className="w-full">Adicionar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Associate Dialog */}
      <Dialog open={isAssociateOpen} onOpenChange={(v) => { setIsAssociateOpen(v); if (!v) setAssociatingGroup(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader><DialogTitle>Associar "{associatingGroup?.name}"</DialogTitle></DialogHeader>
          <div className="flex-1 overflow-y-auto -mx-6 px-6">
            <div className="space-y-6 pb-2">
              {/* Categories */}
              <div>
                <Label className="text-sm font-semibold mb-2 block">Categorias de produtos</Label>
                <p className="text-xs text-muted-foreground mb-3">Todos os produtos dessas categorias terão este grupo de adicionais.</p>
                <div className="space-y-2">
                  {categories.map(cat => (
                    <label key={cat.id} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox checked={selectedCatIds.includes(cat.id)} onCheckedChange={() => toggleCatId(cat.id)} />
                      <span className="text-sm">{cat.name}</span>
                    </label>
                  ))}
                  {categories.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma categoria cadastrada.</p>}
                </div>
              </div>

              {/* Individual products */}
              <div>
                <Label className="text-sm font-semibold mb-2 block">Produtos individuais</Label>
                <p className="text-xs text-muted-foreground mb-3">Associe a produtos específicos além das categorias.</p>
                <div className="space-y-3">
                  {Object.entries(productsByCategory).map(([catName, prods]) => (
                    <div key={catName}>
                      <p className="text-xs font-medium text-muted-foreground mb-1">{catName}</p>
                      <div className="space-y-2 ml-2">
                        {prods.map(p => {
                          const isSelected = selectedProdIds.includes(p.id);
                          const override = prodOverrides[p.id] || { min: null, max: null };
                          return (
                            <div key={p.id} className="space-y-1">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <Checkbox checked={isSelected} onCheckedChange={() => toggleProdId(p.id)} />
                                <span className="text-sm">{p.name}</span>
                              </label>
                              {isSelected && (
                                <div className="flex items-center gap-2 ml-6 text-xs">
                                  <span className="text-muted-foreground whitespace-nowrap">Mín:</span>
                                  <Input
                                    type="number"
                                    min={0}
                                    placeholder={String(associatingGroup?.minSelect ?? 0)}
                                    value={override.min ?? ''}
                                    onChange={(e) => {
                                      const val = e.target.value === '' ? null : parseInt(e.target.value);
                                      setProdOverrides(prev => ({ ...prev, [p.id]: { ...prev[p.id] || { min: null, max: null }, min: val } }));
                                    }}
                                    className="h-7 w-16 text-xs"
                                  />
                                  <span className="text-muted-foreground whitespace-nowrap">Máx:</span>
                                  <Input
                                    type="number"
                                    min={0}
                                    placeholder={String(associatingGroup?.maxSelect ?? 0)}
                                    value={override.max ?? ''}
                                    onChange={(e) => {
                                      const val = e.target.value === '' ? null : parseInt(e.target.value);
                                      setProdOverrides(prev => ({ ...prev, [p.id]: { ...prev[p.id] || { min: null, max: null }, max: val } }));
                                    }}
                                    className="h-7 w-16 text-xs"
                                  />
                                  <span className="text-muted-foreground text-[10px]">(vazio = padrão do grupo)</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  {products.length === 0 && <p className="text-sm text-muted-foreground">Nenhum produto cadastrado.</p>}
                </div>
              </div>
            </div>
          </div>
          <div className="pt-4 border-t flex-shrink-0">
            <Button onClick={handleSaveAssociations} className="w-full">Salvar Associações</Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Edit Item Dialog */}
      <Dialog open={!!editingItem} onOpenChange={() => setEditingItem(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Item</DialogTitle></DialogHeader>
          {editingItem && (
            <div className="space-y-4">
              <div>
                <Label>Nome</Label>
                <Input value={editingItem.name} onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })} />
              </div>
              <div>
                <Label>Preço (R$)</Label>
                <Input type="number" min={0} step="0.01" value={editingItem.price} onChange={(e) => setEditingItem({ ...editingItem, price: e.target.value })} />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={editingItem.active} onCheckedChange={(v) => setEditingItem({ ...editingItem, active: v })} />
                <Label>Ativo</Label>
              </div>
              <Button onClick={handleEditItem} className="w-full">Salvar</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
