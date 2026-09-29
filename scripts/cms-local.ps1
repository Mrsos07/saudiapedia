param(
    [ValidateSet('prepare', 'inspect', 'provision', 'generate', 'migrate', 'migrate-status', 'backup', 'rollback-last', 'verify', 'smoke', 'seed-sections', 'dev')]
    [string]$Action = 'inspect',
    [ValidatePattern('^[a-z][a-z0-9_]*$')]
    [string]$MigrationName = 'initial',
    [ValidateRange(1024, 65535)]
    [int]$Port = 3000
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
$names = @('DATABASE_URL', 'PAYLOAD_SECRET', 'PGPASSWORD', 'CMS_DATABASE_CA_FILE', 'CMS_RUNTIME_PASSWORD', 'CMS_MIGRATOR_PASSWORD', 'CMS_DATABASE_ADMIN_PASSWORD', 'CMS_DB_PUSH', 'SITE_INDEXABLE', 'CMS_SERVER_URL', 'NEXT_PUBLIC_SITE_URL', 'NODE_ENV', 'PAYLOAD_CONFIG_PATH', 'S3_BUCKET', 'S3_REGION', 'S3_ENDPOINT', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_FORCE_PATH_STYLE')
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
    $env:CMS_SERVER_URL = 'http://localhost:' + $Port
    $env:NEXT_PUBLIC_SITE_URL = $env:CMS_SERVER_URL
    $env:NODE_ENV = 'development'
    $env:PAYLOAD_CONFIG_PATH = 'src/payload.config.ts'
    $storageFile = Join-Path $vaultDir 's3-credentials.xml'
    if ($Action -in @('dev', 'smoke') -and (Test-Path $storageFile)) {
        $storage = Import-Clixml $storageFile
        $env:S3_BUCKET = $storage.Bucket
        $env:S3_REGION = $storage.Region
        $env:S3_ENDPOINT = $storage.Endpoint
        $env:S3_ACCESS_KEY_ID = Unprotect-Value $storage.AccessKey
        $env:S3_SECRET_ACCESS_KEY = Unprotect-Value $storage.SecretKey
        $env:S3_FORCE_PATH_STYLE = 'true'
    }
    $dbRole = 'kingdom_runtime'
    $dbPassword = $env:CMS_RUNTIME_PASSWORD
    if ($Action -in @('generate', 'migrate', 'migrate-status', 'backup')) {
        $dbRole = 'kingdom_migrator'
        $dbPassword = $env:CMS_MIGRATOR_PASSWORD
    }
    $env:DATABASE_URL = 'postgresql://' + $dbRole + '.vexushpbyvaoangxyqcm:' + [Uri]::EscapeDataString($dbPassword) + '@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres'
    if ($Action -notin @('inspect', 'provision')) {
        Remove-Item Env:CMS_DATABASE_ADMIN_PASSWORD -ErrorAction SilentlyContinue
    }
    if ($Action -in @('inspect', 'provision', 'verify')) {
        & node scripts/cms-database.mjs $Action
    } elseif ($Action -eq 'generate') {
        if (-not (Test-Path $env:CMS_DATABASE_CA_FILE)) { throw 'Run inspect first to download the official CA.' }
        & node node_modules/payload/bin.js migrate:create $MigrationName
    } elseif ($Action -eq 'migrate') {
        & node node_modules/payload/bin.js migrate
    } elseif ($Action -eq 'migrate-status') {
        # Read-only: lists applied and pending migrations.
        & node node_modules/payload/bin.js migrate:status
    } elseif ($Action -eq 'backup') {
        # Logical backup of the CMS schema (data + DDL) with Docker's pg_dump 17 over verified TLS.
        # The dump contains account password hashes: it stays in the local vault, outside OneDrive and Git.
        if (-not (Test-Path $env:CMS_DATABASE_CA_FILE)) { throw 'Run inspect first to download the official CA.' }
        $backupDir = Join-Path $vaultDir 'backups'
        New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
        $file = 'kingdom_cms-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.dump'
        $conninfo = 'host=aws-0-ap-northeast-1.pooler.supabase.com port=5432 dbname=postgres user=kingdom_migrator.vexushpbyvaoangxyqcm sslmode=verify-full sslrootcert=/vault/supabase-ca.crt'
        $env:PGPASSWORD = $dbPassword
        try {
            # "-e PGPASSWORD" passes the value from this process environment, never on the command line.
            & docker run --rm -e PGPASSWORD -v "${vaultDir}:/vault:ro" -v "${backupDir}:/backup" postgres:17 pg_dump $conninfo --schema=kingdom_cms --format=custom --no-owner --no-privileges --file=/backup/$file
            if ($LASTEXITCODE -ne 0) { throw 'pg_dump failed.' }
            $entries = & docker run --rm -v "${backupDir}:/backup:ro" postgres:17 pg_restore --list /backup/$file
            if ($LASTEXITCODE -ne 0) { throw 'Backup verification failed.' }
            $tables = @($entries | Where-Object { $_ -match ' TABLE DATA kingdom_cms ' }).Count
            $size = [math]::Round((Get-Item (Join-Path $backupDir $file)).Length / 1KB)
            Write-Output "Backup written: $(Join-Path $backupDir $file) ($size KiB, $tables tables with data). Keep it private: it includes password hashes."
        } finally {
            Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
        }
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
        & node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port $Port
    }
    if ($LASTEXITCODE -ne 0) { throw 'CMS operation failed; review the sanitized output.' }
} finally {
    foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') }
    $saved = $null
    $storage = $null
    $dbPassword = $null
    Pop-Location
}