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

# Ajuste anti-corte de bordas na impressão automática (GDI).
# Aumenta margem horizontal e reduz colunas para evitar que caracteres mais largos
# que a média (M, W, %, acentos) sejam cortados pela cabeça térmica.
# Liberado para TODAS as lojas após validação na Lancheria da i9.
SAFE_MARGIN_COMPANY_IDS = None  # None = aplicar para todas as lojas
COMPANY_SLUG = ""  # Preencha aqui para não precisar digitar (ex: "bon-appetit")
PAPER_SIZE = "58mm"  # Será carregado das configurações
PRINT_LAYOUT = "v1"  # Será carregado das configurações (v1, v2 ou v3)
SCRIPT_VERSION = "v8.38"  # libera ajustes V2 v8.32-v8.37 para todas as lojas com layout V2
I9_COMPANY_ID = '8c9e7a0e-dbb6-49b9-8344-c23155a71164'
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
    """Busca empresa pelo slug e retorna id, nome, endereço e dict completo (V3)."""
    try:
        url = f"{SUPABASE_URL}/rest/v1/companies"
        params = {"slug": f"eq.{slug}", "active": "eq.true"}
        r = requests.get(url, headers=HEADERS, params=params)
        if r.ok and r.json():
            empresa = r.json()[0]
            return empresa.get('id'), empresa.get('name'), empresa.get('address'), empresa
        else:
            log(f"Empresa não encontrada: {slug}", "ERRO")
            return None, None, None, None
    except Exception as e:
        log(f"Exceção ao buscar empresa: {e}", "ERRO")
        return None, None, None, None

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
    """Busca o layout de impressão configurado para a empresa (v1, v2 ou v3)"""
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
            PRINT_LAYOUT = valor if valor in ('v1', 'v2', 'v3') else 'v1'
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
    
    # Origem do pedido (detecta marcador [EXPRESS] em notes como fallback)
    source = pedido.get('source', '')
    notes_raw = (pedido.get('notes') or '')
    is_express_note = '[EXPRESS]' in notes_raw
    if source == 'express' or is_express_note:
        origem_label = '⚡ PEDIDO EXPRESS'
    elif source == 'waiter':
        origem_label = '🍽️ PEDIDO GARÇOM'
    else:
        origem_label = '📱 CARDÁPIO ONLINE'
    
    # Número do pedido — prioriza short_code (D-001/R-001/M-001/B-001) quando disponível
    order_num = pedido.get('short_code') or pedido.get('order_code') or pedido.get('daily_number', '?')
    
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
    notes = pedido.get('notes', '') or ''
    # Remove marcador interno [EXPRESS] (usado apenas para detectar origem)
    notes = re.sub(r'\[EXPRESS\]\s*\|\s*', '', notes).strip()
    notes = re.sub(r'\s*\|\s*\[EXPRESS\]', '', notes).strip()
    notes = notes.replace('[EXPRESS]', '').strip()
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

        # Extrai marcador [DESC]...[/DESC] de notes — ativado apenas quando a loja
        # injeta esse marcador no item. Para outras lojas, item_notes permanece intacto.
        item_description = ''
        if item_notes:
            desc_match = re.search(r'\[DESC\](.*?)\[/DESC\]', item_notes, flags=re.DOTALL)
            if desc_match:
                item_description = desc_match.group(1).strip()
                # Remove o marcador (e separador residual " | ") do notes original
                item_notes = re.sub(r'\s*\|\s*\[DESC\].*?\[/DESC\]\s*', '', item_notes, flags=re.DOTALL)
                item_notes = re.sub(r'\[DESC\].*?\[/DESC\]\s*\|?\s*', '', item_notes, flags=re.DOTALL).strip()

        preco_str = f"{preco_total:.2f}".replace('.', ',')

        items_html += f'<div class="item">\n'
        items_html += f'  <div class="item-name">{qtd}x {main_name}</div>\n'
        # NOTA: a descrição do produto NÃO é renderizada no recibo.
        # Ela aparece apenas na comanda de produção (gerada pelo frontend) quando
        # a categoria tem "Imprimir descrição" ativo. O marcador [DESC] já foi
        # extraído acima e removido de item_notes para evitar vazamento.

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
            # V2: extrai adicionais. I9 v8.32+: preserva grupos e emite
            # [ADDGROUP_LABEL] quando há 2+ grupos (■ sublinhado, sem CAPS).
            # Demais lojas: comportamento legado (lista plana com "+ ITEM").
            I9_COMPANY_ID_V2 = '8c9e7a0e-dbb6-49b9-8344-c23155a71164'
            is_i9_v2 = COMPANY_ID == I9_COMPANY_ID_V2
            grupos_estruturados = []  # [(nome, [itens])]
            v2_adicionais = []
            if adicionais_list:
                v2_adicionais.extend(adicionais_list)
                if is_i9_v2 and adicionais_list:
                    grupos_estruturados.append(('Adicionais', list(adicionais_list)))
            if extras_resto:
                grupos = [g.strip() for g in extras_resto.split('|') if g.strip()]
                for grupo in grupos:
                    if ':' in grupo:
                        nome_g, after = grupo.split(':', 1)
                        partes = [p.strip() for p in after.split(',') if p.strip()]
                        v2_adicionais.extend(partes)
                        if is_i9_v2 and partes:
                            grupos_estruturados.append((nome_g.strip(), partes))
                    else:
                        partes = [p.strip() for p in grupo.split(',') if p.strip()]
                        v2_adicionais.extend(partes)
                        if is_i9_v2 and partes:
                            grupos_estruturados.append(('Adicionais', partes))

            if is_i9_v2 and grupos_estruturados:
                items_html += '  <div class="additionals">\n'
                single = len(grupos_estruturados) == 1
                for nome_g, itens_g in grupos_estruturados:
                    if not single:
                        items_html += f'    <div class="add-group-label">[ADDGROUP_LABEL]{nome_g}[/ADDGROUP_LABEL]</div>\n'
                    for ad in itens_g:
                        m_price = re.search(r'\s*R\$\s*([\d.,]+)\s*$', ad)
                        ad_clean = re.sub(r'\s*R\$\s*[\d.,]+\s*$', '', ad).strip()
                        if ad_clean:
                            price_suffix = f'  R$ {m_price.group(1)}' if m_price else ''
                            items_html += f'    <div class="add-line">+ {ad_clean.upper()}{price_suffix}</div>\n'
                items_html += '  </div>\n'
            elif v2_adicionais:
                items_html += '  <div class="additionals">\n'
                for ad in v2_adicionais:
                    m_price = re.search(r'\s*R\$\s*([\d.,]+)\s*$', ad)
                    ad_clean = re.sub(r'\s*R\$\s*[\d.,]+\s*$', '', ad).strip()
                    if ad_clean:
                        price_suffix = f'  R$ {m_price.group(1)}' if m_price else ''
                        items_html += f'    <div class="add-line">+ {ad_clean.upper()}{price_suffix}</div>\n'
                items_html += '  </div>\n'

            # V2: observações em texto invertido (apenas o conteúdo — o GDI adiciona o rótulo "OBSERVAÇÕES:").
            # IMPORTANTE: precisa ser <div class="obs"> pra casar com a regex `marcar_obs`
            # que converte em [OBS]...[/OBS] e o GDI renderiza com fundo preto/texto branco.
            if item_notes:
                items_html += f'  <div class="obs"><span class="obs-text">{item_notes}</span></div>\n'
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
    # I9 v8.32+: envolve endereço com [ENDERECO] pro GDI renderizar invertido.
    I9_COMPANY_ID_END = '8c9e7a0e-dbb6-49b9-8344-c23155a71164'
    if delivery_address:
        if COMPANY_ID == I9_COMPANY_ID_END:
            delivery_section = f'''
            <div class="delivery-badge">ENTREGA</div>
            <div class="section"><p>[ENDERECO]{delivery_address}[/ENDERECO]</p></div>
        '''
        else:
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
    
    # Notes section — remove dados já exibidos no cabeçalho (Pagamento/Troco/PIX)
    notes_html = ''
    if notes:
        clean_notes = notes
        # Remove "Pagamento: X (Chave PIX: ...) (Troco para R$ ...)" e variações
        clean_notes = re.sub(r'Pagamento:\s*[^|]+(\||$)', r'\1', clean_notes, flags=re.IGNORECASE)
        # Remove tokens residuais
        clean_notes = re.sub(r'Troco para R\$\s*[^\)|]+\)?', '', clean_notes, flags=re.IGNORECASE)
        clean_notes = re.sub(r'Chave PIX:\s*[^\)]+\)?', '', clean_notes, flags=re.IGNORECASE)
        # Remove tipo de entrega já exibido como badge (Retirada/Entrega...)
        clean_notes = re.sub(r'\b(Retirada(\s+no\s+local)?|Entrega(\s+em\s+domic[ií]lio)?)\b(\s*\(R\$[^\)]+\))?', '', clean_notes, flags=re.IGNORECASE)
        # Limpa separadores e espaços sobrando
        clean_notes = re.sub(r'\s*\|\s*', ' | ', clean_notes)
        clean_notes = re.sub(r'^\s*[\|\-,;:\s]+|[\|\-,;:\s]+$', '', clean_notes).strip()
        if clean_notes:
            notes_html = f'<hr class="divider"><p class="notes"><strong>Obs:</strong> {clean_notes}</p>'
    
    # Phone section
    phone_html = ''
    if customer_phone:
        phone_html = f'<p><span class="label">Tel:</span> {customer_phone}</p>'

    # Lancheria I9: "Pronto até" no cabeçalho do recibo (V1/V2).
    # Fórmula: criação + (máximo do estimated_wait_time − 10 min). Fallback 30 min.
    # Isolado por company_id — outras lojas não são afetadas.
    I9_COMPANY_ID = '8c9e7a0e-dbb6-49b9-8344-c23155a71164'
    pronto_ate_html = ''
    if pedido.get('company_id') == I9_COMPANY_ID:
        wait_min_i9 = 30
        try:
            url_si9 = f"{SUPABASE_URL}/rest/v1/store_settings"
            params_si9 = {"company_id": f"eq.{pedido.get('company_id')}", "key": "eq.estimated_wait_time"}
            rsi9 = requests.get(url_si9, headers=HEADERS, params=params_si9, timeout=3)
            if rsi9.ok and rsi9.json():
                val_i9 = rsi9.json()[0].get('value', '')
                nums_i9 = re.findall(r'\d+', val_i9 or '')
                if nums_i9:
                    wait_min_i9 = max(int(n) for n in nums_i9)
        except Exception:
            pass
        try:
            dt_utc_i9 = datetime.fromisoformat(pedido['created_at'].replace('Z', '+00:00'))
            dt_sp_i9 = dt_utc_i9.astimezone(timezone(timedelta(hours=-3)))
            offset_i9 = max(1, wait_min_i9 - 10)
            ready_i9 = dt_sp_i9 + timedelta(minutes=offset_i9)
            pronto_ate_html = f'<div class="date" style="font-size:11pt;font-weight:bold;text-transform:uppercase;margin-top:1mm;">Pronto até: {ready_i9.strftime("%H:%M")}</div>'
        except Exception:
            pass
    
    # v8.35: Modo compacto (i9) — reduz paddings/margins SEM mexer no tamanho da fonte.
    # Rollout isolado por company_id; demais lojas mantêm o comportamento da v8.34.
    _i9_compact = (pedido.get('company_id') == I9_COMPANY_ID)
    _body_pad     = '1mm'      if _i9_compact else '2mm'
    _body_lh      = '1.15'     if _i9_compact else '1.3'
    _item_margin  = '0.5mm 0'  if _i9_compact else '1.5mm 0'
    _add_lh       = '1.15'     if _i9_compact else '1.4'
    _divider_mg   = '0.8mm 0'  if _i9_compact else '2mm 0'

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
            padding: {_body_pad};
            line-height: {_body_lh};
            -webkit-print-color-adjust: exact;
        }}
        .center {{ text-align: center; }}
        .header {{ text-align: center; margin-bottom: 2mm; }}
        .store-name {{ font-size: 12pt; font-weight: bold; }}
        .order-num {{ font-size: 16pt; font-weight: bold; margin: 1mm 0; }}
        .origem {{ font-size: 9pt; font-weight: bold; margin: 0.5mm 0; }}
        .date {{ font-size: 8pt; }}
        .divider {{ border: none; border-top: 1px dashed #000; margin: {_divider_mg}; }}
        .label {{ font-size: 9pt; font-weight: bold; }}
        .value {{ font-size: 10pt; font-weight: bold; }}
        .section {{ margin: 1mm 0; }}
        .section p {{ margin: 0.5mm 0; font-size: 10pt; }}
        .item {{ margin: {_item_margin}; }}
        .item-name {{ font-size: 11pt; font-weight: bold; text-transform: uppercase; }}
        .item-detail {{ font-size: 9pt; margin-left: 2mm; }}
        .item-notes {{ font-size: 9pt; font-style: italic; margin-left: 2mm; }}
        /* V2: adicionais empilhados em negrito */
        .additionals {{ margin: 1mm 0 0 2mm; }}
        .add-line {{ font-size: 11pt; font-weight: 900; line-height: {_add_lh}; word-break: break-word; text-transform: uppercase; }}
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
    <!--BOX_START-->
    <div class="header">
        <div class="store-name">{store_name.upper()}</div>
        <div class="order-num">PEDIDO #{order_num}</div>
        <div class="origem">{origem_label}</div>
        <div class="date">{formatted_date}</div>
        {pronto_ate_html}
    </div>
    <hr class="divider">
    <div class="section">
        <p><span class="label">Cliente:</span> {customer_name}</p>
        {phone_html}
        {payment_html}
    </div>
    <!--BOX_END-->
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

def formatar_recibo_html_v3(pedido, itens, store_name="Comanda Tech", store_info=None):
    """Recibo V3 — replica fielmente o layout de impressão térmica do Agilize.
    Estrutura: cabeçalho da loja → PED #xxx → cliente/endereço → faixa de modalidade
    → tabela REF/DESCRICAO/VALOR com adicionais entre colchetes → totais → pagamento
    → COD/criação/impressão → PREVISTO → app/contato. NÃO altera V1/V2."""
    store_info = store_info or {}
    paper_size = PAPER_SIZE
    cols = 42 if paper_size == '80mm' else 32

    # --- Cabeçalho da loja ---
    loja_nome = (store_info.get('name') or store_name or '').strip()
    rua = (store_info.get('address_street') or '').strip()
    num = (store_info.get('address_number') or '').strip()
    compl = (store_info.get('address_complement') or '').strip()
    bairro_l = (store_info.get('address_neighborhood') or '').strip()
    cidade = (store_info.get('address_city') or '').strip()
    uf = (store_info.get('address_state') or '').strip()
    cnpj = (store_info.get('cnpj') or '').strip()
    end_partes = []
    if rua:
        ln = rua + (f", {num}" if num else '')
        if compl:
            ln += f"/{compl}"
        end_partes.append(ln)
    cidade_linha = ' - '.join([p for p in [bairro_l, cidade] if p])
    if cidade_linha and uf:
        cidade_linha += f" - {uf}"
    elif uf:
        cidade_linha = uf
    if cidade_linha:
        end_partes.append(cidade_linha)
    if cnpj:
        end_partes.append(f"CNPJ: {cnpj}")
    endereco_html = '<br/>'.join(end_partes)

    # --- Identificação do pedido ---
    order_num = pedido.get('short_code') or pedido.get('order_code') or pedido.get('daily_number', '?')
    order_code = pedido.get('order_code', '') or ''
    cod_curto = (order_code[:7] if order_code else '').lower()
    try:
        dt_utc = datetime.fromisoformat(pedido['created_at'].replace('Z', '+00:00'))
        dt_sp = dt_utc.astimezone(timezone(timedelta(hours=-3)))
        criado_em = dt_sp.strftime('%d/%m/%Y %H:%M:%S')
    except Exception:
        criado_em = pedido.get('created_at', '')[:19]
    impresso_em = datetime.now(timezone(timedelta(hours=-3))).strftime('%d/%m/%Y %H:%M:%S')

    # --- Cliente ---
    customer_name = (pedido.get('customer_name') or '').strip()
    customer_phone = (pedido.get('customer_phone') or '').strip()
    delivery_address = (pedido.get('delivery_address') or '').strip()

    # Parse endereço do cliente: tenta separar "Rua, num/compl - Cidade - UF | Bairro: X | Ref: Y"
    addr_lines = []
    bairro_cliente = ''
    referencia = ''
    if delivery_address:
        addr_raw = delivery_address
        m_bairro = re.search(r'Bairro:\s*([^|]+)', addr_raw, re.IGNORECASE)
        if m_bairro:
            bairro_cliente = m_bairro.group(1).strip()
            addr_raw = re.sub(r'\s*\|\s*Bairro:\s*[^|]+', '', addr_raw, flags=re.IGNORECASE)
        m_ref = re.search(r'(Refer[eê]ncia|Ref):\s*([^|]+)', addr_raw, re.IGNORECASE)
        if m_ref:
            referencia = m_ref.group(2).strip()
            addr_raw = re.sub(r'\s*\|\s*(Refer[eê]ncia|Ref):\s*[^|]+', '', addr_raw, flags=re.IGNORECASE)
        # quebra endereço em até 2 linhas (rua,num/compl) e (cidade - uf)
        addr_raw = addr_raw.strip().rstrip('|').strip()
        addr_lines = [s.strip() for s in addr_raw.split(' - ') if s.strip()]

    # --- Modalidade (faixa ##### TELE ENTREGA / MOTOBOY #####) ---
    notes_raw = (pedido.get('notes') or '')
    is_express = (pedido.get('source') == 'express') or ('[EXPRESS]' in notes_raw)
    is_waiter = pedido.get('source') == 'waiter'
    if delivery_address:
        modalidade = 'TELE ENTREGA / MOTOBOY'
    elif is_waiter:
        modalidade = 'MESA'
    elif is_express:
        modalidade = 'BALCAO'
    else:
        modalidade = 'RETIRADA NO LOCAL'
    faixa_hash = '#' * cols
    centered = modalidade.center(cols - 2, ' ')
    faixa_mid = f"#{centered}#"

    # --- Itens (REF | DESCRICAO | VALOR) ---
    subtotal = 0.0
    rows_html = ''
    for it in itens:
        qtd = int(it.get('quantity', 1))
        nome = (it.get('name') or 'Item').strip()
        preco_unit = float(it.get('price', 0))
        sub = preco_unit * qtd
        subtotal += sub

        # separa nome principal e adicionais do formato "Nome (Adicionais: A, B | Grupo: X, Y)"
        main_name = nome
        adicionais_lines = []
        if '(' in nome and nome.endswith(')'):
            idx = nome.index('(')
            main_name = nome[:idx].strip()
            extras = nome[idx + 1:-1].strip()
            # grupos separados por "|"
            grupos = [g.strip() for g in extras.split('|') if g.strip()]
            for grupo in grupos:
                if ':' in grupo:
                    _, after = grupo.split(':', 1)
                    partes = [p.strip() for p in after.split(',') if p.strip()]
                else:
                    partes = [p.strip() for p in grupo.split(',') if p.strip()]
                for p in partes:
                    # remove preços tipo " R$ 2,00" para listar limpo
                    p_clean = re.sub(r'\s*R\$\s*[\d.,]+\s*$', '', p).strip()
                    if p_clean:
                        adicionais_lines.append(p_clean)

        unit_str = f"{preco_unit:.2f}".replace('.', ',')
        sub_str = f"{sub:.2f}".replace('.', ',')

        item_block = f'<div class="ref-row"><b>{main_name.upper()} R$ {unit_str}</b></div>'
        for idx_ad, ad in enumerate(adicionais_lines, start=1):
            item_block += f'<div class="ad-line">[{idx_ad}] {ad}</div>'
        item_notes = (it.get('notes') or '').strip()
        if item_notes:
            # remove marcador [DESC]...[/DESC]
            item_notes = re.sub(r'\[DESC\].*?\[/DESC\]', '', item_notes, flags=re.DOTALL).strip()
            if item_notes:
                item_block += f'<div class="ad-line">Obs: {item_notes}</div>'
        item_block += (
            f'<div class="line-total">'
            f'<span>{qtd} X R$ {unit_str} =</span>'
            f'<span>R$ {sub_str}</span>'
            f'</div>'
        )
        rows_html += f'<div class="item-block">{item_block}</div>'

    total = float(pedido.get('total', 0))
    delivery_fee = total - subtotal if total > subtotal else 0.0
    subtotal_str = f"{subtotal:.2f}".replace('.', ',')
    total_str = f"{total:.2f}".replace('.', ',')

    # --- Pagamento (parse do notes) ---
    pagamento_label = ''
    troco_html = ''
    pago_html = ''
    if notes_raw:
        m_pag = re.search(r'Pagamento:\s*([^(|]+)', notes_raw, re.IGNORECASE)
        m_troco = re.search(r'Troco para R\$\s*([\d.,]+)', notes_raw, re.IGNORECASE)
        if m_pag:
            pagamento_label = m_pag.group(1).strip()
        if m_troco:
            try:
                valor_recebido = float(m_troco.group(1).replace('.', '').replace(',', '.'))
                troco_valor = max(0.0, valor_recebido - total)
                pago_html = (
                    f'<div class="pag-line"><span></span>'
                    f'<span>R$ {valor_recebido:.2f}</span></div>'
                ).replace('.', ',')
                troco_html = (
                    f'<div class="pag-line"><b>TROCO</b>'
                    f'<span>R$ {troco_valor:.2f}</span></div>'
                ).replace('.', ',')
            except Exception:
                pass

    pag_block = ''
    if pagamento_label or pago_html:
        pag_block = '<hr class="sep"/>'
        pag_block += f'<div class="pag-line"><b>PAGAMENTO:</b><span></span></div>'
        if pagamento_label:
            pag_block += f'<div class="pag-line"><span>{pagamento_label} -</span>{pago_html or "<span></span>"}</div>'
        if troco_html:
            pag_block += troco_html

    # --- PREVISTO (estimated_wait_time se houver) ---
    previsto_html = ''
    wait_min = 30
    try:
        # Lê store_settings estimated_wait_time
        url_s = f"{SUPABASE_URL}/rest/v1/store_settings"
        params_s = {"company_id": f"eq.{pedido.get('company_id')}", "key": "eq.estimated_wait_time"}
        rs = requests.get(url_s, headers=HEADERS, params=params_s, timeout=3)
        if rs.ok and rs.json():
            val = rs.json()[0].get('value', '')
            nums = re.findall(r'\d+', val or '')
            if nums:
                wait_min = max(int(n) for n in nums)
    except Exception:
        pass
    try:
        dt_utc2 = datetime.fromisoformat(pedido['created_at'].replace('Z', '+00:00'))
        dt_sp2 = dt_utc2.astimezone(timezone(timedelta(hours=-3)))
        prev_ini = dt_sp2 + timedelta(minutes=max(0, wait_min - 15))
        prev_fim = dt_sp2 + timedelta(minutes=wait_min)
        previsto_html = (
            f'<div class="previsto">PREVISTO = '
            f'{prev_ini.strftime("%H:%M")}-{prev_fim.strftime("%H:%M")}</div>'
        )
    except Exception:
        pass

    # --- Cliente / endereço blocks ---
    addr_html = ''
    if delivery_address:
        addr_html += '<div class="cli-line">'
        addr_html += '<br/>'.join(addr_lines) if addr_lines else delivery_address
        addr_html += '</div>'
        if bairro_cliente:
            addr_html += f'<div class="cli-line"><b>Bairro:</b> {bairro_cliente}</div>'
        if referencia:
            addr_html += f'<div class="cli-line"><b>Ponto de referencia:</b> {referencia}</div>'

    # --- Header reimpressão (mantém comportamento Agilize) ---
    reimpresso_faixa = ''
    if pedido.get('printed_at'):
        try:
            dtp = datetime.fromisoformat(pedido['printed_at'].replace('Z', '+00:00')).astimezone(timezone(timedelta(hours=-3)))
            reimpresso_faixa = f'<div class="reimp">XXXXXX REIMPRESSO {dtp.strftime("%d/%m %H:%M")} XXXXXX</div>'
        except Exception:
            pass

    return f'''<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Pedido #{order_num}</title>
<style>
@page {{ margin: 0; size: {paper_size} auto; }}
* {{ box-sizing: border-box; margin:0; padding:0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
body {{
  width:{paper_size}; max-width:{paper_size};
  font-family:'Lucida Console','Consolas','Courier New',monospace;
  padding:2mm 2mm; font-size:9pt; line-height:1.15; color:#000;
}}
.reimp {{ text-align:center; font-size:8pt; letter-spacing:1px; margin-bottom:1mm; }}
.head {{ text-align:center; font-size:8.5pt; line-height:1.2; }}
.head .nome {{ font-weight:bold; font-size:9pt; }}
.ped {{ text-align:center; font-weight:bold; font-size:14pt; margin:2mm 0 1mm; letter-spacing:2px; }}
.sep {{ border:0; border-top:1px dashed #000; margin:1.5mm 0; }}
.cli-line {{ font-size:9pt; margin:0.5mm 0; }}
.cli-line b {{ font-weight:bold; }}
.modalidade {{ font-family:'Courier New',monospace; font-size:8pt; text-align:center; margin:1.5mm 0; line-height:1.1; letter-spacing:0; word-break:break-all; white-space:pre; font-weight:bold; }}
.ref-head {{ display:flex; justify-content:space-between; font-size:8.5pt; border-bottom:1px solid #000; padding-bottom:0.5mm; margin-bottom:1mm; font-weight:bold; }}
.item-block {{ margin:1mm 0; }}
.ref-row {{ font-size:9.5pt; font-weight:bold; }}
.ad-line {{ font-size:8.5pt; padding-left:3mm; }}
.line-total {{ display:flex; justify-content:flex-end; gap:3mm; font-size:8.5pt; margin-top:0.5mm; }}
.totais {{ font-size:9pt; }}
.tot-line {{ display:flex; justify-content:space-between; padding:0.3mm 0; }}
.tot-line.bold {{ font-weight:bold; font-size:11pt; }}
.pag-line {{ display:flex; justify-content:space-between; font-size:9pt; padding:0.3mm 0; }}
.previsto {{ text-align:center; font-size:11pt; font-weight:bold; margin:2mm 0; letter-spacing:1px; }}
.meta {{ display:flex; justify-content:space-between; font-size:8pt; padding:0.2mm 0; }}
.meta-block {{ margin:1mm 0; }}
.foot {{ text-align:center; font-size:8pt; margin-top:1mm; }}
</style></head><body>
<!--BOX_START-->
{reimpresso_faixa}
<div class="head">
  <div class="nome">{loja_nome.upper()}</div>
  {endereco_html}
</div>
<div class="ped">PED #{order_num}</div>
<hr class="sep"/>
<div class="cli-line"><b>CLIENTE:</b> {customer_name}</div>
{f'<div class="cli-line"><b>Fones:</b> {customer_phone}</div>' if customer_phone else ''}
{addr_html}
<!--BOX_END-->
<div class="modalidade">{faixa_hash}
{faixa_mid}
{faixa_hash}</div>
<div class="ref-head"><span>REF| DESCRICAO</span><span>| VALOR</span></div>
{rows_html}
<hr class="sep"/>
<div class="totais">
  <div class="tot-line"><span>TOTAL ITENS</span><span>R$ {subtotal_str}</span></div>
  {f'<div class="tot-line"><span>FRETE</span><span>R$ {f"{delivery_fee:.2f}".replace(".", ",")}</span></div>' if delivery_fee > 0 else ''}
  <div class="tot-line bold"><span>TOTAL GERAL</span><span>R$ {total_str}</span></div>
</div>
{pag_block}
<hr class="sep"/>
<div class="meta-block">
  <div class="meta"><span>COD: {cod_curto}</span><span>App Pedidos</span></div>
  <div class="meta"><span>Criado em</span><span>{criado_em}</span></div>
  <div class="meta"><span>Impresso em</span><span>{impresso_em}</span></div>
</div>
{previsto_html}
<hr class="sep"/>
<div class="foot">App: appcomandatech.agilizeerp.com.br</div>
{f'<div class="foot">Contato: {loja_nome} {customer_phone or ""}</div>' if False else ''}
</body></html>'''

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

    # Descrição do produto (opt-in por categoria, disponível para todas as lojas):
    # <div class="item-desc">[DESC]texto[/DESC]</div>  ->  [DESC]texto[/DESC]
    def marcar_desc(match):
        conteudo = re.sub(r'<[^>]+>', '', match.group(1)).strip()
        # remove marcadores [DESC]/[/DESC] caso já venham — normaliza
        conteudo = re.sub(r'^\[DESC\]', '', conteudo).strip()
        conteudo = re.sub(r'\[/DESC\]$', '', conteudo).strip()
        if not conteudo:
            return ''
        return f'\n[DESC]{conteudo}[/DESC]\n'
    text = re.sub(r'<div\s+class="item-desc"[^>]*>(.*?)</div>', marcar_desc, text, flags=re.DOTALL | re.IGNORECASE)

    # Nome do produto V2: fallback caso venha fora do item-header
    def marcar_name(match):
        conteudo = re.sub(r'<[^>]+>', '', match.group(1)).strip()
        return f'[NAME]{conteudo}[/NAME]'
    text = re.sub(r'<span\s+class="name"[^>]*>(.*?)</span>', marcar_name, text, flags=re.DOTALL | re.IGNORECASE)

    # CABEÇALHO EM CAIXA: marcadores HTML <!--BOX_START--> / <!--BOX_END-->
    # viram linhas próprias [BOX_START] / [BOX_END]. O conteúdo entre eles é processado
    # normalmente, e no GDI desenhamos uma borda em volta da região renderizada.
    text = re.sub(r'<!--\s*BOX_START\s*-->', '\n[BOX_START]\n', text, flags=re.IGNORECASE)
    text = re.sub(r'<!--\s*BOX_END\s*-->', '\n[BOX_END]\n', text, flags=re.IGNORECASE)

    # CLIENTE: linha "<p><span class="label">Cliente:</span> NOME</p>" vira [CLIENTE]Cliente: NOME[/CLIENTE]
    def marcar_cliente(match):
        conteudo = re.sub(r'<[^>]+>', '', match.group(0)).strip()
        conteudo = re.sub(r'[ \t]+', ' ', conteudo)
        return f'\n[CLIENTE]{conteudo}[/CLIENTE]\n'
    text = re.sub(
        r'<p[^>]*>\s*<span\s+class="label"[^>]*>\s*Cliente:\s*</span>.*?</p>',
        marcar_cliente,
        text,
        flags=re.DOTALL | re.IGNORECASE
    )

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

    # v8.36: no modo compacto da I9, a impressão automática usa GDI e não CSS.
    # O HTML vinha com quebras entre praticamente todos os <div>, e o GDI
    # transformava cada quebra vazia em avanço de papel. Aqui removemos essas
    # linhas vazias artificiais sem alterar tamanho de fonte nem conteúdo.
    if PRINT_LAYOUT == 'v2' and COMPANY_ID == I9_COMPANY_ID:
        text = re.sub(r'\n{2,}', '\n', text)
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
        # Caminho A (anti-corte de bordas) — APENAS lojas na allow-list:
        #   - reduz colunas (24→22 / 20→18) para que caracteres mais largos
        #     que a média não estourem a largura física do papel.
        #   - aumenta margem horizontal (~1mm → ~3mm) para sair da zona morta
        #     da cabeça térmica.
        safe_margin = SAFE_MARGIN_COMPANY_IDS is None or COMPANY_ID in SAFE_MARGIN_COMPANY_IDS
        if safe_margin:
            colunas = 22 if is_80mm else 18
        else:
            colunas = 24 if is_80mm else 20
        # MODO COMPACTO V2: economia de papel isolada na Lancheria I9.
        # O rollout não deve alterar o espaçamento das demais lojas sem validação.
        compact_v2 = (PRINT_LAYOUT == 'v2' and COMPANY_ID == I9_COMPANY_ID)
        margin_factor = 0.02 if compact_v2 else 0.04  # margem cai pela metade
        margin_x = int(dpi_x * (0.12 if safe_margin else 0.04))  # ~3mm (allow-list) ou ~1mm (padrão)
        margin_y = int(dpi_y * margin_factor)
        # Importante: a fonte precisa caber na largura útil, descontando as margens.
        # Antes era calculada sobre page_w inteiro; com margem segura ativa, parte do
        # texto podia continuar ultrapassando a área imprimível da térmica.
        usable_page_w = max(1, page_w - (margin_x * 2)) if safe_margin else page_w
        font_height = int(usable_page_w / colunas * 2.0)
        if safe_margin:
            log(f"Margem segura ativa: {colunas} cols, margem {margin_x}px, largura útil {usable_page_w}px", "CONFIG")

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

        # Altura da linha (compacta -15% no modo economia)
        tm = hDC.GetTextMetrics()
        line_h_base = tm['tmHeight'] + tm['tmExternalLeading'] + int(tm['tmHeight'] * 0.1)
        line_h = int(line_h_base * 0.85) if compact_v2 else line_h_base

        hDC.StartDoc(f"Pedido {order_number}")
        # StartPage será chamado de forma lazy ao primeiro desenho
        page_started = {'value': False}

        y = margin_y
        # Estado mutável compartilhado entre closures
        box_state = {'active': False}

        def ensure_page():
            """Inicia uma página apenas quando há algo para desenhar (evita página em branco)."""
            if not page_started['value']:
                hDC.StartPage()
                page_started['value'] = True

        def nova_pagina():
            nonlocal y
            if page_started['value']:
                hDC.EndPage()
                page_started['value'] = False
            y = margin_y

        def garantir_espaco(altura_necessaria):
            nonlocal y
            # Não quebra página enquanto a caixa do cabeçalho está ativa
            # (evita borda incompleta + páginas extras)
            if box_state['active']:
                ensure_page()
                return
            limite = page_h - margin_y
            if y + altura_necessaria > limite:
                nova_pagina()
            ensure_page()

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

        # Largura útil em pixels (descontando margens laterais). Usada para
        # word-wrap baseado em medição real (GetTextExtent) com a fonte
        # atualmente selecionada no hDC — evita corte em caracteres mais
        # largos que a média (negrito, números, acentos).
        usable_text_px = max(1, page_w - margin_x * 2)

        def quebrar_linha_px(texto, max_width_px):
            """Word-wrap por medição real em pixels usando a fonte selecionada.
            IMPORTANTE: selecionar a fonte desejada no hDC ANTES de chamar."""
            if not texto:
                return ['']
            if hDC.GetTextExtent(texto)[0] <= max_width_px:
                return [texto]
            palavras = texto.split(' ')
            linhas_out = []
            atual = ''
            for palavra in palavras:
                # palavra sozinha maior que a linha: quebra por caractere
                if hDC.GetTextExtent(palavra)[0] > max_width_px:
                    if atual:
                        linhas_out.append(atual)
                        atual = ''
                    buf = ''
                    for ch in palavra:
                        if hDC.GetTextExtent(buf + ch)[0] <= max_width_px:
                            buf += ch
                        else:
                            if buf:
                                linhas_out.append(buf)
                            buf = ch
                    atual = buf
                    continue
                tentativa = (atual + ' ' + palavra) if atual else palavra
                if hDC.GetTextExtent(tentativa)[0] <= max_width_px:
                    atual = tentativa
                else:
                    if atual:
                        linhas_out.append(atual)
                    atual = palavra
            if atual:
                linhas_out.append(atual)
            return linhas_out or ['']

        def quebrar_nome_com_recuo_px(texto, max_primeira_px, max_demais_px):
            """Versão pixel-based de quebrar_nome_com_recuo. Selecionar a fonte antes."""
            if not texto:
                return ['']
            palavras = texto.split(' ')
            linhas_out = []
            atual = ''
            max_atual = max(1, max_primeira_px)
            for palavra in palavras:
                # quebra forçada por caractere se palavra exceder a largura disponível
                while hDC.GetTextExtent(palavra)[0] > max_atual:
                    if atual:
                        linhas_out.append(atual)
                        atual = ''
                        max_atual = max(1, max_demais_px)
                    buf = ''
                    rest = palavra
                    for ch in palavra:
                        if hDC.GetTextExtent(buf + ch)[0] <= max_atual:
                            buf += ch
                            rest = rest[1:]
                        else:
                            break
                    if not buf:
                        buf = palavra[0]
                        rest = palavra[1:]
                    linhas_out.append(buf)
                    palavra = rest
                    max_atual = max(1, max_demais_px)
                tentativa = (atual + ' ' + palavra) if atual else palavra
                if hDC.GetTextExtent(tentativa)[0] <= max_atual:
                    atual = tentativa
                else:
                    if atual:
                        linhas_out.append(atual)
                    atual = palavra
                    max_atual = max(1, max_demais_px)
            if atual:
                linhas_out.append(atual)
            return linhas_out or ['']

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

        def limitar_retangulo_direita(rect_right_px):
            """Evita que retângulos GDI ultrapassem a área imprimível.
            Rollout isolado: apenas V2 compacto da Lancheria I9."""
            if compact_v2:
                safe_gap = max(2, int(dpi_x * 0.01))
                return min(rect_right_px, page_w - margin_x - safe_gap)
            return rect_right_px

        def desenhar_fundo_preto(rect_top_px, rect_h_px, rect_right_px):
            try:
                import win32gui
                rect_right_px = limitar_retangulo_direita(rect_right_px)
                brush = win32gui.CreateSolidBrush(0x000000)
                pen = win32gui.CreatePen(win32con.PS_SOLID, 1, 0x000000)
                old_brush = win32gui.SelectObject(hDC.GetSafeHdc(), brush)
                old_pen = win32gui.SelectObject(hDC.GetSafeHdc(), pen)
                win32gui.Rectangle(hDC.GetSafeHdc(), margin_x, rect_top_px, rect_right_px, rect_top_px + rect_h_px)
                win32gui.SelectObject(hDC.GetSafeHdc(), old_brush)
                win32gui.SelectObject(hDC.GetSafeHdc(), old_pen)
                win32gui.DeleteObject(brush)
                win32gui.DeleteObject(pen)
            except Exception as ex:
                log(f"Falha ao desenhar fundo preto: {ex}", "AVISO")

        def desenhar_borda(rect_top_px, rect_h_px, rect_right_px):
            try:
                import win32gui
                rect_right_px = limitar_retangulo_direita(rect_right_px)
                # Borda apenas (sem preenchimento) — usa NULL_BRUSH
                pen = win32gui.CreatePen(win32con.PS_SOLID, 2, 0x000000)
                null_brush = win32gui.GetStockObject(win32con.NULL_BRUSH)
                old_pen = win32gui.SelectObject(hDC.GetSafeHdc(), pen)
                old_brush = win32gui.SelectObject(hDC.GetSafeHdc(), null_brush)
                win32gui.Rectangle(hDC.GetSafeHdc(), margin_x, rect_top_px, rect_right_px, rect_top_px + rect_h_px)
                win32gui.SelectObject(hDC.GetSafeHdc(), old_pen)
                win32gui.SelectObject(hDC.GetSafeHdc(), old_brush)
                win32gui.DeleteObject(pen)
            except Exception as ex:
                log(f"Falha ao desenhar borda: {ex}", "AVISO")

        # Estado da caixa do cabeçalho (borda envolvendo todo o conteúdo pré-itens)
        # Estado da caixa do cabeçalho (borda envolvendo todo o conteúdo pré-itens)
        box_top_y = 0
        box_pad_x = int(dpi_x * 0.04)
        box_pad_y = max(1, int(dpi_y * (0.008 if compact_v2 else 0.02)))

        i = 0
        while i < len(linhas):
            linha = linhas[i]
            stripped = linha.strip()

            # CABEÇALHO EM CAIXA — início: marca posição Y atual e adiciona padding superior
            if stripped == '[BOX_START]':
                ensure_page()
                y += box_pad_y
                box_top_y = y
                box_state['active'] = True
                y += box_pad_y
                i += 1
                continue

            # CABEÇALHO EM CAIXA — fim: desenha borda em volta da região renderizada
            if stripped == '[BOX_END]':
                if box_state['active']:
                    y += box_pad_y
                    altura = y - box_top_y
                    rect_right = margin_x + int(colunas * tm['tmAveCharWidth']) + box_pad_x * 2
                    desenhar_borda(box_top_y, altura, rect_right)
                    box_state['active'] = False
                    y += int(line_h * 0.4)
                i += 1
                continue



            if not stripped:
                # Linha em branco apenas avança y; no compacto v2 reduz pela metade
                if page_started['value']:
                    blank_h = int(line_h * (0.25 if compact_v2 else 0.5))
                    limite = page_h - margin_y
                    if y + blank_h <= limite:
                        y += blank_h
                i += 1
                continue

            if set(stripped) <= {'-', '=', '_'} and len(stripped) > 3:
                garantir_espaco(line_h)
                hDC.SelectObject(font_normal)
                hDC.SetTextColor(0x000000)
                hDC.SetBkMode(win32con.TRANSPARENT)
                hDC.TextOut(margin_x, y, '-' * colunas)
                y += line_h
                i += 1
                continue

            # Detecta marcadores V2
            m_item = re.match(r'^\[ITEM\](.*?)\|\|\|(.*?)\[/ITEM\]$', stripped)
            m_add = re.match(r'^\[ADD\](.*)\[/ADD\]$', stripped)
            m_obs = re.match(r'^\[OBS\](.*)\[/OBS\]$', stripped)
            m_desc = re.match(r'^\[DESC\](.*)\[/DESC\]$', stripped)
            m_name = re.match(r'^\[NAME\](.*)\[/NAME\]$', stripped)
            m_cliente = re.match(r'^\[CLIENTE\](.*)\[/CLIENTE\]$', stripped)
            m_endereco = re.match(r'^\[ENDERECO\](.*)\[/ENDERECO\]$', stripped)
            m_addgroup = re.match(r'^\[ADDGROUP_LABEL\](.*)\[/ADDGROUP_LABEL\]$', stripped)
            m_sep = (stripped == '[SEP]')

            # Descrição do produto (V1 e V2) — linha em itálico, prefixo "Descrição:"
            if m_desc:
                conteudo_desc = m_desc.group(1).strip()
                texto_desc = f'Descricao: {conteudo_desc}'
                # Tenta criar fonte itálica leve; cai pra font_regular se falhar
                try:
                    font_desc = win32ui.CreateFont({
                        'name': 'Courier New',
                        'height': int(font_height * 0.85),
                        'weight': 400,
                        'italic': True,
                    })
                except Exception:
                    font_desc = font_regular
                hDC.SelectObject(font_desc)
                # quebra por medição real em pixels (usa font_desc selecionada acima)
                sublinhas_desc = quebrar_linha_px(texto_desc, usable_text_px)
                garantir_espaco(line_h * len(sublinhas_desc))
                hDC.SetTextColor(0x000000)
                hDC.SetBkMode(win32con.TRANSPARENT)
                for sub in sublinhas_desc:
                    hDC.TextOut(margin_x, y, sub)
                    y += line_h
                hDC.SelectObject(font_normal)
                i += 1
                continue


            if m_sep and is_v2:
                garantir_espaco(int(line_h * 1.4))
                hDC.SelectObject(font_normal)
                hDC.SetTextColor(0x000000)
                hDC.SetBkMode(win32con.TRANSPARENT)
                y += int(line_h * 0.2)
                hDC.TextOut(margin_x, y, '.' * colunas)
                y += line_h
                y += int(line_h * 0.2)
                i += 1
                continue

            if is_v2 and m_item:
                qty = m_item.group(1).strip()
                nome = m_item.group(2).strip()

                qty_text = qty or ''
                gap_px = tm['tmAveCharWidth']
                # mede qty com font_normal (negrito) usada para qty
                hDC.SelectObject(font_normal)
                qty_width_px = hDC.GetTextExtent(qty_text + (' ' if qty_text else ''))[0] if qty_text else 0
                nome_x = margin_x + qty_width_px + (gap_px if qty_text else 0)

                # quebra do nome por medição real em pixels (font_regular)
                hDC.SelectObject(font_regular)
                nome_largura_primeira_px = max(1, usable_text_px - qty_width_px - (gap_px if qty_text else 0))
                nome_linhas = quebrar_nome_com_recuo_px(nome, nome_largura_primeira_px, usable_text_px)
                garantir_espaco(line_h * len(nome_linhas))

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
                i += 1
                continue

            if is_v2 and m_add:
                # Lancheria I9: usa '+' como marcador (mais clean e semântico)
                # em vez do '>>'. Outras lojas mantêm o '>>' original — sem regressão.
                I9_COMPANY_ID_ADD = '8c9e7a0e-dbb6-49b9-8344-c23155a71164'
                add_prefix = '+ ' if COMPANY_ID == I9_COMPANY_ID_ADD else '>> '
                texto_add = add_prefix + m_add.group(1).strip().upper()
                hDC.SelectObject(font_bold_big)
                sublinhas_add = quebrar_linha_px(texto_add, usable_text_px)
                garantir_espaco(line_h * len(sublinhas_add))
                hDC.SetTextColor(0x000000)
                hDC.SetBkMode(win32con.TRANSPARENT)
                for sub in sublinhas_add:
                    hDC.TextOut(margin_x, y, sub)
                    y += line_h
                hDC.SelectObject(font_normal)
                i += 1
                continue

            # CLIENTE invertido (sempre, V1 e V2) — fundo preto + texto branco
            if m_cliente:
                conteudo_cli = m_cliente.group(1).strip().upper()
                hDC.SelectObject(font_obs)
                pad_x = int(dpi_x * 0.02)
                pad_y = int(dpi_y * 0.015)
                sublinhas = quebrar_linha_px(conteudo_cli, max(1, usable_text_px - pad_x * 2))
                garantir_espaco(line_h * len(sublinhas) + pad_y * 2 + int(line_h * 0.3))
                rect_top = y - pad_y
                rect_h = line_h * len(sublinhas) + pad_y * 2
                rect_right = margin_x + int(colunas * tm['tmAveCharWidth']) + pad_x * 2
                desenhar_fundo_preto(rect_top, rect_h, rect_right)
                hDC.SetTextColor(0xFFFFFF)
                hDC.SetBkMode(win32con.TRANSPARENT)
                for sub in sublinhas:
                    hDC.TextOut(margin_x + pad_x, y, sub)
                    y += line_h
                hDC.SetTextColor(0x000000)
                hDC.SelectObject(font_normal)
                y += int(line_h * 0.3)
                i += 1
                continue

            # ENDERECO invertido (I9, V2) — mesmo bloco preto/branco do CLIENTE.
            # Aparece após o nome no recibo/comanda quando o pedido é entrega.
            if m_endereco:
                conteudo_end = m_endereco.group(1).strip().upper()
                if not conteudo_end:
                    i += 1
                    continue
                hDC.SelectObject(font_obs)
                pad_x = int(dpi_x * 0.02)
                pad_y = int(dpi_y * 0.015)
                sublinhas = quebrar_linha_px(conteudo_end, max(1, usable_text_px - pad_x * 2))
                garantir_espaco(line_h * len(sublinhas) + pad_y * 2 + int(line_h * 0.3))
                rect_top = y - pad_y
                rect_h = line_h * len(sublinhas) + pad_y * 2
                rect_right = margin_x + int(colunas * tm['tmAveCharWidth']) + pad_x * 2
                desenhar_fundo_preto(rect_top, rect_h, rect_right)
                hDC.SetTextColor(0xFFFFFF)
                hDC.SetBkMode(win32con.TRANSPARENT)
                for sub in sublinhas:
                    hDC.TextOut(margin_x + pad_x, y, sub)
                    y += line_h
                hDC.SetTextColor(0x000000)
                hDC.SelectObject(font_normal)
                y += int(line_h * 0.3)
                i += 1
                continue

            # ADDGROUP_LABEL (I9, V2): rótulo do grupo de adicionais, prefixo ■,
            # SUBLINHADO, capitalização original (sem CAPS). Aparece acima dos
            # itens "+ ITEM" quando há 2+ grupos no produto.
            if m_addgroup:
                conteudo_grp = m_addgroup.group(1).strip()
                if not conteudo_grp:
                    i += 1
                    continue
                texto_grp = f'\u25A0 {conteudo_grp}'
                # cria fonte sublinhada (cai pra font_normal se falhar)
                try:
                    font_grp = win32ui.CreateFont({
                        'name': 'Courier New',
                        'height': font_height,
                        'weight': 700,
                        'underline': True,
                    })
                except Exception:
                    font_grp = font_normal
                hDC.SelectObject(font_grp)
                sublinhas_grp = quebrar_linha_px(texto_grp, usable_text_px)
                garantir_espaco(line_h * len(sublinhas_grp))
                hDC.SetTextColor(0x000000)
                hDC.SetBkMode(win32con.TRANSPARENT)
                for sub in sublinhas_grp:
                    hDC.TextOut(margin_x, y, sub)
                    y += line_h
                hDC.SelectObject(font_normal)
                i += 1
                continue

            if is_v2 and m_obs:
                conteudo_obs = m_obs.group(1).strip().upper()
                conteudo_obs = re.sub(r'^OBSERVAÇÕES:\s*', '', conteudo_obs, flags=re.IGNORECASE)
                texto_obs = f'OBSERVAÇÕES: {conteudo_obs}'
                hDC.SelectObject(font_obs)
                pad_x = int(dpi_x * 0.02)
                pad_y = int(dpi_y * 0.015)
                sublinhas = quebrar_linha_px(texto_obs, max(1, usable_text_px - pad_x * 2))
                garantir_espaco(line_h * len(sublinhas) + pad_y * 2 + int(line_h * 0.3))
                rect_top = y - pad_y
                rect_h = line_h * len(sublinhas) + pad_y * 2
                rect_right = margin_x + int(colunas * tm['tmAveCharWidth']) + pad_x * 2
                desenhar_fundo_preto(rect_top, rect_h, rect_right)
                hDC.SetTextColor(0xFFFFFF)
                hDC.SetBkMode(win32con.TRANSPARENT)
                for sub in sublinhas:
                    hDC.TextOut(margin_x + pad_x, y, sub)
                    y += line_h
                hDC.SetTextColor(0x000000)
                hDC.SelectObject(font_normal)
                y += int(line_h * 0.3)
                i += 1
                continue

            if is_v2 and m_name:
                texto_nome = m_name.group(1).strip()
                hDC.SelectObject(font_regular)
                hDC.SetTextColor(0x000000)
                hDC.SetBkMode(win32con.TRANSPARENT)
                for sub in quebrar_linha_px(texto_nome, usable_text_px):
                    hDC.TextOut(margin_x, y, sub)
                    y += line_h
                hDC.SelectObject(font_normal)
                i += 1
                continue

            # Linha normal: remove marcadores residuais e imprime
            stripped_clean = re.sub(r'\[/?(ADD|ADDGROUP_LABEL|OBS|DESC|NAME|ITEM|SEP|CLIENTE|ENDERECO|BOX_START|BOX_END)\]', '', stripped).replace('|||', ' ').strip()
            if not stripped_clean:
                i += 1
                continue
            hDC.SelectObject(font_normal)
            sublinhas_normais = quebrar_linha_px(stripped_clean, usable_text_px)
            garantir_espaco(line_h * len(sublinhas_normais))
            hDC.SetTextColor(0x000000)
            hDC.SetBkMode(win32con.TRANSPARENT)
            for sublinha in sublinhas_normais:
                hDC.TextOut(margin_x, y, sublinha)
                y += line_h
            i += 1

        # Margem inferior leve para corte (sem forçar nova página).
        # No modo compacto v2, reduz para 1 linha; padrão é 3 linhas.
        limite_final = page_h - margin_y
        cut_lines = 1 if compact_v2 else 3
        if y + line_h * cut_lines <= limite_final:
            y += line_h * cut_lines

        # Só finaliza a página se realmente houve desenho — evita folha em branco extra
        if page_started['value']:
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

def processar_pedido(pedido, store_name="Comanda Tech", store_info=None):
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
    # Segurança: Lancheria I9 NÃO força mais V3 por slug/company_id. V3 só entra
    # quando a configuração print_layout estiver explicitamente como "v3".
    log(f"Gerando recibo HTML no layout {PRINT_LAYOUT}...", "INFO")
    if PRINT_LAYOUT == 'v3':
        html = formatar_recibo_html_v3(pedido, itens, store_name, store_info or {})
    else:
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
    company_id, company_name, company_address, company_info = buscar_empresa_por_slug(slug)
    STORE_INFO = company_info or {}
    
    if not company_id:
        print(f"Empresa '{slug}' não encontrada ou inativa. Verifique o slug.")
        exit(1)

    # IMPORTANTE: imprimir_html() usa o COMPANY_ID global para ativar a margem
    # segura da allow-list. Sem esta atribuição, a Lancheria I9 nunca entrava
    # no modo anti-corte, mesmo com SAFE_MARGIN_COMPANY_IDS configurado.
    COMPANY_ID = company_id
    
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
                    ok = processar_pedido(pedido, STORE_NAME, STORE_INFO)
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
