@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0.."

set "EXT_ID=%~1"
if not defined EXT_ID (
  echo.
  echo Cole o ID da extensao ^(chrome://extensions - Modo desenvolvedor^)
  set /p EXT_ID="Extension ID: "
)

if not defined EXT_ID (
  echo [ERRO] ID obrigatorio
  pause
  exit /b 1
)

set "HOST_PY=%CD%\scripts\comandatech_native_host.py"
set "HOST_JSON=%CD%\extension\native\comandatech_native_host.json"

echo {> "%HOST_JSON%"
echo   "name": "com.comandatech.print_host",>> "%HOST_JSON%"
echo   "description": "ComandaTech Native Messaging Host",>> "%HOST_JSON%"
echo   "path": "%HOST_PY:\=\\%",>> "%HOST_JSON%"
echo   "type": "stdio",>> "%HOST_JSON%"
echo   "allowed_origins": [>> "%HOST_JSON%"
echo     "chrome-extension://%EXT_ID%/">> "%HOST_JSON%"
echo   ]>> "%HOST_JSON%"
echo }>> "%HOST_JSON%"

reg add "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.comandatech.print_host" /ve /t REG_SZ /d "%HOST_JSON%" /f >nul

echo.
echo [OK] Native host registrado
echo   Python: %HOST_PY%
echo   JSON:   %HOST_JSON%
echo   Ext ID: %EXT_ID%
echo.
echo Proximo passo:
echo   1. Feche e reabra o Chrome ^(ou clique Atualizar na extensao^)
echo   2. Clique direito no icone da extensao - Opcoes
echo   3. Preencha Supabase URL + Company ID + Salvar
echo.
pause
