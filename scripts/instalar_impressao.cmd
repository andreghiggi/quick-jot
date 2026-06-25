@echo off
setlocal EnableExtensions
chcp 65001 >nul
title Comanda Tech - Instalador Alternativo CMD
color 0B

cd /d "%~dp0"

echo ==========================================================
echo   Comanda Tech - Instalador Alternativo (.cmd)
echo ==========================================================
echo  Use este arquivo quando o Windows 11 nao reconhecer .bat.
echo  Ele executa o instalador principal usando cmd.exe diretamente.
echo ==========================================================
echo.

if not exist "%~dp0instalar_impressao.bat" (
    echo [ERRO] instalar_impressao.bat nao encontrado nesta pasta.
    echo Baixe a pasta scripts completa novamente.
    pause
    exit /b 1
)

cmd.exe /d /c ""%~dp0instalar_impressao.bat""
set "RC=%ERRORLEVEL%"

if not "%RC%"=="0" (
    echo.
    echo [ERRO] A instalacao terminou com falha. Codigo: %RC%
    echo Veja o arquivo instalar_impressao.log nesta mesma pasta.
    pause
)

exit /b %RC%