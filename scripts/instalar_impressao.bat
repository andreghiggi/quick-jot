@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
set "INSTALLER_VERSION=v1.2"
title Comanda Tech - Instalacao da Impressao Automatica %INSTALLER_VERSION%
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
echo [1/6] Procurando Python instalado...
set "PY="
set "PYPATH="

where py >nul 2>nul
if %ERRORLEVEL%==0 (
    set "PY=py -3"
    for /f "delims=" %%i in ('where py 2^>nul') do set "PYPATH=%%i" & goto detected
)
where python >nul 2>nul
if %ERRORLEVEL%==0 (
    for /f "delims=" %%i in ('where python 2^>nul') do (
        set "PYPATH=%%i"
        goto check_store
    )
)
where python3 >nul 2>nul
if %ERRORLEVEL%==0 (
    set "PY=python3"
    for /f "delims=" %%i in ('where python3 2^>nul') do set "PYPATH=%%i" & goto detected
)

REM Nao achou nenhum Python
echo.
echo [ERRO] Python nao esta instalado nesta maquina.
echo.
echo  ====== O QUE FAZER ======
echo  1. Acesse:  https://www.python.org/downloads/windows/
echo  2. Baixe a versao mais recente para Windows (64-bit).
echo  3. NA PRIMEIRA TELA do instalador, MARQUE as 2 opcoes:
echo        [x] Add python.exe to PATH
echo        [x] py launcher
echo  4. Clique em "Install Now".
echo  5. Depois rode este arquivo novamente.
echo.
echo [ERRO] Python nao encontrado >> "%LOG%"
pause
exit /b 1

:check_store
REM Detecta se o python.exe e o da Microsoft Store (caminho contem WindowsApps)
echo !PYPATH! | findstr /I "WindowsApps" >nul
if %ERRORLEVEL%==0 (
    echo.
    echo [ERRO] Python da Microsoft Store detectado:
    echo        !PYPATH!
    echo.
    echo Essa versao NAO funciona com impressoras termicas (pywin32
    echo nao consegue registrar as DLLs em ambiente sandbox da Store).
    echo.
    echo  ====== O QUE FAZER ======
    echo  1. Abra:  Configuracoes ^> Apps ^> Apps Instalados
    echo  2. Desinstale TODAS as versoes "Python" e "Python Launcher".
    echo  3. Configuracoes ^> Apps ^> Configuracoes avancadas de apps
    echo     ^> Aliases de execucao de apps  --^>  DESATIVE python.exe e python3.exe
    echo  4. Reinicie o computador.
    echo  5. Instale o Python oficial: https://www.python.org/downloads/windows/
    echo     Marque [x] Add python.exe to PATH  e  [x] py launcher
    echo  6. Rode este .bat novamente.
    echo.
    echo [ERRO] Python da Microsoft Store em !PYPATH! >> "%LOG%"
    pause
    exit /b 1
)
set "PY=python"

:detected
echo [OK] Python encontrado: !PY!  (!PYPATH!)
echo [OK] Python: !PY! em !PYPATH! >> "%LOG%"
!PY! --version
!PY! --version >> "%LOG%" 2>&1
echo.

REM ==========================================================
REM  ETAPA 3 - Garante pip
REM ==========================================================
echo [2/6] Verificando o pip...
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
echo [3/6] Atualizando pip...
!PY! -m pip install --upgrade pip >> "%LOG%" 2>&1
echo.

REM ==========================================================
REM  ETAPA 5 - Instala requests + pywin32
REM  Tenta global; se falhar permissao, tenta --user
REM ==========================================================
echo [4/6] Instalando dependencias (requests e pywin32)...
!PY! -m pip install --upgrade requests pywin32 >> "%LOG%" 2>&1
if errorlevel 1 (
    echo [AVISO] Instalacao global falhou. Tentando instalar apenas para este usuario...
    !PY! -m pip install --user --upgrade requests pywin32 >> "%LOG%" 2>&1
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
REM  ETAPA 6 - Pos-instalacao do pywin32 (registra DLLs)
REM ==========================================================
echo [5/6] Registrando DLLs do pywin32 (necessario para impressao)...
set "POSTINSTALL="
for /f "delims=" %%i in ('!PY! -c "import os, sysconfig; print(os.path.join(sysconfig.get_path('scripts'), 'pywin32_postinstall.py'))" 2^>nul') do set "POSTINSTALL=%%i"
if defined POSTINSTALL if exist "!POSTINSTALL!" (
    !PY! "!POSTINSTALL!" -install >> "%LOG%" 2>&1
)
if errorlevel 1 (
    echo [AVISO] Registro via script falhou. Tentando registro via modulo... >> "%LOG%"
    !PY! -m pywin32_postinstall -install >> "%LOG%" 2>&1
)
echo [OK] Pos-instalacao do pywin32 concluida. >> "%LOG%"
echo.

REM ==========================================================
REM  ETAPA 7 - Teste final: importa win32print
REM ==========================================================
echo [6/6] Testando importacao do modulo de impressao...
!PY! -c "import win32print; print('Impressora padrao:', win32print.GetDefaultPrinter())"
if errorlevel 1 (
    echo.
    echo [ERRO] O modulo win32print nao funcionou apos a instalacao.
    echo Causa mais comum: pywin32 nao registrou as DLLs.
    echo Tente reiniciar o computador e rodar este .bat novamente.
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
echo      iniciar_impressao.bat
echo.
echo ==========================================================
echo [OK] Instalacao concluida com sucesso >> "%LOG%"
pause
exit /b 0
