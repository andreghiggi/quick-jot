#!/usr/bin/env python3
"""
Comanda Tech - Auto Printer
Script para impressão automática de pedidos

Instalação:
1. Instale Python 3.8+ (https://python.org)
2. Instale as dependências: pip install requests python-escpos
3. Configure as variáveis SUPABASE_URL e SUPABASE_KEY abaixo
4. Execute: python auto_printer.py

Para impressora térmica (ESC/POS), instale: pip install python-escpos
Para impressora comum do Windows, o script usa a impressora padrão
"""

import requests
import time
import json
import os
import tempfile
import subprocess
from datetime import datetime
from typing import Set, List, Dict, Any

# ============================================
# CONFIGURAÇÃO - EDITE ESTAS VARIÁVEIS
# ============================================
SUPABASE_URL = "https://iwmrtxdzlkasuzutxvhh.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3bXJ0eGR6bGthc3V6dXR4dmhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3OTExODMsImV4cCI6MjA4MDM2NzE4M30.VsnT1zdVUwJdv8gBlg8CthBx_bccZp-LsOs2PRq1Uik"

# Intervalo de verificação em segundos
CHECK_INTERVAL = 5

# Nome da loja (aparece no recibo)
STORE_NAME = "Comanda Tech"

# Largura do recibo em caracteres
RECEIPT_WIDTH = 40

# ============================================
# NÃO EDITE ABAIXO DESTA LINHA
# ============================================

printed_orders: Set[str] = set()

def get_headers() -> Dict[str, str]:
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json"
    }

def fetch_pending_orders() -> List[Dict[str, Any]]:
    """Busca pedidos pendentes do Supabase"""
    try:
        response = requests.get(
            f"{SUPABASE_URL}/rest/v1/orders?status=eq.pending&order=created_at.desc",
            headers=get_headers()
        )
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"[ERRO] Falha ao buscar pedidos: {e}")
        return []

def fetch_order_items(order_id: str) -> List[Dict[str, Any]]:
    """Busca itens de um pedido"""
    try:
        response = requests.get(
            f"{SUPABASE_URL}/rest/v1/order_items?order_id=eq.{order_id}",
            headers=get_headers()
        )
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"[ERRO] Falha ao buscar itens do pedido: {e}")
        return []

def format_currency(value: float) -> str:
    """Formata valor em reais"""
    return f"R$ {value:.2f}".replace(".", ",")

def center_text(text: str, width: int = RECEIPT_WIDTH) -> str:
    """Centraliza texto"""
    return text.center(width)

def format_receipt(order: Dict[str, Any], items: List[Dict[str, Any]]) -> str:
    """Formata o recibo para impressão"""
    lines = []
    separator = "=" * RECEIPT_WIDTH
    dash = "-" * RECEIPT_WIDTH
    
    # Cabeçalho
    lines.append(separator)
    lines.append(center_text(STORE_NAME))
    lines.append(separator)
    lines.append("")
    
    # Número do pedido
    daily_number = order.get("daily_number", "N/A")
    lines.append(center_text(f"*** PEDIDO #{daily_number} ***"))
    lines.append("")
    
    # Data/hora
    created_at = order.get("created_at", "")
    try:
        dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
        formatted_date = dt.strftime("%d/%m/%Y %H:%M")
    except:
        formatted_date = created_at[:16] if created_at else "N/A"
    
    lines.append(f"Data: {formatted_date}")
    lines.append("")
    
    # Cliente
    lines.append(dash)
    lines.append("CLIENTE:")
    lines.append(f"Nome: {order.get('customer_name', 'N/A')}")
    
    if order.get("customer_phone"):
        lines.append(f"Telefone: {order['customer_phone']}")
    
    if order.get("delivery_address"):
        lines.append(f"Endereço: {order['delivery_address']}")
    
    lines.append("")
    
    # Itens
    lines.append(dash)
    lines.append("ITENS:")
    lines.append(dash)
    
    for item in items:
        qty = item.get("quantity", 1)
        name = item.get("name", "Item")
        price = item.get("price", 0)
        total_item = qty * price
        
        # Linha do item
        item_line = f"{qty}x {name}"
        price_str = format_currency(total_item)
        
        # Truncar nome se necessário
        max_name_len = RECEIPT_WIDTH - len(price_str) - 5
        if len(item_line) > max_name_len:
            item_line = item_line[:max_name_len-3] + "..."
        
        spaces = RECEIPT_WIDTH - len(item_line) - len(price_str)
        lines.append(f"{item_line}{' ' * spaces}{price_str}")
        
        # Observações do item
        if item.get("notes"):
            lines.append(f"   -> {item['notes']}")
    
    lines.append("")
    
    # Observações gerais
    if order.get("notes"):
        lines.append(dash)
        lines.append("OBSERVAÇÕES:")
        lines.append(order["notes"])
        lines.append("")
    
    # Total
    lines.append(separator)
    total = order.get("total", 0)
    total_str = format_currency(total)
    total_line = f"TOTAL: {total_str}"
    lines.append(center_text(total_line))
    lines.append(separator)
    lines.append("")
    lines.append(center_text("Obrigado pela preferência!"))
    lines.append("")
    lines.append("")
    lines.append("")  # Espaço para corte
    
    return "\n".join(lines)

def print_windows(text: str) -> bool:
    """Imprime usando a impressora padrão do Windows"""
    try:
        # Cria arquivo temporário
        with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False, encoding='utf-8') as f:
            f.write(text)
            temp_path = f.name
        
        # Imprime usando notepad (silencioso)
        subprocess.run(
            ['notepad.exe', '/p', temp_path],
            shell=True,
            check=True
        )
        
        # Remove arquivo temporário após um delay
        time.sleep(2)
        try:
            os.unlink(temp_path)
        except:
            pass
        
        return True
    except Exception as e:
        print(f"[ERRO] Falha na impressão: {e}")
        return False

def print_thermal(text: str) -> bool:
    """
    Imprime em impressora térmica ESC/POS
    Requer: pip install python-escpos
    """
    try:
        from escpos.printer import Usb, Network
        
        # Tente conectar via USB (ajuste vendor_id e product_id conforme sua impressora)
        # Impressoras comuns: Epson (0x04b8), Elgin (0x0dd4)
        # Use o comando: lsusb (Linux) ou Device Manager (Windows) para encontrar os IDs
        
        # Exemplo para impressora USB:
        # p = Usb(0x04b8, 0x0202)  # Epson TM-T20
        
        # Exemplo para impressora de rede:
        # p = Network("192.168.1.100")
        
        # Por padrão, tenta USB genérico
        p = Usb(0x04b8, 0x0202)
        p.text(text)
        p.cut()
        return True
    except ImportError:
        print("[INFO] python-escpos não instalado, usando impressora Windows")
        return print_windows(text)
    except Exception as e:
        print(f"[INFO] Impressora térmica não encontrada, usando Windows: {e}")
        return print_windows(text)

def print_order(order: Dict[str, Any]) -> bool:
    """Imprime um pedido"""
    order_id = order.get("id")
    daily_number = order.get("daily_number", "?")
    
    print(f"[NOVO PEDIDO] #{daily_number} - {order.get('customer_name')}")
    
    # Busca itens
    items = fetch_order_items(order_id)
    
    # Formata recibo
    receipt = format_receipt(order, items)
    
    # Tenta impressora térmica, senão usa Windows
    success = print_thermal(receipt)
    
    if success:
        print(f"[OK] Pedido #{daily_number} impresso com sucesso!")
    else:
        print(f"[ERRO] Falha ao imprimir pedido #{daily_number}")
    
    return success

def load_printed_orders():
    """Carrega lista de pedidos já impressos"""
    global printed_orders
    try:
        if os.path.exists("printed_orders.json"):
            with open("printed_orders.json", "r") as f:
                data = json.load(f)
                # Limpa pedidos com mais de 24h
                today = datetime.now().date().isoformat()
                printed_orders = set(data.get(today, []))
    except Exception as e:
        print(f"[AVISO] Não foi possível carregar histórico: {e}")
        printed_orders = set()

def save_printed_orders():
    """Salva lista de pedidos já impressos"""
    try:
        today = datetime.now().date().isoformat()
        with open("printed_orders.json", "w") as f:
            json.dump({today: list(printed_orders)}, f)
    except Exception as e:
        print(f"[AVISO] Não foi possível salvar histórico: {e}")

def main():
    """Loop principal"""
    print(separator := "=" * 50)
    print(f"  {STORE_NAME} - Auto Printer")
    print(separator)
    print(f"  Verificando novos pedidos a cada {CHECK_INTERVAL}s")
    print(f"  Pressione Ctrl+C para parar")
    print(separator)
    print()
    
    load_printed_orders()
    
    try:
        while True:
            # Busca pedidos pendentes
            orders = fetch_pending_orders()
            
            for order in orders:
                order_id = order.get("id")
                
                # Verifica se já foi impresso
                if order_id in printed_orders:
                    continue
                
                # Imprime
                if print_order(order):
                    printed_orders.add(order_id)
                    save_printed_orders()
            
            # Aguarda próxima verificação
            time.sleep(CHECK_INTERVAL)
            
    except KeyboardInterrupt:
        print("\n[INFO] Encerrando...")
        save_printed_orders()

if __name__ == "__main__":
    main()
