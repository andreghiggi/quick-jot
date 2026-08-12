@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
set "INSTALLER_VERSION=v1.6-cmd"
title Comanda Tech - Instalador Autossuficiente (.cmd) %INSTALLER_VERSION%
color 0B

cd /d "%~dp0"

set "LOG=%~dp0instalar_impressao.log"
echo ============================================== > "%LOG%"
echo  Comanda Tech - Log de instalacao %INSTALLER_VERSION% >> "%LOG%"
echo  Data: %DATE% %TIME% >> "%LOG%"
echo ============================================== >> "%LOG%"

echo ==========================================================
echo   Comanda Tech - Instalacao da Impressao Automatica
echo   Versao do instalador: %INSTALLER_VERSION%
echo ==========================================================
echo  (log detalhado sera salvo em instalar_impressao.log)
echo.

REM ==========================================================
REM  ETAPA 0 - Auto-elevacao para Administrador
REM ==========================================================
net session >nul 2>nul
if errorlevel 1 (
    echo [INFO] Solicitando privilegios de administrador...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs" >nul 2>nul
    exit /b 0
)

REM ==========================================================
REM  ETAPA 1 - Limpeza de conflitos Python (Store e 3.14+)
REM ==========================================================
echo [1/8] Verificando e limpando conflitos de Python...
powershell -NoProfile -Command "Get-Package -Name '*Python 3.14*' | Uninstall-Package -Force" >nul 2>nul
powershell -NoProfile -Command "Get-Package -Name '*Python Launcher*' | Uninstall-Package -Force" >nul 2>nul
echo [OK] Conflitos removidos. >> "%LOG%"

REM ==========================================================
REM  ETAPA 2 - Instalacao do Python 3.12.2
REM ==========================================================
echo [2/8] Preparando Python 3.12.2...

set "PYTHON_EXE=python-3.12.2-amd64.exe"
set "PYTHON_URL=https://www.python.org/ftp/python/3.12.2/python-3.12.2-amd64.exe"

if not exist "%PYTHON_EXE%" (
    echo [INFO] Baixando instalador oficial...
    powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object System.Net.WebClient).DownloadFile('%PYTHON_URL%', '%PYTHON_EXE%')"
)

echo [INFO] Instalando Python 3.12.2 (modo silencioso, aguarde)...
start /wait "" "%PYTHON_EXE%" /quiet InstallAllUsers=1 PrependPath=1 Include_test=0 Include_pip=1
del "%PYTHON_EXE%" /q >nul 2>nul

REM Refresh PATH
for /f "tokens=2*" %%A in ('reg query "HKLM\System\CurrentControlSet\Control\Session Manager\Environment" /v Path') do set "NEWPATH=%%B"
for /f "tokens=2*" %%A in ('reg query "HKCU\Environment" /v Path') do set "USERPATH=%%B"
set "PATH=%NEWPATH%;%USERPATH%"

set "PY=python"
where %PY% >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERRO] Python nao foi localizado no PATH apos instalacao.
    pause
    exit /b 1
)
echo [OK] Python 3.12 instalado com sucesso. >> "%LOG%"

REM ==========================================================
REM  ETAPA 3 - Pip e Upgrade
REM ==========================================================
echo [3/8] Verificando o pip...
%PY% -m ensurepip --upgrade >> "%LOG%" 2>&1
%PY% -m pip install --upgrade pip >> "%LOG%" 2>&1
echo [OK] Pip atualizado. >> "%LOG%"

REM ==========================================================
REM  ETAPA 4 - Limpeza de bibliotecas antigas
REM ==========================================================
echo [4/8] Limpando pacotes antigos...
%PY% -m pip uninstall -y pywin32 requests >> "%LOG%" 2>&1
%PY% -m pip cache purge >> "%LOG%" 2>&1

REM ==========================================================
REM  ETAPA 5 - Instalacao de dependencias
REM ==========================================================
echo [5/8] Instalando dependencias (requests, pywin32)...
%PY% -m pip install --upgrade --force-reinstall --no-cache-dir requests pywin32 >> "%LOG%" 2>&1
if errorlevel 1 (
    echo [AVISO] Tentando instalacao --user...
    %PY% -m pip install --user --upgrade --force-reinstall --no-cache-dir requests pywin32 >> "%LOG%" 2>&1
)
echo [OK] Dependencias instaladas. >> "%LOG%"

REM ==========================================================
REM  ETAPA 6 - Registro de DLLs do pywin32
REM ==========================================================
echo [6/8] Registrando DLLs de impressao...
%PY% -m pywin32_postinstall -install >> "%LOG%" 2>&1
echo [OK] DLLs registradas. >> "%LOG%"

REM ==========================================================
REM  ETAPA 7 - Teste de impressao
REM ==========================================================
echo [7/8] Testando modulo de impressao...
%PY% -c "import win32print; print('Sucesso:', win32print.GetDefaultPrinter())" >> "%LOG%" 2>&1
if errorlevel 1 (
    echo [ERRO] O modulo de impressao falhou. Tente reiniciar o Windows.
    pause
    exit /b 1
)
echo [OK] Teste concluido. >> "%LOG%"

REM ==========================================================
REM  ETAPA 8 - Finalizacao
REM ==========================================================
echo [8/8] Salvando configuracoes...
> "%~dp0python_detectado.txt" echo %PY%

echo ==========================================================
echo   INSTALACAO CONCLUIDA COM SUCESSO!
echo ==========================================================
echo [OK] Instalacao finalizada com sucesso >> "%LOG%"
pause
exit /b 0
