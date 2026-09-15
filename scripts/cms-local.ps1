param(
    [ValidateSet('prepare', 'inspect', 'provision', 'generate', 'migrate', 'rollback-last', 'verify', 'smoke', 'seed-sections', 'dev')]
    [string]$Action = 'inspect',
    [ValidatePattern('^[a-z][a-z0-9_]*$')]
    [string]$MigrationName = 'initial'
)
$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'This local launcher requires Windows DPAPI.' }
$root = Split-Path $PSScriptRoot -Parent
$vaultDir = Join-Path $env:LOCALAPPDATA 'KingdomSaudi\vexushpbyvaoangxyqcm'
$vaultFile = Join-Path $vaultDir 'cms-credentials.xml'

function New-RandomSecret {
    $bytes = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return ([BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
}
function Unprotect-Value([Security.SecureString]$Value) {
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

if ($Action -eq 'prepare') {
    if (-not (Test-Path $vaultFile)) {
        New-Item -ItemType Directory -Path $vaultDir -Force | Out-Null
        $values = [PSCustomObject]@{
            Runtime = (ConvertTo-SecureString (New-RandomSecret) -AsPlainText -Force)
            Migrator = (ConvertTo-SecureString (New-RandomSecret) -AsPlainText -Force)
            Payload = (ConvertTo-SecureString (New-RandomSecret) -AsPlainText -Force)
        }
        $values | Export-Clixml -Path $vaultFile
    }
    Write-Output 'Encrypted Windows-user credential vault is ready outside the workspace. No database writes performed.'
    return
}
if (-not (Test-Path $vaultFile)) { throw 'Run prepare first. Existing credentials are never regenerated automatically.' }
$saved = Import-Clixml $vaultFile
$names = @('DATABASE_URL', 'PAYLOAD_SECRET', 'CMS_DATABASE_CA_FILE', 'CMS_RUNTIME_PASSWORD', 'CMS_MIGRATOR_PASSWORD', 'CMS_DB_PUSH', 'SITE_INDEXABLE', 'CMS_SERVER_URL', 'NEXT_PUBLIC_SITE_URL', 'NODE_ENV', 'PAYLOAD_CONFIG_PATH')
$previous = @{}
foreach ($name in $names) { $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
Push-Location $root
try {
    $env:CMS_RUNTIME_PASSWORD = Unprotect-Value $saved.Runtime
    $env:CMS_MIGRATOR_PASSWORD = Unprotect-Value $saved.Migrator
    $env:PAYLOAD_SECRET = Unprotect-Value $saved.Payload
    $env:CMS_DATABASE_CA_FILE = Join-Path $vaultDir 'supabase-ca.crt'
    $env:CMS_DB_PUSH = 'false'
    $env:SITE_INDEXABLE = 'false'
    $env:CMS_SERVER_URL = 'http://localhost:3000'
    $env:NEXT_PUBLIC_SITE_URL = 'http://localhost:3000'
    $env:NODE_ENV = 'development'
    $env:PAYLOAD_CONFIG_PATH = 'src/payload.config.ts'
    $dbRole = 'kingdom_runtime'
    $dbPassword = $env:CMS_RUNTIME_PASSWORD
    if ($Action -in @('generate', 'migrate')) {
        $dbRole = 'kingdom_migrator'
        $dbPassword = $env:CMS_MIGRATOR_PASSWORD
    }
    $env:DATABASE_URL = 'postgresql://' + $dbRole + '.vexushpbyvaoangxyqcm:' + [Uri]::EscapeDataString($dbPassword) + '@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres'
    if ($Action -in @('inspect', 'provision', 'verify')) {
        & node scripts/cms-database.mjs $Action
    } elseif ($Action -eq 'generate') {
        if (-not (Test-Path $env:CMS_DATABASE_CA_FILE)) { throw 'Run inspect first to download the official CA.' }
        & node node_modules/payload/bin.js migrate:create $MigrationName
    } elseif ($Action -eq 'migrate') {
        & node node_modules/payload/bin.js migrate
    } elseif ($Action -eq 'rollback-last') {
        & node node_modules/payload/bin.js migrate:down
    } elseif ($Action -eq 'smoke') {
        Remove-Item Env:CMS_RUNTIME_PASSWORD, Env:CMS_MIGRATOR_PASSWORD
        & node --import tsx scripts/cms-smoke.ts
    } elseif ($Action -eq 'seed-sections') {
        Remove-Item Env:CMS_RUNTIME_PASSWORD, Env:CMS_MIGRATOR_PASSWORD
        & node --import tsx scripts/seed-sections.ts
    } elseif ($Action -eq 'dev') {
        # The web process gets only the restricted runtime connection, never role provisioning secrets.
        Remove-Item Env:CMS_RUNTIME_PASSWORD, Env:CMS_MIGRATOR_PASSWORD
        & node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3000
    }
    if ($LASTEXITCODE -ne 0) { throw 'CMS operation failed; review the sanitized output.' }
} finally {
    foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') }
    $saved = $null
    $dbPassword = $null
    Pop-Location
}