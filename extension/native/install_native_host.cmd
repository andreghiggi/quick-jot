@echo off
setlocal
echo ComandaTech - Registro Native Messaging Host
echo.
echo 1. Instale a extensao em chrome://extensions (modo desenvolvedor)
echo 2. Copie o ID da extensao
echo 3. Edite extension\native\comandatech_native_host.json:
echo    - path: caminho absoluto para scripts\comandatech_native_host.py
echo    - allowed_origins: chrome-extension://SEU_ID/
echo 4. Registre no Windows (Admin):
echo.
echo    reg add "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.comandatech.print_host" /ve /t REG_SZ /d "%CD%\extension\native\comandatech_native_host.json" /f
echo.
pause
