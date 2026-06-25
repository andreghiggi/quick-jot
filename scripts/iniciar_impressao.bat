@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
set "LAUNCHER_VERSION=v1.2"
title Comanda Tech - Impressao Automatica %LAUNCHER_VERSION%
color 0A

cd /d "%~dp0"

REM Le qual Python o instalador detectou
set "PY="
if exist "%~dp0python_detectado.txt" (
    set /p PY=<"%~dp0python_detectado.txt"
)

REM Fallback: detecta de novo se o arquivo nao existir
if not defined PY (
    where py >nul 2>nul && set "PY=py -3"
    if not defined PY ( where python >nul 2>nul && set "PY=python" )
    if not defined PY ( where python3 >nul 2>nul && set "PY=python3" )
)

if not defined PY (
    echo [ERRO] Python nao encontrado.
    echo Rode primeiro o arquivo  instalar_impressao.bat
    pause
    exit /b 1
)

echo ==========================================================
echo   Comanda Tech - Impressao Automatica em execucao
echo ==========================================================
echo  Versao do inicializador: %LAUNCHER_VERSION%
echo  Python: %PY%
echo  Mantenha esta janela ABERTA enquanto a loja estiver
echo  funcionando. Para parar, feche esta janela.
echo ==========================================================
echo.

%PY% -c "import requests, win32print" >nul 2>nul
if errorlevel 1 (
    echo [AVISO] Dependencias da impressao nao estao prontas.
    echo Rodando instalador automaticamente antes de iniciar...
    echo.
    cmd.exe /d /c ""%~dp0instalar_impressao.bat""
    if errorlevel 1 (
        echo.
        echo [ERRO] Instalacao automatica falhou.
        echo Abra o arquivo instalar_impressao.log e envie o conteudo para suporte.
        pause
        exit /b 1
    )
)

%PY% "%~dp0auto_printer.py"
echo.
echo [Servico encerrado] - pressione qualquer tecla para fechar.
pause >nul
