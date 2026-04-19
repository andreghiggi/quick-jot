import { useEffect } from 'react';
import { Receipt } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { useStoreSettings } from '@/hooks/useStoreSettings';
import { useCompanyModules } from '@/hooks/useCompanyModules';

export type DocumentMode = 'sale_only' | 'sale_with_nfce';

interface Props {
  companyId?: string;
  value: DocumentMode;
  onChange: (v: DocumentMode) => void;
  forceNFCe?: boolean; // e.g. TEF payments
  forceNFCeReason?: string;
}

/**
 * Mesmas opções e estilos do PDV V1 (Geração de Documentos + Impressão Automática),
 * encapsulado para reuso na tela de cobrança do PDV V2.
 * Persiste em localStorage 'pdv_document_mode' como o V1.
 */
export function PDVV2DocumentModeSelector({
  companyId,
  value,
  onChange,
  forceNFCe,
  forceNFCeReason = '⚠️ NFC-e obrigatória para pagamentos com TEF',
}: Props) {
  const { isModuleEnabled } = useCompanyModules({ companyId });
  const { settings, updateSetting } = useStoreSettings({ companyId });

  // Persist like V1
  useEffect(() => {
    localStorage.setItem('pdv_document_mode', value);
  }, [value]);

  if (!isModuleEnabled('fiscal')) return null;

  const effective: DocumentMode = forceNFCe ? 'sale_with_nfce' : value;

  return (
    <div className="space-y-3">
      <div className="p-3 bg-accent/50 rounded-lg border border-accent space-y-2">
        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
          <Receipt className="w-3.5 h-3.5" />
          Geração de Documentos
        </p>
        <RadioGroup
          value={effective}
          onValueChange={(v) => onChange(v as DocumentMode)}
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="sale_only" id="v2-doc-sale-only" disabled={forceNFCe} />
            <label
              htmlFor="v2-doc-sale-only"
              className={`text-sm cursor-pointer ${forceNFCe ? 'opacity-50' : ''}`}
            >
              Somente Venda
            </label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="sale_with_nfce" id="v2-doc-sale-nfce" />
            <label htmlFor="v2-doc-sale-nfce" className="text-sm cursor-pointer">
              Venda com NFC-e
            </label>
          </div>
        </RadioGroup>
        {forceNFCe && (
          <p className="text-xs text-amber-600 mt-1">{forceNFCeReason}</p>
        )}
      </div>

      <div className="p-3 bg-muted/40 rounded-lg border space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Impressão Automática</p>
        <div className="flex items-center space-x-2">
          <Checkbox
            id="v2-auto-print-sales"
            checked={settings.autoPrintSales}
            onCheckedChange={async (checked) => {
              await updateSetting('auto_print_sales', checked ? 'true' : 'false');
            }}
          />
          <label htmlFor="v2-auto-print-sales" className="text-sm cursor-pointer">
            Vendas
          </label>
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox
            id="v2-auto-print-nfce"
            checked={settings.autoPrintNfce}
            onCheckedChange={async (checked) => {
              await updateSetting('auto_print_nfce', checked ? 'true' : 'false');
            }}
          />
          <label htmlFor="v2-auto-print-nfce" className="text-sm cursor-pointer">
            NFC-e
          </label>
        </div>
      </div>
      <Separator />
    </div>
  );
}
