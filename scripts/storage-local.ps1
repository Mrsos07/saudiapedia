param(
    [ValidateSet('configure', 'verify', 'copy')]
    [string]$Action = 'verify',
    [string]$CMSOrigin = ''
)
$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'This launcher requires Windows DPAPI.' }
$root = Split-Path $PSScriptRoot -Parent
$vaultDir = Join-Path $env:LOCALAPPDATA 'KingdomSaudi\vexushpbyvaoangxyqcm'
$storageFile = Join-Path $vaultDir 's3-credentials.xml'
if (-not (Test-Path $vaultDir)) { throw 'The existing project credential vault is required.' }

function Unprotect-Value([Security.SecureString]$Value) {
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

if ($Action -eq 'configure') {
    if (Test-Path $storageFile) { throw 'Storage credentials already exist; refusing to overwrite them.' }
    Write-Host 'Create S3 access keys in the project Storage / S3 page. Paste them here, not into chat.'
    $region = Read-Host 'Region shown in Supabase (Enter for ap-northeast-1)'
    if (-not $region) { $region = 'ap-northeast-1' }
    $access = Read-Host 'S3 Access Key ID' -AsSecureString
    $secret = Read-Host 'S3 Secret Access Key' -AsSecureString
    if ($access.Length -eq 0 -or $secret.Length -eq 0) { throw 'Both S3 credentials are required.' }
    [PSCustomObject]@{
        Region = $region
        Endpoint = 'https://vexushpbyvaoangxyqcm.storage.supabase.co/storage/v1/s3'
        Bucket = 'saudiapedia-media'
        AccessKey = $access
        SecretKey = $secret
    } | Export-Clixml -Path $storageFile -NoClobber
    Write-Host 'Saved with Windows-user encryption outside the repository. Credential values were not printed.'
    Read-Host 'Press Enter to close' | Out-Null
    return
}

if (-not (Test-Path $storageFile)) { throw 'Configure the project S3 credentials first.' }
$storage = Import-Clixml $storageFile
$database = Import-Clixml (Join-Path $vaultDir 'cms-credentials.xml')
$names = @('DATABASE_URL', 'CMS_DATABASE_CA_FILE', 'S3_BUCKET', 'S3_REGION', 'S3_ENDPOINT', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_FORCE_PATH_STYLE', 'CMS_VERIFICATION_ORIGIN')
$previous = @{}
foreach ($name in $names) { $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
Push-Location $root
try {
    $env:S3_BUCKET = $storage.Bucket
    $env:S3_REGION = $storage.Region
    $env:S3_ENDPOINT = $storage.Endpoint
    $env:S3_ACCESS_KEY_ID = Unprotect-Value $storage.AccessKey
    $env:S3_SECRET_ACCESS_KEY = Unprotect-Value $storage.SecretKey
    $env:S3_FORCE_PATH_STYLE = 'true'
    $env:CMS_VERIFICATION_ORIGIN = $CMSOrigin
    $password = Unprotect-Value $database.Runtime
    $env:DATABASE_URL = 'postgresql://kingdom_runtime.vexushpbyvaoangxyqcm:' + [Uri]::EscapeDataString($password) + '@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres'
    $env:CMS_DATABASE_CA_FILE = Join-Path $vaultDir 'supabase-ca.crt'
    & node scripts/storage-transfer.mjs $Action
    if ($LASTEXITCODE -ne 0) { throw 'Storage operation failed; review the sanitized result.' }
} finally {
    foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') }
    $password = $null
    $storage = $null
    $database = $null
    Pop-Location
}
