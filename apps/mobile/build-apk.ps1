# ============================================================
# Visão360 — Script de build de APK para distribuição direta
# ============================================================
# Uso: .\build-apk.ps1 -Cliente "Nome da Empresa" -ApiUrl "http://192.168.1.100:3001/api/v1"
# ============================================================

param(
    [string]$Cliente = "Visao360",
    [string]$ApiUrl  = "http://localhost:3001/api/v1",
    [string]$Versao  = "1.0.0"
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "=============================================="
Write-Host "  VISAO360 — BUILD APK"
Write-Host "  Cliente : $Cliente"
Write-Host "  API URL : $ApiUrl"
Write-Host "  Versao  : $Versao"
Write-Host "=============================================="
Write-Host ""

# 1. Verificar pre-requisitos
Write-Host "[1/5] Verificando pre-requisitos..."
$eas = Get-Command eas -ErrorAction SilentlyContinue
if (-not $eas) {
    Write-Host "  Instalando EAS CLI..."
    npm install -g eas-cli
}
Write-Host "  ✅ EAS CLI disponivel"

# 2. Configurar variavel de ambiente com a URL da API do cliente
Write-Host "[2/5] Configurando URL da API para $Cliente..."
$env:EXPO_PUBLIC_API_URL = $ApiUrl
Write-Host "  ✅ EXPO_PUBLIC_API_URL = $ApiUrl"

# 3. Verificar login no Expo
Write-Host "[3/5] Verificando autenticacao Expo..."
$whoami = eas whoami 2>&1
if ($whoami -like "*Not logged in*") {
    Write-Host "  Faca login na sua conta Expo:"
    eas login
}
Write-Host "  ✅ Autenticado"

# 4. Build
Write-Host "[4/5] Iniciando build do APK (pode levar 10-20 min)..."
Write-Host "  O build roda na nuvem da Expo gratuitamente."
Write-Host ""
eas build --platform android --profile preview --non-interactive

# 5. Instrucoes finais
Write-Host ""
Write-Host "[5/5] Build concluido!"
Write-Host ""
Write-Host "  Apos o download do APK:"
Write-Host "  1. Renomeie para: visao360-$($Cliente.ToLower() -replace ' ','-')-v$Versao.apk"
Write-Host "  2. Envie por WhatsApp/email para o cliente"
Write-Host "  3. O cliente precisa habilitar 'Fontes desconhecidas' no Android"
Write-Host "     (Configuracoes > Seguranca > Instalar apps desconhecidos)"
Write-Host ""
Write-Host "  Para instalacao em massa em tablets:"
Write-Host "  adb install visao360-$($Cliente.ToLower() -replace ' ','-')-v$Versao.apk"
Write-Host ""
