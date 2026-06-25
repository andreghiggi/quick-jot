import { useState, useEffect, useRef } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuthContext } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, Building2, Phone, MapPin, Globe, Printer, Download, Truck, LayoutDashboard, Plus, Trash2, Clock, BookOpen, Image, Upload, AlertTriangle, Mail } from 'lucide-react';
import { uploadCompressedImage } from '@/utils/imageUtils';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Separator } from '@/components/ui/separator';
import { useStoreSettings } from '@/hooks/useStoreSettings';
import { useDeliveryNeighborhoods } from '@/hooks/useDeliveryNeighborhoods';
import { BusinessHoursSettings } from '@/components/settings/BusinessHoursSettings';
import { ButtonColorPicker } from '@/components/settings/ButtonColorPicker';
import autoPrinterTemplate from '../../scripts/auto_printer.py?raw';
import instalarImpressaoCmd from '../../scripts/instalar_impressao.cmd?raw';
import iniciarImpressaoCmd from '../../scripts/iniciar_impressao.cmd?raw';
import verificarPywin32Py from '../../scripts/verificar_pywin32.py?raw';
import autoPrinterWin11Py from '../../scripts/auto_printer.py?raw';

const escapePythonString = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

export default function Settings() {
  const { company, profile, refetchUserData, isSuperAdmin } = useAuthContext();
  const { toast } = useToast();
  const { settings: storeSettings, saveDeliveryFeeCity, saveDeliveryFeeInterior, saveCardVisibility, updateSetting, saveBannerUrl } = useStoreSettings({ companyId: company?.id });
  const [bannerUrl, setBannerUrl] = useState('');
  const [isBannerUploading, setIsBannerUploading] = useState(false);
  const bannerFileInputRef = useRef<HTMLInputElement>(null);
  const [showDangerZone, setShowDangerZone] = useState(false);
  const { neighborhoods, addNeighborhood, deleteNeighborhood } = useDeliveryNeighborhoods({ companyId: company?.id });
  const [loading, setLoading] = useState(false);
  const [deliveryFeeCity, setDeliveryFeeCity] = useState('');
  const [deliveryFeeInterior, setDeliveryFeeInterior] = useState('');
  const [savingDelivery, setSavingDelivery] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    cnpj: '',
    address_street: '',
    address_number: '',
    address_complement: '',
    address_neighborhood: '',
    address_reference: '',
    slug: '',
    subdomain: '',
  });

  // Neighborhood form state
  const [newNeighborhoodName, setNewNeighborhoodName] = useState('');
  const [newNeighborhoodFee, setNewNeighborhoodFee] = useState('');
  const [deliveryMode, setDeliveryMode] = useState<'simple' | 'neighborhood'>('simple');
  const [featuredSectionName, setFeaturedSectionName] = useState(storeSettings.featuredSectionName || 'Novidades');

  // Card visibility states
  const [cardVisibility, setCardVisibility] = useState({
    showCardPendentes: true,
    showCardPreparando: true,
    showCardProntos: true,
    showCardEntregues: true,
    showCardTodos: true,
    showCardFaturamento: true,
  });

  useEffect(() => {
    setDeliveryFeeCity(storeSettings.deliveryFeeCity.toString());
    setDeliveryFeeInterior(storeSettings.deliveryFeeInterior.toString());
    setCardVisibility({
      showCardPendentes: storeSettings.showCardPendentes,
      showCardPreparando: storeSettings.showCardPreparando,
      showCardProntos: storeSettings.showCardProntos,
      showCardEntregues: storeSettings.showCardEntregues,
      showCardTodos: storeSettings.showCardTodos,
      showCardFaturamento: storeSettings.showCardFaturamento,
    });
    // Check if there are neighborhoods to determine delivery mode
    if (neighborhoods.length > 0) {
      setDeliveryMode('neighborhood');
    }
    setBannerUrl(storeSettings.bannerUrl);
  }, [storeSettings, neighborhoods.length]);

  useEffect(() => {
    if (company) {
      setFormData({
        name: company.name || '',
        phone: company.phone || '',
        cnpj: (company as any).cnpj || '',
        address_street: (company as any).address_street || '',
        address_number: (company as any).address_number || '',
        address_complement: (company as any).address_complement || '',
        address_neighborhood: (company as any).address_neighborhood || '',
        address_reference: (company as any).address_reference || '',
        slug: company.slug || '',
        subdomain: (company as any).subdomain || '',
      });
    }
  }, [company]);

  useEffect(() => {
    if (storeSettings.featuredSectionName) {
      setFeaturedSectionName(storeSettings.featuredSectionName);
    }
  }, [storeSettings.featuredSectionName]);

  async function uploadBanner(file: File): Promise<string | null> {
    setIsBannerUploading(true);
    try {
      const fileName = `banner_${Date.now()}`;
      const result = await uploadCompressedImage(supabase, 'product-images', `${fileName}.webp`, file, { maxWidth: 1920 });
      if (!result) throw new Error('Upload failed');
      return result.publicUrl;
    } catch (error) {
      console.error('Error uploading banner:', error);
      toast({ title: 'Erro ao enviar banner', variant: 'destructive' });
      return null;
    } finally {
      setIsBannerUploading(false);
    }
  }

  async function handleBannerSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const imageUrl = await uploadBanner(file);
    if (imageUrl) {
      setBannerUrl(imageUrl);
      await saveBannerUrl(imageUrl);
      toast({ title: 'Banner salvo', description: 'O banner foi atualizado com sucesso.' });
    }
  }

  async function handleRemoveBanner() {
    setBannerUrl('');
    await saveBannerUrl('');
    toast({ title: 'Banner removido' });
  }

  const handleSave = async () => {
    if (!company?.id) return;

    setLoading(true);
    try {
      const fullAddress = [
        formData.address_street,
        formData.address_number,
        formData.address_complement,
        formData.address_neighborhood,
        formData.address_reference ? `Ref: ${formData.address_reference}` : '',
      ].filter(Boolean).join(', ');

      const { error } = await supabase
        .from('companies')
        .update({
          name: formData.name,
          phone: formData.phone,
          cnpj: formData.cnpj,
          address: fullAddress,
          address_street: formData.address_street,
          address_number: formData.address_number,
          address_complement: formData.address_complement,
          address_neighborhood: formData.address_neighborhood,
          address_reference: formData.address_reference,
          slug: formData.slug,
          subdomain: formData.subdomain || null,
        } as any)
        .eq('id', company.id);

      if (error) throw error;

      toast({
        title: 'Configurações salvas',
        description: 'As configurações da empresa foram atualizadas com sucesso.',
      });

      refetchUserData();
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({
        title: 'Erro ao salvar',
        description: 'Não foi possível salvar as configurações.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  async function clearAllProducts() {
    try {
      const { error: optionalsError } = await supabase
        .from('product_optionals')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');

      if (optionalsError) throw optionalsError;

      const { error: productsError } = await supabase
        .from('products')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');

      if (productsError) throw productsError;

      toast({
        title: 'Produtos zerados',
        description: 'Todos os produtos foram removidos com sucesso.',
      });
      window.location.reload();
    } catch (error) {
      console.error('Error clearing products:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao limpar produtos.',
        variant: 'destructive',
      });
    }
  }

  const handleCardVisibilityChange = async (key: string, value: boolean) => {
    setCardVisibility(prev => ({ ...prev, [key]: value }));
    const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
    await saveCardVisibility(dbKey, value);
    toast({
      title: 'Configuração salva',
      description: 'Visibilidade do card atualizada.',
    });
  };

  const generatePythonScript = () => {
    const storeName = escapePythonString(company?.name || 'Minha Loja');
    const companySlug = escapePythonString(company?.slug || '');
    const paperSize = storeSettings.printerPaperSize === '80mm' ? '80mm' : '58mm';
    const printLayout = storeSettings.printLayout || 'v1';

    return autoPrinterTemplate
      .replace('STORE_NAME = "Comanda Tech"', `STORE_NAME = "${storeName}"`)
      .replace('COMPANY_SLUG = ""', `COMPANY_SLUG = "${companySlug}"`)
      .replace('PAPER_SIZE = "58mm"', `PAPER_SIZE = "${paperSize}"`)
      .replace('PRINT_LAYOUT = "v1"', `PRINT_LAYOUT = "${printLayout}"`);
  };

  const generateBatScript = () => {
    const storeName = company?.name || 'Minha Loja';
    
    return `@echo off
chcp 65001 >nul
title ${storeName} - Impressao Automatica
color 0A

echo.
echo ============================================
echo   ${storeName} - Impressao Automatica
echo ============================================
echo.

echo [..] Verificando Python...
python --version
if %errorlevel% neq 0 (
    color 0C
    echo.
    echo [ERRO] Python nao encontrado!
    echo Instale em https://python.org
    echo Marque "Add Python to PATH"
    echo.
    pause
    exit /b 1
)
echo [OK] Python encontrado
echo.

if not exist "C:\\ComandaTech\\printer.py" (
    color 0C
    echo [ERRO] Arquivo printer.py nao encontrado!
    echo.
    echo Baixe o arquivo printer.py e salve em:
    echo C:\\ComandaTech\\printer.py
    echo.
    pause
    exit /b 1
)
echo [OK] Arquivo printer.py encontrado
echo.

echo [..] Instalando dependencias...
python -m pip install requests pywin32 -q
echo [OK] Dependencias instaladas
echo.

echo ============================================
echo   Iniciando impressao automatica...
echo ============================================
echo.

cd /d "C:\\ComandaTech"
python printer.py

echo.
pause
`;
  };

  const handleDownloadScript = () => {
    const script = generatePythonScript();
    const blob = new Blob([script], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `printer.py`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: 'Script baixado',
      description: 'O script Python atualizado foi baixado com sucesso.',
    });
  };

  const handleDownloadBat = () => {
    const script = generateBatScript();
    const blob = new Blob([script], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `instalar_impressao_${company?.slug || 'loja'}.bat`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: 'Instalador baixado',
      description: 'Salve na área de trabalho e execute como administrador.',
    });
  };

  const downloadTextFile = (content: string, filename: string, mime = 'text/plain') => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: 'Arquivo baixado', description: filename });
  };

  if (!company) {
    return (
      <AppLayout title="Configurações" subtitle="Configure sua empresa">
        <Card>
          <CardContent className="p-6">
            <p className="text-muted-foreground">Você não está vinculado a nenhuma empresa.</p>
          </CardContent>
        </Card>
      </AppLayout>
    );
  }

  return (
    <AppLayout 
      title="Configurações" 
      subtitle="Configure os dados da sua empresa"
    >
      <Tabs defaultValue="empresa" className="space-y-6">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="empresa">Geral</TabsTrigger>
          <TabsTrigger value="layout">Layout</TabsTrigger>
          <TabsTrigger value="horarios">Horários</TabsTrigger>
          <TabsTrigger value="entrega">Entrega</TabsTrigger>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="impressao">Impressão</TabsTrigger>
        </TabsList>

        {/* Tab Empresa */}
        <TabsContent value="empresa" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                Dados da Empresa
              </CardTitle>
              <CardDescription>
                Informações básicas sobre sua empresa
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome da Empresa</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Nome da sua empresa"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cnpj">CNPJ</Label>
                <Input
                  id="cnpj"
                  value={formData.cnpj}
                  onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })}
                  placeholder="00.000.000/0000-00"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="slug" className="flex items-center gap-2">
                  <Globe className="w-4 h-4" />
                  Slug (URL do cardápio)
                </Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">/cardapio/</span>
                  <Input
                    id="slug"
                    value={formData.slug}
                    onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                    placeholder="minha-empresa"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="subdomain" className="flex items-center gap-2">
                  <Globe className="w-4 h-4" />
                  Endereço da sua loja (Comanda Tech)
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="subdomain"
                    value={formData.subdomain}
                    onChange={(e) => setFormData({ ...formData, subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '') })}
                    placeholder="minhaloja"
                    maxLength={30}
                  />
                  <span className="text-sm text-muted-foreground whitespace-nowrap">.comandatech.com.br</span>
                </div>
                {formData.subdomain && (
                  <p className="text-xs text-muted-foreground">
                    Sua loja ficará acessível em{' '}
                    <code className="bg-muted px-1 py-0.5 rounded">
                      https://{formData.subdomain}.comandatech.com.br
                    </code>
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Apenas letras minúsculas e números, entre 3 e 30 caracteres. Esse é o endereço curto e profissional do seu cardápio.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Phone className="w-5 h-5" />
                Contato
              </CardTitle>
              <CardDescription>
                Informações de contato da empresa
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  E-mail
                </Label>
                <Input
                  id="email"
                  value={profile?.email || ''}
                  disabled
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">O e-mail é definido no cadastro e não pode ser alterado aqui.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Telefone / WhatsApp</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="(00) 00000-0000"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="w-5 h-5" />
                Endereço
              </CardTitle>
              <CardDescription>
                Endereço da empresa
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="address_street">Endereço (rua, avenida, travessa...) *</Label>
                <Input
                  id="address_street"
                  value={formData.address_street}
                  onChange={(e) => setFormData({ ...formData, address_street: e.target.value })}
                  placeholder="Ex: Rua das Flores"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="address_number">Número *</Label>
                  <Input
                    id="address_number"
                    value={formData.address_number}
                    onChange={(e) => setFormData({ ...formData, address_number: e.target.value })}
                    placeholder="Ex: 123"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address_complement">Complemento</Label>
                  <Input
                    id="address_complement"
                    value={formData.address_complement}
                    onChange={(e) => setFormData({ ...formData, address_complement: e.target.value })}
                    placeholder="Ex: Sala 2"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="address_neighborhood">Bairro *</Label>
                <Input
                  id="address_neighborhood"
                  value={formData.address_neighborhood}
                  onChange={(e) => setFormData({ ...formData, address_neighborhood: e.target.value })}
                  placeholder="Ex: Centro"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="address_reference">Ponto de Referência</Label>
                <Input
                  id="address_reference"
                  value={formData.address_reference}
                  onChange={(e) => setFormData({ ...formData, address_reference: e.target.value })}
                  placeholder="Ex: Próximo à praça central"
                />
              </div>

              <Button onClick={handleSave} disabled={loading} className="w-full">
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Salvar Dados da Empresa
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Image className="w-5 h-5" />
                Banner do Cardápio
              </CardTitle>
              <CardDescription>
                Imagem exibida no topo do cardápio online (recomendado: 1200x400 pixels)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <input
                type="file"
                accept="image/*"
                ref={bannerFileInputRef}
                onChange={handleBannerSelect}
                className="hidden"
              />
              {bannerUrl ? (
                <div className="relative">
                  <img
                    src={bannerUrl}
                    alt="Banner Preview"
                    className="w-full rounded-lg border object-contain"
                  />
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2 h-7 w-7"
                    onClick={handleRemoveBanner}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => bannerFileInputRef.current?.click()}
                  disabled={isBannerUploading}
                >
                  {isBannerUploading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Selecionar banner
                    </>
                  )}
                </Button>
              )}
            </CardContent>
          </Card>

          <Separator className="my-6" />

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-destructive" /> Zona de Perigo</CardTitle>
                  <CardDescription className="text-destructive">
                    Ative apenas se precisar executar ações irreversíveis
                  </CardDescription>
                </div>
                <Switch
                  checked={showDangerZone}
                  onCheckedChange={setShowDangerZone}
                  aria-label="Ativar Zona de Perigo"
                />
              </div>
            </CardHeader>
          </Card>

          {showDangerZone && (
            <Card className="border-destructive/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="w-5 h-5" />
                  Zona de Perigo
                </CardTitle>
                <CardDescription>
                  Estas ações são irreversíveis. Tenha certeza antes de continuar.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" className="w-full">
                      <AlertTriangle className="h-4 w-4 mr-2" />
                      Zerar todos os produtos
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Tem certeza?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Esta ação irá remover TODOS os produtos e seus opcionais da base de dados. 
                        Esta ação não pode ser desfeita.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={clearAllProducts} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        Sim, zerar produtos
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardContent>
            </Card>
          )}

        </TabsContent>

        {/* Tab Horários */}
        <TabsContent value="horarios" className="space-y-6">
          <BusinessHoursSettings companyId={company?.id} />
        </TabsContent>

        {/* Tab Entrega */}
        <TabsContent value="entrega" className="space-y-6">
          {/* Delivery Modes Enable/Disable */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Truck className="w-5 h-5" />
                Modalidades de Entrega
              </CardTitle>
              <CardDescription>
                Selecione quais opções de entrega seu estabelecimento oferece. Pelo menos uma deve estar ativa.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <p className="font-medium">🛵 Delivery (Entrega)</p>
                  <p className="text-sm text-muted-foreground">Entrega no endereço do cliente</p>
                </div>
                <Switch
                  checked={storeSettings.enableDelivery}
                  onCheckedChange={async (checked) => {
                    if (!checked && !storeSettings.enablePickup) {
                      toast({ title: 'Atenção', description: 'Pelo menos uma modalidade deve estar ativa.', variant: 'destructive' });
                      return;
                    }
                    await updateSetting('enable_delivery', checked.toString());
                    toast({ title: 'Configuração salva', description: checked ? 'Delivery ativado' : 'Delivery desativado' });
                  }}
                />
              </div>
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <p className="font-medium">📍 Retirada no Local</p>
                  <p className="text-sm text-muted-foreground">Cliente retira no estabelecimento</p>
                </div>
                <Switch
                  checked={storeSettings.enablePickup}
                  onCheckedChange={async (checked) => {
                    if (!checked && !storeSettings.enableDelivery) {
                      toast({ title: 'Atenção', description: 'Pelo menos uma modalidade deve estar ativa.', variant: 'destructive' });
                      return;
                    }
                    await updateSetting('enable_pickup', checked.toString());
                    toast({ title: 'Configuração salva', description: checked ? 'Retirada ativada' : 'Retirada desativada' });
                  }}
                />
              </div>
            </CardContent>
          </Card>

          {/* Delivery Mode Selection - only show when delivery is enabled */}
          {storeSettings.enableDelivery && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Truck className="w-5 h-5" />
                Modo de Taxas de Entrega
              </CardTitle>
              <CardDescription>
                Escolha como deseja configurar as taxas de entrega
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RadioGroup
                value={deliveryMode}
                onValueChange={(value: 'simple' | 'neighborhood') => {
                  setDeliveryMode(value);
                  updateSetting('delivery_mode', value);
                }}
                className="space-y-3"
              >
                <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer">
                  <RadioGroupItem value="simple" id="simple" />
                  <div className="flex-1">
                    <Label htmlFor="simple" className="font-medium cursor-pointer">Taxas Simples</Label>
                    <p className="text-sm text-muted-foreground">
                      Duas opções: Cidade e Interior
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer">
                  <RadioGroupItem value="neighborhood" id="neighborhood" />
                  <div className="flex-1">
                    <Label htmlFor="neighborhood" className="font-medium cursor-pointer">Por Bairro</Label>
                    <p className="text-sm text-muted-foreground">
                      Taxa específica para cada bairro
                    </p>
                  </div>
                </div>
              </RadioGroup>
            </CardContent>
          </Card>
          )}

          {/* Simple Mode - City/Interior */}
          {storeSettings.enableDelivery && deliveryMode === 'simple' && (
            <Card>
              <CardHeader>
                <CardTitle>Taxas Cidade e Interior</CardTitle>
                <CardDescription>
                  Configure os valores de entrega. Desative as regiões que sua loja não atende — quando só uma estiver ativa, o cliente verá apenas "Entrega" no checkout.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="deliveryFeeCity">Taxa Cidade (R$)</Label>
                      <Switch
                        checked={storeSettings.deliveryFeeCityEnabled}
                        onCheckedChange={async (v) => {
                          await updateSetting('delivery_fee_city_enabled', v ? 'true' : 'false');
                        }}
                      />
                    </div>
                    <Input
                      id="deliveryFeeCity"
                      type="number"
                      step="0.01"
                      min="0"
                      value={deliveryFeeCity}
                      onChange={(e) => setDeliveryFeeCity(e.target.value)}
                      placeholder="0.00"
                      disabled={!storeSettings.deliveryFeeCityEnabled}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="deliveryFeeInterior">Taxa Interior (R$)</Label>
                      <Switch
                        checked={storeSettings.deliveryFeeInteriorEnabled}
                        onCheckedChange={async (v) => {
                          await updateSetting('delivery_fee_interior_enabled', v ? 'true' : 'false');
                        }}
                      />
                    </div>
                    <Input
                      id="deliveryFeeInterior"
                      type="number"
                      step="0.01"
                      min="0"
                      value={deliveryFeeInterior}
                      onChange={(e) => setDeliveryFeeInterior(e.target.value)}
                      placeholder="0.00"
                      disabled={!storeSettings.deliveryFeeInteriorEnabled}
                    />
                  </div>
                </div>
                <Button 
                  onClick={async () => {
                    setSavingDelivery(true);
                    await saveDeliveryFeeCity(parseFloat(deliveryFeeCity) || 0);
                    await saveDeliveryFeeInterior(parseFloat(deliveryFeeInterior) || 0);
                    setSavingDelivery(false);
                  }}
                  disabled={savingDelivery}
                  className="w-full"
                >
                  {savingDelivery ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  Salvar Taxas de Entrega
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Neighborhood Mode */}
          {storeSettings.enableDelivery && deliveryMode === 'neighborhood' && (
            <Card>
              <CardHeader>
                <CardTitle>Cadastro de Bairros</CardTitle>
                <CardDescription>
                  Adicione os bairros e suas respectivas taxas de entrega
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Add neighborhood form */}
                <div className="flex gap-2">
                  <Input
                    placeholder="Nome do bairro"
                    value={newNeighborhoodName}
                    onChange={(e) => setNewNeighborhoodName(e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Taxa (R$)"
                    value={newNeighborhoodFee}
                    onChange={(e) => setNewNeighborhoodFee(e.target.value)}
                    className="w-28"
                  />
                  <Button
                    onClick={async () => {
                      if (!newNeighborhoodName.trim()) {
                        toast({
                          title: 'Erro',
                          description: 'Informe o nome do bairro',
                          variant: 'destructive',
                        });
                        return;
                      }
                      const success = await addNeighborhood(
                        newNeighborhoodName.trim(),
                        parseFloat(newNeighborhoodFee) || 0
                      );
                      if (success) {
                        setNewNeighborhoodName('');
                        setNewNeighborhoodFee('');
                      }
                    }}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>

                {/* List of neighborhoods */}
                <div className="space-y-2">
                  <Label>Bairros cadastrados</Label>
                  <ScrollArea className="h-[250px] rounded border p-2">
                    <div className="space-y-2">
                      {neighborhoods.map((n) => (
                        <div key={n.id} className="flex items-center justify-between p-3 border rounded-lg">
                          <div>
                            <p className="font-medium">{n.neighborhoodName}</p>
                            <p className="text-sm text-muted-foreground">
                              Taxa: R$ {n.deliveryFee.toFixed(2)}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => deleteNeighborhood(n.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                      {neighborhoods.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          Nenhum bairro cadastrado
                        </p>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Free Delivery Above Minimum */}
          {storeSettings.enableDelivery && (
            <Card>
              <CardHeader>
                <CardTitle>Entrega Grátis Acima de um Valor</CardTitle>
                <CardDescription>
                  Quando ativado, pedidos com subtotal igual ou maior ao valor mínimo terão taxa de entrega zerada automaticamente.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="freeDeliveryEnabled">Ativar entrega grátis acima de um valor</Label>
                  <Switch
                    id="freeDeliveryEnabled"
                    checked={storeSettings.freeDeliveryEnabled}
                    onCheckedChange={async (checked) => {
                      await updateSetting('free_delivery_enabled', checked ? 'true' : 'false');
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="freeDeliveryMinOrder">Valor mínimo do pedido (R$)</Label>
                  <Input
                    id="freeDeliveryMinOrder"
                    type="number"
                    step="0.01"
                    min="0"
                    disabled={!storeSettings.freeDeliveryEnabled}
                    defaultValue={storeSettings.freeDeliveryMinOrder || ''}
                    onBlur={async (e) => {
                      const value = parseFloat(e.target.value) || 0;
                      await updateSetting('free_delivery_min_order', value.toString());
                    }}
                    placeholder="Ex: 100.00"
                  />
                  <p className="text-xs text-muted-foreground">
                    Ex: definindo R$ 100,00, qualquer pedido a partir desse valor terá entrega grátis.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Tab Layout */}
        <TabsContent value="layout" className="space-y-6">
          {isSuperAdmin() && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="w-5 h-5" />
                  Layout do Cardápio Online
                </CardTitle>
                <CardDescription>
                  Escolha qual layout será exibido no cardápio público para seus clientes
                </CardDescription>
              </CardHeader>
              <CardContent>
                <RadioGroup
                  value={storeSettings.menuLayout}
                  onValueChange={async (value: 'v1' | 'v2') => {
                    await updateSetting('menu_layout', value);
                    toast({
                      title: 'Layout alterado',
                      description: `Cardápio online agora usa o layout ${value.toUpperCase()}`,
                    });
                  }}
                  className="space-y-4"
                >
                  <div className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-muted/50 cursor-pointer">
                    <RadioGroupItem value="v1" id="layout-v1" className="mt-1" />
                    <div className="flex-1">
                      <Label htmlFor="layout-v1" className="font-medium cursor-pointer text-base">V1 — Clássico</Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        Categorias em pills horizontais no topo. Todos os produtos listados na mesma página com separação por seção. Ideal para cardápios menores.
                      </p>
                      <div className="mt-2 flex gap-2">
                        <Badge variant="secondary" className="text-xs">Atual</Badge>
                        <Badge variant="outline" className="text-xs">Navegação rápida</Badge>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-muted/50 cursor-pointer">
                    <RadioGroupItem value="v2" id="layout-v2" className="mt-1" />
                    <div className="flex-1">
                      <Label htmlFor="layout-v2" className="font-medium cursor-pointer text-base">V2 — Categorias</Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        Banner do estabelecimento + categorias em cards coloridos. O cliente seleciona a categoria para ver os produtos. Visual mais moderno e organizado.
                      </p>
                      <div className="mt-2 flex gap-2">
                        <Badge variant="default" className="text-xs">Novo</Badge>
                        <Badge variant="outline" className="text-xs">Estilo App</Badge>
                      </div>
                    </div>
                  </div>
                </RadioGroup>
              </CardContent>
            </Card>
          )}

          {isSuperAdmin() && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="w-5 h-5" />
                  Rolagem Lateral de Adicionais
                </CardTitle>
                <CardDescription>
                  Quando ativado, os grupos de adicionais são exibidos em etapas laterais (estilo cross-selling), ao invés de todos listados para baixo
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium">Rolagem Lateral</p>
                    <p className="text-sm text-muted-foreground">Adicionais navegam por etapas laterais</p>
                  </div>
                  <Switch
                    checked={storeSettings.lateralScrollOptionals}
                    onCheckedChange={async (value) => {
                      await updateSetting('lateral_scroll_optionals', value.toString());
                      toast({
                        title: value ? 'Rolagem lateral ativada' : 'Rolagem lateral desativada',
                        description: value
                          ? 'Adicionais serão exibidos em etapas laterais no cardápio'
                          : 'Adicionais voltaram ao modo padrão (vertical)',
                      });
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="w-5 h-5" />
                Foto Flutuante nos Produtos
              </CardTitle>
              <CardDescription>
                Ativa animação de deslizamento vertical nas fotos dos produtos do cardápio
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <p className="font-medium">Foto Flutuante</p>
                  <p className="text-sm text-muted-foreground">Aplica efeito de movimento suave nas imagens dos produtos</p>
                </div>
                <Switch
                  checked={storeSettings.floatingPhoto}
                  onCheckedChange={async (value) => {
                    await updateSetting('floating_photo', value.toString());
                    toast({
                      title: value ? 'Foto flutuante ativada' : 'Foto flutuante desativada',
                      description: value
                        ? 'As fotos dos produtos terão animação de deslizamento'
                        : 'As fotos dos produtos ficarão estáticas',
                    });
                  }}
                />
              </div>
            </CardContent>
          </Card>
          <ButtonColorPicker
            value={storeSettings.buttonColor}
            onChange={async (color) => {
              await updateSetting('button_color', color);
              toast({
                title: color ? 'Cor dos botões atualizada' : 'Cor dos botões resetada',
                description: color ? `Cor definida para ${color}` : 'Os botões usarão a cor padrão',
              });
            }}
          />

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="w-5 h-5" />
                Seção em destaque
              </CardTitle>
              <CardDescription>
                Este nome aparece no cardápio na seção de produtos marcados com ⭐. Marque um produto com a estrela para ele aparecer aqui.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <Label>Nome da seção em destaque</Label>
                <RadioGroup
                  value={featuredSectionName}
                  onValueChange={setFeaturedSectionName}
                  className="flex flex-wrap gap-4"
                >
                  {['Novidades', 'Destaques', 'Mais pedidos', 'Em alta'].map((option) => (
                    <div key={option} className="flex items-center space-x-2">
                      <RadioGroupItem value={option} id={`featured_${option}`} />
                      <Label htmlFor={`featured_${option}`} className="cursor-pointer font-normal">{option}</Label>
                    </div>
                  ))}
                </RadioGroup>
                <Button
                  size="sm"
                  onClick={async () => {
                    await updateSetting('featured_section_name', featuredSectionName);
                    toast({
                      title: 'Nome da seção salvo',
                      description: `A seção em destaque agora se chama "${featuredSectionName}"`,
                    });
                  }}
                >
                  <Save className="h-4 w-4 mr-1" />
                  Salvar
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Dashboard */}
        <TabsContent value="dashboard" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LayoutDashboard className="w-5 h-5" />
                Cards do Dashboard
              </CardTitle>
              <CardDescription>
                Escolha quais cards deseja exibir na página inicial
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <p className="font-medium">Pendentes</p>
                  <p className="text-sm text-muted-foreground">Mostra pedidos pendentes</p>
                </div>
                <Switch
                  checked={cardVisibility.showCardPendentes}
                  onCheckedChange={(value) => handleCardVisibilityChange('showCardPendentes', value)}
                />
              </div>

              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <p className="font-medium">Preparando</p>
                  <p className="text-sm text-muted-foreground">Mostra pedidos em preparo</p>
                </div>
                <Switch
                  checked={cardVisibility.showCardPreparando}
                  onCheckedChange={(value) => handleCardVisibilityChange('showCardPreparando', value)}
                />
              </div>

              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <p className="font-medium">Prontos</p>
                  <p className="text-sm text-muted-foreground">Mostra pedidos prontos para entrega</p>
                </div>
                <Switch
                  checked={cardVisibility.showCardProntos}
                  onCheckedChange={(value) => handleCardVisibilityChange('showCardProntos', value)}
                />
              </div>

              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <p className="font-medium">Entregues</p>
                  <p className="text-sm text-muted-foreground">Mostra pedidos entregues</p>
                </div>
                <Switch
                  checked={cardVisibility.showCardEntregues}
                  onCheckedChange={(value) => handleCardVisibilityChange('showCardEntregues', value)}
                />
              </div>

              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <p className="font-medium">Todos</p>
                  <p className="text-sm text-muted-foreground">Mostra total de pedidos no período</p>
                </div>
                <Switch
                  checked={cardVisibility.showCardTodos}
                  onCheckedChange={(value) => handleCardVisibilityChange('showCardTodos', value)}
                />
              </div>

              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <p className="font-medium">Faturamento no Período</p>
                  <p className="text-sm text-muted-foreground">Mostra o valor faturado no período</p>
                </div>
                <Switch
                  checked={cardVisibility.showCardFaturamento}
                  onCheckedChange={(value) => handleCardVisibilityChange('showCardFaturamento', value)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Impressão */}
        <TabsContent value="impressao" className="space-y-6">
          {/* TEF Auto Print v1 — visível somente para a Lancheria da I9 */}
          {company?.id === '8c9e7a0e-dbb6-49b9-8344-c23155a71164' && (
            <Card className="border-primary/40">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Printer className="w-5 h-5" />
                  Impressão automática do comprovante TEF
                  <Badge variant="secondary" className="ml-2">Beta — Lancheria I9</Badge>
                </CardTitle>
                <CardDescription>
                  Após cada venda TEF aprovada (PinPad), imprime o comprovante automaticamente.
                  A reimpressão manual (2ª via) continua disponível nos cards de pedido.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <RadioGroup
                  value={storeSettings.tefAutoPrintVias}
                  onValueChange={async (value: 'none' | 'estabelecimento' | 'ambas') => {
                    await updateSetting('tef_auto_print_vias', value);
                    toast({
                      title: 'Configuração salva',
                      description:
                        value === 'none'
                          ? 'Impressão automática desativada'
                          : value === 'estabelecimento'
                            ? 'Imprime apenas a via do estabelecimento'
                            : 'Imprime via estabelecimento + via cliente',
                    });
                  }}
                  className="space-y-3"
                >
                  <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer">
                    <RadioGroupItem value="ambas" id="tef-vias-ambas" />
                    <div className="flex-1">
                      <Label htmlFor="tef-vias-ambas" className="font-medium cursor-pointer">Ambas as vias (Estabelecimento + Cliente)</Label>
                      <p className="text-sm text-muted-foreground">Padrão. Imprime 2 vias logo após a aprovação.</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer">
                    <RadioGroupItem value="estabelecimento" id="tef-vias-estab" />
                    <div className="flex-1">
                      <Label htmlFor="tef-vias-estab" className="font-medium cursor-pointer">Somente via do Estabelecimento</Label>
                      <p className="text-sm text-muted-foreground">Imprime apenas 1 via para arquivo no caixa.</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer">
                    <RadioGroupItem value="none" id="tef-vias-none" />
                    <div className="flex-1">
                      <Label htmlFor="tef-vias-none" className="font-medium cursor-pointer">Não imprimir automaticamente</Label>
                      <p className="text-sm text-muted-foreground">Mantém apenas a reimpressão manual via card do pedido.</p>
                    </div>
                  </div>
                </RadioGroup>
              </CardContent>
            </Card>
          )}

          {/* Paper Size Setting */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Printer className="w-5 h-5" />
                Tamanho da Bobina
              </CardTitle>
              <CardDescription>
                Selecione o tamanho da bobina da sua impressora térmica
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RadioGroup
                value={storeSettings.printerPaperSize}
                onValueChange={async (value: '58mm' | '80mm') => {
                  await updateSetting('printer_paper_size', value);
                  toast({
                    title: 'Configuração salva',
                    description: `Tamanho da bobina alterado para ${value}`,
                  });
                }}
                className="space-y-3"
              >
                <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer">
                  <RadioGroupItem value="58mm" id="paper-58" />
                  <div className="flex-1">
                    <Label htmlFor="paper-58" className="font-medium cursor-pointer">58mm</Label>
                    <p className="text-sm text-muted-foreground">
                      Bobina estreita (padrão) — ideal para impressoras compactas
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer">
                  <RadioGroupItem value="80mm" id="paper-80" />
                  <div className="flex-1">
                    <Label htmlFor="paper-80" className="font-medium cursor-pointer">80mm</Label>
                    <p className="text-sm text-muted-foreground">
                      Bobina larga — mais espaço, menos quebra de linha
                    </p>
                  </div>
                </div>
              </RadioGroup>
            </CardContent>
          </Card>

          {/* Layout Selection — Super Admin Only */}
          {isSuperAdmin && (
            <Card className="border-primary/40">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Printer className="w-5 h-5" />
                  Layout de Impressão
                  <Badge variant="secondary" className="ml-2">Admin Master</Badge>
                </CardTitle>
                <CardDescription>
                  Selecione o layout visual da comanda de produção. Visível apenas para administradores master.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <RadioGroup
                  value={storeSettings.printLayout}
                  onValueChange={async (value: 'v1' | 'v2' | 'v3') => {
                    await updateSetting('print_layout', value);
                    toast({
                      title: 'Layout salvo',
                      description: `Layout de impressão alterado para ${value.toUpperCase()}`,
                    });
                  }}
                  className="space-y-3"
                >
                  <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer">
                    <RadioGroupItem value="v1" id="layout-v1" />
                    <div className="flex-1">
                      <Label htmlFor="layout-v1" className="font-medium cursor-pointer">Layout V1 (padrão)</Label>
                      <p className="text-sm text-muted-foreground">
                        Layout original. Adicionais aparecem em uma única linha após o produto.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer">
                    <RadioGroupItem value="v2" id="layout-v2" />
                    <div className="flex-1">
                      <Label htmlFor="layout-v2" className="font-medium cursor-pointer">Layout V2 (novo)</Label>
                      <p className="text-sm text-muted-foreground">
                        Adicionais empilhados (um por linha) em negrito. Observações destacadas em fundo preto / texto branco.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer">
                    <RadioGroupItem value="v3" id="layout-v3" />
                    <div className="flex-1">
                      <Label htmlFor="layout-v3" className="font-medium cursor-pointer">Layout V3 (beta)</Label>
                      <p className="text-sm text-muted-foreground">
                        Layout denso com cabeçalho "PEDIDO" gigante, separadores em ASCII e bloco "Pronto até" em destaque. Inspirado no recibo V3 piloto da Lancheria I9.
                      </p>
                    </div>
                  </div>
                </RadioGroup>
              </CardContent>
            </Card>
          )}

          {/* Production Ticket Setting */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Printer className="w-5 h-5" />
                Comanda de Produção
              </CardTitle>
              <CardDescription>
                Imprime automaticamente uma comanda de produção (somente itens, sem preços) junto com o pedido do cardápio
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <p className="font-medium">Impressão Comanda Produção</p>
                  <p className="text-sm text-muted-foreground">Ao receber pedido do cardápio, imprime também a comanda para a cozinha</p>
                </div>
                <Switch
                  checked={storeSettings.autoPrintProductionTicket}
                  onCheckedChange={async (value) => {
                    await updateSetting('auto_print_production_ticket', value.toString());
                    toast({
                      title: value ? 'Comanda de produção ativada' : 'Comanda de produção desativada',
                      description: value
                        ? 'Pedidos do cardápio também imprimirão a comanda de produção'
                        : 'Apenas o recibo do pedido será impresso',
                    });
                  }}
                />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Printer className="w-5 h-5" />
                Impressão Automática
              </CardTitle>
              <CardDescription>
                Script para imprimir pedidos automaticamente no Windows (compatível com Epson TM-T20)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Info da empresa para debug */}
              <div className="bg-muted/50 border rounded-lg p-3 space-y-1">
                <p className="text-sm font-medium">Dados da Impressão</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Slug:</span>{' '}
                    <code className="bg-background px-1 py-0.5 rounded">{company?.slug || '-'}</code>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Bobina:</span>{' '}
                    <code className="bg-background px-1 py-0.5 rounded">{storeSettings.printerPaperSize}</code>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Layout:</span>{' '}
                    <code className="bg-background px-1 py-0.5 rounded">{storeSettings.printLayout}</code>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  O script usa o <strong>slug</strong> para identificar a empresa. Se precisar corrigir manualmente, 
                  edite a variável <code className="bg-background px-1 rounded">COMPANY_SLUG</code> no arquivo printer.py.
                </p>
                <p className="text-xs text-destructive mt-2">
                  Se a loja ainda imprimir V3 com V2 selecionado, baixe novamente o printer.py abaixo e substitua o arquivo antigo em C:\ComandaTech.
                </p>
              </div>

              <div className="bg-primary/10 border border-primary/20 p-4 rounded-lg space-y-3">
                <h4 className="font-medium">Instalação (4 passos)</h4>
                <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                  <li>Instale o Python em <a href="https://python.org" target="_blank" rel="noopener noreferrer" className="text-primary underline">python.org</a> (marque "Add to PATH")</li>
                  <li>Crie a pasta <code className="bg-background px-1 py-0.5 rounded">C:\ComandaTech</code></li>
                  <li>Baixe os 2 arquivos abaixo e salve na pasta criada</li>
                  <li>Execute o .bat como administrador</li>
                </ol>
                
                <div className="grid grid-cols-2 gap-2">
                  <Button onClick={handleDownloadScript} size="lg" className="w-full">
                    <Download className="w-4 h-4 mr-2" />
                    1. printer.py
                  </Button>
                  <Button onClick={handleDownloadBat} size="lg" variant="secondary" className="w-full">
                    <Download className="w-4 h-4 mr-2" />
                    2. iniciar.bat
                  </Button>
                </div>
                
                <p className="text-xs text-muted-foreground text-center">
                  Salve ambos em C:\ComandaTech e execute o .bat
                </p>
              </div>

              <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-lg space-y-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <h4 className="font-medium">Windows 11 — Correção pywin32 (v1.4 / auto_printer v8.41)</h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      Use estes arquivos <strong>apenas se o Windows 11 não reconhecer o .bat acima</strong> ou
                      exibir o erro <code className="bg-background px-1 rounded">DLL load failed while importing win32print</code>.
                      Não substitui os arquivos acima — é um pacote alternativo.
                    </p>
                    <p className="text-xs text-destructive mt-2">
                      ⚠️ Requer <strong>Python 3.12 ou 3.13</strong>. O <strong>Python 3.14</strong> ainda
                      não é suportado pela biblioteca de impressão (pywin32) — se a máquina tiver 3.14,
                      desinstale e baixe o 3.12 em
                      {' '}
                      <a
                        href="https://www.python.org/downloads/release/python-3127/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        python.org/3.12.7
                      </a>
                      .
                    </p>
                  </div>
                </div>

                <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
                  <li>Crie/abra a pasta <code className="bg-background px-1 py-0.5 rounded">C:\ComandaTech</code></li>
                  <li>Baixe os 4 arquivos abaixo e salve nessa pasta (mantendo os nomes)</li>
                  <li>Clique com o botão direito em <code className="bg-background px-1 py-0.5 rounded">instalar_impressao.cmd</code> → <strong>Executar como administrador</strong></li>
                  <li>Depois, dê duplo-clique em <code className="bg-background px-1 py-0.5 rounded">iniciar_impressao.cmd</code> para iniciar a impressão automática</li>
                </ol>

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    onClick={() => downloadTextFile(instalarImpressaoCmd, 'instalar_impressao.cmd')}
                    size="sm"
                    variant="outline"
                    className="w-full"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    instalar_impressao.cmd
                  </Button>
                  <Button
                    onClick={() => downloadTextFile(iniciarImpressaoCmd, 'iniciar_impressao.cmd')}
                    size="sm"
                    variant="outline"
                    className="w-full"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    iniciar_impressao.cmd
                  </Button>
                  <Button
                    onClick={() => downloadTextFile(verificarPywin32Py, 'verificar_pywin32.py')}
                    size="sm"
                    variant="outline"
                    className="w-full"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    verificar_pywin32.py
                  </Button>
                  <Button
                    onClick={() => downloadTextFile(autoPrinterWin11Py, 'auto_printer.py')}
                    size="sm"
                    variant="outline"
                    className="w-full"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    auto_printer.py
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground">
                  O instalador reinstala o <strong>pywin32</strong> limpo, valida as DLLs e registra o
                  post-install. O launcher (<code className="bg-background px-1 rounded">iniciar_impressao.cmd</code>) auto-repara
                  dependências antes de subir o serviço.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}
