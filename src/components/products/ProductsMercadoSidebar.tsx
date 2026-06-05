import { Plus, Camera, Upload, FileText, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface Props {
  onNewProduct: () => void;
  onImportPhoto: () => void;
  onImportFile: () => void;
  onBulkTax?: () => void;
  onOpenMenu: () => void;
}

/**
 * Sidebar de atalhos da aba "Mercado" (Fase A).
 * Apenas dispara ações já existentes na página de Produtos — não cria fluxo novo
 * e não mexe em nada homologado/congelado.
 */
export function ProductsMercadoSidebar({
  onNewProduct,
  onImportPhoto,
  onImportFile,
  onBulkTax,
  onOpenMenu,
}: Props) {
  return (
    <aside className="w-full lg:w-56 lg:flex-shrink-0">
      <Card className="lg:sticky lg:top-4">
        <CardContent className="p-3 space-y-3">
          <div>
            <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">
              Ações rápidas
            </h4>
          </div>

          <div className="space-y-1.5">
            <Button onClick={onNewProduct} className="w-full justify-start" size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Novo produto
            </Button>
          </div>

          <div className="pt-2 border-t space-y-1.5">
            <p className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wide">
              Importação
            </p>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start"
              onClick={onImportPhoto}
            >
              <Camera className="h-4 w-4 mr-2" />
              Foto do cardápio
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start"
              onClick={onImportFile}
            >
              <Upload className="h-4 w-4 mr-2" />
              Arquivo (PDF/Imagem)
            </Button>
          </div>

          {onBulkTax && (
            <div className="pt-2 border-t space-y-1.5">
              <p className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wide">
                Em massa
              </p>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={onBulkTax}
              >
                <FileText className="h-4 w-4 mr-2" />
                Tributação NCM/CFOP
              </Button>
            </div>
          )}

          <div className="pt-2 border-t space-y-1.5">
            <p className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wide">
              Utilidades
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={onOpenMenu}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Ver cardápio
            </Button>
          </div>
        </CardContent>
      </Card>
    </aside>
  );
}