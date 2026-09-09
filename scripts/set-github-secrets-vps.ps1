# Define secrets GitHub Actions para produção VPS (requer gh CLI autenticado).
# Uso: .\scripts\set-github-secrets-vps.ps1 [-Repo owner/repo]
param(
  [string]$Repo = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$envFile = Join-Path $root ".env"

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  Write-Host "gh CLI não encontrado. Instale: winget install GitHub.cli"
  Write-Host "Ou configure manualmente — veja docs/GITHUB-ACTIONS-SECRETS-VPS.md"
  node (Join-Path $root "scripts/print-github-secrets-vps.mjs")
  exit 1
}

$url = "https://api.comandatech.com.br"
$key = ""
$projectId = "comandatech-vps"

if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    if ($_ -match '^VITE_SUPABASE_URL=(.+)$') { $url = $matches[1].Trim() }
    if ($_ -match '^VITE_SUPABASE_PUBLISHABLE_KEY=(.+)$') { $key = $matches[1].Trim() }
    if ($_ -match '^VITE_SUPABASE_PROJECT_ID=(.+)$') { $projectId = $matches[1].Trim() }
  }
}

if ($url -match 'iwmrt|supabase\.co') {
  Write-Error "VITE_SUPABASE_URL no .env ainda aponta para Lovable: $url"
}

if (-not $key) {
  Write-Error "VITE_SUPABASE_PUBLISHABLE_KEY ausente no .env"
}

if (-not $Repo) {
  $Repo = (gh repo view --json nameWithOwner -q .nameWithOwner 2>$null)
}
if (-not $Repo) {
  Write-Error "Informe -Repo owner/repo ou rode dentro de um clone git com gh autenticado"
}

Write-Host "Repositório: $Repo"
gh secret set VITE_SUPABASE_URL --body $url --repo $Repo
gh secret set VITE_SUPABASE_PUBLISHABLE_KEY --body $key --repo $Repo
gh secret set VITE_SUPABASE_PROJECT_ID --body $projectId --repo $Repo
Write-Host "Secrets atualizados. Re-run workflow Deploy to VPS."
