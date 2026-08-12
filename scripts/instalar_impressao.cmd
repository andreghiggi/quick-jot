@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
set "INSTALLER_VERSION=v1.5-cmd"
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
REM  pywin32 precisa de admin para registrar as DLLs.
REM ==========================================================
net session >nul 2>nul
if errorlevel 1 (
    echo [INFO] Solicitando privilegios de administrador...
    echo Clique em SIM na janela do Windows que vai aparecer.
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs" >nul 2>nul
    exit /b 0
)
echo [OK] Executando como administrador. >> "%LOG%"

REM ==========================================================
REM  ETAPA 1 - Desbloqueia o proprio .bat (Mark-of-the-Web)
REM  Sem isto o Win11 trava .bat baixado da internet.
REM ==========================================================
powershell -NoProfile -Command "Get-ChildItem -Path '%~dp0' -Recurse | Unblock-File" >nul 2>nul
echo [OK] Arquivos desbloqueados (Mark-of-the-Web removido). >> "%LOG%"

REM ==========================================================
REM  ETAPA 2 - Detecta Python
REM  Prioridade: py launcher (oficial) > python > python3
REM ==========================================================
echo [1/7] Verificando compatibilidade do Python...
set "PY="
set "PYPATH="

REM Tenta detectar se o Python 3.12 já está no PATH
where python >nul 2>nul
if %ERRORLEVEL%==0 (
    for /f "tokens=1,2 delims=." %%a in ('python -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2^>nul') do (
        if "%%a.%%b"=="3.12" (
            set "PY=python"
            goto python_ready
        )
    )
)

echo [INFO] Python 3.12 não detectado ou versão incompatível.
echo [INFO] Iniciando instalação automática do Python 3.12.2...

set "PYTHON_EXE=python-3.12.2-amd64.exe"
set "PYTHON_URL=https://www.python.org/ftp/python/3.12.2/python-3.12.2-amd64.exe"

if not exist "%PYTHON_EXE%" (
    echo [INFO] Baixando instalador do Python...
    powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object System.Net.WebClient).DownloadFile('%PYTHON_URL%', '%PYTHON_EXE%')"
)

echo [INFO] Instalando Python 3.12.2 (modo silencioso, aguarde)...
start /wait "" "%PYTHON_EXE%" /quiet InstallAllUsers=1 PrependPath=1 Include_test=0 Include_pip=1

REM Limpeza do instalador
del "%PYTHON_EXE%" /q >nul 2>nul

REM Refresh PATH para a sessão atual do CMD
for /f "tokens=2*" %%A in ('reg query "HKLM\System\CurrentControlSet\Control\Session Manager\Environment" /v Path') do set "NEWPATH=%%B"
for /f "tokens=2*" %%A in ('reg query "HKCU\Environment" /v Path') do set "USERPATH=%%B"
set "PATH=%NEWPATH%;%USERPATH%"

:python_ready
where python >nul 2>nul
if %ERRORLEVEL%==0 (
    set "PY=python"
) else (
    echo [ERRO] Falha ao instalar ou localizar o Python 3.12.
    pause
    exit /b 1
)

echo [OK] Python 3.12 configurado.
!PY! --version
echo.
echo.

REM ==========================================================
REM  ETAPA 3 - Garante pip
REM ==========================================================
echo [2/7] Verificando o pip...
!PY! -m ensurepip --upgrade >> "%LOG%" 2>&1
!PY! -m pip --version
if errorlevel 1 (
    echo.
    echo [ERRO] Pip nao pode ser inicializado.
    echo Reinstale o Python (https://python.org) marcando a opcao "pip".
    echo [ERRO] ensurepip falhou >> "%LOG%"
    pause
    exit /b 1
)
!PY! -m pip --version >> "%LOG%" 2>&1
echo.

REM ==========================================================
REM  ETAPA 4 - Atualiza pip
REM ==========================================================
echo [3/7] Atualizando pip...
!PY! -m pip install --upgrade pip >> "%LOG%" 2>&1
echo.

REM ==========================================================
REM  ETAPA 5 - Limpa pywin32 antigo/quebrado
REM  O erro "DLL load failed while importing win32print" normalmente
REM  vem de instalacao parcial ou DLL de versao antiga no Python.
REM ==========================================================
echo [4/7] Limpando instalacao antiga do pywin32...
!PY! -m pip uninstall -y pywin32 >> "%LOG%" 2>&1
!PY! -m pip cache purge >> "%LOG%" 2>&1
echo.

REM ==========================================================
REM  ETAPA 6 - Instala requests + pywin32
REM  Reinstala sem cache; se falhar permissao, tenta --user
REM ==========================================================
echo [5/7] Instalando dependencias (requests e pywin32)...
!PY! -m pip install --upgrade --force-reinstall --no-cache-dir requests pywin32 >> "%LOG%" 2>&1
if errorlevel 1 (
    echo [AVISO] Instalacao global falhou. Tentando instalar apenas para este usuario...
    !PY! -m pip install --user --upgrade --force-reinstall --no-cache-dir requests pywin32 >> "%LOG%" 2>&1
    if errorlevel 1 (
        echo.
        echo [ERRO] Nao foi possivel instalar as dependencias.
        echo Possiveis causas:
        echo   - Sem conexao com a internet.
        echo   - Firewall/antivirus bloqueando o pip.
        echo   - Proxy da rede bloqueando pypi.org.
        echo.
        echo Veja o detalhe completo no arquivo:
        echo   %LOG%
        echo [ERRO] pip install falhou (global e --user) >> "%LOG%"
        pause
        exit /b 1
    )
)
echo [OK] requests e pywin32 instalados. >> "%LOG%"
echo.

REM ==========================================================
REM  ETAPA 7 - Pos-instalacao do pywin32 (registra DLLs)
REM ==========================================================
echo [6/7] Registrando DLLs do pywin32 (necessario para impressao)...
set "POSTINSTALL="
set "POSTINSTALL_RC=0"
for /f "delims=" %%i in ('!PY! -c "import os, sysconfig; print(os.path.join(sysconfig.get_path('scripts'), 'pywin32_postinstall.py'))" 2^>nul') do set "POSTINSTALL=%%i"
if defined POSTINSTALL if exist "!POSTINSTALL!" (
    !PY! "!POSTINSTALL!" -install >> "%LOG%" 2>&1
    set "POSTINSTALL_RC=!ERRORLEVEL!"
)
if not "!POSTINSTALL_RC!"=="0" (
    echo [AVISO] Registro via script falhou. Tentando registro via modulo... >> "%LOG%"
    !PY! -m pywin32_postinstall -install >> "%LOG%" 2>&1
)
echo [OK] Pos-instalacao do pywin32 concluida. >> "%LOG%"
echo.

REM ==========================================================
REM  ETAPA 8 - Teste final: importa win32print e DLLs
REM ==========================================================
echo [7/7] Testando importacao do modulo de impressao...
if exist "%~dp0verificar_pywin32.py" (
    !PY! "%~dp0verificar_pywin32.py"
) else (
    !PY! -c "import win32print; print('Impressora padrao:', win32print.GetDefaultPrinter())"
)
if errorlevel 1 (
    echo.
    echo [ERRO] O modulo win32print nao funcionou apos a instalacao.
    echo Causa: DLL do pywin32 nao carregou no Python usado por este launcher.
    echo Tente reiniciar o computador e rode instalar_impressao.cmd novamente.
    echo Se persistir, envie o arquivo instalar_impressao.log para suporte.
    echo [ERRO] import win32print falhou no teste final >> "%LOG%"
    pause
    exit /b 1
)
echo.

REM ==========================================================
REM  Salva qual Python usar para o iniciar_impressao.bat
REM ==========================================================
> "%~dp0python_detectado.txt" echo !PY!

echo ==========================================================
echo   INSTALACAO CONCLUIDA COM SUCESSO!
echo ==========================================================
echo.
echo  Para comecar a imprimir pedidos automaticamente,
echo  de duplo clique em:
echo.
echo      iniciar_impressao.cmd
echo.
echo ==========================================================
echo [OK] Instalacao concluida com sucesso >> "%LOG%"
pause
exit /b 0
