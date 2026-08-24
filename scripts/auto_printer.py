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
SCRIPT_VERSION = "1.7.0"
CHECK_INTERVAL = 5  # Segundos entre verificações
API_URL = "https://iwmrtxdzlkasuzutxvhh.supabase.co/rest/v1"
API_KEY = "" # Injetado pelo frontend
LOG_FILE = "printer_log.txt"
STORE_NAME = ""
STORE_INFO = {}
COMPANY_ID = "" # Injetado pelo frontend
PRINTER_MAP_FILE = "printer_map.json"

# Lojas que usam renderizacao GRAFICA (GDI) em vez de RAW.
# ISOLAMENTO: nao afeta nenhuma outra loja.
GDI_COMPANY_IDS = {"f5f9eec3-67bc-497a-88a6-ce41d3b15df8"}  # Amore Mio

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
    """Busca e processa itens na print_queue ainda nao impressos"""
    try:
        url = f"{API_URL}/print_queue?company_id=eq.{company_id}&printed=eq.false&select=*"
        response = requests.get(url, headers=get_headers())
        if response.status_code == 200:
            fila = response.json()
            for item in fila:
                if item['id'] in ids_processados: continue
                
                log(f"Imprimindo da fila: {item.get('label', 'Sem título')}", "FILA")
                if imprimir_html(item.get('html_content', ''), item.get('station_id')):
                    ids_processados.add(item['id'])
                    marcar_fila_impressa(item['id'])
                    remover_da_fila(item['id'])
            return len(fila)
    except Exception as e:
        log(f"Erro ao processar fila: {e}", "ERRO")
    return 0

def marcar_fila_impressa(item_id):
    """Marca o job como impresso (evita reimpressao caso o DELETE seja bloqueado por RLS)"""
    try:
        url = f"{API_URL}/print_queue?id=eq.{item_id}"
        requests.patch(url, headers=get_headers(), json={"printed": True})
    except Exception as e:
        log(f"Erro ao marcar job como impresso: {e}", "ERRO")

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
    return _imprimir_html(html_content, station_id)


def normalizar_marcadores(texto):
    """
    Converte os marcadores do Layout V2 ([CLIENTE], [ENDERECO], [ADD],
    [ADDGROUP_LABEL]) na formatacao de texto usada nas comandas 58mm,
    igual ao padrao das demais lojas.
    """
    import re as _re

    def _cliente(m):
        return f"CLIENTE: {m.group(1).strip().upper()}"

    def _endereco(m):
        return "-" * 32 + f"\nENDERECO: {m.group(1).strip().upper()}\n" + "-" * 32

    texto = _re.sub(r"\[CLIENTE\](.*?)\[/CLIENTE\]", _cliente, texto, flags=_re.S)
    texto = _re.sub(r"\[ENDERECO\](.*?)\[/ENDERECO\]", _endereco, texto, flags=_re.S)
    texto = _re.sub(
        r"\[ADDGROUP_LABEL\](.*?)\[/ADDGROUP_LABEL\]",
        lambda m: f"  {m.group(1).strip()}:",
        texto,
        flags=_re.S,
    )
    texto = _re.sub(
        r"\[ADD\](.*?)\[/ADD\]",
        lambda m: f"  >> {m.group(1).strip().upper()}",
        texto,
        flags=_re.S,
    )
    # Remove qualquer marcador residual desconhecido
    texto = _re.sub(r"\[/?(CLIENTE|ENDERECO|ADD|ADDGROUP_LABEL)\]", "", texto)
    return texto


def montar_linhas_estilizadas(texto, colunas=32):
    """
    Converte o texto da comanda em linhas com estilo (normal/bold/invertido),
    reproduzindo o layout de referencia da comanda de producao 58mm.
    Retorna lista de tuplas (linha, estilo).
    """
    import re as _re
    import textwrap as _tw

    saida = []

    def add(txt, estilo="normal"):
        txt = txt.rstrip()
        if not txt:
            saida.append(("", "normal"))
            return
        for i, parte in enumerate(_tw.wrap(txt, colunas) or [txt]):
            saida.append((parte, estilo))

    linhas_src = texto.split("\n")
    idx = 0
    while idx < len(linhas_src):
        linha = linhas_src[idx].strip()
        idx += 1
        if not linha:
            saida.append(("", "normal"))
            continue

        # Quantidade isolada ("1x") junta com o nome do produto da linha seguinte
        if _re.match(r"^\d+\s*x$", linha, _re.I) and idx < len(linhas_src):
            proximo = linhas_src[idx].strip()
            if proximo:
                linha = f"{linha} {proximo}"
                idx += 1

        upper = linha.upper()

        # Rodape antigo ("--- FIM ---") e removido: o padrao e adicionado no final
        if _re.match(r"^-{2,}\s*FIM.*$", upper):
            continue

        # Tipo do pedido no formato ">> RETIRADA <<"
        m_tipo = _re.match(r"^>>\s*([A-ZÀ-Ú ]+?)\s*<<$", upper)
        if m_tipo:
            add(m_tipo.group(1).strip(), "invert")
            continue

        # Cabecalho / titulo
        if ("COMANDA DE PRODU" in upper or upper.startswith("COMANDA #")
                or upper.startswith("PEDIDO") or upper.startswith("#")):
            add(linha, "bold")
            continue

        # Previsao de entrega/retirada
        if upper.startswith("PRONTO AT") or upper.startswith("PREVIS"):
            add(linha, "bold")
            continue

        # Nome do cliente -> faixa invertida (fundo preto)
        m_cli = _re.match(r"^CLIENTE:\s*(.+)$", linha, _re.I)
        if m_cli:
            add(m_cli.group(1).strip().upper(), "invert")
            continue

        # Tipo do pedido (RETIRADA / ENTREGA / MESA / BALCAO)
        if upper.strip("= ") in ("RETIRADA", "ENTREGA", "MESA", "BALCAO", "BALCÃO", "DELIVERY"):
            add(upper.strip("= "), "invert")
            continue

        # Linhas de separador do parser antigo
        if set(linha) <= {"=", "-"} and len(linha) > 3:
            continue

        # Data / hora
        if _re.match(r"^\d{2}/\d{2}/\d{4}", linha):
            add(linha, "bold")
            continue

        # Item: "1x Produto"
        m_item = _re.match(r"^(\d+)\s*x\s*(.+)$", linha, _re.I)
        if m_item:
            saida.append(("", "normal"))
            add(f"{m_item.group(1)}x  {m_item.group(2).strip()}", "item")
            continue

        # Descricao / observacao
        if upper.startswith("DESCRI") or upper.startswith("OBS"):
            add(linha, "bold")
            continue

        # Adicionais
        if linha.startswith(">>"):
            add(">> " + linha.lstrip("> ").upper(), "bold")
            continue

        add(linha, "normal")

    # Rodape padrao
    saida.append(("", "normal"))
    add("--- FIM DO PEDIDO ---", "bold")
    return saida


def imprimir_gdi(printer_name, texto, largura_mm=58):
    """
    Renderiza o conteudo como PAGINA GRAFICA (GDI) usando win32ui.
    Necessario para drivers que nao aceitam RAW (Microsoft Print to PDF,
    drivers de POS instalados em modo grafico). Gera arquivo/pagina real,
    eliminando o problema de PDF com 0 bytes.
    """
    try:
        import win32ui
        import win32con

        dc = win32ui.CreateDC()
        dc.CreatePrinterDC(printer_name)

        # Area imprimivel em pixels
        largura_px = dc.GetDeviceCaps(8)   # HORZRES
        altura_px = dc.GetDeviceCaps(10)   # VERTRES
        dpi_y = dc.GetDeviceCaps(90) or 203  # LOGPIXELSY

        if largura_px <= 0:
            largura_px = 384 if largura_mm == 58 else 576

        # Fonte monoespacada dimensionada para caber ~32 colunas em 58mm
        colunas = 32 if largura_mm == 58 else 48
        altura_fonte = max(-int(dpi_y / 12), -40)
        fonte_normal = win32ui.CreateFont({
            "name": "Consolas",
            "height": altura_fonte,
            "weight": 400,
        })
        fonte_bold = win32ui.CreateFont({
            "name": "Consolas",
            "height": altura_fonte,
            "weight": 700,
        })

        dc.StartDoc("ComandaTech Comanda")
        dc.StartPage()
        dc.SelectObject(fonte_bold)

        tm = dc.GetTextMetrics()
        linha_altura = tm["tmHeight"] + tm["tmExternalLeading"]
        largura_char = tm["tmAveCharWidth"] or 10
        y = 0

        linhas = montar_linhas_estilizadas(texto, colunas)
        for linha, estilo in linhas:
            if y + linha_altura > altura_px and altura_px > 0:
                dc.EndPage()
                dc.StartPage()
                y = 0
            if estilo == "invert":
                dc.SelectObject(fonte_bold)
                largura_faixa = largura_px if largura_px > 0 else largura_char * colunas
                dc.FillSolidRect((0, y, largura_faixa, y + linha_altura), 0x000000)
                dc.SetBkMode(win32con.TRANSPARENT)
                dc.SetTextColor(0xFFFFFF)
                dc.TextOut(2, y, linha[:colunas])
                dc.SetTextColor(0x000000)
            else:
                dc.SelectObject(fonte_bold if estilo in ("bold", "item") else fonte_normal)
                dc.SetBkMode(win32con.TRANSPARENT)
                dc.SetTextColor(0x000000)
                dc.TextOut(0, y, linha[:colunas * 2])
            y += linha_altura

        dc.EndPage()
        dc.EndDoc()
        dc.DeleteDC()
        log(f"Impressao GRAFICA (GDI) concluida em '{printer_name}'", "GDI")
        return True
    except Exception as e:
        log(f"Falha no modo grafico (GDI): {e}", "ERRO")
        return False


def _imprimir_html(html_content, station_id=None):
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

        # Tenta extrair entre marcadores se houver
        if "<!--HTML_START-->" in html_content and "<!--HTML_END-->" in html_content:
            html_content = html_content.split("<!--HTML_START-->")[1].split("<!--HTML_END-->")[0]
            log("Processando bloco HTML rico do PDV", "HTML")

        class MyHTMLParser(HTMLParser):
            def __init__(self):
                super().__init__()
                self.text = ""
                self.in_badge = False
                self.in_obs = False
                self.in_add = False
                self.skip_depth = 0  # style/script/head/title nao devem virar texto
            
            def handle_starttag(self, tag, attrs):
                # Tags vazias (void) nunca fecham: nao podem entrar no skip_depth
                if tag in ("meta", "link"):
                    return
                if tag in ("style", "script", "title", "head"):
                    self.skip_depth += 1
                    return
                if self.skip_depth:
                    return
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
                if tag in ("style", "script", "title", "head"):
                    if self.skip_depth:
                        self.skip_depth -= 1
                    return
                if self.skip_depth:
                    return
                if self.in_badge:
                    self.text += "="*32 + "\n"
                    self.in_badge = False
                elif self.in_obs:
                    self.text += "-"*32 + "\n"
                    self.in_obs = False
                elif self.in_add:
                    self.in_add = False

            def handle_data(self, data):
                if self.skip_depth:
                    return
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

        # Rede de seguranca: se o parser nao extraiu nada, cai para regex bruto
        if not texto_puro:
            import re as _re
            bruto = _re.sub(r'(?is)<(style|script|head)[^>]*>.*?</\1>', ' ', html_content)
            bruto = _re.sub(r'(?is)<br\s*/?>|</(div|p|tr|li|h[1-6])>', '\n', bruto)
            bruto = _re.sub(r'(?s)<[^>]+>', '', bruto)
            linhas = [l.strip() for l in bruto.split('\n')]
            texto_puro = "\n".join([l for l in linhas if l]).strip()
            log("Parser vazio: usando extracao alternativa por regex", "AVISO")

        if not texto_puro:
            log("Conteudo vazio apos parsing - impressao abortada", "ERRO")
            return False

        # Converte marcadores do Layout V2 (padrao Rei do Acai / 58mm)
        texto_puro = normalizar_marcadores(texto_puro)

        # Garante corte de papel/espaço no fim
        texto_puro += "\n\n\n\n\n"

        # ------------------------------------------------------------------
        # MODO GRAFICO (GDI) - exclusivo para lojas em GDI_COMPANY_IDS
        # Corrige PDF de 0 bytes (Microsoft Print to PDF nao aceita RAW)
        # e mantem o layout visual do V2 na POS 58mm.
        # ------------------------------------------------------------------
        if COMPANY_ID in GDI_COMPANY_IDS:
            if imprimir_gdi(printer_name, texto_puro):
                return True
            log("Fallback para modo RAW apos falha no modo grafico", "AVISO")

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
    global STORE_NAME, COMPANY_ID
    COMPANY_ID = company_id
    
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
