$ErrorActionPreference = "Stop"
$root = Join-Path ([IO.Path]::GetTempPath()) ("herdr-wrapper-test-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $root | Out-Null
$originalUserPath = [Environment]::GetEnvironmentVariable("Path", "User")
$originalHerdrHome = $env:HERDR_HOME
try {
    $installer = Join-Path $PSScriptRoot "..\scripts\install-windows.ps1"
    $resolved = & $installer -Action resolve -PluginVersion 1.1.5 -Architecture Arm64 | ConvertFrom-Json
    if ($resolved.version -ne "0.19.2" -or
        $resolved.target -ne "windows-x86_64" -or
        $resolved.windows_emulated -ne $true -or
        $resolved.sha256 -ne "b0d3b75f70f57a9ea7bd6fb88cc3475703e841fb850d09a1d5658bd91409960b" -or
        $resolved.url -ne "https://github.com/f5-sales-demo/herdr/releases/download/v0.19.2/herdr-windows-x86_64.zip") {
        throw "Windows stable manifest resolution failed."
    }
    $env:HERDR_HOME = Join-Path $root "herdr-home"
    $installDir = Join-Path $root "bin"
    $receipt = Join-Path $root "state\setup-receipt.json"
    & $installer -Action apply -PluginVersion 1.1.2 -InstallDir $installDir -ReceiptPath $receipt
    & $installer -Action verify -PluginVersion 1.1.2 -InstallDir $installDir -ReceiptPath $receipt
    $record = Get-Content -LiteralPath $receipt -Raw | ConvertFrom-Json
    if ($record.sha256 -notmatch '^[0-9a-f]{64}$') {
        throw "Windows asset checksum is missing from the receipt."
    }
    if ($record.binary_sha256 -notmatch '^[0-9a-f]{64}$' -or
        (Get-FileHash -LiteralPath $record.installed_path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $record.binary_sha256) {
        throw "Installed Windows binary does not match the receipt."
    }
    $second = & $installer -Action apply -PluginVersion 1.1.2 -InstallDir $installDir -ReceiptPath $receipt *>&1 | Out-String
    if ($second -notmatch "already installed") { throw "Second Windows setup was not a no-op." }
    Write-Host "Windows Herdr wrapper smoke passed."
} finally {
    [Environment]::SetEnvironmentVariable("Path", $originalUserPath, "User")
    $env:HERDR_HOME = $originalHerdrHome
    Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
}
