# Deploy de correções na VPS (Windows + PuTTY).
# Uso: .\deploy\vps-apply-fixes.ps1 -Host 153.75.244.221 -Password 'sua-senha'
param(
  [string]$Host = '153.75.244.221',
  [Parameter(Mandatory = $true)][string]$Password,
  [string]$RepoRoot = 'C:\xampp\htdocs\comandatech'
)

$plink = 'C:\Program Files\PuTTY\plink.exe'
$pscp = 'C:\Program Files\PuTTY\pscp.exe'
if (-not (Test-Path $plink)) { throw "Instale PuTTY (plink.exe)" }

Write-Host "==> Sync deploy + migrations + functions"
& $pscp -batch -pw $Password -r "$RepoRoot\deploy" "root@${Host}:/var/www/comandatech/"
& $pscp -batch -pw $Password -r "$RepoRoot\supabase\functions" "root@${Host}:/var/www/comandatech/supabase/"
& $pscp -batch -pw $Password -r "$RepoRoot\supabase\migrations\20260909000000_nfce_records_unique_external_id.sql" "root@${Host}:/var/www/comandatech/supabase/migrations/"

Write-Host "==> Sync src (frontend)"
& $pscp -batch -pw $Password -r "$RepoRoot\src" "root@${Host}:/var/www/comandatech/"

Write-Host "==> Aplicar na VPS"
& $plink -batch -ssh "root@$Host" -pw $Password "chmod +x /var/www/comandatech/deploy/vps-apply-fixes.sh && bash /var/www/comandatech/deploy/vps-apply-fixes.sh"

Write-Host "Concluído."
