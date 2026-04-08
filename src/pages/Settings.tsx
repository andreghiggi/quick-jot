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
import { Loader2, Save, Building2, Phone, MapPin, Globe, Printer, Download, Truck, LayoutDashboard, Plus, Trash2, Clock, BookOpen, Image, Upload } from 'lucide-react';
import { uploadCompressedImage } from '@/utils/imageUtils';
import { useStoreSettings } from '@/hooks/useStoreSettings';
import { useDeliveryNeighborhoods } from '@/hooks/useDeliveryNeighborhoods';
import { BusinessHoursSettings } from '@/components/settings/BusinessHoursSettings';

export default function Settings() {
  const { company, refetchUserData } = useAuthContext();
  const { toast } = useToast();
  const { settings: storeSettings, saveDeliveryFeeCity, saveDeliveryFeeInterior, saveCardVisibility, updateSetting, saveBannerUrl } = useStoreSettings({ companyId: company?.id });
  const [bannerUrl, setBannerUrl] = useState('');
  const [isBannerUploading, setIsBannerUploading] = useState(false);
  const bannerFileInputRef = useRef<HTMLInputElement>(null);
  const { neighborhoods, addNeighborhood, deleteNeighborhood } = useDeliveryNeighborhoods({ companyId: company?.id });
  const [loading, setLoading] = useState(false);
  const [deliveryFeeCity, setDeliveryFeeCity] = useState('');
  const [deliveryFeeInterior, setDeliveryFeeInterior] = useState('');
  const [savingDelivery, setSavingDelivery] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    slug: '',
  });

  // Neighborhood form state
  const [newNeighborhoodName, setNewNeighborhoodName] = useState('');
  const [newNeighborhoodFee, setNewNeighborhoodFee] = useState('');
  const [deliveryMode, setDeliveryMode] = useState<'simple' | 'neighborhood'>('simple');

  // Card visibility states
  const [cardVisibility, setCardVisibility] = useState({
    showCardPedidosHoje: true,
    showCardAguardando: true,
    showCardFaturamento: true,
    showCardTotalPedidos: true,
  });

  useEffect(() => {
    setDeliveryFeeCity(storeSettings.deliveryFeeCity.toString());
    setDeliveryFeeInterior(storeSettings.deliveryFeeInterior.toString());
    setCardVisibility({
      showCardPedidosHoje: storeSettings.showCardPedidosHoje,
      showCardAguardando: storeSettings.showCardAguardando,
      showCardFaturamento: storeSettings.showCardFaturamento,
      showCardTotalPedidos: storeSettings.showCardTotalPedidos,
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
        address: company.address || '',
        slug: company.slug || '',
      });
    }
  }, [company]);

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
      const { error } = await supabase
        .from('companies')
        .update({
          name: formData.name,
          phone: formData.phone,
          address: formData.address,
          slug: formData.slug,
        })
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

  const handleCardVisibilityChange = async (key: string, value: boolean) => {
    setCardVisibility(prev => ({ ...prev, [key]: value }));
    await saveCardVisibility(key.replace(/([A-Z])/g, '_$1').toLowerCase(), value);
    toast({
      title: 'Configuração salva',
      description: 'Visibilidade do card atualizada.',
    });
  };

  const generatePythonScript = () => {
    const storeName = company?.name || 'Minha Loja';
    const companySlug = company?.slug || '';
    
    return `"""
${storeName} - Impressao Automatica de Pedidos (Windows)

COMO USAR:
1. Instale Python: https://python.org (marque "Add to PATH")
2. Abra o CMD e rode: python -m pip install requests pywin32
3. De duplo clique neste arquivo OU rode: python printer.py

CONFIGURACAO DA IMPRESSORA:
- O script usa a impressora PADRAO do Windows
- Para impressoras em rede/compartilhadas, defina-a como padrao
- Funciona com Epson TM-T20, Elgin i9, Bematech, etc.

CONFIGURACAO DA EMPRESA:
- O script usa o SLUG da empresa para buscar o ID automaticamente
- Se precisar alterar, edite a variavel COMPANY_SLUG abaixo
"""

import requests
import time
import json
import os
from datetime import datetime

# Tenta importar win32print (melhor para impressoras termicas)
try:
    import win32print
    USE_WIN32 = True
except ImportError:
    USE_WIN32 = False
    print("[AVISO] pywin32 nao instalado. Usando metodo alternativo.")
    print("        Para melhor compatibilidade: python -m pip install pywin32")

# ============================================
# CONFIGURACAO - EDITE AQUI SE NECESSARIO
# ============================================
SUPABASE_URL = "https://iwmrtxdzlkasuzutxvhh.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3bXJ0eGR6bGthc3V6dXR4dmhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3OTExODMsImV4cCI6MjA4MDM2NzE4M30.VsnT1zdVUwJdv8gBlg8CthBx_bccZp-LsOs2PRq1Uik"

# SLUG da empresa (nome simples usado na URL do cardapio)
# Exemplo: se o cardapio e /cardapio/avenida-lanches, o slug e "avenida-lanches"
COMPANY_SLUG = "${companySlug}"

CHECK_INTERVAL = 5  # segundos
STORE_NAME = "${storeName}"

# Largura do papel em caracteres (32 para 58mm, 48 para 80mm)
PAPER_WIDTH = ${storeSettings.printerPaperSize === '80mm' ? '48' : '32'}

# Nome da impressora (deixe vazio para usar a padrao)
# Exemplo: "EPSON TM-T20" ou "\\\\\\\\SERVIDOR\\\\IMPRESSORA"
PRINTER_NAME = ""

# ============================================
# VARIAVEIS GLOBAIS
# ============================================
COMPANY_ID = None
pedidos_impressos = set()

def buscar_company_id():
    """Busca o ID da empresa pelo slug"""
    global COMPANY_ID
    try:
        print(f"[..] Buscando empresa pelo slug: {COMPANY_SLUG}")
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/companies?slug=eq.{COMPANY_SLUG}&select=id,name",
            headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
        )
        if r.ok and r.json():
            data = r.json()[0]
            COMPANY_ID = data['id']
            print(f"[OK] Empresa encontrada: {data['name']}")
            print(f"     ID: {COMPANY_ID}")
            return True
        else:
            print(f"[ERRO] Empresa com slug '{COMPANY_SLUG}' nao encontrada!")
            return False
    except Exception as e:
        print(f"[ERRO] Falha ao buscar empresa: {e}")
        return False

def get_printer_name():
    """Retorna o nome da impressora a ser usada"""
    if PRINTER_NAME:
        return PRINTER_NAME
    if USE_WIN32:
        return win32print.GetDefaultPrinter()
    return None

def buscar_pedidos():
    if not COMPANY_ID:
        return []
    try:
        # Busca apenas pedidos pendentes que ainda nao foram impressos
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/orders?status=eq.pending&company_id=eq.{COMPANY_ID}&printed=eq.false&order=created_at.desc&select=*,order_code",
            headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
        )
        return r.json() if r.ok else []
    except:
        return []

def marcar_impresso(order_id):
    """Marca o pedido como impresso no banco de dados"""
    try:
        from datetime import timezone
        r = requests.patch(
            f"{SUPABASE_URL}/rest/v1/orders?id=eq.{order_id}",
            headers={
                "apikey": SUPABASE_KEY, 
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "Content-Type": "application/json",
                "Prefer": "return=minimal"
            },
            json={"printed": True, "printed_at": datetime.now(timezone.utc).isoformat()}
        )
        return r.ok
    except Exception as e:
        print(f"[AVISO] Nao foi possivel marcar como impresso: {e}")
        return False

def buscar_itens(order_id):
    try:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/order_items?order_id=eq.{order_id}",
            headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
        )
        return r.json() if r.ok else []
    except:
        return []

def formatar_recibo(pedido, itens):
    # Determina largura baseada no tamanho da bobina configurado
    largura = PAPER_WIDTH
    
    linhas = []
    linhas.append("=" * largura)
    linhas.append(STORE_NAME.center(largura))
    linhas.append("=" * largura)
    linhas.append(f"*** PEDIDO #{pedido.get('order_code', pedido.get('daily_number', '?'))} ***".center(largura))
    linhas.append("")
    
    # Data
    try:
        dt = datetime.fromisoformat(pedido['created_at'].replace('Z', '+00:00'))
        linhas.append(f"Data: {dt.strftime('%d/%m/%Y %H:%M')}")
    except:
        linhas.append(f"Data: {pedido.get('created_at', '')[:16]}")
    
    linhas.append("")
    linhas.append("-" * largura)
    linhas.append(f"Cliente: {pedido.get('customer_name', '')}")
    
    if pedido.get('customer_phone'):
        linhas.append(f"Telefone: {pedido['customer_phone']}")
    if pedido.get('delivery_address'):
        linhas.append(f"Endereco: {pedido['delivery_address']}")
    
    linhas.append("")
    linhas.append("-" * largura)
    linhas.append("ITENS:")
    
    for item in itens:
        qtd = item.get('quantity', 1)
        nome = item.get('name', 'Item')
        preco = item.get('price', 0) * qtd
        linhas.append(f"{qtd}x {nome} - R$ {preco:.2f}".replace('.', ','))
        if item.get('notes'):
            linhas.append(f"   -> {item['notes']}")
    
    if pedido.get('notes'):
        linhas.append("")
        linhas.append(f"OBS: {pedido['notes']}")
    
    linhas.append("")
    linhas.append("=" * largura)
    total = pedido.get('total', 0)
    linhas.append(f"TOTAL: R$ {total:.2f}".replace('.', ',').center(largura))
    linhas.append("=" * largura)
    linhas.append("")
    linhas.append("Obrigado pela preferencia!".center(largura))
    
    return "\\n".join(linhas)

def imprimir_win32(texto):
    """Imprime usando win32print (melhor para impressoras termicas)"""
    try:
        printer_name = get_printer_name()
        if not printer_name:
            print("[ERRO] Nenhuma impressora encontrada!")
            return False
        
        print(f"[INFO] Usando impressora: {printer_name}")
        
        # Abre a impressora
        hprinter = win32print.OpenPrinter(printer_name)
        try:
            # Inicia o documento
            job = win32print.StartDocPrinter(hprinter, 1, ("Pedido", None, "RAW"))
            try:
                win32print.StartPagePrinter(hprinter)
                
                # Envia o texto como bytes
                texto_bytes = texto.encode('cp850', errors='replace')
                texto_bytes += b"\\n\\n\\n\\n\\n"  # Avanca papel
                texto_bytes += b"\\x1d\\x56\\x00"  # Comando ESC/POS para corte (se suportado)
                
                win32print.WritePrinter(hprinter, texto_bytes)
                win32print.EndPagePrinter(hprinter)
            finally:
                win32print.EndDocPrinter(hprinter)
        finally:
            win32print.ClosePrinter(hprinter)
        
        return True
    except Exception as e:
        print(f"[ERRO] Falha ao imprimir via win32: {e}")
        return False

def imprimir_alternativo(texto):
    """Metodo alternativo usando comando print do Windows"""
    import tempfile
    import subprocess
    
    try:
        # Salva em arquivo temporario
        with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False, encoding='cp850', errors='replace') as f:
            f.write(texto)
            f.write("\\n\\n\\n\\n\\n")  # Espaco para corte
            arquivo = f.name
        
        # Usa o comando print do Windows (envia direto para impressora padrao)
        result = subprocess.run(
            ['print', '/d:prn', arquivo],
            shell=True,
            capture_output=True,
            timeout=30
        )
        
        time.sleep(2)
        
        try:
            os.unlink(arquivo)
        except:
            pass
        
        return result.returncode == 0
    except Exception as e:
        print(f"[ERRO] Falha ao imprimir: {e}")
        return False

def imprimir(texto):
    """Funcao principal de impressao"""
    if USE_WIN32:
        return imprimir_win32(texto)
    else:
        return imprimir_alternativo(texto)

def carregar_historico():
    global pedidos_impressos
    try:
        if os.path.exists("impressos.json"):
            with open("impressos.json", "r") as f:
                hoje = datetime.now().date().isoformat()
                pedidos_impressos = set(json.load(f).get(hoje, []))
    except:
        pedidos_impressos = set()

def salvar_historico():
    try:
        hoje = datetime.now().date().isoformat()
        with open("impressos.json", "w") as f:
            json.dump({hoje: list(pedidos_impressos)}, f)
    except:
        pass

# ============================================
# INICIO
# ============================================
if __name__ == "__main__":
    print("=" * 50)
    print(f"  {STORE_NAME} - Impressao Automatica")
    print("=" * 50)
    print()
    
    # Busca o ID da empresa pelo slug
    if not buscar_company_id():
        print()
        print("ERRO: Nao foi possivel encontrar a empresa.")
        print(f"Verifique se o slug '{COMPANY_SLUG}' esta correto.")
        print("O slug e o nome usado na URL do cardapio.")
        print()
        input("Pressione Enter para sair...")
        exit(1)
    
    print()
    printer = get_printer_name()
    if printer:
        print(f"  Impressora: {printer}")
    else:
        print("  [AVISO] Nenhuma impressora detectada!")
    
    print(f"  Verificando pedidos a cada {CHECK_INTERVAL}s")
    print("  Pressione Ctrl+C para parar")
    print("=" * 50)
    print()
    
    carregar_historico()
    
    try:
        while True:
            for pedido in buscar_pedidos():
                order_id = pedido.get("id")
                
                if order_id in pedidos_impressos:
                    continue
                
                print(f"[NOVO] Pedido #{pedido.get('order_code', pedido.get('daily_number'))} - {pedido.get('customer_name')}")
                
                itens = buscar_itens(order_id)
                recibo = formatar_recibo(pedido, itens)
                
                if imprimir(recibo):
                    print(f"[OK] Impresso!")
                    # Marca como impresso no banco de dados
                    if marcar_impresso(order_id):
                        print(f"[OK] Marcado como impresso no sistema")
                    pedidos_impressos.add(order_id)
                    salvar_historico()
                else:
                    print(f"[FALHA] Nao foi possivel imprimir. Tentando novamente em {CHECK_INTERVAL}s...")
            
            time.sleep(CHECK_INTERVAL)
            
    except KeyboardInterrupt:
        print("\\nEncerrando...")
        salvar_historico()`;
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
      description: 'O script Python foi baixado com sucesso.',
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
          <TabsTrigger value="empresa">Empresa</TabsTrigger>
          <TabsTrigger value="horarios">Horários</TabsTrigger>
          <TabsTrigger value="entrega">Entrega</TabsTrigger>
          <TabsTrigger value="layout">Layout</TabsTrigger>
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
                <Label htmlFor="phone">Telefone / WhatsApp</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="(00) 00000-0000"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="address" className="flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  Endereço
                </Label>
                <Input
                  id="address"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Rua, número, bairro, cidade"
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
                    className="w-full h-32 object-cover rounded-lg border"
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
              </Button>
            </CardContent>
          </Card>
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
                  Configure os valores de entrega para cidade e interior
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="deliveryFeeCity">Taxa Cidade (R$)</Label>
                    <Input
                      id="deliveryFeeCity"
                      type="number"
                      step="0.01"
                      min="0"
                      value={deliveryFeeCity}
                      onChange={(e) => setDeliveryFeeCity(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="deliveryFeeInterior">Taxa Interior (R$)</Label>
                    <Input
                      id="deliveryFeeInterior"
                      type="number"
                      step="0.01"
                      min="0"
                      value={deliveryFeeInterior}
                      onChange={(e) => setDeliveryFeeInterior(e.target.value)}
                      placeholder="0.00"
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
        </TabsContent>

        {/* Tab Layout */}
        <TabsContent value="layout" className="space-y-6">
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
                  <p className="font-medium">Pedidos Hoje</p>
                  <p className="text-sm text-muted-foreground">Mostra quantidade de pedidos do dia</p>
                </div>
                <Switch
                  checked={cardVisibility.showCardPedidosHoje}
                  onCheckedChange={(value) => handleCardVisibilityChange('showCardPedidosHoje', value)}
                />
              </div>

              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <p className="font-medium">Aguardando</p>
                  <p className="text-sm text-muted-foreground">Mostra pedidos pendentes e em preparo</p>
                </div>
                <Switch
                  checked={cardVisibility.showCardAguardando}
                  onCheckedChange={(value) => handleCardVisibilityChange('showCardAguardando', value)}
                />
              </div>

              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <p className="font-medium">Faturamento Hoje</p>
                  <p className="text-sm text-muted-foreground">Mostra o valor faturado no dia</p>
                </div>
                <Switch
                  checked={cardVisibility.showCardFaturamento}
                  onCheckedChange={(value) => handleCardVisibilityChange('showCardFaturamento', value)}
                />
              </div>

              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <p className="font-medium">Total de Pedidos</p>
                  <p className="text-sm text-muted-foreground">Mostra o total geral de pedidos</p>
                </div>
                <Switch
                  checked={cardVisibility.showCardTotalPedidos}
                  onCheckedChange={(value) => handleCardVisibilityChange('showCardTotalPedidos', value)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Impressão */}
        <TabsContent value="impressao" className="space-y-6">
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
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  O script usa o <strong>slug</strong> para identificar a empresa. Se precisar corrigir manualmente, 
                  edite a variável <code className="bg-background px-1 rounded">COMPANY_SLUG</code> no arquivo printer.py.
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
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}
