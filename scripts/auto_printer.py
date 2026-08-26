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
SCRIPT_VERSION = "1.7.2"
CHECK_INTERVAL = 5  # Segundos entre verificações
API_URL = "https://iwmrtxdzlkasuzutxvhh.supabase.co/rest/v1"
API_KEY = "" # Injetado pelo frontend
LOG_FILE = "printer_log.txt"
STORE_NAME = ""
STORE_INFO = {}
COMPANY_ID = "" # Injetado pelo frontend
PRINTER_MAP_FILE = "printer_map.json"

# Tamanho de papel configurado na loja (store_settings.printer_paper_size).
# Usado pelo renderizador grafico para dimensionar fonte, colunas e faixas.
PAPER_SIZE = "58mm"
PRINT_LAYOUT = "v1"
CONFIG_LAST_SYNC = 0
CONFIG_TTL = 300  # segundos

# Cache do mapeamento estacao -> impressora (vindo do painel)
STATION_PRINTERS = {}
STATIONS_LAST_SYNC = 0
STATIONS_TTL = 300  # segundos

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

def carregar_config_loja(force=False):
    """
    Le em store_settings o tamanho de papel (printer_paper_size) e o layout
    (print_layout) configurados no painel. O renderizador grafico usa esses
    valores para dimensionar a impressao conforme a configuracao da loja.
    """
    global PAPER_SIZE, PRINT_LAYOUT, CONFIG_LAST_SYNC
    agora = time.time()
    if not force and (agora - CONFIG_LAST_SYNC) < CONFIG_TTL:
        return PAPER_SIZE
    if not COMPANY_ID:
        return PAPER_SIZE
    try:
        url = (
            f"{API_URL}/store_settings?company_id=eq.{COMPANY_ID}"
            f"&key=in.(printer_paper_size,print_layout)&select=key,value"
        )
        resp = requests.get(url, headers=get_headers(), timeout=15)
        if resp.status_code == 200:
            for row in resp.json():
                valor = (row.get("value") or "").strip()
                if not valor:
                    continue
                if row.get("key") == "printer_paper_size":
                    PAPER_SIZE = valor
                elif row.get("key") == "print_layout":
                    PRINT_LAYOUT = valor
            CONFIG_LAST_SYNC = agora
            log(f"Config da loja: papel {PAPER_SIZE} / layout {PRINT_LAYOUT}", "CONFIG")
        else:
            log(f"Erro ao buscar configuracoes da loja: {resp.status_code}", "AVISO")
    except Exception as e:
        log(f"Falha ao sincronizar configuracoes da loja: {e}", "AVISO")
    return PAPER_SIZE


def carregar_estacoes(force=False):
    """
    Busca no painel as estacoes da loja e monta o mapa
    station_id -> nome da impressora compartilhada do Windows.
    """
    global STATION_PRINTERS, STATIONS_LAST_SYNC
    agora = time.time()
    if not force and STATION_PRINTERS and (agora - STATIONS_LAST_SYNC) < STATIONS_TTL:
        return STATION_PRINTERS
    if not COMPANY_ID:
        return STATION_PRINTERS
    try:
        url = f"{API_URL}/print_stations?company_id=eq.{COMPANY_ID}&select=id,name,printer_name"
        resp = requests.get(url, headers=get_headers(), timeout=15)
        if resp.status_code == 200:
            mapa = {}
            for st in resp.json():
                nome = (st.get("printer_name") or "").strip()
                if nome:
                    mapa[st["id"]] = nome
            STATION_PRINTERS = mapa
            STATIONS_LAST_SYNC = agora
            if mapa:
                log(f"Estacoes sincronizadas: {', '.join(mapa.values())}", "STATION")
        else:
            log(f"Erro ao buscar estacoes: {resp.status_code}", "AVISO")
    except Exception as e:
        log(f"Falha ao sincronizar estacoes: {e}", "AVISO")
    return STATION_PRINTERS


def get_printer_for_station(station_id):
    """
    Resolve a impressora da estacao:
    1) cadastro do painel (print_stations.printer_name)
    2) arquivo local printer_map.json (plano B)
    """
    if not station_id:
        return None

    mapa = carregar_estacoes()
    if mapa.get(station_id):
        return mapa[station_id]

    try:
        if not os.path.exists(PRINTER_MAP_FILE):
            return None
        with open(PRINTER_MAP_FILE, "r", encoding="utf-8") as f:
            mapping = json.load(f)
            nome = (mapping.get(station_id) or "").strip()
            return nome or None
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
    Converte o texto da comanda em linhas com PAPEL LOGICO (estilo por
    elemento), reproduzindo a hierarquia do layout V2 de referencia:
    titulo, modalidade, numero do pedido, faixa do cliente, data/hora,
    "Pronto ate", itens, adicionais, observacoes e rodape.

    Retorna lista de tuplas (linha, estilo). Estilos possiveis:
      titulo | tipo | pedido | cliente | datetime | pronto |
      item | add | obs | normal | rodape | espaco
    """
    import re as _re
    import textwrap as _tw

    # Colunas efetivas por estilo (fontes maiores cabem menos caracteres)
    fator = {
        "titulo": 0.72,
        "tipo": 0.72,
        "pedido": 0.72,
        "cliente": 0.80,
        "datetime": 1.0,
        "pronto": 0.85,
        "item": 0.85,
        "add": 0.90,
        "obs": 0.90,
        "normal": 1.0,
        "rodape": 1.0,
    }

    saida = []

    def add(txt, estilo="normal"):
        txt = txt.rstrip()
        if not txt:
            saida.append(("", "espaco"))
            return
        largura = max(8, int(colunas * fator.get(estilo, 1.0)))
        for parte in (_tw.wrap(txt, largura) or [txt]):
            saida.append((parte, estilo))

    linhas_src = texto.split("\n")
    idx = 0
    while idx < len(linhas_src):
        linha = linhas_src[idx].strip()
        idx += 1
        if not linha:
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

        # Linhas de separador do parser antigo
        if set(linha) <= {"=", "-", ".", "_"} and len(linha) > 3:
            continue

        # Titulo da comanda
        if "COMANDA DE PRODU" in upper:
            add("COMANDA DE PRODUÇÃO", "titulo")
            continue

        # Modalidade no formato ">> RETIRADA <<"
        m_tipo = _re.match(r"^>>\s*([A-ZÀ-Ú ]+?)\s*<<$", upper)
        if m_tipo:
            add(f">> {m_tipo.group(1).strip()} <<", "tipo")
            continue

        # Modalidade solta (RETIRADA / ENTREGA / MESA / BALCAO)
        if upper.strip("= ") in ("RETIRADA", "ENTREGA", "MESA", "BALCAO", "BALCÃO", "DELIVERY"):
            add(f">> {upper.strip('= ')} <<", "tipo")
            continue

        # Numero do pedido / comanda
        if upper.startswith("PEDIDO") or upper.startswith("COMANDA #") or upper.startswith("#"):
            add(upper, "pedido")
            continue

        # Nome do cliente -> faixa invertida (fundo preto)
        m_cli = _re.match(r"^CLIENTE:\s*(.+)$", linha, _re.I)
        if m_cli:
            add(m_cli.group(1).strip().upper(), "cliente")
            continue

        # Endereco de entrega -> tambem em faixa invertida
        m_end = _re.match(r"^ENDERECO:\s*(.+)$", linha, _re.I)
        if m_end:
            add(m_end.group(1).strip().upper(), "cliente")
            continue

        # Previsao de entrega/retirada
        if upper.startswith("PRONTO AT") or upper.startswith("PREVIS"):
            add(linha, "pronto")
            continue

        # Data / hora
        if _re.match(r"^\d{2}/\d{2}/\d{4}", linha):
            add(linha, "datetime")
            continue

        # Item: "1x Produto"
        m_item = _re.match(r"^(\d+)\s*x\s*(.+)$", linha, _re.I)
        if m_item:
            saida.append(("", "espaco"))
            add(f"{m_item.group(1)}x  {m_item.group(2).strip()}", "item")
            continue

        # Observacoes
        if upper.startswith("OBS") or upper.startswith("DESCRI"):
            add(linha, "obs")
            continue

        # Adicionais
        if linha.startswith(">>"):
            add(">> " + linha.lstrip("> ").upper(), "add")
            continue

        add(linha, "normal")

    saida.append(("", "espaco"))
    add("--- FIM ---", "rodape")
    return saida


def extrair_blocos_v2(html_content):
    """Transforma o HTML V2 em blocos semanticos sem descartar sua hierarquia."""
    from html.parser import HTMLParser
    import html as _html
    import re as _re

    class Node:
        def __init__(self, tag="root", attrs=None, parent=None):
            self.tag = tag
            self.attrs = dict(attrs or [])
            self.parent = parent
            self.children = []
            self.parts = []

        def classes(self):
            return set(self.attrs.get("class", "").split())

        def text(self):
            values = list(self.parts)
            for child in self.children:
                values.append(child.text())
            return _re.sub(r"\s+", " ", _html.unescape(" ".join(values))).strip()

    class TreeParser(HTMLParser):
        VOID = {"br", "hr", "meta", "link", "img", "input"}

        def __init__(self):
            super().__init__()
            self.root = Node()
            self.current = self.root
            self.skip_depth = 0

        def handle_starttag(self, tag, attrs):
            if tag in ("style", "script", "head", "title"):
                self.skip_depth += 1
                return
            if self.skip_depth:
                return
            node = Node(tag, attrs, self.current)
            self.current.children.append(node)
            if tag not in self.VOID:
                self.current = node

        def handle_endtag(self, tag):
            if tag in ("style", "script", "head", "title"):
                if self.skip_depth:
                    self.skip_depth -= 1
                return
            if self.skip_depth or tag in self.VOID:
                return
            probe = self.current
            while probe.parent and probe.tag != tag:
                probe = probe.parent
            if probe.parent and probe.tag == tag:
                self.current = probe.parent

        def handle_data(self, data):
            if not self.skip_depth and data.strip():
                self.current.parts.append(data.strip())

    parser = TreeParser()
    parser.feed(html_content)

    def walk(node):
        yield node
        for child in node.children:
            yield from walk(child)

    nodes = list(walk(parser.root))

    def by_class(name):
        return [node for node in nodes if name in node.classes()]

    def clean_marker(value):
        value = _re.sub(r"\[/?(?:CLIENTE|ENDERECO|ADD|ADDGROUP_LABEL)\]", "", value)
        return _re.sub(r"\s+", " ", value).strip()

    def normalizar_ready(value):
        """Corrige a ordem invertida do DOM: '20:41 Pronto ate:' -> 'Pronto ate: 20:41'."""
        value = clean_marker(value)
        m = _re.match(r"^(\d{1,2}:\d{2})\s*(pronto at[eé]:?)\s*$", value, _re.I)
        if m:
            return f"Pronto até: {m.group(1)}"
        return value

    def block(text, style="normal", align="left", right=None):
        text = clean_marker(text)
        if text or right:
            return {"text": text, "style": style, "align": align, "right": clean_marker(right or "")}
        return None


    blocos = []
    is_receipt = any(node.tag == "h2" and "RECIBO" in node.text().upper() for node in nodes)

    if not is_receipt and by_class("title"):
        title = block(by_class("title")[0].text(), "title", "center")
        if title:
            blocos.append(title)
        badges = by_class("order-type-badge")
        if badges:
            blocos.append(block(badges[0].text(), "type", "center"))
        infos = by_class("info")
        if infos:
            blocos.append(block(infos[0].text(), "order", "center"))
        table_infos = by_class("table-info")
        if table_infos:
            blocos.append(block(table_infos[0].text(), "type", "center"))
        customer = next((node for node in infos if "[CLIENTE]" in node.text()), None)
        if customer:
            blocos.append(block(customer.text(), "inverse"))
        datetimes = [node for node in by_class("datetime") if "ready-inline" not in node.classes()]
        if datetimes:
            blocos.append(block(datetimes[0].text(), "datetime", "center"))
        ready = by_class("ready-inline")
        if ready:
            blocos.append(block(normalizar_ready(ready[0].text()), "ready", "center"))
        address = next((node for node in infos if "[ENDERECO]" in node.text()), None)
        if address:
            blocos.append(block(address.text(), "inverse"))

        blocos.append({"text": "", "style": "sep", "align": "left", "right": ""})

        for item in by_class("item"):
            # Ignora containers que apenas envolvem outros .item.
            if any("item" in child.classes() for child in item.children):
                continue
            qty = next((node.text() for node in walk(item) if "qty" in node.classes()), "")
            name = next((node.text() for node in walk(item) if "name" in node.classes()), "")
            if qty or name:
                # Uma unica coluna com quebra de linha: evita corte do nome na margem.
                linha_item = " ".join(p for p in (clean_marker(qty), clean_marker(name)) if p)
                blocos.append({"text": linha_item, "style": "item_qty", "align": "left", "right": ""})
            for node in walk(item):
                classes = node.classes()
                if "description" in classes:
                    blocos.append(block(node.text(), "description"))
                elif "add-group-label" in classes:
                    blocos.append(block("■ " + node.text(), "group"))
                elif "add-line" in classes:
                    blocos.append(block(node.text().replace(">>", "+", 1), "additional"))
                elif "obs-text" in classes:
                    blocos.append(block(node.text(), "inverse"))
        blocos.append(block("--- FIM ---", "footer", "center"))
        return [b for b in blocos if b]


    if is_receipt:
        body = next((node for node in nodes if node.tag == "body"), parser.root)
        blocos.append(block(STORE_NAME or "COMANDATECH", "store", "center"))
        for child in body.children:
            text = child.text()
            classes = child.classes()
            if child.tag == "hr":
                blocos.append({"text": "", "style": "sep", "align": "left", "right": ""})
                continue
            if not text:
                continue
            if child.tag == "h2":
                continue
            if "total" in classes:
                spans = [node.text() for node in child.children if node.tag == "span"]
                blocos.append({"text": spans[0] if spans else "TOTAL", "style": "total", "align": "left", "right": spans[1] if len(spans) > 1 else ""})
            elif "[CLIENTE]" in text:
                blocos.append(block(text, "inverse"))
            elif "[ENDERECO]" in text:
                blocos.append(block(text, "inverse"))
            elif text.upper().startswith("PRONTO AT") or _re.match(r"^\d{1,2}:\d{2}\s*pronto", text, _re.I):
                blocos.append(block(normalizar_ready(text), "ready"))
            elif _re.match(r"^[A-Z]-\d{3,}$", text, _re.I) or text.upper().startswith("PEDIDO #"):
                blocos.append(block(text, "order", "center"))
            elif _re.match(r"^[A-F0-9]{6,}$", text, _re.I):
                blocos.append(block(text, "code", "center"))
            elif "add-group-label" in classes:
                blocos.append(block("■ " + text, "group"))
            elif "add-line" in classes:
                blocos.append(block(text.replace(">>", "+", 1), "additional"))
            elif child.tag == "div" and any(grand.tag == "span" for grand in child.children):
                spans = [grand.text() for grand in child.children if grand.tag == "span"]
                estilo_linha = "total" if _re.match(r"^(sub\s*total|subtotal|total)", clean_marker(spans[0] if spans else text), _re.I) else "item"
                blocos.append({"text": clean_marker(spans[0]) if spans else clean_marker(text), "style": estilo_linha, "align": "left", "right": clean_marker(spans[1]) if len(spans) > 1 else ""})
            elif _re.match(r"^\d{1,2}/\d{1,2}/\d{4}", text):
                blocos.append(block(text, "datetime", "center"))
            elif text.upper().startswith("PAGAMENTO"):
                blocos.append(block(text.upper(), "ready"))
            else:
                blocos.append(block(text, "normal"))
        blocos.append({"text": "", "style": "sep", "align": "left", "right": ""})
        blocos.append(block("Obrigado pela preferência!", "footer", "center"))

        return [b for b in blocos if b]

    return []


def imprimir_gdi(printer_name, conteudo, largura_mm=None):
    """
    Renderiza o conteudo como PAGINA GRAFICA (GDI) usando win32ui,
    respeitando o TAMANHO DE PAPEL configurado na loja (58mm ou 80mm)
    e reproduzindo a hierarquia visual do layout V2 de referencia.

    Necessario para drivers que nao aceitam RAW (Microsoft Print to PDF,
    drivers de POS em modo grafico) e evita PDF com 0 bytes.
    """
    try:
        import win32ui
        import win32con

        if not largura_mm:
            largura_mm = 80 if str(PAPER_SIZE).startswith("80") else 58

        dc = win32ui.CreateDC()
        dc.CreatePrinterDC(printer_name)

        # Area imprimivel real. Em drivers A4 (Microsoft Print to PDF), o
        # canvas continua limitado ao papel termico selecionado no sistema.
        largura_px = dc.GetDeviceCaps(8)    # HORZRES
        altura_px = dc.GetDeviceCaps(10)    # VERTRES
        dpi_x = dc.GetDeviceCaps(88) or 203  # LOGPIXELSX
        dpi_y = dc.GetDeviceCaps(90) or 203  # LOGPIXELSY
        largura_fisica_px = int(dpi_x * largura_mm / 25.4)
        largura_canvas = min(largura_px, largura_fisica_px) if largura_px > 0 else largura_fisica_px
        margem = max(4, int(dpi_x * 2.0 / 25.4))
        largura_util = max(80, largura_canvas - (margem * 2))

        pontos = {
            "store": 17, "title": 17, "type": 17, "order": 17,
            "code": 12, "inverse": 16, "datetime": 15, "ready": 16,
            "item_qty": 15, "item": 14, "description": 12,
            "group": 13, "additional": 13, "normal": 14,
            "total": 17, "footer": 14, "sep": 12,
        }
        pesos = {
            "store": 800, "title": 800, "type": 800, "order": 800,
            "code": 500, "inverse": 800, "datetime": 700, "ready": 800,
            "item_qty": 800, "item": 600, "description": 500,
            "group": 800, "additional": 700, "normal": 700,
            "total": 800, "footer": 700, "sep": 700,
        }
        invertidos = {"inverse"}


        cache_fontes = {}

        def fonte(estilo):
            if estilo not in cache_fontes:
                cache_fontes[estilo] = win32ui.CreateFont({
                    "name": "Courier New",
                    "height": -max(10, int(pontos.get(estilo, 11) * dpi_y / 72)),
                    "weight": pesos.get(estilo, 500),
                })
            return cache_fontes[estilo]

        def quebrar(texto, estilo, limite_px):
            dc.SelectObject(fonte(estilo))
            palavras = texto.split()
            if not palavras:
                return [""]
            linhas, atual = [], palavras[0]
            for palavra in palavras[1:]:
                candidato = atual + " " + palavra
                if dc.GetTextExtent(candidato)[0] <= limite_px:
                    atual = candidato
                else:
                    linhas.append(atual)
                    atual = palavra
            linhas.append(atual)
            return linhas

        dc.StartDoc("ComandaTech Comanda")
        dc.StartPage()

        blocos = extrair_blocos_v2(conteudo) if "<" in conteudo else []
        if not blocos:
            # Compatibilidade para algum job antigo que ainda esteja em texto.
            blocos = [
                {"text": linha, "style": estilo, "align": "left", "right": ""}
                for linha, estilo in montar_linhas_estilizadas(conteudo, 44 if largura_mm >= 80 else 32)
                if estilo != "espaco"
            ]

        y = margem
        for bloco in blocos:
            estilo = bloco.get("style", "normal")
            texto = bloco.get("text", "")
            direita = bloco.get("right", "")
            alinhamento = bloco.get("align", "left")
            dc.SelectObject(fonte(estilo))
            tm = dc.GetTextMetrics()
            altura_linha = max(12, tm["tmHeight"] + tm["tmExternalLeading"])
            espaco_depois = max(2, int(dpi_y * (1.2 if estilo in ("title", "type", "order", "inverse", "ready", "total") else 0.7) / 25.4))

            if direita:
                direita_px = dc.GetTextExtent(direita)[0]
                limite_esquerda = max(int(largura_util * 0.45), largura_util - direita_px - margem)
                linhas = quebrar(texto, estilo, limite_esquerda)
            else:
                linhas = quebrar(texto, estilo, largura_util)

            bloco_altura = altura_linha * len(linhas) + espaco_depois
            if altura_px > 0 and y + bloco_altura > altura_px:
                dc.EndPage()
                dc.StartPage()
                y = margem
                dc.SelectObject(fonte(estilo))

            if estilo in invertidos:
                dc.FillSolidRect((0, y, largura_canvas, y + bloco_altura), 0x000000)
                dc.SetTextColor(0xFFFFFF)
            else:
                dc.SetTextColor(0x000000)
            dc.SetBkMode(win32con.TRANSPARENT)

            for indice, linha in enumerate(linhas):
                linha_px = dc.GetTextExtent(linha)[0]
                if alinhamento == "center":
                    x = margem + max(0, (largura_util - linha_px) // 2)
                elif alinhamento == "right":
                    x = margem + max(0, largura_util - linha_px)
                else:
                    x = margem
                dc.TextOut(x, y + indice * altura_linha, linha)

            if direita:
                direita_px = dc.GetTextExtent(direita)[0]
                dc.TextOut(margem + max(0, largura_util - direita_px), y, direita)

            dc.SetTextColor(0x000000)
            y += bloco_altura

        dc.EndPage()
        dc.EndDoc()
        dc.DeleteDC()
        log(
            f"Impressao GRAFICA (GDI) concluida em '{printer_name}' "
            f"[papel {largura_mm}mm / canvas {largura_canvas}px / {len(blocos)} blocos V2]",
            "GDI",
        )
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
            carregar_config_loja()
            if imprimir_gdi(printer_name, html_content):
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

    carregar_estacoes(force=True)
    carregar_config_loja(force=True)

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
