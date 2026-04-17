import React, { useState } from 'react';
import { useCategories, CategorySortMode } from '@/hooks/useCategories';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuthContext } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, ChevronUp, ChevronDown, GripVertical, Image, FolderOpen, Pencil, Check, X, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { uploadCompressedImage } from '@/utils/imageUtils';

export default function Categories() {
  const { company } = useAuthContext();
  const {
    categories,
    loading,
    sortMode,
    saveSortMode,
    addCategory,
    deleteCategory,
    updateCategory,
    moveCategory,
  } = useCategories({ companyId: company?.id });

  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingCatName, setEditingCatName] = useState('');

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    const success = await addCategory(newCategoryName.trim());
    if (success) setNewCategoryName('');
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
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <FolderOpen className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Categorias</h1>
            <p className="text-sm text-muted-foreground">Gerencie as categorias do seu cardápio</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Nova Categoria</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Nome da categoria"
                onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                className="flex-1"
              />
              <Button onClick={handleAddCategory}>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <CardTitle className="text-lg">Categorias ({categories.length})</CardTitle>
            <Select value={sortMode} onValueChange={(v: CategorySortMode) => saveSortMode(v)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Ordem manual</SelectItem>
                <SelectItem value="alphabetical">Ordem alfabética</SelectItem>
                <SelectItem value="created">Ordem de cadastro</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">
              {sortMode === 'manual' && 'Use as setas para reordenar as categorias'}
              {sortMode === 'alphabetical' && 'Categorias ordenadas de A-Z'}
              {sortMode === 'created' && 'Categorias ordenadas pela data de criação'}
            </p>
            <div className="space-y-2">
              {categories.map((cat, index) => (
                <div key={cat.id} className="flex items-center justify-between p-3 border rounded-lg bg-background">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {sortMode === 'manual' && (
                      <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    )}
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="hover:bg-muted rounded p-1 transition-colors flex-shrink-0 w-8 h-8 flex items-center justify-center overflow-hidden" title="Alterar ícone">
                          {cat.imageUrl ? (
                            <img src={cat.imageUrl} alt={cat.name} className="w-7 h-7 rounded object-cover" />
                          ) : (
                            <span className="text-xl">{cat.emoji || '🍽️'}</span>
                          )}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-3" align="start">
                        <div className="space-y-3">
                          <p className="text-xs font-medium text-muted-foreground">Escolha um emoji</p>
                          <div className="grid grid-cols-6 gap-1">
                            {['🍔', '🍕', '🍟', '🌭', '🥪', '🌮', '🍝', '🍣', '🍱', '🥗', '🥩', '🐟', '🦐', '🍗', '🥟', '🍰', '🍩', '🍦', '🧁', '🍇', '☕', '🧃', '🥤', '🍺', '🍷', '🧋', '🥂', '🍸', '🎁', '🍽️'].map(emoji => (
                              <button
                                key={emoji}
                                className={cn("text-xl p-1.5 rounded hover:bg-muted transition-colors", cat.emoji === emoji && !cat.imageUrl && "bg-primary/10 ring-1 ring-primary")}
                                onClick={() => updateCategory(cat.id, { emoji, imageUrl: '' })}
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                          <div className="border-t pt-2">
                            <p className="text-xs font-medium text-muted-foreground mb-2">Ou envie uma imagem</p>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              id={`cat-img-${cat.id}`}
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                try {
                                  const path = `categories/${cat.id}.webp`;
                                  const result = await uploadCompressedImage(supabase, 'product-images', path, file, { upsert: true });
                                  if (!result) throw new Error('Upload failed');
                                  await updateCategory(cat.id, { imageUrl: result.publicUrl + '?t=' + Date.now() });
                                } catch (err) {
                                  console.error(err);
                                  toast.error('Erro ao enviar imagem');
                                }
                                e.target.value = '';
                              }}
                            />
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full"
                              onClick={() => document.getElementById(`cat-img-${cat.id}`)?.click()}
                            >
                              <Image className="h-4 w-4 mr-2" />
                              Buscar imagem
                            </Button>
                            {cat.imageUrl && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="w-full mt-1 text-destructive"
                                onClick={() => updateCategory(cat.id, { imageUrl: '', emoji: cat.emoji || '🍽️' })}
                              >
                                Remover imagem
                              </Button>
                            )}
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                    {editingCatId === cat.id ? (
                      <div className="flex items-center gap-1 flex-1 min-w-0">
                        <Input
                          value={editingCatName}
                          onChange={(e) => setEditingCatName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              if (editingCatName.trim() && editingCatName.trim() !== cat.name) {
                                updateCategory(cat.id, { name: editingCatName.trim() });
                              }
                              setEditingCatId(null);
                            } else if (e.key === 'Escape') {
                              setEditingCatId(null);
                            }
                          }}
                          className="h-7 text-sm"
                          autoFocus
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-primary"
                          onClick={() => {
                            if (editingCatName.trim() && editingCatName.trim() !== cat.name) {
                              updateCategory(cat.id, { name: editingCatName.trim() });
                            }
                            setEditingCatId(null);
                          }}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => setEditingCatId(null)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <span
                        className="truncate font-medium cursor-pointer hover:text-primary transition-colors"
                        onDoubleClick={() => { setEditingCatId(cat.id); setEditingCatName(cat.name); }}
                      >
                        {cat.name}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <div className="relative group">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => { setEditingCatId(cat.id); setEditingCatName(cat.name); }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-xs text-white bg-gray-800 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">Editar categoria</span>
                    </div>
                    {sortMode === 'manual' && (
                      <>
                        <div className="relative group">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => moveCategory(cat.id, 'up')}
                            disabled={index === 0}
                          >
                            <ChevronUp className="h-4 w-4" />
                          </Button>
                          <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-xs text-white bg-gray-800 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">Mover para cima</span>
                        </div>
                        <div className="relative group">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => moveCategory(cat.id, 'down')}
                            disabled={index === categories.length - 1}
                          >
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                          <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-xs text-white bg-gray-800 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">Mover para baixo</span>
                        </div>
                      </>
                    )}
                    <div className="relative group">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive h-8 w-8 p-0"
                        onClick={() => deleteCategory(cat.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-xs text-white bg-gray-800 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">Excluir categoria</span>
                    </div>
                  </div>
                </div>
              ))}
              {categories.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <FolderOpen className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>Nenhuma categoria cadastrada</p>
                  <p className="text-xs mt-1">Crie sua primeira categoria acima</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
