@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
title Comanda Tech - Instalacao da Impressao Automatica

echo ==========================================================
echo   Comanda Tech - Instalacao da Impressao Automatica
echo ==========================================================
echo.

REM ----------------------------------------------------------
REM  1) Detecta o Python instalado.
REM     No Windows 11 o comando "pip" frequentemente NAO existe
REM     porque o instalador usa apenas o "py launcher". Por isso
REM     procuramos py / python / python3 e SEMPRE rodamos pip
REM     atraves de "<python> -m pip".
REM ----------------------------------------------------------
set "PY="
where py >nul 2>nul
if %ERRORLEVEL%==0 (
    set "PY=py -3"
    goto have_python
)
where python >nul 2>nul
if %ERRORLEVEL%==0 (
    set "PY=python"
    goto have_python
)
where python3 >nul 2>nul
if %ERRORLEVEL%==0 (
    set "PY=python3"
    goto have_python
)

echo [ERRO] Python nao encontrado.
echo.
echo  1. Acesse https://www.python.org/downloads/windows/
echo  2. Baixe e instale a versao recomendada.
echo  3. IMPORTANTE: marque "Add python.exe to PATH" antes
echo     de clicar em Install Now.
echo  4. Depois de instalar, rode este arquivo novamente.
echo.
pause
exit /b 1

:have_python
echo [OK] Python detectado: %PY%
%PY% --version
echo.

echo [1/4] Verificando o pip...
%PY% -m ensurepip --upgrade >nul 2>nul
%PY% -m pip --version
if errorlevel 1 (
    echo [ERRO] Nao foi possivel inicializar o pip.
    echo Reinstale o Python marcando a opcao "pip" durante a instalacao.
    pause
    exit /b 1
)
echo.

echo [2/4] Atualizando o pip...
%PY% -m pip install --upgrade pip
echo.

echo [3/4] Instalando dependencias (requests e pywin32)...
%PY% -m pip install --upgrade requests pywin32
if errorlevel 1 (
    echo.
    echo [ERRO] Falha ao instalar as dependencias.
    echo Verifique a conexao com a internet e tente novamente.
    pause
    exit /b 1
)
echo.

echo [4/4] Finalizando configuracao do pywin32...
REM Esta etapa registra as DLLs do pywin32. Pode pedir admin -
REM se falhar, o script de impressao ainda funciona na maioria
REM dos casos; recomendamos rodar este .bat "como administrador"
REM caso a impressao nao funcione depois.
%PY% -m pywin32_postinstall -install >nul 2>nul
if errorlevel 1 (
    echo [AVISO] Nao foi possivel rodar o pos-instalador do pywin32.
    echo Se a impressao nao funcionar, clique com o botao direito
    echo neste arquivo e escolha "Executar como administrador".
)
echo.

echo ==========================================================
echo  Instalacao concluida com sucesso!
echo ==========================================================
echo.
echo Para iniciar a impressao automatica de pedidos, de duplo
echo clique no arquivo:  iniciar_impressao.bat
echo.
pause
exit /b 0
