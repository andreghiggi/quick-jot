@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"

if not exist "printer.local.env" (
  echo [AVISO] Config nao encontrada. Rodando setup automatico...
  call "%~dp0setup-impressao-local.cmd"
  if errorlevel 1 exit /b 1
)

set "PY="
if exist "python_detectado.txt" set /p PY=<"python_detectado.txt"
if not defined PY where py >nul 2>nul && set "PY=py -3"
if not defined PY where python >nul 2>nul && set "PY=python"

if not defined PY (
  echo [ERRO] Python nao encontrado
  pause
  exit /b 1
)

title ComandaTech - Impressao Local
color 0A
echo ==========================================================
echo   Impressao automatica LOCAL (espelho .env.local)
echo   Mantenha esta janela aberta durante o expediente
echo ==========================================================
echo.

%PY% "%~dp0auto_printer.py"
echo.
pause
