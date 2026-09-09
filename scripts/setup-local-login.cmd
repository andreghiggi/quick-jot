@echo off
setlocal
cd /d "%~dp0.."

echo === ComandaTech - Setup login bundle ===

if not exist ".env.local" (
  echo [ERRO] .env.local nao encontrado. Copie de .env e aponte para vyotbtmnnosiejyltlxc
  exit /b 1
)

if not exist ".env.backup" (
  echo [ERRO] .env.backup nao encontrado. Veja .env.backup.example
  exit /b 1
)

set "BUNDLE=%~1"
if "%BUNDLE%"=="" set "BUNDLE=login-bundle.json"

if not exist "%BUNDLE%" (
  if exist "%USERPROFILE%\Downloads\login-bundle.json" (
    set "BUNDLE=%USERPROFILE%\Downloads\login-bundle.json"
    echo Usando bundle de Downloads...
  ) else (
    echo [ERRO] Arquivo nao encontrado: %BUNDLE%
    echo Uso: scripts\setup-local-login.cmd [caminho\login-bundle.json]
    exit /b 1
  )
)

echo.
echo [1/4] Importando bundle...
call npm run import-login-bundle -- "%BUNDLE%"
if errorlevel 1 exit /b 1

echo.
echo [2/5] GRANTs authenticated/anon...
call npm run fix-mirror-grants
if errorlevel 1 exit /b 1

echo.
echo [3/5] Validando vinculos...
node scripts/check-company-link.mjs
node scripts/check-user-companies.mjs

echo.
echo [4/5] Build (verifica compilacao)...
call npm run build
if errorlevel 1 exit /b 1

echo.
echo [5/5] Pronto! Inicie o app:
echo   npm run dev
echo   http://localhost:8080/auth
echo.
echo Contas testadas no bundle:
echo   deboraboscato@hotmail.com  - garcom Lancheria da i9
echo   garcom@lancheriadai9.com   - garcom Lancheria da i9
echo   ernanizatt1@icloud.com     - admin Amore Mio
echo.
