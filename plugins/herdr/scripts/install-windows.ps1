[CmdletBinding()]
param(
    [ValidateSet("apply", "verify", "resolve")]
    [string]$Action = "apply",
    [Parameter(Mandatory = $true)]
    [string]$PluginVersion,
    [string]$InstallDir,
    [string]$ReceiptPath,
    [string]$PackagePath,
    [string]$Architecture
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$MinimumProtocol = 27
$PinnedVersion = "0.19.2"
$PinnedSha256 = "b0d3b75f70f57a9ea7bd6fb88cc3475703e841fb850d09a1d5658bd91409960b"

function Get-Target {
    param([string]$RequestedArchitecture)
    $value = if ([string]::IsNullOrWhiteSpace($RequestedArchitecture)) {
        [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()
    } else {
        $RequestedArchitecture
    }
    switch ($value.ToLowerInvariant()) {
        "x64" { return [PSCustomObject]@{ Target = "windows-x86_64"; Emulated = $false } }
        "x86_64" { return [PSCustomObject]@{ Target = "windows-x86_64"; Emulated = $false } }
        "arm64" { return [PSCustomObject]@{ Target = "windows-x86_64"; Emulated = $true } }
        default { throw "unsupported_target:windows-$value" }
    }
}

function Resolve-StableRelease {
    param([string]$Target)
    $expectedName = "herdr-windows-x86_64.zip"
    return [PSCustomObject]@{
        Version = $PinnedVersion
        Protocol = $MinimumProtocol
        Target = $Target
        Url = "https://github.com/f5-sales-demo/herdr/releases/download/v$PinnedVersion/$expectedName"
        Sha256 = $PinnedSha256
    }
}

function Get-FileSha256 {
    param([string]$Path)
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Test-InstalledReceipt {
    param(
        [string]$Binary,
        [string]$Receipt,
        [string]$ExpectedPluginVersion,
        [object]$ExpectedRelease
    )
    if (-not (Test-Path -LiteralPath $Binary -PathType Leaf) -or -not (Test-Path -LiteralPath $Receipt -PathType Leaf)) {
        return $false
    }
    try {
        $record = [System.IO.File]::ReadAllText($Receipt) | ConvertFrom-Json
        if ([int]$record.schema_version -ne 1 -or
            [string]$record.plugin_version -ne $ExpectedPluginVersion -or
            [string]$record.target -ne "windows-x86_64" -or
            [string]$record.installed_path -ne $Binary -or
            [int]$record.protocol -lt $MinimumProtocol -or
            [string]$record.binary_sha256 -notmatch '^[0-9a-f]{64}$' -or
            (Get-FileSha256 -Path $Binary) -ne [string]$record.binary_sha256) {
            return $false
        }
        if ($null -ne $ExpectedRelease -and
            ([string]$record.herdr_version -ne $ExpectedRelease.Version -or
             [int]$record.protocol -ne $ExpectedRelease.Protocol -or
             [string]$record.url -ne $ExpectedRelease.Url -or
             [string]$record.sha256 -ne $ExpectedRelease.Sha256)) {
            return $false
        }
        $output = & $Binary --version 2>$null
        return $LASTEXITCODE -eq 0 -and ($output -join " ") -match "(^|\s)$([regex]::Escape([string]$record.herdr_version))(\s|$)"
    } catch {
        return $false
    }
}

function Set-OwnerOnlyReceipt {
    param([string]$Path, [object]$Value)
    $directory = Split-Path -Parent $Path
    New-Item -ItemType Directory -Force -Path $directory | Out-Null
    $temporary = Join-Path $directory (".setup-receipt." + [Guid]::NewGuid().ToString("N") + ".json")
    try {
        $json = $Value | ConvertTo-Json -Compress
        [IO.File]::WriteAllText($temporary, $json + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
        $identity = [Security.Principal.WindowsIdentity]::GetCurrent().User
        $acl = [Security.AccessControl.FileSecurity]::new()
        $acl.SetOwner($identity)
        $acl.SetAccessRuleProtection($true, $false)
        $rule = [Security.AccessControl.FileSystemAccessRule]::new(
            $identity,
            [Security.AccessControl.FileSystemRights]::FullControl,
            [Security.AccessControl.AccessControlType]::Allow
        )
        [void]$acl.AddAccessRule($rule)
        Set-Acl -LiteralPath $temporary -AclObject $acl
        [IO.File]::Move($temporary, $Path, $true)
    } finally {
        Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue
    }
}

if ($env:OS -ne "Windows_NT") { throw "unsupported_platform:$([Environment]::OSVersion.Platform)" }
if ($PluginVersion -notmatch '^\d+\.\d+\.\d+$') { throw "invalid_plugin_version" }
$targetInfo = Get-Target -RequestedArchitecture $Architecture
$localAppData = if ([string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
    Join-Path $env:USERPROFILE "AppData\Local"
} else {
    $env:LOCALAPPDATA
}
if ([string]::IsNullOrWhiteSpace($InstallDir)) { $InstallDir = Join-Path $localAppData "Programs\Herdr\bin" }
if ([string]::IsNullOrWhiteSpace($ReceiptPath)) { $ReceiptPath = Join-Path $localAppData "xcsh\herdr\setup-receipt.json" }
$binaryPath = Join-Path $InstallDir "herdr.exe"

if ($Action -eq "verify") {
    if (-not (Test-InstalledReceipt -Binary $binaryPath -Receipt $ReceiptPath -ExpectedPluginVersion $PluginVersion -ExpectedRelease $null)) {
        throw "setup_incomplete"
    }
    Write-Host "Herdr installation verified: $binaryPath"
    exit 0
}

$temporaryRoot = Join-Path ([IO.Path]::GetTempPath()) ("xcsh-herdr-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $temporaryRoot | Out-Null
try {
    $release = Resolve-StableRelease -Target $targetInfo.Target
    if ($Action -eq "resolve") {
        [PSCustomObject]@{
            version = $release.Version
            protocol = $release.Protocol
            target = $release.Target
            url = $release.Url
            sha256 = $release.Sha256
            windows_emulated = $targetInfo.Emulated
        } | ConvertTo-Json -Compress
        exit 0
    }
    if (Test-InstalledReceipt -Binary $binaryPath -Receipt $ReceiptPath -ExpectedPluginVersion $PluginVersion -ExpectedRelease $release) {
        Write-Host "Herdr $($release.Version) already installed; no changes required."
        exit 0
    }
    $localPackage = if ([string]::IsNullOrWhiteSpace($PackagePath)) {
        $candidate = Join-Path $temporaryRoot "herdr-windows-x86_64.zip"
        Invoke-WebRequest -UseBasicParsing -Uri $release.Url -OutFile $candidate
        $candidate
    } else {
        $PackagePath
    }
    $actual = Get-FileSha256 -Path $localPackage
    if ($actual -ne $release.Sha256) { throw "checksum_mismatch" }
    $vendoredInstaller = Join-Path $PSScriptRoot "vendor\install.ps1"
    & $vendoredInstaller `
        -Channel stable `
        -InstallDir $InstallDir `
        -LocalPackagePath $localPackage `
        -LocalPackageFormat zip `
        -LocalPackageIdentity $release.Version `
        -LocalPackageSha256 $release.Sha256
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $binaryPath -PathType Leaf)) {
        throw "activation_failed"
    }
    $receipt = [ordered]@{
        schema_version = 1
        plugin_version = $PluginVersion
        herdr_version = $release.Version
        protocol = $release.Protocol
        target = $release.Target
        url = $release.Url
        sha256 = $release.Sha256
        binary_sha256 = Get-FileSha256 -Path $binaryPath
        installed_path = $binaryPath
        installed_at = [DateTime]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ")
    }
    Set-OwnerOnlyReceipt -Path $ReceiptPath -Value $receipt
    if (-not (Test-InstalledReceipt -Binary $binaryPath -Receipt $ReceiptPath -ExpectedPluginVersion $PluginVersion -ExpectedRelease $release)) {
        throw "post_install_verification"
    }
    Write-Host "Installed Herdr $($release.Version) to $binaryPath."
} finally {
    Remove-Item -LiteralPath $temporaryRoot -Recurse -Force -ErrorAction SilentlyContinue
}
