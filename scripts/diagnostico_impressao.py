#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
ComandaTech - Diagnostico de Impressao (somente leitura)

Rode este arquivo NA MESMA PASTA do auto_printer.py, no computador da loja.

O que ele faz:
  - mostra a loja configurada (company_id) e a API usada
  - lista as impressoras instaladas no Windows e qual e a padrao
  - mostra o estado de cada impressora (pronta / pausada / offline / trabalhos presos)
  - mostra as estacoes cadastradas no painel e a impressora ligada a cada uma
  - mostra as comandas pendentes na fila (print_queue) da loja
  - mostra as ultimas linhas do printer_log.txt
  - opcionalmente imprime uma pagina de teste em modo RAW e em modo GRAFICO (GDI)

O que ele NAO faz:
  - nao altera pedidos, vendas, caixa, notas fiscais, TEF nem configuracoes
  - nao marca nada como impresso e nao apaga nada da fila
"""

import os
import re
import sys
import json
import time

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
AUTO_PRINTER = os.path.join(BASE_DIR, "auto_printer.py")
LOG_FILE = os.path.join(BASE_DIR, "printer_log.txt")
PRINTER_MAP_FILE = os.path.join(BASE_DIR, "printer_map.json")


def linha(titulo=""):
    print("\n" + "=" * 68)
    if titulo:
        print("  " + titulo)
        print("=" * 68)


def ler_config_do_auto_printer():
    """Le API_KEY / API_URL / COMPANY_ID ja injetados no auto_printer.py."""
    api_key = ""
    api_url = "https://api.comandatech.com.br/rest/v1"
    company_id = ""
    try:
        with open(AUTO_PRINTER, "r", encoding="utf-8", errors="ignore") as f:
            conteudo = f.read()
        m = re.search(r'^API_KEY\s*=\s*"([^"]*)"', conteudo, re.M)
        if m:
            api_key = m.group(1).strip()
        m = re.search(r'^COMPANY_ID\s*=\s*"([^"]*)"', conteudo, re.M)
        if m:
            company_id = m.group(1).strip()
        m = re.search(r'"(https://[^"]*comandatech[^"]*)"', conteudo)
        if m:
            api_url = m.group(1).rstrip("/") + "/rest/v1"
    except Exception as e:
        print("Nao consegui ler o auto_printer.py:", e)

    if not company_id:
        try:
            with open(os.path.join(BASE_DIR, "company_id.txt"), "r", encoding="utf-8") as f:
                company_id = f.read().strip()
        except Exception:
            pass
    if not company_id:
        company_id = os.environ.get("COMANDATECH_COMPANY_ID", "").strip()

    return api_key, api_url, company_id


def secao_impressoras():
    linha("IMPRESSORAS INSTALADAS NO WINDOWS")
    try:
        import win32print
    except Exception as e:
        print("pywin32 indisponivel:", e)
        return []

    try:
        padrao = win32print.GetDefaultPrinter()
    except Exception as e:
        padrao = None
        print("Nao foi possivel ler a impressora padrao:", e)

    nomes = []
    flags = win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS
    for p in win32print.EnumPrinters(flags, None, 2):
        nome = p["pPrinterName"]
        nomes.append(nome)
        marca = "  <== PADRAO" if nome == padrao else ""
        print("\n- %s%s" % (nome, marca))
        print("    driver .......: %s" % p.get("pDriverName"))
        print("    porta ........: %s" % p.get("pPortName"))
        print("    trabalhos ....: %s" % p.get("cJobs"))
        print("    status .......: %s" % descrever_status(p.get("Status", 0)))
        print("    atributos ....: %s" % descrever_atributos(p.get("Attributes", 0)))
        listar_jobs(win32print, nome)
    return nomes


def descrever_status(status):
    import win32print
    mapa = {
        win32print.PRINTER_STATUS_PAUSED: "PAUSADA",
        win32print.PRINTER_STATUS_ERROR: "ERRO",
        win32print.PRINTER_STATUS_PAPER_JAM: "PAPEL PRESO",
        win32print.PRINTER_STATUS_PAPER_OUT: "SEM PAPEL",
        win32print.PRINTER_STATUS_OFFLINE: "OFFLINE",
        win32print.PRINTER_STATUS_NOT_AVAILABLE: "INDISPONIVEL",
        win32print.PRINTER_STATUS_DOOR_OPEN: "TAMPA ABERTA",
        win32print.PRINTER_STATUS_OUT_OF_MEMORY: "SEM MEMORIA",
    }
    achados = [txt for bit, txt in mapa.items() if status & bit]
    return ", ".join(achados) if achados else "PRONTA"


def descrever_atributos(attrs):
    import win32print
    achados = []
    if attrs & win32print.PRINTER_ATTRIBUTE_WORK_OFFLINE:
        achados.append("USAR IMPRESSORA OFFLINE")
    if attrs & win32print.PRINTER_ATTRIBUTE_SHARED:
        achados.append("compartilhada")
    if attrs & win32print.PRINTER_ATTRIBUTE_RAW_ONLY:
        achados.append("somente RAW")
    return ", ".join(achados) if achados else "-"


def listar_jobs(win32print, nome):
    try:
        h = win32print.OpenPrinter(nome)
        try:
            jobs = win32print.EnumJobs(h, 0, 20, 1)
            if jobs:
                print("    FILA PRESA ...: %d trabalho(s)" % len(jobs))
                for j in jobs[:5]:
                    print("        - %s (status %s)" % (j.get("pDocument"), j.get("Status")))
        finally:
            win32print.ClosePrinter(h)
    except Exception as e:
        print("    (nao consegui ler a fila: %s)" % e)


def api_get(api_url, api_key, caminho):
    import requests
    headers = {"apikey": api_key, "Authorization": "Bearer " + api_key}
    r = requests.get(api_url + caminho, headers=headers, timeout=20)
    if r.status_code != 200:
        print("  HTTP %s - %s" % (r.status_code, r.text[:200]))
        return None
    return r.json()


def secao_painel(api_url, api_key, company_id, nomes_windows):
    linha("CADASTRO NO PAINEL (somente leitura)")
    if not api_key or not company_id:
        print("Chave ou identificador da loja ausentes - baixe o instalador novamente pelo painel.")
        return

    print("Loja ..: %s" % company_id)
    print("API ...: %s" % api_url)

    print("\nESTACOES DE IMPRESSAO:")
    estacoes = api_get(api_url, api_key,
                       "/print_stations?company_id=eq.%s&select=id,name,printer_name" % company_id)
    if estacoes is None:
        print("  (nao foi possivel consultar)")
    elif not estacoes:
        print("  nenhuma estacao cadastrada (usa a impressora padrao do Windows)")
    else:
        for e in estacoes:
            nome_imp = (e.get("printer_name") or "").strip()
            existe = "OK" if nome_imp in nomes_windows else "NAO EXISTE NESTE COMPUTADOR"
            print("  - %s -> '%s'  [%s]" % (e.get("name"), nome_imp or "(vazio)", existe))

    print("\nCONFIGURACAO DA LOJA:")
    cfg = api_get(api_url, api_key,
                  "/store_settings?company_id=eq.%s&select=key,value" % company_id)
    if cfg:
        for s in cfg:
            if s.get("key") in ("print_layout", "printer_paper_size"):
                print("  - %s = %s" % (s["key"], s["value"]))

    print("\nCOMANDAS PENDENTES NA FILA:")
    fila = api_get(api_url, api_key,
                   "/print_queue?company_id=eq.%s&printed=eq.false&select=id,label,station_id,created_at&order=created_at.asc"
                   % company_id)
    if fila is None:
        print("  (nao foi possivel consultar)")
    elif not fila:
        print("  nenhuma pendente (tudo que entrou ja foi confirmado como impresso)")
    else:
        for f in fila[:20]:
            print("  - %s | estacao=%s | %s" % (f.get("label"), f.get("station_id"), f.get("created_at")))

    print("\nULTIMAS COMANDAS ENVIADAS (ja confirmadas):")
    hist = api_get(api_url, api_key,
                   "/print_queue?company_id=eq.%s&select=label,printed,printed_at,station_id&order=created_at.desc&limit=10"
                   % company_id)
    if hist:
        for f in hist:
            print("  - %s | impressa=%s | %s | estacao=%s"
                  % (f.get("label"), f.get("printed"), f.get("printed_at"), f.get("station_id")))
    else:
        print("  (sem registros recentes - a fila e limpa apos a impressao)")

    if os.path.exists(PRINTER_MAP_FILE):
        print("\nMAPA LOCAL (printer_map.json):")
        try:
            with open(PRINTER_MAP_FILE, "r", encoding="utf-8") as f:
                print("  " + json.dumps(json.load(f), ensure_ascii=False))
        except Exception as e:
            print("  (ilegivel: %s)" % e)


def secao_log():
    linha("ULTIMAS LINHAS DO printer_log.txt")
    if not os.path.exists(LOG_FILE):
        print("arquivo nao encontrado")
        return
    try:
        with open(LOG_FILE, "r", encoding="utf-8", errors="ignore") as f:
            linhas = f.readlines()
        for l in linhas[-40:]:
            print(l.rstrip())
    except Exception as e:
        print("nao consegui ler o log:", e)


def teste_raw(nome):
    import win32print
    texto = ("\nTESTE COMANDATECH - MODO RAW\n"
             + time.strftime("%d/%m/%Y %H:%M:%S")
             + "\nSe voce esta lendo isto no papel,\na impressora aceita o envio direto.\n\n\n\n")
    h = win32print.OpenPrinter(nome)
    try:
        job = win32print.StartDocPrinter(h, 1, ("ComandaTech Teste RAW", None, "RAW"))
        win32print.StartPagePrinter(h)
        win32print.WritePrinter(h, texto.encode("cp850", "replace"))
        win32print.EndPagePrinter(h)
        win32print.EndDocPrinter(h)
        print("Enviado em RAW (job %s)." % job)
    finally:
        win32print.ClosePrinter(h)


def teste_gdi(nome):
    import win32ui
    dc = win32ui.CreateDC()
    dc.CreatePrinterDC(nome)
    dc.StartDoc("ComandaTech Teste GDI")
    dc.StartPage()
    dc.TextOut(10, 10, "TESTE COMANDATECH - MODO GRAFICO")
    dc.TextOut(10, 40, time.strftime("%d/%m/%Y %H:%M:%S"))
    dc.EndPage()
    dc.EndDoc()
    dc.DeleteDC()
    print("Enviado em modo grafico (GDI).")


def main():
    print("ComandaTech - Diagnostico de Impressao (somente leitura)")
    api_key, api_url, company_id = ler_config_do_auto_printer()
    nomes = secao_impressoras()
    secao_painel(api_url, api_key, company_id, nomes)
    secao_log()

    linha("TESTE DE IMPRESSAO (opcional)")
    print("Isto apenas imprime uma folha de teste. Nao altera nenhum pedido.")
    resp = input("Deseja imprimir a folha de teste agora? (s/n): ").strip().lower()
    if resp != "s":
        print("Teste ignorado.")
    else:
        try:
            import win32print
            padrao = win32print.GetDefaultPrinter()
        except Exception:
            padrao = None
        alvo = input("Nome exato da impressora (Enter para a padrao '%s'): " % padrao).strip() or padrao
        if not alvo:
            print("Nenhuma impressora informada.")
        else:
            for nome_modo, func in (("RAW", teste_raw), ("GRAFICO", teste_gdi)):
                try:
                    func(alvo)
                except Exception as e:
                    print("Falha no modo %s: %s" % (nome_modo, e))
            print("\nVeja qual das duas folhas saiu no papel. Isso indica o modo correto para esta loja.")

    linha("FIM")
    input("Pressione Enter para fechar...")


if __name__ == "__main__":
    main()
