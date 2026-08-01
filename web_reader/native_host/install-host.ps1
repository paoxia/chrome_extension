[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-p]{32}$')]
    [string]$ExtensionId,

    [ValidateSet('Chrome', 'Edge', 'Both')]
    [string]$Browser = 'Chrome'
)

$ErrorActionPreference = 'Stop'
$hostName = 'com.chrome_extension.web_reader_codex'
$installRoot = Join-Path $env:LOCALAPPDATA 'WebReaderCodexHost'
$sourcePath = Join-Path $PSScriptRoot 'WebReaderCodexHost.cs'
$executablePath = Join-Path $installRoot 'WebReaderCodexHost.exe'
$manifestPath = Join-Path $installRoot "$hostName.json"
$configPath = Join-Path $installRoot 'host-config.json'

if (-not (Test-Path -LiteralPath $sourcePath)) {
    throw "Native Host source not found: $sourcePath"
}

$codexCommand = Get-Command codex.cmd -ErrorAction SilentlyContinue
if (-not $codexCommand) {
    throw 'codex.cmd was not found. Install Codex CLI and verify that codex --version works.'
}

New-Item -ItemType Directory -Force -Path $installRoot | Out-Null
if (Test-Path -LiteralPath $executablePath) {
    Remove-Item -LiteralPath $executablePath -Force
}

Add-Type `
    -TypeDefinition (Get-Content -Raw -Encoding UTF8 $sourcePath) `
    -Language CSharp `
    -ReferencedAssemblies @('System.dll', 'System.Core.dll', 'System.Web.Extensions.dll') `
    -OutputAssembly $executablePath `
    -OutputType ConsoleApplication

$utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
$hostConfig = @{ codexPath = $codexCommand.Source } | ConvertTo-Json
[System.IO.File]::WriteAllText($configPath, $hostConfig, $utf8WithoutBom)

$hostManifest = @{
    name = $hostName
    description = 'Web Reader local Codex Native Messaging host'
    path = $executablePath
    type = 'stdio'
    allowed_origins = @("chrome-extension://$ExtensionId/")
} | ConvertTo-Json -Depth 4
[System.IO.File]::WriteAllText($manifestPath, $hostManifest, $utf8WithoutBom)

$registryRoots = @()
if ($Browser -in @('Chrome', 'Both')) {
    $registryRoots += 'HKCU:\Software\Google\Chrome\NativeMessagingHosts'
}
if ($Browser -in @('Edge', 'Both')) {
    $registryRoots += 'HKCU:\Software\Microsoft\Edge\NativeMessagingHosts'
}

foreach ($registryRoot in $registryRoots) {
    $registryPath = Join-Path $registryRoot $hostName
    New-Item -Path $registryPath -Force | Out-Null
    Set-Item -Path $registryPath -Value $manifestPath
}

$version = & $codexCommand.Source --version
Write-Host ''
Write-Host 'Web Reader Native Host installed successfully.' -ForegroundColor Green
Write-Host "Codex: $version"
Write-Host "Extension ID: $ExtensionId"
Write-Host "Install directory: $installRoot"
Write-Host 'Reload Web Reader at chrome://extensions/ and test Local Codex (Native).'
