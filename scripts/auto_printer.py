"""
Comanda Tech - Impressão Automática de Pedidos (Windows)

COMO USAR:
1. Instale Python: https://python.org (marque "Add to PATH")
2. Abra o CMD e rode: pip install requests
3. Dê duplo clique neste arquivo OU rode: python auto_printer.py
"""

import requests
import time
import tempfile
import subprocess
import os
from datetime import datetime

# ============================================
# CONFIGURAÇÃO
# ============================================
SUPABASE_URL = "https://iwmrtxdzlkasuzutxvhh.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3bXJ0eGR6bGthc3V6dXR4dmhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3OTExODMsImV4cCI6MjA4MDM2NzE4M30.VsnT1zdVUwJdv8gBlg8CthBx_bccZp-LsOs2PRq1Uik"
CHECK_INTERVAL = 5  # segundos entre verificações
STORE_NAME = "Comanda Tech"

# ============================================
# HEADERS para API
# ============================================
HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal"
}

def buscar_pedidos_nao_impressos():
    """Busca pedidos pendentes que ainda não foram impressos"""
    try:
        url = f"{SUPABASE_URL}/rest/v1/orders"
        params = {
            "status": "eq.pending",
            "printed": "eq.false",
            "order": "created_at.asc"
        }
        r = requests.get(url, headers=HEADERS, params=params)
        if r.ok:
            pedidos = r.json()
            print(f"[DEBUG] Encontrados {len(pedidos)} pedidos não impressos")
            return pedidos
        else:
            print(f"[ERRO] Falha ao buscar pedidos: {r.status_code} - {r.text}")
            return []
    except Exception as e:
        print(f"[ERRO] Exceção ao buscar pedidos: {e}")
        return []

def buscar_itens(order_id):
    """Busca itens de um pedido específico"""
    try:
        url = f"{SUPABASE_URL}/rest/v1/order_items"
        params = {"order_id": f"eq.{order_id}"}
        r = requests.get(url, headers=HEADERS, params=params)
        if r.ok:
            return r.json()
        else:
            print(f"[ERRO] Falha ao buscar itens: {r.status_code}")
            return []
    except Exception as e:
        print(f"[ERRO] Exceção ao buscar itens: {e}")
        return []

def marcar_como_impresso(order_id):
    """Marca o pedido como impresso no banco de dados"""
    try:
        url = f"{SUPABASE_URL}/rest/v1/orders?id=eq.{order_id}"
        data = {
            "printed": True,
            "printed_at": datetime.utcnow().isoformat() + "Z"
        }
        r = requests.patch(url, headers=HEADERS, json=data)
        if r.ok:
            print(f"[DB] Pedido {order_id[:8]}... marcado como impresso")
            return True
        else:
            print(f"[ERRO] Falha ao marcar impresso: {r.status_code} - {r.text}")
            return False
    except Exception as e:
        print(f"[ERRO] Exceção ao marcar impresso: {e}")
        return False

def formatar_recibo(pedido, itens):
    """Formata o recibo para impressão"""
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
        linhas.append(f"Endereco: {pedido['delivery_address']}")
    
    linhas.append("")
    linhas.append("-" * 40)
    linhas.append("ITENS:")
    
    for item in itens:
        qtd = item.get('quantity', 1)
        nome = item.get('name', 'Item')
        preco = float(item.get('price', 0)) * qtd
        linhas.append(f"{qtd}x {nome} - R$ {preco:.2f}".replace('.', ','))
        if item.get('notes'):
            linhas.append(f"   -> {item['notes']}")
    
    if pedido.get('notes'):
        linhas.append("")
        linhas.append(f"OBS: {pedido['notes']}")
    
    linhas.append("")
    linhas.append("=" * 40)
    total = float(pedido.get('total', 0))
    linhas.append(f"TOTAL: R$ {total:.2f}".replace('.', ',').center(40))
    linhas.append("=" * 40)
    linhas.append("")
    linhas.append("Obrigado pela preferencia!".center(40))
    linhas.append("\n\n\n")
    
    return "\n".join(linhas)

def imprimir(texto, order_number):
    """Envia o texto para a impressora padrão via notepad"""
    try:
        # Salva em arquivo temporário
        arquivo = os.path.join(tempfile.gettempdir(), f"pedido_{order_number}.txt")
        with open(arquivo, 'w', encoding='utf-8') as f:
            f.write(texto)
        
        print(f"[PRINT] Enviando para impressora: {arquivo}")
        
        # Imprime via notepad (silencioso)
        result = subprocess.run(
            ['notepad.exe', '/p', arquivo],
            shell=True,
            capture_output=True,
            timeout=30
        )
        
        time.sleep(2)  # Aguarda impressão
        
        # Remove arquivo temporário
        try:
            os.unlink(arquivo)
        except:
            pass
        
        return True
    except subprocess.TimeoutExpired:
        print(f"[ERRO] Timeout ao imprimir")
        return False
    except Exception as e:
        print(f"[ERRO] Falha na impressão: {e}")
        return False

def processar_pedido(pedido):
    """Processa um pedido: busca itens, formata e imprime"""
    order_id = pedido.get("id")
    order_number = pedido.get("daily_number", "?")
    customer = pedido.get("customer_name", "")
    
    print(f"\n{'='*50}")
    print(f"[NOVO PEDIDO] #{order_number} - {customer}")
    print(f"{'='*50}")
    
    # Busca itens
    itens = buscar_itens(order_id)
    if not itens:
        print(f"[AVISO] Pedido sem itens, pulando...")
        return False
    
    print(f"[INFO] {len(itens)} item(s) no pedido")
    
    # Formata recibo
    recibo = formatar_recibo(pedido, itens)
    
    # Imprime
    if imprimir(recibo, order_number):
        print(f"[OK] Impresso com sucesso!")
        # Marca como impresso no banco
        if marcar_como_impresso(order_id):
            return True
        else:
            print(f"[AVISO] Impresso mas falhou ao marcar no banco")
            return True  # Mesmo assim considera sucesso
    else:
        print(f"[ERRO] Falha na impressão")
        return False

# ============================================
# LOOP PRINCIPAL
# ============================================
if __name__ == "__main__":
    print("=" * 50)
    print(f"  {STORE_NAME} - Impressão Automática v2.0")
    print("=" * 50)
    print(f"  Verificando a cada {CHECK_INTERVAL} segundos")
    print("  Usando banco de dados para controle")
    print("  Pressione Ctrl+C para parar")
    print("=" * 50)
    print()
    
    try:
        while True:
            pedidos = buscar_pedidos_nao_impressos()
            
            for pedido in pedidos:
                processar_pedido(pedido)
            
            time.sleep(CHECK_INTERVAL)
            
    except KeyboardInterrupt:
        print("\n[INFO] Encerrando...")
        print("Obrigado por usar o Comanda Tech!")
