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
import webbrowser
from datetime import datetime, timezone, timedelta
from pathlib import Path

# ============================================
# CONFIGURAÇÃO
# ============================================
SUPABASE_URL = "https://iwmrtxdzlkasuzutxvhh.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3bXJ0eGR6bGthc3V6dXR4dmhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3OTExODMsImV4cCI6MjA4MDM2NzE4M30.VsnT1zdVUwJdv8gBlg8CthBx_bccZp-LsOs2PRq1Uik"
CHECK_INTERVAL = 5  # segundos entre verificações
STORE_NAME = "Comanda Tech"
COMPANY_ID = ""  # Será preenchido automaticamente pelo slug
COMPANY_SLUG = ""  # Preencha aqui para não precisar digitar (ex: "bon-appetit")
PAPER_SIZE = "58mm"  # Será carregado das configurações
SCRIPT_VERSION = "v7.0"
LOG_FILE = Path(__file__).with_name("auto_printer.log")

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
    """Log com timestamp em tela e arquivo"""
    agora = datetime.now(timezone(timedelta(hours=-3))).strftime("%H:%M:%S")
    linha = f"[{agora}] [{tipo}] {msg}"
    print(linha)
    try:
        with LOG_FILE.open("a", encoding="utf-8") as f:
            f.write(linha + "\n")
    except Exception:
        pass

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

def buscar_paper_size(company_id):
    """Busca o tamanho do papel configurado para a empresa"""
    global PAPER_SIZE
    try:
        url = f"{SUPABASE_URL}/rest/v1/store_settings"
        params = {
            "company_id": f"eq.{company_id}",
            "key": "eq.printer_paper_size"
        }
        r = requests.get(url, headers=HEADERS, params=params)
        if r.ok and r.json():
            valor = r.json()[0].get('value', '58mm')
            PAPER_SIZE = valor if valor in ('58mm', '80mm') else '58mm'
            log(f"Tamanho do papel: {PAPER_SIZE}", "CONFIG")
        else:
            log(f"Usando tamanho padrão: {PAPER_SIZE}", "CONFIG")
    except Exception as e:
        log(f"Erro ao buscar paper size: {e}", "AVISO")

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
        r = requests.get(url, headers=HEADERS, params=params)
        if r.ok:
            return r.json()
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
            "printed_at": datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
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

def formatar_recibo_html(pedido, itens, store_name="Comanda Tech"):
    """Gera HTML idêntico ao layout do OrderCard (impressão manual do painel)"""
    paper_size = PAPER_SIZE
    font_size = '11pt' if paper_size == '80mm' else '10pt'
    
    # Número do pedido
    order_num = pedido.get('order_code') or pedido.get('daily_number', '?')
    
    # Data/Hora formatada (convertido para fuso São Paulo UTC-3)
    try:
        dt_utc = datetime.fromisoformat(pedido['created_at'].replace('Z', '+00:00'))
        dt_sp = dt_utc.astimezone(timezone(timedelta(hours=-3)))
        formatted_date = dt_sp.strftime('%d/%m/%Y %H:%M')
    except:
        formatted_date = pedido.get('created_at', '')[:16]
    
    # Cliente
    customer_name = pedido.get('customer_name', '')
    customer_phone = pedido.get('customer_phone', '')
    delivery_address = pedido.get('delivery_address', '')
    notes = pedido.get('notes', '')
    total = float(pedido.get('total', 0))
    
    # Calcular subtotal e taxa de entrega
    subtotal = 0
    for item in itens:
        subtotal += float(item.get('price', 0)) * int(item.get('quantity', 1))
    delivery_fee = total - subtotal if total > subtotal else 0
    
    # Gerar HTML dos itens (com formatação correta de preço)
    items_html = ""
    for item in itens:
        qtd = int(item.get('quantity', 1))
        nome_completo = item.get('name', 'Item')
        preco_unit = float(item.get('price', 0))
        preco_total = preco_unit * qtd
        
        main_name = nome_completo
        extras = ''
        if '(' in nome_completo and nome_completo.endswith(')'):
            idx = nome_completo.index('(')
            main_name = nome_completo[:idx].strip()
            extras = nome_completo[idx+1:-1].strip()
        
        item_notes = item.get('notes', '')
        preco_str = f"{preco_total:.2f}".replace('.', ',')
        
        items_html += f'<div class="item">\n'
        items_html += f'  <div class="item-name">{qtd}x {main_name}</div>\n'
        if extras:
            items_html += f'  <div class="item-detail">+ {extras}</div>\n'
        if item_notes:
            items_html += f'  <div class="item-notes">Obs: {item_notes}</div>\n'
        items_html += f'  <div class="item-detail">R$ {preco_str}</div>\n'
        items_html += f'</div>\n'
    
    # Delivery section
    if delivery_address:
        delivery_section = f'''
            <div class="delivery-badge">ENTREGA</div>
            <div class="section"><p>{delivery_address}</p></div>
        '''
    else:
        delivery_section = '<div class="delivery-badge">RETIRADA NO LOCAL</div>'
    
    # Delivery fee line
    delivery_fee_html = ''
    if delivery_fee > 0:
        fee_str = f"{delivery_fee:.2f}".replace('.', ',')
        delivery_fee_html = f'''
            <div class="total-line">
                <span>Entrega:</span>
                <span>R$ {fee_str}</span>
            </div>
        '''
    
    subtotal_str = f"{subtotal:.2f}".replace('.', ',')
    total_str = f"{total:.2f}".replace('.', ',')
    
    # Extract payment info from notes
    import re
    payment_html = ''
    if notes:
        pagamento_match = re.search(r'Pagamento:\s*([^(|]+)', notes, re.IGNORECASE)
        troco_match = re.search(r'Troco para R\$\s*([^\)]+)', notes, re.IGNORECASE)
        pix_match = re.search(r'Chave PIX:\s*([^)]+)\)', notes, re.IGNORECASE)
        if pagamento_match:
            payment_html += f'<p><span class="label">PAGAMENTO:</span> {pagamento_match.group(1).strip()}</p>'
        if troco_match:
            payment_html += f'<p><span class="label">TROCO PARA:</span> R$ {troco_match.group(1).strip()}</p>'
        if pix_match:
            payment_html += f'<p><span class="label">CHAVE PIX:</span> {pix_match.group(1).strip()}</p>'
    
    # Notes section
    notes_html = ''
    if notes:
        notes_html = f'<hr class="divider"><p class="notes"><strong>Obs:</strong> {notes}</p>'
    
    # Phone section
    phone_html = ''
    if customer_phone:
        phone_html = f'<p><span class="label">Tel:</span> {customer_phone}</p>'
    
    html = f'''<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Pedido #{order_num}</title>
    <style>
        @page {{ margin: 0; size: {paper_size} auto; }}
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{ 
            font-family: 'Courier New', 'Lucida Console', monospace; 
            font-size: {font_size};
            font-weight: bold;
            width: {paper_size};
            max-width: {paper_size};
            padding: 2mm;
            line-height: 1.3;
            -webkit-print-color-adjust: exact;
        }}
        .center {{ text-align: center; }}
        .header {{ text-align: center; margin-bottom: 2mm; }}
        .store-name {{ font-size: 12pt; font-weight: bold; }}
        .order-num {{ font-size: 16pt; font-weight: bold; margin: 1mm 0; }}
        .date {{ font-size: 8pt; }}
        .divider {{ border: none; border-top: 1px dashed #000; margin: 2mm 0; }}
        .label {{ font-size: 9pt; font-weight: bold; }}
        .value {{ font-size: 10pt; font-weight: bold; }}
        .section {{ margin: 1mm 0; }}
        .section p {{ margin: 0.5mm 0; font-size: 10pt; }}
        .item {{ margin: 1.5mm 0; }}
        .item-name {{ font-size: 11pt; font-weight: bold; text-transform: uppercase; }}
        .item-detail {{ font-size: 9pt; margin-left: 2mm; }}
        .item-notes {{ font-size: 9pt; font-style: italic; margin-left: 2mm; }}
        .total-line {{ display: flex; justify-content: space-between; font-size: 10pt; margin: 0.5mm 0; }}
        .grand-total {{ display: flex; justify-content: space-between; font-size: 13pt; font-weight: bold; margin: 1mm 0; }}
        .notes {{ font-size: 9pt; margin: 1mm 0; }}
        .footer {{ text-align: center; font-size: 8pt; margin-top: 2mm; }}
        .delivery-badge {{ 
            text-align: center; 
            font-size: 11pt; 
            font-weight: bold; 
            padding: 1mm; 
            margin: 1mm 0;
            border: 1px solid #000;
        }}
    </style>
</head>
<body>
    <div class="header">
        <div class="store-name">{store_name.upper()}</div>
        <div class="order-num">PEDIDO #{order_num}</div>
        <div class="date">{formatted_date}</div>
    </div>
    <hr class="divider">
    <div class="section">
        <p><span class="label">Cliente:</span> {customer_name}</p>
        {phone_html}
        {payment_html}
    </div>
    {delivery_section}
    <hr class="divider">
    <div class="section">
        {items_html}
    </div>
    <hr class="divider">
    <div class="total-line">
        <span>Subtotal:</span>
        <span>R$ {subtotal_str}</span>
    </div>
    {delivery_fee_html}
    <div class="grand-total">
        <span>TOTAL:</span>
        <span>R$ {total_str}</span>
    </div>
    {notes_html}
    <hr class="divider">
    <p class="footer">Obrigado pela preferencia!</p>
    <script>
        window.onload = function() {{
            setTimeout(function() {{
                window.print();
                setTimeout(function() {{ window.close(); }}, 1000);
            }}, 300);
        }};
    </script>
</body>
</html>'''
    
    return html

def encontrar_chrome():
    """Encontra o executável do Chrome ou Edge no Windows"""
    caminhos = [
        os.path.expandvars(r"%ProgramFiles%\Google\Chrome\Application\chrome.exe"),
        os.path.expandvars(r"%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"),
        os.path.expandvars(r"%LocalAppData%\Google\Chrome\Application\chrome.exe"),
        os.path.expandvars(r"%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"),
        os.path.expandvars(r"%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"),
    ]
    for caminho in caminhos:
        if os.path.exists(caminho):
            log(f"Navegador encontrado: {caminho}", "PRINT")
            return caminho
    return None

def imprimir_html(html, order_number):
    """Salva HTML e envia direto para a impressora padrão.
    Usa Chrome/Edge --kiosk-printing para impressão silenciosa (sem diálogo)."""
    try:
        arquivo = os.path.join(tempfile.gettempdir(), f"pedido_{order_number}.html")
        with open(arquivo, 'w', encoding='utf-8') as f:
            f.write(html)
        
        file_url = f'file:///{arquivo.replace(os.sep, "/")}'
        log(f"HTML salvo: {arquivo}", "PRINT")
        
        # Método 1: Chrome/Edge com --kiosk-printing (envia direto, sem diálogo)
        browser_exe = encontrar_chrome()
        if browser_exe:
            log(f"Imprimindo via --kiosk-printing (silencioso)...", "PRINT")
            try:
                subprocess.Popen([
                    browser_exe,
                    "--kiosk-printing",
                    "--disable-print-preview",
                    file_url
                ], shell=False)
                log(f"Enviado para impressora via kiosk-printing!", "PRINT")
                time.sleep(5)
                # Remove arquivo temporário
                try:
                    os.unlink(arquivo)
                except:
                    pass
                return True
            except Exception as e:
                log(f"Falha no kiosk-printing: {e}", "ERRO")
        
        # Método 2: Fallback - webbrowser.open (abre diálogo, mas funciona)
        log(f"Fallback: abrindo navegador padrão...", "PRINT")
        webbrowser.open(file_url)
        time.sleep(5)
        try:
            os.unlink(arquivo)
        except:
            pass
        
        return True
    except Exception as e:
        log(f"Falha na impressão: {e}", "ERRO")
        return False

def processar_pedido(pedido, store_name="Comanda Tech"):
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
    
    # Formata recibo HTML (mesmo layout do painel web)
    log("Gerando recibo HTML...", "INFO")
    html = formatar_recibo_html(pedido, itens, store_name)
    
    # Imprime via navegador
    log("Iniciando impressão...", "PRINT")
    if imprimir_html(html, order_number):
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
    for p in outros[:5]:
        print(f"     └─ #{p.get('daily_number')} - {p.get('customer_name')} [{p.get('status')}]")
    
    print()
    print(f"  🖨️  IMPRESSOS NESTA SESSÃO: {len(pedidos_impressos_sessao)}")
    for p in pedidos_impressos_sessao:
        print(f"     └─ #{p['numero']} - {p['cliente']} às {p['hora']}")
    
    print("-" * 50)
    print()

# ============================================
# FILA DE IMPRESSÃO (GARÇOM / MESA)
# ============================================
def buscar_fila_impressao(company_id):
    """Busca jobs pendentes na fila de impressão"""
    try:
        url = f"{SUPABASE_URL}/rest/v1/print_queue"
        params = {
            "company_id": f"eq.{company_id}",
            "printed": "eq.false",
            "order": "created_at.asc"
        }
        r = requests.get(url, headers=HEADERS, params=params)
        if r.ok:
            return r.json()
        return []
    except Exception as e:
        log(f"Erro ao buscar fila: {e}", "ERRO")
        return []

def marcar_fila_impressa(job_id):
    """Marca job da fila como impresso"""
    try:
        url = f"{SUPABASE_URL}/rest/v1/print_queue?id=eq.{job_id}"
        data = {
            "printed": True,
            "printed_at": datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
        }
        r = requests.patch(url, headers=HEADERS, json=data)
        return r.ok
    except Exception as e:
        log(f"Erro ao marcar fila: {e}", "ERRO")
        return False

def processar_fila(company_id):
    """Processa jobs pendentes da fila de impressão (mesa/garçom)"""
    jobs = buscar_fila_impressao(company_id)
    if not jobs:
        return 0
    
    log(f"Encontrados {len(jobs)} job(s) na fila de impressão!", "FILA")
    for job in jobs:
        label = job.get('label', 'Impressão')
        log(f"Imprimindo: {label}...", "FILA")
        html = job.get('html_content', '')
        if html and imprimir_html(html, label.replace('#', '').replace(' ', '_')):
            if marcar_fila_impressa(job['id']):
                log(f"Job '{label}' impresso e marcado na fila!", "OK")
            else:
                log(f"Job '{label}' disparado, mas não foi marcado como impresso.", "AVISO")
        else:
            log(f"Falha ao imprimir job '{label}'", "ERRO")
    
    return len(jobs)

# ============================================
# LOOP PRINCIPAL
# ============================================
if __name__ == "__main__":
    print()
    print("=" * 50)
    print(f"  {STORE_NAME} - Impressão Automática {SCRIPT_VERSION}")
    print("=" * 50)
    print(f"  URL: {SUPABASE_URL}")
    print("=" * 50)
    print()
    
    # Usa slug preconfigurado quando existir; caso contrário, solicita ao usuário
    slug = (COMPANY_SLUG or "").strip()
    if slug:
        log(f"Usando slug preconfigurado: {slug}", "CONFIG")
    else:
        slug = input("Digite o SLUG da sua empresa (ex: avenida-lanches): ").strip()
    if not slug:
        print("Slug não informado. Encerrando.")
        exit(1)
    
    log(f"Buscando empresa: {slug}...", "INFO")
    company_id, company_name, company_address = buscar_empresa_por_slug(slug)
    
    if not company_id:
        print(f"Empresa '{slug}' não encontrada ou inativa. Verifique o slug.")
        exit(1)
    
    # Busca configuração de papel
    buscar_paper_size(company_id)
    
    print()
    print("=" * 50)
    log(f"Empresa encontrada: {company_name}", "OK")
    log(f"Company ID: {company_id}", "OK")
    log(f"Papel: {PAPER_SIZE}", "OK")
    print("=" * 50)
    print(f"  Intervalo: {CHECK_INTERVAL} segundos")
    print("  Pressione Ctrl+C para parar")
    print(f"  Log: {LOG_FILE}")
    print("=" * 50)
    print()
    
    # Atualiza nome da loja
    STORE_NAME = company_name
    
    # Mostra status inicial
    log("Iniciando monitoramento...", "START")
    mostrar_status(company_id)
    
    contador = 0
    try:
        while True:
            # 1. Pedidos do cardápio online
            pedidos = buscar_pedidos_nao_impressos(company_id)
            
            if pedidos:
                log(f"Encontrados {len(pedidos)} pedido(s) para imprimir!", "INFO")
                for pedido in pedidos:
                    processar_pedido(pedido, STORE_NAME)
                mostrar_status(company_id)
            
            # 2. Fila de impressão (garçom / mesa)
            fila_count = processar_fila(company_id)
            
            if not pedidos and fila_count == 0:
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
