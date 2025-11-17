param(
    # Buraya kendi Gemini API key'ini vererek çağırabilirsin:
    # .\split-test.ps1 -ApiKey "AIzaSy....."
    [Parameter(Mandatory = $true)]
    [string]$ApiKey
)

# ==== 1. Sabitler ====
$BASE_URL = "https://safeapi-bridge-production.up.railway.app"

# Test amaçlı user & app id (loglarda gözükecek, önemli değil)
$UserId = "ps-test-user"
$AppId  = "ps-test-app"

Write-Host ">>> 1) JWT alınıyor (/auth/token)..." -ForegroundColor Cyan

# ==== 2. JWT alma ====
$authBody = @{
    userId = $UserId
    appId  = $AppId
} | ConvertTo-Json

try {
    $authResponse = Invoke-RestMethod -Uri "$BASE_URL/auth/token" `
        -Method POST `
        -Headers @{ "Content-Type" = "application/json" } `
        -Body $authBody
} catch {
    Write-Host "JWT isteği hata verdi:" -ForegroundColor Red
    Write-Host $_.Exception.Message
    exit 1
}

$jwt = $authResponse.token

if (-not $jwt) {
    Write-Host "JWT alınamadı, response beklenen formatta değil." -ForegroundColor Red
    $authResponse | ConvertTo-Json -Depth 10
    exit 1
}

Write-Host "JWT alındı." -ForegroundColor Green

# ==== 3. Split key çağrısı ====
Write-Host ">>> 2) Split key çalıştırılıyor (/api/split-key/split)..." -ForegroundColor Cyan

$splitBody = @{
    originalKey = $ApiKey
    apiProvider = "gemini"
    description = "PowerShell BYOK split test"
} | ConvertTo-Json

try {
    $splitResponse = Invoke-RestMethod -Uri "$BASE_URL/api/split-key/split" `
        -Method POST `
        -Headers @{
            "Authorization" = "Bearer $jwt"
            "Content-Type"  = "application/json"
        } `
        -Body $splitBody
} catch {
    Write-Host "Split isteği hata verdi:" -ForegroundColor Red
    Write-Host $_.Exception.Message
    exit 1
}

if (-not $splitResponse.success) {
    Write-Host "Split işlemi success=false döndü:" -ForegroundColor Red
    $splitResponse | ConvertTo-Json -Depth 10
    exit 1
}

$keyId      = $splitResponse.data.keyId
$clientPart = $splitResponse.data.clientPart

Write-Host ""
Write-Host ">>> Split işlemi tamam." -ForegroundColor Green
Write-Host "Key ID      : $keyId"
Write-Host "Client Part : $clientPart"
Write-Host ""

# İstersen tüm JSON'u da gör:
# $splitResponse | ConvertTo-Json -Depth 10
