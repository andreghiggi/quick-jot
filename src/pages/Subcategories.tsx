import React, { useState, useRef } from 'react';
import { useSubcategories } from '@/hooks/useSubcategories';
import { useCategories } from '@/hooks/useCategories';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuthContext } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, ChevronUp, ChevronDown, Pencil, Check, X, Layers, Image, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { uploadCompressedImage } from '@/utils/imageUtils';

export default function Subcategories() {
  const { company } = useAuthContext();
  const { categories } = useCategories({ companyId: company?.id });
  const {
    subcategories,
    loading,
    addSubcategory,
    updateSubcategory,
    deleteSubcategory,
    moveSubcategory,
    getSubcategoriesByCategoryId,
  } = useSubcategories({ companyId: company?.id });

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCategoryId, setNewCategoryId] = useState('');
  const [newImageUrl, setNewImageUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const [filterCategoryId, setFilterCategoryId] = useState<string | null>(null);

  const handleAdd = async () => {
    if (!newName.trim() || !newCategoryId) {
      toast.error('Preencha o nome e selecione uma categoria');
      return;
    }
    const success = await addSubcategory(newCategoryId, newName.trim(), newImageUrl || undefined);
    if (success) {
      setNewName('');
      setNewCategoryId('');
      setNewImageUrl('');
      setIsAddOpen(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !company?.id) return;
    setIsUploading(true);
    try {
      const path = `subcategories/${company.id}/${Date.now()}.webp`;
      const result = await uploadCompressedImage(supabase, 'product-images', path, file, { upsert: true });
      if (!result) throw new Error('Upload failed');
      setNewImageUrl(result.publicUrl);
      toast.success('Imagem enviada!');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao enviar imagem');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleSubcatImageUpload = async (subcatId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !company?.id) return;
    try {
      const path = `subcategories/${company.id}/${subcatId}.webp`;
      const result = await uploadCompressedImage(supabase, 'product-images', path, file, { upsert: true });
      if (!result) throw new Error('Upload failed');
      await updateSubcategory(subcatId, { imageUrl: result.publicUrl + '?t=' + Date.now() });
    } catch (err) {
      console.error(err);
      toast.error('Erro ao enviar imagem');
    }
    e.target.value = '';
  };

  // Group subcategories by category
  const grouped = categories
    .filter(cat => !filterCategoryId || cat.id === filterCategoryId)
    .map(cat => ({
      category: cat,
      subs: getSubcategoriesByCategoryId(cat.id),
    }))
    .filter(g => !filterCategoryId || g.subs.length > 0 || g.category.id === filterCategoryId);

  // Also show all active+inactive subcats
  const allSubsForCategory = (categoryId: string) => {
    return subcategories
      .filter(s => s.categoryId === categoryId)
      .sort((a, b) => a.displayOrder - b.displayOrder);
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      title="Subcategorias"
      actions={
        <Button onClick={() => setIsAddOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          <span className="hidden sm:inline">Nova Subcategoria</span>
        </Button>
      }
    >
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Layers className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Subcategorias</h1>
            <p className="text-sm text-muted-foreground">Gerencie as subcategorias associadas às categorias do cardápio</p>
          </div>
        </div>

        {/* Category filter */}
        {categories.length > 1 && (
          <div className="flex gap-2 flex-wrap">
            <Badge
              variant={filterCategoryId === null ? 'default' : 'outline'}
              className="cursor-pointer px-3 py-1.5 text-sm"
              onClick={() => setFilterCategoryId(null)}
            >
              Todas
            </Badge>
            {categories.map(cat => (
              <Badge
                key={cat.id}
                variant={filterCategoryId === cat.id ? 'default' : 'outline'}
                className="cursor-pointer px-3 py-1.5 text-sm"
                onClick={() => setFilterCategoryId(prev => prev === cat.id ? null : cat.id)}
              >
                {cat.name} ({allSubsForCategory(cat.id).length})
              </Badge>
            ))}
          </div>
        )}

        {categories.filter(cat => !filterCategoryId || cat.id === filterCategoryId).map(cat => {
          const catSubs = allSubsForCategory(cat.id);
          if (catSubs.length === 0 && filterCategoryId !== cat.id) return null;

          return (
            <Card key={cat.id}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  {cat.imageUrl ? (
                    <img src={cat.imageUrl} alt={cat.name} className="w-6 h-6 rounded object-cover" />
                  ) : (
                    <span>{cat.emoji || '🍽️'}</span>
                  )}
                  {cat.name}
                  <span className="text-xs text-muted-foreground font-normal">({catSubs.length} subcategorias)</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {catSubs.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    Nenhuma subcategoria nesta categoria
                  </p>
                ) : (
                  <div className="space-y-2">
                    {catSubs.map((sub, idx) => (
                      <div key={sub.id} className="flex items-center justify-between p-3 border rounded-lg bg-background">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          {sub.imageUrl ? (
                            <img src={sub.imageUrl} alt={sub.name} className="w-8 h-8 rounded object-cover flex-shrink-0" />
                          ) : (
                            <div className="w-8 h-8 rounded bg-muted flex items-center justify-center flex-shrink-0">
                              <Layers className="h-4 w-4 text-muted-foreground" />
                            </div>
                          )}
                          {editingId === sub.id ? (
                            <div className="flex items-center gap-1 flex-1 min-w-0">
                              <Input
                                value={editingName}
                                onChange={(e) => setEditingName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    if (editingName.trim()) updateSubcategory(sub.id, { name: editingName.trim() });
                                    setEditingId(null);
                                  } else if (e.key === 'Escape') {
                                    setEditingId(null);
                                  }
                                }}
                                className="h-7 text-sm"
                                autoFocus
                              />
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-primary" onClick={() => { if (editingName.trim()) updateSubcategory(sub.id, { name: editingName.trim() }); setEditingId(null); }}>
                                <Check className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditingId(null)}>
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <span
                              className={cn("truncate font-medium cursor-pointer hover:text-primary transition-colors", !sub.active && "opacity-50")}
                              onDoubleClick={() => { setEditingId(sub.id); setEditingName(sub.name); }}
                            >
                              {sub.name}
                            </span>
                          )}
                          {!sub.active && <Badge variant="secondary" className="text-xs">Inativa</Badge>}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            id={`subcat-img-${sub.id}`}
                            onChange={(e) => handleSubcatImageUpload(sub.id, e)}
                          />
                          <div className="relative group">
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => document.getElementById(`subcat-img-${sub.id}`)?.click()}>
                              <Image className="h-3.5 w-3.5" />
                            </Button>
                            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-xs text-white bg-gray-800 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">Alterar imagem</span>
                          </div>
                          <div className="relative group">
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => { setEditingId(sub.id); setEditingName(sub.name); }}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-xs text-white bg-gray-800 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">Editar</span>
                          </div>
                          <div className="relative group">
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => moveSubcategory(sub.id, 'up', cat.id)} disabled={idx === 0}>
                              <ChevronUp className="h-4 w-4" />
                            </Button>
                            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-xs text-white bg-gray-800 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">Mover para cima</span>
                          </div>
                          <div className="relative group">
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => moveSubcategory(sub.id, 'down', cat.id)} disabled={idx === catSubs.length - 1}>
                              <ChevronDown className="h-4 w-4" />
                            </Button>
                            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-xs text-white bg-gray-800 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">Mover para baixo</span>
                          </div>
                          <div className="relative group">
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive hover:text-destructive" onClick={() => deleteSubcategory(sub.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-xs text-white bg-gray-800 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">Excluir</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}

        {subcategories.length === 0 && !filterCategoryId && (
          <Card>
            <CardContent className="py-12 text-center">
              <Layers className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Nenhuma subcategoria cadastrada</p>
              <Button className="mt-4" onClick={() => setIsAddOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Criar primeira subcategoria
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Add Dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Subcategoria</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Categoria *</Label>
              <Select value={newCategoryId} onValueChange={setNewCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a categoria" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(cat => (
                    <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Nome *</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nome da subcategoria"
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              />
            </div>
            <div>
              <Label>Imagem (opcional)</Label>
              <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageUpload} className="hidden" />
              {newImageUrl ? (
                <div className="relative mt-2">
                  <img src={newImageUrl} alt="Preview" className="w-full h-32 object-cover rounded" />
                  <Button variant="destructive" size="icon" className="absolute top-1 right-1 h-6 w-6" onClick={() => setNewImageUrl('')}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <Button type="button" variant="outline" className="w-full mt-2" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                  {isUploading ? 'Enviando...' : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Selecionar imagem
                    </>
                  )}
                </Button>
              )}
            </div>
            <Button onClick={handleAdd} className="w-full">Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
