@echo off
chcp 65001 >nul
title ComandaTech - Diagnostico de Impressao
cd /d "%~dp0"

echo ============================================================
echo   COMANDATECH - DIAGNOSTICO DE IMPRESSAO (somente leitura)
echo ============================================================
echo.
echo Este programa apenas verifica impressoras, estacoes e fila.
echo Ele NAO altera pedidos, vendas, caixa, notas fiscais ou TEF.
echo.

where python >nul 2>&1
if errorlevel 1 (
  echo Python nao encontrado. Use o mesmo computador onde a impressao automatica roda.
  pause
  exit /b 1
)

python "%~dp0diagnostico_impressao.py"
