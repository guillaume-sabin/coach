# Lance les tests CoachCore sur Windows en configurant l'environnement du toolchain Swift installé par winget.
#   powershell -File apps/ios/CoachCore/test.ps1
$ErrorActionPreference = 'Stop'

$toolchains = Join-Path $env:LOCALAPPDATA 'Programs\Swift\Toolchains'
$runtimes = Join-Path $env:LOCALAPPDATA 'Programs\Swift\Runtimes'
if (-not (Test-Path $toolchains)) {
    Write-Error "Toolchain Swift introuvable. Installez-le : winget install --id Swift.Toolchain --exact"
}
$tc = Get-ChildItem $toolchains | Sort-Object Name -Descending | Select-Object -First 1
$rt = Get-ChildItem $runtimes | Sort-Object Name -Descending | Select-Object -First 1

if (-not $env:SDKROOT) {
    $env:SDKROOT = [Environment]::GetEnvironmentVariable('SDKROOT', 'User')
    if (-not $env:SDKROOT) { $env:SDKROOT = [Environment]::GetEnvironmentVariable('SDKROOT', 'Machine') }
}
$env:Path = "$($tc.FullName)\usr\bin;$($rt.FullName)\usr\bin;$env:Path"

Set-Location $PSScriptRoot
swift --version
swift test @args
