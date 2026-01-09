import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuthContext } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, Building2, Phone, MapPin, Globe, Printer, Download, Copy, Check } from 'lucide-react';
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
${storeName} - Impressão Automática de Pedidos (Windows)

COMO USAR:
1. Instale Python: https://python.org (marque "Add to PATH")
2. Abra o CMD e rode: pip install requests
3. Dê duplo clique neste arquivo OU rode: python auto_printer.py
"""

import requests
import time
import json
import os
import tempfile
import subprocess
from datetime import datetime

# ============================================
# CONFIGURAÇÃO
# ============================================
SUPABASE_URL = "${import.meta.env.VITE_SUPABASE_URL}"
SUPABASE_KEY = "${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}"
COMPANY_ID = "${companyId}"
CHECK_INTERVAL = 5  # segundos
STORE_NAME = "${storeName}"

# ============================================
pedidos_impressos = set()

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
    linhas.append("=" * 40)
    linhas.append(STORE_NAME.center(40))
    linhas.append("=" * 40)
    linhas.append(f"*** PEDIDO #{pedido.get('daily_number', '?')} ***".center(40))
    linhas.append("")
    
    # Data
    try:
        dt = datetime.fromisoformat(pedido['created_at'].replace('Z', '+00:00'))
        linhas.append(f"Data: {dt.strftime('%d/%m/%Y %H:%M')}")
    except:
        linhas.append(f"Data: {pedido.get('created_at', '')[:16]}")
    
    linhas.append("")
    linhas.append("-" * 40)
    linhas.append(f"Cliente: {pedido.get('customer_name', '')}")
    
    if pedido.get('customer_phone'):
        linhas.append(f"Telefone: {pedido['customer_phone']}")
    if pedido.get('delivery_address'):
        linhas.append(f"Endereço: {pedido['delivery_address']}")
    
    linhas.append("")
    linhas.append("-" * 40)
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
    linhas.append("=" * 40)
    total = pedido.get('total', 0)
    linhas.append(f"TOTAL: R$ {total:.2f}".replace('.', ',').center(40))
    linhas.append("=" * 40)
    linhas.append("")
    linhas.append("Obrigado pela preferência!".center(40))
    linhas.append("\\n\\n\\n")
    
    return "\\n".join(linhas)

def imprimir(texto):
    try:
        # Salva em arquivo temporário
        with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False, encoding='utf-8') as f:
            f.write(texto)
            arquivo = f.name
        
        # Imprime via notepad
        subprocess.run(['notepad.exe', '/p', arquivo], shell=True)
        time.sleep(2)
        
        try:
            os.unlink(arquivo)
        except:
            pass
        return True
    except Exception as e:
        print(f"ERRO ao imprimir: {e}")
        return False

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
# INÍCIO
# ============================================
if __name__ == "__main__":
    print("=" * 50)
    print(f"  {STORE_NAME} - Impressão Automática")
    print("=" * 50)
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
            
            time.sleep(CHECK_INTERVAL)
            
    except KeyboardInterrupt:
        print("\\nEncerrando...")
        salvar_historico()`;
  };

  const handleDownloadScript = () => {
    const script = generatePythonScript();
    const blob = new Blob([script], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `auto_printer_${company?.slug || 'loja'}.py`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: 'Script baixado',
      description: 'O script Python foi baixado com sucesso.',
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
              Script Python para imprimir pedidos automaticamente no Windows
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted/50 p-4 rounded-lg space-y-3">
              <h4 className="font-medium">Como usar:</h4>
              <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
                <li>Instale o Python em <a href="https://python.org" target="_blank" rel="noopener noreferrer" className="text-primary underline">python.org</a> (marque "Add to PATH")</li>
                <li>Abra o CMD e rode: <code className="bg-background px-1 py-0.5 rounded">pip install requests</code></li>
                <li>Baixe o script abaixo e execute com duplo clique</li>
              </ol>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleDownloadScript} className="flex-1">
                <Download className="w-4 h-4 mr-2" />
                Baixar Script Python
              </Button>
              <Button variant="outline" onClick={handleCopyScript}>
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>

            <div className="space-y-2">
              <Label>Prévia do Script</Label>
              <Textarea 
                readOnly 
                value={generatePythonScript()} 
                className="font-mono text-xs h-48"
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
