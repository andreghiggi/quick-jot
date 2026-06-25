@echo off
setlocal EnableExtensions
chcp 65001 >nul
title Comanda Tech - Iniciar Impressao Alternativo CMD v1.3
color 0A

cd /d "%~dp0"

echo ==========================================================
echo   Comanda Tech - Iniciar Impressao Alternativo (.cmd)
echo   Versao: v1.3
echo ==========================================================
echo  Use este arquivo quando o Windows 11 nao reconhecer .bat.
echo  Ele executa o inicializador principal usando cmd.exe diretamente.
echo ==========================================================
echo.

if not exist "%~dp0iniciar_impressao.bat" (
    echo [ERRO] iniciar_impressao.bat nao encontrado nesta pasta.
    echo Baixe a pasta scripts completa novamente.
    pause
    exit /b 1
)

cmd.exe /d /c ""%~dp0iniciar_impressao.bat""
set "RC=%ERRORLEVEL%"

if not "%RC%"=="0" (
    echo.
    echo [ERRO] A impressao foi encerrada com falha. Codigo: %RC%
    echo Veja os arquivos auto_printer.log e instalar_impressao.log nesta pasta.
    pause
)

exit /b %RC%