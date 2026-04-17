"""
Comanda Tech - Impressão Automática de Pedidos (Windows)

COMO USAR:
1. Instale Python: https://python.org (marque "Add to PATH")
2. Abra o CMD e rode: pip install requests pywin32
3. Dê duplo clique neste arquivo OU rode: python auto_printer.py
"""

import requests
import time
import tempfile
import subprocess
import re
import os
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
PRINT_LAYOUT = "v1"  # Será carregado das configurações (v1 ou v2)
SCRIPT_VERSION = "v8.12"  # v2: separador pontilhado entre itens + compat item-name
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
# IDs que falharam na impressão — evita loop infinito
ids_com_falha = set()

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

def buscar_print_layout(company_id):
    """Busca o layout de impressão configurado para a empresa (v1 ou v2)"""
    global PRINT_LAYOUT
    try:
        url = f"{SUPABASE_URL}/rest/v1/store_settings"
        params = {
            "company_id": f"eq.{company_id}",
            "key": "eq.print_layout"
        }
        r = requests.get(url, headers=HEADERS, params=params)
        if r.ok and r.json():
            valor = r.json()[0].get('value', 'v1')
            PRINT_LAYOUT = valor if valor in ('v1', 'v2') else 'v1'
            log(f"Layout de impressão: {PRINT_LAYOUT}", "CONFIG")
        else:
            log(f"Usando layout padrão: {PRINT_LAYOUT}", "CONFIG")
    except Exception as e:
        log(f"Erro ao buscar print layout: {e}", "AVISO")

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
    """Busca pedidos não impressos de qualquer status imprimível"""
    STATUS_IMPRIMIVEIS = {"pending", "confirmed", "express", "waiter"}
    try:
        url = f"{SUPABASE_URL}/rest/v1/orders"
        params = {
            "company_id": f"eq.{company_id}",
            "printed": "eq.false",
            "order": "created_at.asc"
        }
        r = requests.get(url, headers=HEADERS, params=params)
        if r.ok:
            todos = r.json()
            return [p for p in todos if p.get("status", "") in STATUS_IMPRIMIVEIS]
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
    
    # Origem do pedido
    source = pedido.get('source', '')
    if source == 'express':
        origem_label = '⚡ PEDIDO EXPRESS'
    elif source == 'waiter':
        origem_label = '🍽️ PEDIDO GARÇOM'
    else:
        origem_label = '📱 CARDÁPIO ONLINE'
    
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
    total_itens = len(itens)
    for idx_item, item in enumerate(itens):
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

        # Parse extras: "Adicionais: a, b, c" -> lista de adicionais
        adicionais_list = []
        extras_resto = ''
        if extras:
            m = re.match(r'^Adicionais?:\s*(.+)$', extras, re.IGNORECASE)
            if m:
                adicionais_list = [s.strip() for s in m.group(1).split(',') if s.strip()]
            else:
                extras_resto = extras

        if PRINT_LAYOUT == 'v2':
            # V2: adicionais empilhados em negrito (uppercase, sem preço)
            if adicionais_list:
                items_html += '  <div class="additionals">\n'
                for ad in adicionais_list:
                    # Remove eventual " R$X.XX" do nome do adicional
                    ad_clean = re.sub(r'\s*R\$\s*[\d.,]+\s*$', '', ad).strip()
                    items_html += f'    <div class="add-line">+ {ad_clean.upper()}</div>\n'
                items_html += '  </div>\n'
            if extras_resto:
                items_html += f'  <div class="item-detail">+ {extras_resto}</div>\n'
            # V2: observações em texto invertido
            if item_notes:
                items_html += f'  <div class="obs-block"><span class="obs">{item_notes}</span></div>\n'
        else:
            # V1: comportamento original
            if extras:
                items_html += f'  <div class="item-detail">+ {extras}</div>\n'
            if item_notes:
                items_html += f'  <div class="item-notes">Obs: {item_notes}</div>\n'

        items_html += f'  <div class="item-detail">R$ {preco_str}</div>\n'
        items_html += f'</div>\n'
        # V2: separador pontilhado entre itens (não imprime depois do último)
        if PRINT_LAYOUT == 'v2' and idx_item < total_itens - 1:
            items_html += '<div class="item-sep">................................</div>\n'
    
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
        .origem {{ font-size: 9pt; font-weight: bold; margin: 0.5mm 0; }}
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
        /* V2: adicionais empilhados em negrito */
        .additionals {{ margin: 1mm 0 0 2mm; }}
        .add-line {{ font-size: 11pt; font-weight: 900; line-height: 1.4; word-break: break-word; text-transform: uppercase; }}
        /* V2: observações texto invertido (fundo preto, letras brancas) */
        .obs-block {{ margin: 1mm 0 0 2mm; }}
        .obs {{ display: inline-block; background: #000 !important; color: #fff !important; padding: 0.5mm 2mm; font-weight: bold; font-size: 10pt; -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
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
        <div class="origem">{origem_label}</div>
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
            return caminho
    return None

def html_para_texto(html):
    """Converte HTML do recibo para texto plano formatado para impressora térmica.
    No layout V2 marca adicionais com [ADD] e observações com [OBS] para o GDI
    renderizar com estilos diferentes (negrito real / fundo preto)."""
    is_80mm = PAPER_SIZE == '80mm'
    cols = 24 if is_80mm else 20
    divider = '-' * cols

    # 1. Remove blocos não-conteúdo
    text = re.sub(r'<style[^>]*>.*?</style>', '', html, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r'<head[^>]*>.*?</head>', '', text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r'<script[^>]*>.*?</script>', '', text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r'<!DOCTYPE[^>]*>', '', text, flags=re.IGNORECASE)
    text = re.sub(r'<html[^>]*>', '', text, flags=re.IGNORECASE)
    text = re.sub(r'</html>', '', text, flags=re.IGNORECASE)
    text = re.sub(r'<body[^>]*>', '', text, flags=re.IGNORECASE)
    text = re.sub(r'</body>', '', text, flags=re.IGNORECASE)

    # 1b. LAYOUT V2: marca blocos especiais antes de remover as tags
    def marcar_item_header(match):
        qty = re.sub(r'<[^>]+>', '', match.group(1)).strip()
        name = re.sub(r'<[^>]+>', '', match.group(2)).strip()
        if not qty and not name:
            return '\n'
        return f'\n[ITEM]{qty}|||{name}[/ITEM]\n'
    text = re.sub(
        r'<div\s+class="item-header"[^>]*>.*?<span\s+class="qty"[^>]*>(.*?)</span>.*?<span\s+class="name"[^>]*>(.*?)</span>.*?</div>',
        marcar_item_header,
        text,
        flags=re.DOTALL | re.IGNORECASE
    )

    # 1b'. Cabeçalho compacto vindo do recibo (formatar_recibo_html): "<div class="item-name">2x X-Tudo</div>"
    def marcar_item_name(match):
        conteudo = re.sub(r'<[^>]+>', '', match.group(1)).strip()
        m = re.match(r'^(\d+x)\s+(.+)$', conteudo)
        if m:
            return f'\n[ITEM]{m.group(1)}|||{m.group(2)}[/ITEM]\n'
        return f'\n[ITEM]|||{conteudo}[/ITEM]\n'
    text = re.sub(
        r'<div\s+class="item-name"[^>]*>(.*?)</div>',
        marcar_item_name,
        text,
        flags=re.DOTALL | re.IGNORECASE
    )

    # 1b''. Separador pontilhado entre itens
    text = re.sub(
        r'<div\s+class="item-sep"[^>]*>(.*?)</div>',
        lambda m: '\n[SEP]\n',
        text,
        flags=re.DOTALL | re.IGNORECASE
    )

    # 1c. LAYOUT V2: marca adicionais e observações com prefixos especiais
    # Adicional: <div class="add-line">>> texto</div>  ->  [ADD]texto[/ADD]
    def marcar_add(match):
        conteudo = re.sub(r'<[^>]+>', '', match.group(1)).strip()
        # remove prefixo >> ou + se houver
        conteudo = re.sub(r'^(&gt;&gt;|>>|\+)\s*', '', conteudo).strip()
        return f'\n[ADD]{conteudo}[/ADD]\n'
    text = re.sub(r'<div\s+class="add-line"[^>]*>(.*?)</div>', marcar_add, text, flags=re.DOTALL | re.IGNORECASE)

    # Observação: <div class="obs">...<span class="obs-text">TEXTO</span>...</div>  ->  [OBS]texto[/OBS]
    def marcar_obs(match):
        conteudo = re.sub(r'<[^>]+>', '', match.group(1)).strip()
        if not conteudo:
            return ''
        return f'\n[OBS]{conteudo}[/OBS]\n'
    text = re.sub(r'<div\s+class="obs"[^>]*>(.*?)</div>', marcar_obs, text, flags=re.DOTALL | re.IGNORECASE)

    # Nome do produto V2: fallback caso venha fora do item-header
    def marcar_name(match):
        conteudo = re.sub(r'<[^>]+>', '', match.group(1)).strip()
        return f'[NAME]{conteudo}[/NAME]'
    text = re.sub(r'<span\s+class="name"[^>]*>(.*?)</span>', marcar_name, text, flags=re.DOTALL | re.IGNORECASE)

    # 2. <hr> em divisórias
    text = re.sub(r'<hr[^>]*/?>', f'\n{divider}\n', text, flags=re.IGNORECASE)
    # 3. Quebras de linha por bloco
    text = re.sub(r'<br\s*/?>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'</(div|p|tr|li|h[1-6])>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'</(td|th)>', '  ', text, flags=re.IGNORECASE)
    # 4. Remove tags restantes
    text = re.sub(r'<[^>]+>', '', text)
    # 5. Entidades
    text = text.replace('&nbsp;', ' ').replace('&amp;', '&')
    text = text.replace('&lt;', '<').replace('&gt;', '>')
    text = text.replace('&quot;', '"').replace('&#39;', "'")
    # 6. Limpa espaços
    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r' *\n *', '\n', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def imprimir_html(html, order_number):
    """Imprime direto na impressora padrão via GDI (win32ui) — 100% silencioso, sem navegador"""
    try:
        import win32print
        import win32ui
        import win32con

        # Converte HTML para texto plano (agora sem CSS vazando)
        texto = html_para_texto(html)
        linhas = texto.split('\n')

        printer_name = win32print.GetDefaultPrinter()
        log(f"Impressora padrão: {printer_name}", "PRINT")

        # Cria Device Context para a impressora
        hDC = win32ui.CreateDC()
        hDC.CreatePrinterDC(printer_name)

        # Dimensões da página em pixels
        page_w = hDC.GetDeviceCaps(win32con.HORZRES)
        page_h = hDC.GetDeviceCaps(win32con.VERTRES)
        dpi_x = hDC.GetDeviceCaps(win32con.LOGPIXELSX)
        dpi_y = hDC.GetDeviceCaps(win32con.LOGPIXELSY)

        # Fonte GRANDE — máximo possível para 80mm (24 colunas) ou 58mm (20 colunas)
        is_80mm = PAPER_SIZE == '80mm'
        colunas = 24 if is_80mm else 20
        font_height = int(page_w / colunas * 2.0)
        margin_x = int(dpi_x * 0.04)  # ~1mm margem mínima
        margin_y = int(dpi_y * 0.04)

        font_normal = win32ui.CreateFont({
            'name': 'Courier New',
            'height': font_height,
            'weight': 900,  # padrão V1: tudo bold
        })
        font_regular = win32ui.CreateFont({
            'name': 'Courier New',
            'height': font_height,
            'weight': 400,  # peso normal (para nome do produto no V2)
        })
        font_bold_big = win32ui.CreateFont({
            'name': 'Courier New',
            'height': int(font_height * 1.05),
            'weight': 900,  # adicionais V2 — negrito forte
        })
        font_obs = win32ui.CreateFont({
            'name': 'Courier New',
            'height': font_height,
            'weight': 900,
        })
        hDC.SelectObject(font_normal)

        # Altura da linha
        tm = hDC.GetTextMetrics()
        line_h = tm['tmHeight'] + tm['tmExternalLeading'] + int(tm['tmHeight'] * 0.1)

        hDC.StartDoc(f"Pedido {order_number}")
        hDC.StartPage()

        y = margin_y

        def quebrar_linha(texto, largura):
            """Quebra texto em múltiplas linhas respeitando palavras (word-wrap)."""
            if len(texto) <= largura:
                return [texto]
            palavras = texto.split(' ')
            linhas_out = []
            atual = ''
            for palavra in palavras:
                if len(palavra) > largura:
                    if atual:
                        linhas_out.append(atual)
                        atual = ''
                    while len(palavra) > largura:
                        linhas_out.append(palavra[:largura])
                        palavra = palavra[largura:]
                    atual = palavra
                    continue
                if not atual:
                    atual = palavra
                elif len(atual) + 1 + len(palavra) <= largura:
                    atual += ' ' + palavra
                else:
                    linhas_out.append(atual)
                    atual = palavra
            if atual:
                linhas_out.append(atual)
            return linhas_out

        def quebrar_nome_com_recuo(texto, largura_primeira, largura_demais):
            """Quebra nome do produto respeitando o espaço após a quantidade."""
            palavras = texto.split(' ')
            linhas_out = []
            atual = ''
            largura_atual = max(1, largura_primeira)

            for palavra in palavras:
                while len(palavra) > largura_atual:
                    if atual:
                        linhas_out.append(atual)
                        atual = ''
                        largura_atual = max(1, largura_demais)
                    linhas_out.append(palavra[:largura_atual])
                    palavra = palavra[largura_atual:]
                    largura_atual = max(1, largura_demais)

                if not atual:
                    atual = palavra
                elif len(atual) + 1 + len(palavra) <= largura_atual:
                    atual += ' ' + palavra
                else:
                    linhas_out.append(atual)
                    atual = palavra
                    largura_atual = max(1, largura_demais)

            if atual:
                linhas_out.append(atual)

            return linhas_out or ['']

        is_v2 = (PRINT_LAYOUT == 'v2')

        for linha in linhas:
            stripped = linha.strip()
            if not stripped:
                y += int(line_h * 0.5)
                continue

            if set(stripped) <= {'-', '=', '_'} and len(stripped) > 3:
                hDC.SelectObject(font_normal)
                hDC.SetTextColor(0x000000)
                hDC.SetBkMode(win32con.TRANSPARENT)
                hDC.TextOut(margin_x, y, '-' * colunas)
                y += line_h
                continue

            # Detecta marcadores V2
            m_item = re.match(r'^\[ITEM\](.*?)\|\|\|(.*?)\[/ITEM\]$', stripped)
            m_add = re.match(r'^\[ADD\](.*)\[/ADD\]$', stripped)
            m_obs = re.match(r'^\[OBS\](.*)\[/OBS\]$', stripped)
            m_name = re.match(r'^\[NAME\](.*)\[/NAME\]$', stripped)
            m_sep = (stripped == '[SEP]')

            if is_v2 and m_sep:
                hDC.SelectObject(font_normal)
                hDC.SetTextColor(0x000000)
                hDC.SetBkMode(win32con.TRANSPARENT)
                y += int(line_h * 0.2)
                hDC.TextOut(margin_x, y, '.' * colunas)
                y += line_h
                y += int(line_h * 0.2)
                continue

            if is_v2 and m_item:
                qty = m_item.group(1).strip()
                nome = m_item.group(2).strip()

                qty_text = qty or ''
                gap_px = tm['tmAveCharWidth']
                qty_width_px = hDC.GetTextExtent(qty_text + (' ' if qty_text else ''))[0] if qty_text else 0
                nome_x = margin_x + qty_width_px + (gap_px if qty_text else 0)

                qty_cols = len(qty_text) + (1 if qty_text else 0)
                nome_largura_primeira = max(1, colunas - qty_cols - (1 if qty_text else 0))
                nome_linhas = quebrar_nome_com_recuo(nome, nome_largura_primeira, colunas)

                if qty_text:
                    hDC.SelectObject(font_normal)
                    hDC.SetTextColor(0x000000)
                    hDC.SetBkMode(win32con.TRANSPARENT)
                    hDC.TextOut(margin_x, y, qty_text)

                for idx, sub in enumerate(nome_linhas):
                    hDC.SelectObject(font_regular)
                    hDC.SetTextColor(0x000000)
                    hDC.SetBkMode(win32con.TRANSPARENT)
                    current_x = nome_x if idx == 0 and qty_text else margin_x
                    hDC.TextOut(current_x, y, sub)
                    y += line_h

                hDC.SelectObject(font_normal)
                continue

            if is_v2 and m_add:
                # Adicional: negrito forte com prefixo ">>"
                texto_add = '>> ' + m_add.group(1).strip().upper()
                hDC.SelectObject(font_bold_big)
                hDC.SetTextColor(0x000000)
                hDC.SetBkMode(win32con.TRANSPARENT)
                for sub in quebrar_linha(texto_add, colunas):
                    hDC.TextOut(margin_x, y, sub)
                    y += line_h
                hDC.SelectObject(font_normal)
                continue

            if is_v2 and m_obs:
                # Observação: fundo PRETO + letras BRANCAS (texto invertido real)
                conteudo_obs = m_obs.group(1).strip().upper()
                texto_obs = f'OBSERVAÇÕES: {conteudo_obs}'
                hDC.SelectObject(font_obs)
                sublinhas = quebrar_linha(texto_obs, colunas - 2)
                # desenha um retângulo preto cobrindo todas as linhas
                pad_x = int(dpi_x * 0.02)
                pad_y = int(dpi_y * 0.015)
                rect_top = y - pad_y
                rect_h = line_h * len(sublinhas) + pad_y * 2
                rect_right = margin_x + int(colunas * tm['tmAveCharWidth']) + pad_x * 2
                # Cria pincel e caneta pretos
                try:
                    import win32gui
                    brush = win32gui.CreateSolidBrush(0x000000)
                    pen = win32gui.CreatePen(win32con.PS_SOLID, 1, 0x000000)
                    old_brush = win32gui.SelectObject(hDC.GetSafeHdc(), brush)
                    old_pen = win32gui.SelectObject(hDC.GetSafeHdc(), pen)
                    win32gui.Rectangle(hDC.GetSafeHdc(), margin_x, rect_top, rect_right, rect_top + rect_h)
                    win32gui.SelectObject(hDC.GetSafeHdc(), old_brush)
                    win32gui.SelectObject(hDC.GetSafeHdc(), old_pen)
                    win32gui.DeleteObject(brush)
                    win32gui.DeleteObject(pen)
                except Exception as ex:
                    log(f"Falha ao desenhar fundo preto: {ex}", "AVISO")
                # Texto branco em cima
                hDC.SetTextColor(0xFFFFFF)
                hDC.SetBkMode(win32con.TRANSPARENT)
                for sub in sublinhas:
                    hDC.TextOut(margin_x + pad_x, y, sub)
                    y += line_h
                # Volta padrão
                hDC.SetTextColor(0x000000)
                hDC.SelectObject(font_normal)
                y += int(line_h * 0.3)
                continue

            if is_v2 and m_name:
                # Nome do produto V2: peso REGULAR (sem negrito)
                texto_nome = m_name.group(1).strip()
                hDC.SelectObject(font_regular)
                hDC.SetTextColor(0x000000)
                hDC.SetBkMode(win32con.TRANSPARENT)
                for sub in quebrar_linha(texto_nome, colunas):
                    hDC.TextOut(margin_x, y, sub)
                    y += line_h
                hDC.SelectObject(font_normal)
                continue

            # Linha normal: remove marcadores residuais e imprime
            stripped_clean = re.sub(r'\[/?(ADD|OBS|NAME|ITEM|SEP)\]', '', stripped).replace('|||', ' ').strip()
            if not stripped_clean:
                continue
            hDC.SelectObject(font_normal)
            hDC.SetTextColor(0x000000)
            hDC.SetBkMode(win32con.TRANSPARENT)
            for sublinha in quebrar_linha(stripped_clean, colunas):
                hDC.TextOut(margin_x, y, sublinha)
                y += line_h

        # Espaço para corte: 6 linhas em branco ao final do pedido
        y += line_h * 6

        hDC.EndPage()
        hDC.EndDoc()
        hDC.DeleteDC()

        log("Enviado direto para impressora via GDI!", "PRINT")
        return True

    except ImportError as ie:
        log(f"pywin32 não instalado! Rode: pip install pywin32  ({ie})", "ERRO")
        return False
    except Exception as e:
        log(f"Falha na impressão GDI: {e}", "ERRO")
        return False

def diagnosticar_impressora():
    """Verifica se a impressora padrão está configurada e acessível"""
    log("=== DIAGNÓSTICO DE IMPRESSÃO ===", "DIAG")
    try:
        resultado = subprocess.run(
            ['wmic', 'printer', 'where', 'default=true', 'get', 'name'],
            capture_output=True, text=True, timeout=5
        )
        log(f"Impressora padrão: {resultado.stdout.strip()}", "DIAG")
    except Exception as e:
        log(f"Erro ao verificar impressora: {e}", "DIAG")
    
    browser = encontrar_chrome()
    if browser:
        log(f"Navegador encontrado: {browser}", "DIAG")
    else:
        log("ATENÇÃO: Chrome/Edge não encontrado! Impressão automática não funcionará.", "ERRO")
    
    # Verifica pywin32
    try:
        import win32print
        log(f"pywin32 instalado ✓", "DIAG")
    except ImportError:
        log("pywin32 NÃO instalado. Rode: pip install pywin32", "AVISO")
    
    try:
        resultado = subprocess.run(
            ['wmic', 'printer', 'get', 'name,portname'],
            capture_output=True, text=True, timeout=5
        )
        log(f"Impressoras disponíveis:\n{resultado.stdout.strip()}", "DIAG")
    except Exception as e:
        log(f"Erro ao listar impressoras: {e}", "DIAG")
    log("=== FIM DO DIAGNÓSTICO ===", "DIAG")

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
    
    # Imprime silenciosamente
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
    os.system("title Comanda Tech - Impressao Automatica")
    print()
    print("=" * 50)
    print(f"  {STORE_NAME} - Impressão Automática")
    print(f"  Versão: {SCRIPT_VERSION}")
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
    
    # Busca configuração de papel e layout
    buscar_paper_size(company_id)
    buscar_print_layout(company_id)
    
    # Diagnóstico de impressora e navegador
    diagnosticar_impressora()
    
    print()
    print("=" * 50)
    log(f"Empresa encontrada: {company_name}", "OK")
    log(f"Company ID: {company_id}", "OK")
    log(f"Papel: {PAPER_SIZE}", "OK")
    log(f"Versão do script: {SCRIPT_VERSION}", "OK")
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
            # 1. Pedidos do cardápio online / express / garçom
            pedidos = buscar_pedidos_nao_impressos(company_id)
            # Filtra pedidos que já falharam nesta sessão (evita loop infinito)
            pedidos = [p for p in pedidos if p.get('id') not in ids_com_falha]
            
            if pedidos:
                log(f"Encontrados {len(pedidos)} pedido(s) para imprimir!", "INFO")
                for pedido in pedidos:
                    ok = processar_pedido(pedido, STORE_NAME)
                    if not ok:
                        ids_com_falha.add(pedido.get('id'))
                        log(f"Pedido {pedido.get('order_code','')} adicionado à lista de falhas (não tentará novamente)", "AVISO")
                mostrar_status(company_id)
            
            # 2. Fila de impressão (garçom / mesa - print_queue)
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
