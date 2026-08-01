[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$hostName = 'com.chrome_extension.web_reader_codex'
$installRoot = Join-Path $env:LOCALAPPDATA 'WebReaderCodexHost'
$expectedRoot = [System.IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'WebReaderCodexHost'))
$resolvedRoot = [System.IO.Path]::GetFullPath($installRoot)

foreach ($registryPath in @(
    "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$hostName",
    "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$hostName"
)) {
    if (Test-Path $registryPath) {
        Remove-Item -Path $registryPath -Recurse -Force
    }
}

if ($resolvedRoot -ne $expectedRoot) {
    throw "Refusing to remove an unexpected directory: $resolvedRoot"
}
if (Test-Path -LiteralPath $resolvedRoot) {
    Remove-Item -LiteralPath $resolvedRoot -Recurse -Force
}

Write-Host 'Web Reader Native Host uninstalled.' -ForegroundColor Green
