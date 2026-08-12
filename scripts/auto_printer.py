import os
import sys
import time
import json
import requests
import socket
import threading
from datetime import datetime

# ==============================================================================
# CONFIGURAÇÕES TÉCNICAS
# ==============================================================================
SCRIPT_VERSION = "1.6.2"
CHECK_INTERVAL = 5  # Segundos entre verificações
API_URL = "https://iwmrtxdzlkasuzutxvhh.supabase.co/rest/v1"
API_KEY = "" # Injetado pelo frontend
LOG_FILE = "printer_log.txt"
STORE_NAME = ""
STORE_INFO = {}
COMPANY_ID = "" # Injetado pelo frontend
PRINTER_MAP_FILE = "printer_map.json"

# Controle de sessão
pedidos_impressos_sessao = []
ids_com_falha = set()
ids_processados = set()

def log(mensagem, tipo="INFO"):
    agora = datetime.now().strftime("%H:%M:%S")
    msg = f"[{agora}] [{tipo}] {mensagem}"
    print(msg)
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(msg + "\n")
    except:
        pass

def mostrar_status(company_id):
    os.system('cls' if os.name == 'nt' else 'clear')
    print("=" * 60)
    print(f"  COMANDATECH - IMPRESSÃO AUTOMÁTICA v{SCRIPT_VERSION}")
    print("=" * 60)
    print(f"  LOJA: {STORE_NAME}")
    print(f"  ID: {company_id}")
    print(f"  STATUS: ATIVO E MONITORANDO")
    print(f"  ÚLTIMA VERIFICAÇÃO: {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}")
    print("-" * 60)
    print(f"  PEDIDOS IMPRESSOS HOJE: {len(pedidos_impressos_sessao)}")
    if pedidos_impressos_sessao:
        print("  ÚLTIMOS 3:")
        for p in pedidos_impressos_sessao[-3:]:
            print(f"    - #{p['numero']} ({p['cliente']}) às {p['hora']}")
    print("-" * 60)
    print("  Pressione Ctrl+C para encerrar com segurança")
    print("=" * 60)

def run_scale_server():
    """
    Inicia um servidor local na porta 8081 para comunicação com a balança Wind D3.
    """
    try:
        server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        server.bind(('localhost', 8081))
        server.listen(5)
        log("Servidor de Balança iniciado em localhost:8081", "BALANCA")
        
        while True:
            client, addr = server.accept()
            try:
                # Simula leitura da balança (em produção isso leria da serial)
                # O formato esperado é "00.000" em kg
                peso_mock = "0.450" 
                client.send(peso_mock.encode())
            except Exception as e:
                log(f"Erro no servidor de balança: {e}", "ERRO")
            finally:
                client.close()
    except Exception as e:
        log(f"Falha ao iniciar servidor de balança: {e}", "ERRO")

def get_headers():
    return {
        "apikey": API_KEY,
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }

def buscar_pedidos_nao_impressos(company_id):
    """Busca pedidos que ainda não foram impressos (printed=false)"""
    try:
        url = f"{API_URL}/orders?company_id=eq.{company_id}&printed=eq.false&select=*"
        response = requests.get(url, headers=get_headers())
        if response.status_code == 200:
            return response.json()
        log(f"Erro ao buscar pedidos: {response.status_code}", "ERRO")
    except Exception as e:
        log(f"Falha na requisição de pedidos: {e}", "ERRO")
    return []

def processar_fila(company_id):
    """Busca e processa itens na print_queue"""
    try:
        url = f"{API_URL}/print_queue?company_id=eq.{company_id}&select=*"
        response = requests.get(url, headers=get_headers())
        if response.status_code == 200:
            fila = response.json()
            for item in fila:
                if item['id'] in ids_processados: continue
                
                log(f"Imprimindo da fila: {item.get('label', 'Sem título')}", "FILA")
                if imprimir_html(item.get('html_content', ''), item.get('station_id')):
                    remover_da_fila(item['id'])
                    ids_processados.add(item['id'])
            return len(fila)
    except Exception as e:
        log(f"Erro ao processar fila: {e}", "ERRO")
    return 0

def remover_da_fila(item_id):
    try:
        url = f"{API_URL}/print_queue?id=eq.{item_id}"
        requests.delete(url, headers=get_headers())
    except:
        pass

def marcar_como_impresso(order_id):
    try:
        url = f"{API_URL}/orders?id=eq.{order_id}"
        requests.patch(url, headers=get_headers(), json={"printed": True})
    except Exception as e:
        log(f"Erro ao marcar como impresso: {e}", "ERRO")

def get_printer_for_station(station_id):
    """Lê o arquivo de mapeamento local para encontrar a impressora da estação"""
    try:
        if not os.path.exists(PRINTER_MAP_FILE):
            return None
        with open(PRINTER_MAP_FILE, "r", encoding="utf-8") as f:
            mapping = json.load(f)
            return mapping.get(station_id)
    except:
        return None

def imprimir_html(html_content, station_id=None):
    """
    Envia HTML para a impressora térmica via Win32Print
    Requer: pip install pywin32
    """
    if not html_content: return False
    
    try:
        import win32print
        import win32ui
        from html.parser import HTMLParser

        # Tenta encontrar impressora mapeada para a estação
        printer_name = None
        if station_id:
            printer_name = get_printer_for_station(station_id)
            if printer_name:
                log(f"Usando impressora mapeada: {printer_name}", "STATION")
        
        if not printer_name:
            try:
                printer_name = win32print.GetDefaultPrinter()
                log(f"Usando impressora padrão: {printer_name}", "DEFAULT")
            except Exception as e:
                log(f"Falha ao obter impressora padrão do Windows: {e}", "ERRO")
                return False

        # Simplificação extrema para o MVP: extrai texto do HTML
        # Mas para Layout V2, preservamos os marcadores de formatação básica
        # e garantimos que o texto saia o mais próximo possível do layout original.
        class MyHTMLParser(HTMLParser):
            def __init__(self):
                super().__init__()
                self.text = ""
                self.in_badge = False
                self.in_obs = False
                self.in_add = False
            
            def handle_starttag(self, tag, attrs):
                attrs_dict = dict(attrs)
                classes = attrs_dict.get('class', '').split()
                
                if 'order-type-badge' in classes:
                    self.text += "\n" + "="*32 + "\n"
                    self.in_badge = True
                elif 'obs-block' in classes:
                    self.text += "\n" + "-"*32 + "\n"
                    self.in_obs = True
                elif 'additionals' in classes:
                    self.in_add = True
                elif 'item' in classes:
                    self.text += "\n"
                elif tag == 'br':
                    self.text += "\n"

            def handle_endtag(self, tag):
                if self.in_badge:
                    self.text += "="*32 + "\n"
                    self.in_badge = False
                elif self.in_obs:
                    self.text += "-"*32 + "\n"
                    self.in_obs = False
                elif self.in_add:
                    self.in_add = False

            def handle_data(self, data):
                clean_data = data.strip()
                if not clean_data: return
                
                if self.in_badge or self.in_obs:
                    self.text += clean_data.upper() + "\n"
                elif self.in_add:
                    # Adicionais geralmente já vem com >> do routing
                    self.text += clean_data + "\n"
                else:
                    self.text += clean_data + "\n"

        parser = MyHTMLParser()
        parser.feed(html_content)
        texto_puro = parser.text.strip()
        
        # Garante corte de papel/espaço no fim
        texto_puro += "\n\n\n\n\n"

        try:
            hPrinter = win32print.OpenPrinter(printer_name)
        except Exception as e:
            log(f"Não foi possível abrir a impressora '{printer_name}': {e}", "ERRO")
            return False
            
        try:
            # Tenta enviar como RAW para a impressora
            hJob = win32print.StartDocPrinter(hPrinter, 1, ("ComandaTech Print", None, "RAW"))
            win32print.StartPagePrinter(hPrinter)
            
            # Converte para bytes usando CP850 (comum em impressoras térmicas no BR) ou Latin-1
            # Tenta CP850 primeiro para melhores caracteres de borda se houver
            try:
                raw_data = texto_puro.encode('cp850', 'replace')
            except:
                raw_data = texto_puro.encode('latin-1', 'replace')
                
            win32print.WritePrinter(hPrinter, raw_data)
            win32print.EndPagePrinter(hPrinter)
            win32print.EndDocPrinter(hPrinter)
        finally:
            win32print.ClosePrinter(hPrinter)
        return True
    except Exception as e:
        log(f"Erro na impressão: {e}", "ERRO")
        return False

def processar_pedido(pedido, store_name, store_info):
    order_code = pedido.get('order_code', '---')
    log(f"Processando pedido #{order_code}...", "PEDIDO")
    
    # Se o pedido já vem com HTML de impressão no banco (campo opcional futuro)
    # ou se precisamos gerar o HTML aqui. Por enquanto, a maioria vem pela print_queue
    # Mas para pedidos do cardápio que não geraram print_queue:
    
    # Marcar como impresso para não repetir
    marcar_como_impresso(pedido['id'])
    
    info_sessao = {
        "numero": order_code,
        "cliente": pedido.get('customer_name', 'Cliente'),
        "hora": datetime.now().strftime("%H:%M")
    }
    pedidos_impressos_sessao.append(info_sessao)
    return True

def main(company_id, company_name):
    global STORE_NAME
    
    if not API_KEY:
        log("ERRO CRÍTICO: Chave de API (API_KEY) não encontrada. Baixe o script novamente pelo painel.", "ERRO")
        return

    log(f"Versão do script: {SCRIPT_VERSION}", "OK")
    print("=" * 50)
    print(f"  Intervalo: {CHECK_INTERVAL} segundos")
    print("  Pressione Ctrl+C para parar")
    print(f"  Log: {LOG_FILE}")
    print("=" * 50)
    print()
    
    STORE_NAME = company_name

    log("Iniciando monitoramento...", "START")
    mostrar_status(company_id)
    
    contador = 0
    try:
        # Inicia servidor de balança em uma thread separada
        scale_thread = threading.Thread(target=run_scale_server, daemon=True)
        scale_thread.start()

        while True:
            # 1. Pedidos do cardápio online / express / garçom
            pedidos = buscar_pedidos_nao_impressos(company_id)
            pedidos = [p for p in pedidos if p.get('id') not in ids_com_falha]
            
            if pedidos:
                log(f"Encontrados {len(pedidos)} pedido(s) para imprimir!", "INFO")
                for pedido in pedidos:
                    ok = processar_pedido(pedido, STORE_NAME, STORE_INFO)
                    if not ok:
                        ids_com_falha.add(pedido.get('id'))
                        log(f"Pedido {pedido.get('order_code','')} adicionado à lista de falhas", "AVISO")
                mostrar_status(company_id)
            
            # 2. Fila de impressão (garçom / mesa - print_queue)
            fila_count = processar_fila(company_id)
            
            if not pedidos and fila_count == 0:
                contador += 1
                if contador >= 12:
                    mostrar_status(company_id)
                    contador = 0
                else:
                    print(".", end="", flush=True)
            
            time.sleep(CHECK_INTERVAL)
            
    except KeyboardInterrupt:
        print("\n\n")
        log("Encerrando...", "INFO")
        print("=" * 50)
        print(f"  Total de pedidos impressos: {len(pedidos_impressos_sessao)}")
        print("=" * 50)
        print("  Obrigado por usar o Comanda Tech!")
        print("=" * 50)

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--company_id", help="ID da empresa")
    parser.add_argument("--company_name", help="Nome da empresa")
    args = parser.parse_args()

    # Fallback para variáveis injetadas via build se não vier por argumento
    company_id = args.company_id or COMPANY_ID
    company_name = args.company_name or STORE_NAME

    if not company_id:
        print("ERRO: company_id nao fornecido.")
        sys.exit(1)

    main(company_id, company_name)
