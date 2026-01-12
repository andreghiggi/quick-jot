import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuthContext } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, Building2, Phone, MapPin, Globe, Printer, Download, Copy, Check, FileText } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';

export default function Settings() {
  const { company, refetchUserData } = useAuthContext();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    slug: '',
  });

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

  const generatePythonScript = () => {
    const storeName = company?.name || 'Minha Loja';
    const companyId = company?.id || '';
    
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
# CONFIGURACAO
# ============================================
SUPABASE_URL = "https://iwmrtxdzlkasuzutxvhh.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3bXJ0eGR6bGthc3V6dXR4dmhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3OTExODMsImV4cCI6MjA4MDM2NzE4M30.VsnT1zdVUwJdv8gBlg8CthBx_bccZp-LsOs2PRq1Uik"
COMPANY_ID = "${companyId}"
CHECK_INTERVAL = 5  # segundos
STORE_NAME = "${storeName}"

# Nome da impressora (deixe vazio para usar a padrao)
# Exemplo: "EPSON TM-T20" ou "\\\\\\\\SERVIDOR\\\\IMPRESSORA"
PRINTER_NAME = ""

# ============================================
pedidos_impressos = set()

def get_printer_name():
    """Retorna o nome da impressora a ser usada"""
    if PRINTER_NAME:
        return PRINTER_NAME
    if USE_WIN32:
        return win32print.GetDefaultPrinter()
    return None

def buscar_pedidos():
    try:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/orders?status=eq.pending&company_id=eq.{COMPANY_ID}&order=created_at.desc",
            headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
        )
        return r.json() if r.ok else []
    except:
        return []

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
    linhas = []
    linhas.append("=" * 48)
    linhas.append(STORE_NAME.center(48))
    linhas.append("=" * 48)
    linhas.append(f"*** PEDIDO #{pedido.get('daily_number', '?')} ***".center(48))
    linhas.append("")
    
    # Data
    try:
        dt = datetime.fromisoformat(pedido['created_at'].replace('Z', '+00:00'))
        linhas.append(f"Data: {dt.strftime('%d/%m/%Y %H:%M')}")
    except:
        linhas.append(f"Data: {pedido.get('created_at', '')[:16]}")
    
    linhas.append("")
    linhas.append("-" * 48)
    linhas.append(f"Cliente: {pedido.get('customer_name', '')}")
    
    if pedido.get('customer_phone'):
        linhas.append(f"Telefone: {pedido['customer_phone']}")
    if pedido.get('delivery_address'):
        linhas.append(f"Endereco: {pedido['delivery_address']}")
    
    linhas.append("")
    linhas.append("-" * 48)
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
    linhas.append("=" * 48)
    total = pedido.get('total', 0)
    linhas.append(f"TOTAL: R$ {total:.2f}".replace('.', ',').center(48))
    linhas.append("=" * 48)
    linhas.append("")
    linhas.append("Obrigado pela preferencia!".center(48))
    
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
                
                print(f"[NOVO] Pedido #{pedido.get('daily_number')} - {pedido.get('customer_name')}")
                
                itens = buscar_itens(order_id)
                recibo = formatar_recibo(pedido, itens)
                
                if imprimir(recibo):
                    print(f"[OK] Impresso!")
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
    const companyId = company?.id || '';
    
    // Gera o script Python como string para o PowerShell
    const pythonScript = `import requests
import time
import json
import os
from datetime import datetime

try:
    import win32print
    USE_WIN32 = True
except ImportError:
    USE_WIN32 = False
    print('[AVISO] pywin32 nao instalado')

SUPABASE_URL = 'https://iwmrtxdzlkasuzutxvhh.supabase.co'
SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3bXJ0eGR6bGthc3V6dXR4dmhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3OTExODMsImV4cCI6MjA4MDM2NzE4M30.VsnT1zdVUwJdv8gBlg8CthBx_bccZp-LsOs2PRq1Uik'
COMPANY_ID = '${companyId}'
CHECK_INTERVAL = 5
STORE_NAME = '${storeName}'
PRINTER_NAME = ''

pedidos_impressos = set()

def get_printer_name():
    if PRINTER_NAME:
        return PRINTER_NAME
    if USE_WIN32:
        return win32print.GetDefaultPrinter()
    return None

def buscar_pedidos():
    try:
        url = SUPABASE_URL + '/rest/v1/orders?status=eq.pending&company_id=eq.' + COMPANY_ID + '&order=created_at.desc'
        headers = {'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY}
        r = requests.get(url, headers=headers)
        return r.json() if r.ok else []
    except:
        return []

def buscar_itens(order_id):
    try:
        url = SUPABASE_URL + '/rest/v1/order_items?order_id=eq.' + order_id
        headers = {'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY}
        r = requests.get(url, headers=headers)
        return r.json() if r.ok else []
    except:
        return []

def formatar_recibo(pedido, itens):
    linhas = []
    linhas.append('=' * 48)
    linhas.append(STORE_NAME.center(48))
    linhas.append('=' * 48)
    num = pedido.get('daily_number', '?')
    linhas.append(('*** PEDIDO #' + str(num) + ' ***').center(48))
    linhas.append('')
    try:
        dt = datetime.fromisoformat(pedido['created_at'].replace('Z', '+00:00'))
        linhas.append('Data: ' + dt.strftime('%d/%m/%Y %H:%M'))
    except:
        linhas.append('Data: ' + pedido.get('created_at', '')[:16])
    linhas.append('')
    linhas.append('-' * 48)
    linhas.append('Cliente: ' + pedido.get('customer_name', ''))
    if pedido.get('customer_phone'):
        linhas.append('Telefone: ' + pedido['customer_phone'])
    if pedido.get('delivery_address'):
        linhas.append('Endereco: ' + pedido['delivery_address'])
    linhas.append('')
    linhas.append('-' * 48)
    linhas.append('ITENS:')
    for item in itens:
        qtd = item.get('quantity', 1)
        nome = item.get('name', 'Item')
        preco = item.get('price', 0) * qtd
        linha = str(qtd) + 'x ' + nome + ' - R$ ' + str(round(preco, 2)).replace('.', ',')
        linhas.append(linha)
        if item.get('notes'):
            linhas.append('   -> ' + item['notes'])
    if pedido.get('notes'):
        linhas.append('')
        linhas.append('OBS: ' + pedido['notes'])
    linhas.append('')
    linhas.append('=' * 48)
    total = pedido.get('total', 0)
    total_str = 'TOTAL: R$ ' + str(round(total, 2)).replace('.', ',')
    linhas.append(total_str.center(48))
    linhas.append('=' * 48)
    linhas.append('')
    linhas.append('Obrigado pela preferencia!'.center(48))
    return chr(10).join(linhas)

def imprimir(texto):
    if USE_WIN32:
        try:
            printer = get_printer_name()
            if not printer:
                return False
            print('[INFO] Impressora: ' + printer)
            hprinter = win32print.OpenPrinter(printer)
            try:
                job = win32print.StartDocPrinter(hprinter, 1, ('Pedido', None, 'RAW'))
                try:
                    win32print.StartPagePrinter(hprinter)
                    texto_bytes = texto.encode('cp850', errors='replace')
                    texto_bytes += b'\\x0a\\x0a\\x0a\\x0a\\x0a'
                    texto_bytes += b'\\x1d\\x56\\x00'
                    win32print.WritePrinter(hprinter, texto_bytes)
                    win32print.EndPagePrinter(hprinter)
                finally:
                    win32print.EndDocPrinter(hprinter)
            finally:
                win32print.ClosePrinter(hprinter)
            return True
        except Exception as e:
            print('[ERRO] ' + str(e))
            return False
    else:
        import tempfile
        import subprocess
        try:
            with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False, encoding='cp850', errors='replace') as f:
                f.write(texto)
                arquivo = f.name
            subprocess.run(['print', '/d:prn', arquivo], shell=True, timeout=30)
            time.sleep(2)
            os.unlink(arquivo)
            return True
        except:
            return False

def carregar_historico():
    global pedidos_impressos
    try:
        if os.path.exists('impressos.json'):
            with open('impressos.json', 'r') as f:
                hoje = datetime.now().date().isoformat()
                pedidos_impressos = set(json.load(f).get(hoje, []))
    except:
        pedidos_impressos = set()

def salvar_historico():
    try:
        hoje = datetime.now().date().isoformat()
        with open('impressos.json', 'w') as f:
            json.dump({hoje: list(pedidos_impressos)}, f)
    except:
        pass

if __name__ == '__main__':
    print('=' * 50)
    print('  ' + STORE_NAME + ' - Impressao Automatica')
    print('=' * 50)
    printer = get_printer_name()
    if printer:
        print('  Impressora: ' + printer)
    else:
        print('  [AVISO] Nenhuma impressora detectada!')
    print('  Verificando pedidos a cada ' + str(CHECK_INTERVAL) + 's')
    print('  Pressione Ctrl+C para parar')
    print('=' * 50)
    print()
    carregar_historico()
    try:
        while True:
            for pedido in buscar_pedidos():
                order_id = pedido.get('id')
                if order_id in pedidos_impressos:
                    continue
                print('[NOVO] Pedido #' + str(pedido.get('daily_number')) + ' - ' + pedido.get('customer_name'))
                itens = buscar_itens(order_id)
                recibo = formatar_recibo(pedido, itens)
                if imprimir(recibo):
                    print('[OK] Impresso!')
                    pedidos_impressos.add(order_id)
                    salvar_historico()
                else:
                    print('[FALHA] Tentando novamente...')
            time.sleep(CHECK_INTERVAL)
    except KeyboardInterrupt:
        print('')
        print('Encerrando...')
        salvar_historico()`;

    // Escapa aspas duplas para o PowerShell
    const escapedScript = pythonScript.replace(/"/g, '`"').replace(/\$/g, '`$');
    
    return `@echo off
setlocal
chcp 65001 >nul
title ${storeName} - Impressao Automatica
color 0A

echo.
echo ============================================
echo   ${storeName} - Instalador de Impressao
echo ============================================
echo.

REM Verifica se Python esta instalado
echo [..] Verificando Python...
python --version
if %errorlevel% neq 0 (
    color 0C
    echo.
    echo [ERRO] Python nao encontrado!
    echo.
    echo Por favor, instale o Python:
    echo 1. Acesse https://python.org
    echo 2. Baixe e instale a versao mais recente
    echo 3. IMPORTANTE: Marque "Add Python to PATH"
    echo 4. Reinicie o computador
    echo 5. Execute este instalador novamente
    goto :fim
)

echo [OK] Python encontrado
echo.

REM Cria a pasta se nao existir
echo [..] Criando pasta...
if not exist "C:\\ComandaTech" mkdir "C:\\ComandaTech"
echo [OK] Pasta C:\\ComandaTech OK
echo.

echo ============================================
echo   Instalando dependencias...
echo ============================================
echo.
python -m pip install requests pywin32 --quiet
echo.
echo [OK] Dependencias instaladas
echo.

echo [..] Criando script de impressao...
powershell -ExecutionPolicy Bypass -Command "Set-Content -Path 'C:\\ComandaTech\\printer.py' -Value '${escapedScript}' -Encoding UTF8"

if not exist "C:\\ComandaTech\\printer.py" (
    color 0C
    echo [ERRO] Arquivo printer.py nao foi criado!
    goto :fim
)

echo [OK] Script criado
echo.
echo ============================================
echo   Iniciando impressao automatica...
echo ============================================
echo.
echo Impressora padrao do Windows sera usada.
echo.

cd /d "C:\\ComandaTech"
python printer.py

:fim
echo.
echo ============================================
echo   Pressione qualquer tecla para fechar...
echo ============================================
pause >nul
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

  const handleCopyScript = () => {
    const script = generatePythonScript();
    navigator.clipboard.writeText(script);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    
    toast({
      title: 'Copiado!',
      description: 'O script foi copiado para a área de transferência.',
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
      actions={
        <Button onClick={handleSave} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Salvar
        </Button>
      }
    >
      <div className="max-w-2xl space-y-6">
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
            <div className="bg-primary/10 border border-primary/20 p-4 rounded-lg space-y-3">
              <h4 className="font-medium flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Instalação Automática
              </h4>
              <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
                <li>Instale o Python em <a href="https://python.org" target="_blank" rel="noopener noreferrer" className="text-primary underline">python.org</a> (marque "Add to PATH")</li>
                <li>Baixe o instalador abaixo</li>
                <li>Execute como administrador (clique direito → Executar como administrador)</li>
              </ol>
              <Button onClick={handleDownloadBat} className="w-full" size="lg">
                <Download className="w-4 h-4 mr-2" />
                Baixar Instalador (.bat)
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                O instalador cria a pasta, instala dependências e inicia automaticamente
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
