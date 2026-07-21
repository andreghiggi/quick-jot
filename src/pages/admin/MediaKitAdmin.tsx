import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Loader2, Upload, Download, Trash2, FileText, Image as ImageIcon, Video, FileAudio, File as FileIcon } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface MediaFile {
  id: string;
  title: string;
  description: string | null;
  category: string;
  file_path: string;
  file_name: string;
  file_type: string | null;
  size_bytes: number | null;
  created_at: string;
}

const CATEGORIES = [
  { value: 'logos', label: 'Logos' },
  { value: 'banners', label: 'Banners' },
  { value: 'videos', label: 'Vídeos' },
  { value: 'apresentacoes', label: 'Apresentações' },
  { value: 'textos', label: 'Textos prontos' },
  { value: 'redes-sociais', label: 'Redes sociais' },
  { value: 'geral', label: 'Geral' },
];

function formatSize(bytes: number | null) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fileIcon(type: string | null) {
  if (!type) return FileIcon;
  if (type.startsWith('image/')) return ImageIcon;
  if (type.startsWith('video/')) return Video;
  if (type.startsWith('audio/')) return FileAudio;
  if (type.includes('pdf') || type.includes('text')) return FileText;
  return FileIcon;
}

export default function MediaKitAdmin() {
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('geral');
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => { fetchFiles(); }, []);

  async function fetchFiles() {
    setLoading(true);
    const { data, error } = await supabase
      .from('media_kit_files')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      toast.error('Erro ao carregar mídia kit');
    } else {
      setFiles((data as any) || []);
    }
    setLoading(false);
  }

  function resetForm() {
    setTitle('');
    setDescription('');
    setCategory('geral');
    setFile(null);
  }

  async function handleUpload() {
    if (!file || !title.trim()) {
      toast.error('Preencha o título e selecione um arquivo');
      return;
    }
    setIsUploading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const ts = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${category}/${ts}-${safeName}`;

      const { error: upErr } = await supabase.storage
        .from('media-kit')
        .upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (upErr) throw upErr;

      const { error: insErr } = await supabase.from('media_kit_files').insert({
        title: title.trim(),
        description: description.trim() || null,
        category,
        file_path: path,
        file_name: file.name,
        file_type: file.type || null,
        size_bytes: file.size,
        uploaded_by: userData.user?.id ?? null,
      });
      if (insErr) throw insErr;

      toast.success('Material adicionado!');
      setIsDialogOpen(false);
      resetForm();
      fetchFiles();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Erro ao enviar arquivo');
    } finally {
      setIsUploading(false);
    }
  }

  async function handleDownload(f: MediaFile) {
    const { data, error } = await supabase.storage
      .from('media-kit')
      .createSignedUrl(f.file_path, 300, { download: f.file_name });
    if (error || !data) {
      toast.error('Não foi possível gerar o link');
      return;
    }
    window.open(data.signedUrl, '_blank');
  }

  async function handleDelete(f: MediaFile) {
    if (!confirm(`Excluir "${f.title}"?`)) return;
    try {
      await supabase.storage.from('media-kit').remove([f.file_path]);
      const { error } = await supabase.from('media_kit_files').delete().eq('id', f.id);
      if (error) throw error;
      toast.success('Material removido');
      fetchFiles();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao remover');
    }
  }

  const grouped = CATEGORIES.map(c => ({
    ...c,
    items: files.filter(f => f.category === c.value),
  })).filter(g => g.items.length > 0);

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold">Mídia Kit</h1>
            <p className="text-sm text-muted-foreground">
              Materiais de divulgação disponíveis para todos os revendedores baixarem.
            </p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button><Upload className="w-4 h-4 mr-2" /> Novo material</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Adicionar material</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Título *</Label>
                  <Input value={title} onChange={e => setTitle(e.target.value)} />
                </div>
                <div>
                  <Label>Descrição</Label>
                  <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} />
                </div>
                <div>
                  <Label>Categoria</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(c => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Arquivo *</Label>
                  <Input type="file" onChange={e => setFile(e.target.files?.[0] ?? null)} />
                  {file && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {file.name} — {formatSize(file.size)}
                    </p>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isUploading}>Cancelar</Button>
                <Button onClick={handleUpload} disabled={isUploading}>
                  {isUploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                  Enviar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : files.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Nenhum material publicado ainda.
            </CardContent>
          </Card>
        ) : (
          grouped.map(g => (
            <div key={g.value} className="space-y-3">
              <h2 className="text-lg font-semibold">{g.label}</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {g.items.map(f => {
                  const Icon = fileIcon(f.file_type);
                  return (
                    <Card key={f.id}>
                      <CardHeader className="pb-2">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded bg-muted flex items-center justify-center shrink-0">
                            <Icon className="w-5 h-5 text-muted-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <CardTitle className="text-base truncate">{f.title}</CardTitle>
                            <CardDescription className="text-xs">
                              {formatSize(f.size_bytes)} · {format(new Date(f.created_at), 'dd/MM/yyyy', { locale: ptBR })}
                            </CardDescription>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {f.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2">{f.description}</p>
                        )}
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" className="flex-1" onClick={() => handleDownload(f)}>
                            <Download className="w-4 h-4 mr-1" /> Baixar
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleDelete(f)}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </AppLayout>
  );
}