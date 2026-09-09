#!/usr/bin/env python3
"""Configura impressão local automaticamente (sem extensão Chrome)."""
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENV_LOCAL = ROOT / ".env.local"
PRINTER_ENV = Path(__file__).resolve().parent / "printer.local.env"
PRINTER_MAP = Path(os.environ.get("LOCALAPPDATA", "")) / "ComandaTech" / "printer_map.json"


def load_dotenv(path: Path) -> dict:
    out = {}
    if not path.exists():
        return out
    for line in path.read_text(encoding="utf-8").splitlines():
        t = line.strip()
        if not t or t.startswith("#"):
            continue
        if "=" not in t:
            continue
        k, v = t.split("=", 1)
        v = v.strip().strip('"').strip("'")
        out[k.strip()] = v
    return out


def save_printer_env(values: dict) -> None:
    lines = ["# Gerado por setup-impressao-local — não commitar", ""]
    for k, v in values.items():
        lines.append(f"{k}={v}")
    PRINTER_ENV.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    slug = (sys.argv[1] if len(sys.argv) > 1 else "").strip()

    env = load_dotenv(ENV_LOCAL)
    url = env.get("VITE_SUPABASE_URL", "").strip()
    key = env.get("VITE_SUPABASE_PUBLISHABLE_KEY", "").strip()

    if not url or not key:
        print("[ERRO] .env.local nao encontrado ou incompleto")
        return 1

    if not slug:
        slug = input("Slug da loja (ex: lancheria-bon-appetit): ").strip()
    if not slug:
        print("[ERRO] Slug obrigatorio")
        return 1

    try:
        import requests
    except ImportError:
        print("[ERRO] Rode primeiro: scripts\\instalar_impressao.cmd")
        return 1

    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    comp = requests.get(
        f"{url.rstrip('/')}/rest/v1/companies",
        params={"slug": f"eq.{slug}", "select": "id,name,slug", "active": "eq.true"},
        headers=headers,
        timeout=20,
    )
    comp.raise_for_status()
    rows = comp.json()
    if not rows:
        print(f"[ERRO] Empresa nao encontrada: {slug}")
        return 1
    company = rows[0]
    company_id = company["id"]

    station_rows = []
    try:
        stations = requests.get(
            f"{url.rstrip('/')}/rest/v1/print_stations",
            params={
                "company_id": f"eq.{company_id}",
                "active": "eq.true",
                "select": "id,name,slug",
                "order": "display_order.asc",
            },
            headers=headers,
            timeout=20,
        )
        if stations.ok:
            station_rows = stations.json()
        else:
            print(f"[AVISO] print_stations indisponivel ({stations.status_code}) - usando impressora padrao")
    except Exception as e:
        print(f"[AVISO] print_stations: {e} - usando impressora padrao")

    default_printer = None
    try:
        import win32print

        default_printer = win32print.GetDefaultPrinter()
    except Exception as e:
        print(f"[AVISO] Nao foi possivel detectar impressora padrao: {e}")

    station_printers = {s["id"]: default_printer for s in station_rows if default_printer}

    PRINTER_MAP.parent.mkdir(parents=True, exist_ok=True)
    printer_map = {
        "company_id": company_id,
        "supabase_url": url,
        "station_printers": station_printers,
        "fallback_printer": default_printer,
        "host_version": "setup-local-1",
    }
    PRINTER_MAP.write_text(json.dumps(printer_map, ensure_ascii=False, indent=2), encoding="utf-8")

    save_printer_env(
        {
            "SUPABASE_URL": url,
            "SUPABASE_KEY": key,
            "COMPANY_SLUG": slug,
            "COMPANY_ID": company_id,
        }
    )

    print("[OK] Impressao local configurada")
    print(f"   Loja: {company['name']} ({slug})")
    print(f"   Impressora padrao: {default_printer or '(nao detectada)'}")
    print(f"   Estacoes mapeadas: {len(station_printers)}")
    print(f"   Mapa: {PRINTER_MAP}")
    print(f"   Env:  {PRINTER_ENV}")
    print()
    print(">> Duplo clique: scripts\\iniciar_impressao-local.cmd")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
