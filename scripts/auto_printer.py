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
COMPANY_ID = ""  # Será preenchido automaticamente pelo slug

# ============================================
# HEADERS para API
# ============================================
HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

# Histórico de pedidos impressos nesta sessão
pedidos_impressos_sessao = []

def log(msg, tipo="INFO"):
    """Log com timestamp"""
    agora = datetime.now().strftime("%H:%M:%S")
    print(f"[{agora}] [{tipo}] {msg}")

def buscar_empresa_por_slug(slug):
    """Busca empresa pelo slug e retorna id, nome e endereço"""
    try:
        url = f"{SUPABASE_URL}/rest/v1/companies"
        params = {"slug": f"eq.{slug}", "active": "eq.true"}
        r = requests.get(url, headers=HEADERS, params=params)
        if r.ok and r.json():
            empresa = r.json()[0]
            return empresa.get('id'), empresa.get('name'), empresa.get('address')
        else:
            log(f"Empresa não encontrada: {slug}", "ERRO")
            return None, None, None
    except Exception as e:
        log(f"Exceção ao buscar empresa: {e}", "ERRO")
        return None, None, None

def buscar_todos_pedidos_hoje(company_id):
    """Busca TODOS os pedidos de hoje para mostrar status"""
    try:
        url = f"{SUPABASE_URL}/rest/v1/orders"
        params = {
            "company_id": f"eq.{company_id}",
            "order": "created_at.desc",
            "limit": "50"
        }
        r = requests.get(url, headers=HEADERS, params=params)
        if r.ok:
            return r.json()
        else:
            log(f"Erro ao buscar pedidos: {r.status_code} - {r.text}", "ERRO")
            return []
    except Exception as e:
        log(f"Exceção: {e}", "ERRO")
        return []

def buscar_pedidos_nao_impressos(company_id):
    """Busca pedidos pendentes que ainda não foram impressos"""
    try:
        url = f"{SUPABASE_URL}/rest/v1/orders"
        params = {
            "company_id": f"eq.{company_id}",
            "status": "eq.pending",
            "printed": "eq.false",
            "order": "created_at.asc"
        }
        log(f"Buscando: company_id={company_id}, status=pending, printed=false", "DEBUG")
        r = requests.get(url, headers=HEADERS, params=params)
        if r.ok:
            pedidos = r.json()
            log(f"API retornou {len(pedidos)} pedido(s)", "DEBUG")
            return pedidos
        else:
            log(f"Erro HTTP: {r.status_code} - {r.text}", "ERRO")
            return []
    except Exception as e:
        log(f"Exceção: {e}", "ERRO")
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
            log(f"Erro ao buscar itens: {r.status_code}", "ERRO")
            return []
    except Exception as e:
        log(f"Exceção ao buscar itens: {e}", "ERRO")
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
            log(f"Marcado como impresso no banco!", "DB")
            return True
        else:
            log(f"Erro ao marcar: {r.status_code} - {r.text}", "ERRO")
            return False
    except Exception as e:
        log(f"Exceção ao marcar: {e}", "ERRO")
        return False

def formatar_recibo(pedido, itens, endereco_loja=None):
    """Formata o recibo para impressão 58mm - fonte grande e legível"""
    linhas = []
    
    # Cabeçalho
    linhas.append("")
    linhas.append("================================")
    linhas.append("        COMANDA TECH            ")
    linhas.append("================================")
    
    # Número do pedido grande
    num = pedido.get('daily_number', '?')
    linhas.append(f"      PEDIDO #{num}              ")
    
    # Data/Hora
    try:
        dt = datetime.fromisoformat(pedido['created_at'].replace('Z', '+00:00'))
        linhas.append(f"  {dt.strftime('%d/%m/%Y %H:%M')}")
    except:
        linhas.append(f"  {pedido.get('created_at', '')[:16]}")
    
    linhas.append("================================")
    linhas.append("")
    
    # Cliente
    linhas.append(f"Cliente: {pedido.get('customer_name', '')}")
    
    # Telefone
    if pedido.get('customer_phone'):
        linhas.append(f"Tel: {pedido['customer_phone']}")
    
    linhas.append("")
    
    # Endereço de Entrega ou Retirada
    if pedido.get('delivery_address'):
        linhas.append("================================")
        linhas.append("         ENTREGA                ")
        linhas.append("================================")
        linhas.append(f"{pedido['delivery_address']}")
    else:
        linhas.append("================================")
        linhas.append("    RETIRADA NO LOCAL           ")
        linhas.append("================================")
        if endereco_loja:
            linhas.append(f"{endereco_loja}")
    
    linhas.append("")
    linhas.append("--------------------------------")
    linhas.append("PRODUTOS:")
    linhas.append("--------------------------------")
    
    # Produtos
    subtotal = 0
    for item in itens:
        qtd = item.get('quantity', 1)
        nome_completo = item.get('name', 'Item')
        preco_unit = float(item.get('price', 0))
        preco_total = preco_unit * qtd
        subtotal += preco_total
        
        # Separar nome do produto e adicionais
        if '(' in nome_completo and nome_completo.endswith(')'):
            idx = nome_completo.index('(')
            nome = nome_completo[:idx].strip()
            adicionais = nome_completo[idx+1:-1].strip()
        else:
            nome = nome_completo
            adicionais = None
        
        # Nome do produto em maiúsculas
        linhas.append(f"{qtd}x {nome.upper()}")
        linhas.append(f"   R$ {preco_total:.2f}".replace('.', ','))
        
        # Adicionais
        if adicionais:
            linhas.append(f"   + {adicionais}")
        
        # Observações do item
        if item.get('notes'):
            linhas.append(f"   Obs: {item['notes']}")
        
        linhas.append("")
    
    linhas.append("--------------------------------")
    
    # Subtotal
    linhas.append(f"Subtotal: R$ {subtotal:.2f}".replace('.', ','))
    
    # Taxa de entrega (calculada)
    total = float(pedido.get('total', 0))
    taxa_entrega = total - subtotal if total > subtotal else 0
    
    if pedido.get('delivery_address') and taxa_entrega > 0:
        linhas.append(f"Entrega:  R$ {taxa_entrega:.2f}".replace('.', ','))
    
    linhas.append("")
    linhas.append("================================")
    linhas.append(f"TOTAL:    R$ {total:.2f}".replace('.', ','))
    linhas.append("================================")
    
    # Observações gerais do pedido
    if pedido.get('notes'):
        linhas.append("")
        linhas.append(f"Obs: {pedido['notes']}")
    
    linhas.append("")
    linhas.append("  Obrigado pela preferencia!    ")
    linhas.append("================================")
    linhas.append("\n\n\n")
    
    return "\n".join(linhas)

def imprimir(texto, order_number):
    """Envia o texto para a impressora padrão via notepad"""
    try:
        # Salva em arquivo temporário
        arquivo = os.path.join(tempfile.gettempdir(), f"pedido_{order_number}.txt")
        with open(arquivo, 'w', encoding='utf-8') as f:
            f.write(texto)
        
        log(f"Arquivo salvo: {arquivo}", "PRINT")
        log(f"Enviando para impressora...", "PRINT")
        
        # Imprime via notepad (silencioso)
        result = subprocess.run(
            ['notepad.exe', '/p', arquivo],
            shell=True,
            capture_output=True,
            timeout=30
        )
        
        log(f"Comando executado, aguardando...", "PRINT")
        time.sleep(2)  # Aguarda impressão
        
        # Remove arquivo temporário
        try:
            os.unlink(arquivo)
            log(f"Arquivo temporário removido", "PRINT")
        except:
            pass
        
        return True
    except subprocess.TimeoutExpired:
        log(f"Timeout ao imprimir!", "ERRO")
        return False
    except Exception as e:
        log(f"Falha na impressão: {e}", "ERRO")
        return False

def processar_pedido(pedido, endereco_loja=None):
    """Processa um pedido: busca itens, formata e imprime"""
    order_id = pedido.get("id")
    order_number = pedido.get("daily_number", "?")
    customer = pedido.get("customer_name", "")
    
    print()
    print("=" * 50)
    log(f"NOVO PEDIDO DETECTADO!", "***")
    log(f"Pedido #{order_number} - Cliente: {customer}", "***")
    print("=" * 50)
    
    # Busca itens
    log("Buscando itens do pedido...", "INFO")
    itens = buscar_itens(order_id)
    if not itens:
        log("Pedido sem itens, pulando...", "AVISO")
        return False
    
    log(f"{len(itens)} item(s) encontrado(s)", "INFO")
    for item in itens:
        log(f"  - {item.get('quantity', 1)}x {item.get('name', 'Item')}", "INFO")
    
    # Formata recibo
    log("Formatando recibo...", "INFO")
    recibo = formatar_recibo(pedido, itens, endereco_loja)
    
    # Imprime
    log("Iniciando impressão...", "PRINT")
    if imprimir(recibo, order_number):
        log("IMPRESSÃO CONCLUÍDA COM SUCESSO!", "OK")
        
        # Marca como impresso no banco
        log("Marcando como impresso no banco...", "DB")
        if marcar_como_impresso(order_id):
            pedidos_impressos_sessao.append({
                "numero": order_number,
                "cliente": customer,
                "hora": datetime.now().strftime("%H:%M:%S")
            })
            return True
        else:
            log("Impresso mas falhou ao marcar no banco", "AVISO")
            return True
    else:
        log("FALHA NA IMPRESSÃO!", "ERRO")
        return False

def mostrar_status(company_id):
    """Mostra status atual dos pedidos"""
    print()
    print("-" * 50)
    log("Verificando status dos pedidos...", "INFO")
    
    todos = buscar_todos_pedidos_hoje(company_id)
    pendentes_nao_impressos = [p for p in todos if p.get('status') == 'pending' and not p.get('printed')]
    pendentes_impressos = [p for p in todos if p.get('status') == 'pending' and p.get('printed')]
    outros = [p for p in todos if p.get('status') != 'pending']
    
    print()
    print(f"  📋 PENDENTES NÃO IMPRESSOS: {len(pendentes_nao_impressos)}")
    for p in pendentes_nao_impressos:
        print(f"     └─ #{p.get('daily_number')} - {p.get('customer_name')} (id: {p.get('id')[:8]}...)")
    
    print(f"  ✅ PENDENTES JÁ IMPRESSOS: {len(pendentes_impressos)}")
    for p in pendentes_impressos:
        hora = p.get('printed_at', '')[:19] if p.get('printed_at') else ''
        print(f"     └─ #{p.get('daily_number')} - {p.get('customer_name')} (impresso: {hora})")
    
    print(f"  📦 OUTROS STATUS: {len(outros)}")
    for p in outros[:5]:  # Mostra só os 5 últimos
        print(f"     └─ #{p.get('daily_number')} - {p.get('customer_name')} [{p.get('status')}]")
    
    print()
    print(f"  🖨️  IMPRESSOS NESTA SESSÃO: {len(pedidos_impressos_sessao)}")
    for p in pedidos_impressos_sessao:
        print(f"     └─ #{p['numero']} - {p['cliente']} às {p['hora']}")
    
    print("-" * 50)
    print()

# ============================================
# LOOP PRINCIPAL
# ============================================
if __name__ == "__main__":
    print()
    print("=" * 50)
    print(f"  {STORE_NAME} - Impressão Automática v3.0")
    print("=" * 50)
    print(f"  URL: {SUPABASE_URL}")
    print("=" * 50)
    print()
    
    # Solicita slug da empresa
    slug = input("Digite o SLUG da sua empresa (ex: avenida-lanches): ").strip()
    if not slug:
        print("Slug não informado. Encerrando.")
        exit(1)
    
    log(f"Buscando empresa: {slug}...", "INFO")
    company_id, company_name, company_address = buscar_empresa_por_slug(slug)
    
    if not company_id:
        print(f"Empresa '{slug}' não encontrada ou inativa. Verifique o slug.")
        exit(1)
    
    print()
    print("=" * 50)
    log(f"Empresa encontrada: {company_name}", "OK")
    log(f"Company ID: {company_id}", "OK")
    print("=" * 50)
    print(f"  Intervalo: {CHECK_INTERVAL} segundos")
    print("  Pressione Ctrl+C para parar")
    print("=" * 50)
    print()
    
    # Atualiza nome da loja
    global STORE_NAME
    STORE_NAME = company_name
    
    # Mostra status inicial
    log("Iniciando monitoramento...", "START")
    mostrar_status(company_id)
    
    contador = 0
    try:
        while True:
            pedidos = buscar_pedidos_nao_impressos(company_id)
            
            if pedidos:
                log(f"Encontrados {len(pedidos)} pedido(s) para imprimir!", "INFO")
                for pedido in pedidos:
                    processar_pedido(pedido, company_address)
                mostrar_status(company_id)
            else:
                # A cada 12 verificações (1 minuto), mostra status
                contador += 1
                if contador >= 12:
                    mostrar_status(company_id)
                    contador = 0
                else:
                    print(".", end="", flush=True)
            
            time.sleep(CHECK_INTERVAL)
            
    except KeyboardInterrupt:
        print()
        print()
        log("Encerrando...", "INFO")
        print()
        print("=" * 50)
        print("  RESUMO DA SESSÃO")
        print("=" * 50)
        print(f"  Total de pedidos impressos: {len(pedidos_impressos_sessao)}")
        for p in pedidos_impressos_sessao:
            print(f"    ✅ #{p['numero']} - {p['cliente']} às {p['hora']}")
        print("=" * 50)
        print("  Obrigado por usar o Comanda Tech!")
        print("=" * 50)
