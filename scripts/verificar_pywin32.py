"""
Comanda Tech - verificador de dependencias de impressao no Windows.

Este arquivo valida o pywin32 do mesmo Python usado pelo instalador/launcher.
Ele tambem adiciona a pasta pywin32_system32 ao caminho de DLLs do processo,
corrigindo o erro comum do Windows 11:
"DLL load failed while importing win32print".
"""

import os
import platform
import site
import sys
from pathlib import Path

_DLL_HANDLES = []


def _unique_paths(paths):
    seen = set()
    result = []
    for raw in paths:
        if not raw:
            continue
        try:
            path = Path(raw).resolve()
        except Exception:
            continue
        key = str(path).lower()
        if key not in seen and path.exists():
            seen.add(key)
            result.append(path)
    return result


def _site_package_roots():
    roots = []
    try:
        roots.extend(site.getsitepackages())
    except Exception:
        pass
    try:
        roots.append(site.getusersitepackages())
    except Exception:
        pass
    roots.extend([p for p in sys.path if p and "site-packages" in p.lower()])
    roots.append(Path(sys.prefix) / "Lib" / "site-packages")
    roots.append(Path(sys.base_prefix) / "Lib" / "site-packages")
    return _unique_paths(roots)


def prepare_pywin32_dll_path(verbose=True):
    """Adiciona as pastas do pywin32 ao PATH/DLL search path do processo atual."""
    candidates = []
    for root in _site_package_roots():
        candidates.extend([
            root / "pywin32_system32",
            root / "win32",
            root / "win32" / "lib",
            root / "Pythonwin",
        ])

    added = []
    current_path = [p.lower() for p in os.environ.get("PATH", "").split(os.pathsep) if p]
    for path in _unique_paths(candidates):
        path_str = str(path)
        if path_str.lower() not in current_path:
            os.environ["PATH"] = path_str + os.pathsep + os.environ.get("PATH", "")
        if path.name.lower() in {"win32", "pythonwin"} and path_str not in sys.path:
            sys.path.insert(0, path_str)
        if hasattr(os, "add_dll_directory") and path.name.lower() == "pywin32_system32":
            try:
                _DLL_HANDLES.append(os.add_dll_directory(path_str))
            except OSError:
                pass
        added.append(path_str)

    if verbose:
        if added:
            print("Pastas pywin32 encontradas:")
            for path in added:
                print(f"  - {path}")
        else:
            print("Nenhuma pasta pywin32_system32/win32 encontrada no Python atual.")
    return added


def main():
    print("=== Comanda Tech - Verificacao pywin32 ===")
    print(f"Python: {platform.python_version()} ({platform.architecture()[0]})")
    print(f"Executavel: {sys.executable}")
    prepare_pywin32_dll_path(verbose=True)

    try:
        import requests  # noqa: F401
        print("requests: OK")
    except Exception as exc:
        print(f"requests: FALHOU - {exc}")
        return 1

    try:
        import pywintypes  # noqa: F401
        import win32con  # noqa: F401
        import win32gui  # noqa: F401
        import win32print
        import win32ui  # noqa: F401
        print("pywin32/win32print: OK")
    except Exception as exc:
        print("pywin32/win32print: FALHOU")
        print(f"Erro: {type(exc).__name__}: {exc}")
        print("")
        print("Correcao aplicada pelo instalador v1.3:")
        print("  1. Reinstalar pywin32 sem cache.")
        print("  2. Rodar pywin32_postinstall.")
        print("  3. Carregar pywin32_system32 no PATH de DLLs.")
        return 1

    try:
        print(f"Impressora padrao: {win32print.GetDefaultPrinter()}")
    except Exception as exc:
        print(f"Aviso: pywin32 OK, mas nenhuma impressora padrao respondeu ({exc}).")

    print("Verificacao concluida com sucesso.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())