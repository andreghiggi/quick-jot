#!/usr/bin/env python3
"""
ComandaTech — Native Messaging host para extensão Chrome.
Comandos: list_printers, save_map, test_print, ping
"""
import json
import os
import struct
import sys
from pathlib import Path

PRINTER_MAP_PATH = Path(os.environ.get("LOCALAPPDATA", "")) / "ComandaTech" / "printer_map.json"


def read_message():
    raw_len = sys.stdin.buffer.read(4)
    if not raw_len:
        return None
    msg_len = struct.unpack("=I", raw_len)[0]
    data = sys.stdin.buffer.read(msg_len)
    return json.loads(data.decode("utf-8"))


def send_message(obj):
    encoded = json.dumps(obj).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("=I", len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()


def list_printers():
    try:
        import win32print
        flags = win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS
        printers = win32print.EnumPrinters(flags)
        names = sorted({p[2] for p in printers if p[2]})
        default = win32print.GetDefaultPrinter()
        return {"ok": True, "printers": names, "default": default}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def save_map(payload):
    try:
        PRINTER_MAP_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(PRINTER_MAP_PATH, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
        return {"ok": True, "path": str(PRINTER_MAP_PATH)}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def test_print(printer_name):
    try:
        import win32print
        import win32ui
        import win32con
        hDC = win32ui.CreateDC()
        hDC.CreatePrinterDC(printer_name or win32print.GetDefaultPrinter())
        hDC.StartDoc("ComandaTech Teste")
        hDC.StartPage()
        hDC.TextOut(100, 100, "ComandaTech — teste de impressora OK")
        hDC.EndPage()
        hDC.EndDoc()
        hDC.DeleteDC()
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def handle(msg):
    action = msg.get("action")
    if action == "ping":
        return {"ok": True, "version": "1.0.0"}
    if action == "list_printers":
        return list_printers()
    if action == "save_map":
        return save_map(msg.get("map") or {})
    if action == "test_print":
        return test_print(msg.get("printer"))
    return {"ok": False, "error": f"acao desconhecida: {action}"}


def main():
    while True:
        msg = read_message()
        if msg is None:
            break
        try:
            send_message(handle(msg))
        except Exception as e:
            send_message({"ok": False, "error": str(e)})


if __name__ == "__main__":
    main()
