@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0.."

echo ============================================================
echo   ComandaTech - Setup impressao local (automatico)
echo   Sem extensao Chrome / sem registro manual
echo ============================================================
echo.

set "SLUG=%~1"
if not defined SLUG set "SLUG=lancheria-bon-appetit"

set "PY="
where py >nul 2>nul && set "PY=py -3"
if not defined PY where python >nul 2>nul && set "PY=python"

if not defined PY (
  echo [ERRO] Python nao encontrado. Instale em python.org
  pause
  exit /b 1
)

if not exist "scripts\instalar_impressao.cmd" (
  echo [ERRO] scripts\instalar_impressao.cmd nao encontrado
  pause
  exit /b 1
)

echo [1/3] Dependencias Python...
call "scripts\instalar_impressao.cmd"
if errorlevel 1 exit /b 1

echo.
echo [2/3] Configurando loja slug: %SLUG%
%PY% "scripts\setup-impressao-local.py" "%SLUG%"
if errorlevel 1 (
  pause
  exit /b 1
)

echo.
echo [3/3] Pronto!
echo.
echo   Impressao: duplo clique em scripts\iniciar_impressao-local.cmd
echo   App web:   npm run dev  ^(localhost:8080^)
echo.
echo   Extensao Chrome NAO e necessaria para imprimir.
echo.
pause
