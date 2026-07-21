import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ResellerLayout } from '@/components/reseller/ResellerLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Loader2, Download, FileText, Image as ImageIcon, Video, FileAudio, File as FileIcon, Search } from 'lucide-react';
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

const CATEGORY_LABEL: Record<string, string> = {
  logos: 'Logos',
  banners: 'Banners',
  videos: 'Vídeos',
  apresentacoes: 'Apresentações',
  textos: 'Textos prontos',
  'redes-sociais': 'Redes sociais',
  geral: 'Geral',
};

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

export default function ResellerMediaKit() {
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('media_kit_files')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) toast.error('Erro ao carregar mídia kit');
      else setFiles((data as any) || []);
      setLoading(false);
    })();
  }, []);

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

  const query = q.trim().toLowerCase();
  const filtered = query
    ? files.filter(f =>
        f.title.toLowerCase().includes(query) ||
        (f.description || '').toLowerCase().includes(query) ||
        (CATEGORY_LABEL[f.category] || f.category).toLowerCase().includes(query)
      )
    : files;

  const categories = Array.from(new Set(filtered.map(f => f.category)));

  return (
    <ResellerLayout title="Mídia Kit">
      <div className="space-y-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar material..."
            value={q}
            onChange={e => setQ(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Nenhum material disponível ainda.
            </CardContent>
          </Card>
        ) : (
          categories.map(cat => {
            const items = filtered.filter(f => f.category === cat);
            if (items.length === 0) return null;
            return (
              <div key={cat} className="space-y-3">
                <h2 className="text-lg font-semibold">{CATEGORY_LABEL[cat] || cat}</h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map(f => {
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
                            <p className="text-sm text-muted-foreground line-clamp-3">{f.description}</p>
                          )}
                          <Button size="sm" variant="outline" className="w-full" onClick={() => handleDownload(f)}>
                            <Download className="w-4 h-4 mr-1" /> Baixar
                          </Button>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </ResellerLayout>
  );
}