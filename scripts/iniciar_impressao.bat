@echo off
setlocal EnableExtensions
chcp 65001 >nul
title Comanda Tech - Impressao Automatica

set "PY="
where py >nul 2>nul && set "PY=py -3"
if not defined PY ( where python >nul 2>nul && set "PY=python" )
if not defined PY ( where python3 >nul 2>nul && set "PY=python3" )

if not defined PY (
    echo [ERRO] Python nao encontrado.
    echo Rode primeiro o arquivo instalar_impressao.bat
    pause
    exit /b 1
)

cd /d "%~dp0"
echo Iniciando impressao automatica com %PY% ...
echo (Mantenha esta janela aberta enquanto a loja estiver operando)
echo.
%PY% "%~dp0auto_printer.py"
pause
