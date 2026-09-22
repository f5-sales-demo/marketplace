$ErrorActionPreference = "Stop"
$root = Join-Path ([IO.Path]::GetTempPath()) ("herdr-wrapper-test-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $root | Out-Null
$originalUserPath = [Environment]::GetEnvironmentVariable("Path", "User")
$originalHerdrHome = $env:HERDR_HOME
try {
    $manifest = Join-Path $root "latest.json"
    $sha = "a" * 64
    [IO.File]::WriteAllText($manifest, (@{
        version = "0.18.0"
        protocol = 26
        assets = @{ "windows-x86_64" = "https://github.com/f5-sales-demo/herdr/releases/latest/download/herdr-windows-x86_64.zip" }
        sha256 = @{ "windows-x86_64" = $sha }
    } | ConvertTo-Json -Compress))
    $installer = Join-Path $PSScriptRoot "..\scripts\install-windows.ps1"
    $resolved = & $installer -Action resolve -PluginVersion 1.1.1 -ManifestPath $manifest -Architecture Arm64 | ConvertFrom-Json
    if ($resolved.version -ne "0.18.0" -or
        $resolved.target -ne "windows-x86_64" -or
        $resolved.windows_emulated -ne $true -or
        $resolved.url -ne "https://github.com/f5-sales-demo/herdr/releases/download/v0.18.0/herdr-windows-x86_64.zip") {
        throw "Windows stable manifest resolution failed."
    }
    $badManifest = Join-Path $root "bad.json"
    [IO.File]::WriteAllText($badManifest, [IO.File]::ReadAllText($manifest).Replace($sha, "bad"))
    $failed = $false
    try {
        & $installer -Action resolve -PluginVersion 1.1.1 -ManifestPath $badManifest -Architecture X64 | Out-Null
    } catch {
        $failed = $_.Exception.Message -match "manifest_checksum"
    }
    if (-not $failed) { throw "Invalid Windows checksum was accepted." }
    $env:HERDR_HOME = Join-Path $root "herdr-home"
    $installDir = Join-Path $root "bin"
    $receipt = Join-Path $root "state\setup-receipt.json"
    & $installer -Action apply -PluginVersion 1.1.1 -InstallDir $installDir -ReceiptPath $receipt
    & $installer -Action verify -PluginVersion 1.1.1 -InstallDir $installDir -ReceiptPath $receipt
    $record = Get-Content -LiteralPath $receipt -Raw | ConvertFrom-Json
    if ($record.sha256 -notmatch '^[0-9a-f]{64}$') {
        throw "Windows asset checksum is missing from the receipt."
    }
    if ($record.binary_sha256 -notmatch '^[0-9a-f]{64}$' -or
        (Get-FileHash -LiteralPath $record.installed_path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $record.binary_sha256) {
        throw "Installed Windows binary does not match the receipt."
    }
    $second = & $installer -Action apply -PluginVersion 1.1.1 -InstallDir $installDir -ReceiptPath $receipt | Out-String
    if ($second -notmatch "already installed") { throw "Second Windows setup was not a no-op." }
    Write-Host "Windows Herdr wrapper smoke passed."
} finally {
    [Environment]::SetEnvironmentVariable("Path", $originalUserPath, "User")
    $env:HERDR_HOME = $originalHerdrHome
    Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
}
