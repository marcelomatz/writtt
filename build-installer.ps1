[CmdletBinding()]
param(
    [string] $PfxPath = '',
    [string] $PfxPass = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Root       = $PSScriptRoot
$WinDir     = Join-Path $Root 'build\windows'
$BinDir     = Join-Path $Root 'build\bin'
$DefaultPfx = Join-Path $WinDir 'writtt-dev.pfx'
$DefaultPass = 'writtt-dev-2026'

if ($PfxPath -eq '')         { $PfxPath = $DefaultPfx }
if ($PfxPass -eq '')         { $PfxPass = $DefaultPass }
if ($env:WRITTT_CERT_PATH)   { $PfxPath = $env:WRITTT_CERT_PATH }
if ($env:WRITTT_CERT_PASS)   { $PfxPass = $env:WRITTT_CERT_PASS }

function WriteStep { param([string]$m); Write-Host ''; Write-Host ("  > $m") -ForegroundColor Cyan }
function WriteOk   { param([string]$m); Write-Host ("    OK  $m") -ForegroundColor Green }
function WriteWarn { param([string]$m); Write-Host ("    !!  $m") -ForegroundColor Yellow }
function WriteFail { param([string]$m); Write-Host ("    ERR $m") -ForegroundColor Red; exit 1 }

# --- 1. signtool ---
WriteStep 'Localizando signtool.exe'
$signtool = $null
$kitsRoots = @(
    "${env:ProgramFiles(x86)}\Windows Kits\10\bin",
    "$env:ProgramFiles\Windows Kits\10\bin"
)
foreach ($base in $kitsRoots) {
    if (Test-Path $base) {
        $f = Get-ChildItem $base -Filter 'signtool.exe' -Recurse -ErrorAction SilentlyContinue |
             Where-Object { $_.FullName -like '*x64*' } |
             Sort-Object LastWriteTime -Descending |
             Select-Object -First 1
        if ($f) { $signtool = $f.FullName }
    }
}
if ($signtool)      { WriteOk $signtool }
if (-not $signtool) { WriteWarn 'signtool.exe nao encontrado - binarios nao serao assinados.' }

# --- 2. Wails CLI ---
WriteStep 'Verificando Wails CLI'
if (-not (Get-Command wails -ErrorAction SilentlyContinue)) {
    WriteFail 'wails nao esta no PATH. go install github.com/wailsapp/wails/v2/cmd/wails@latest'
}
WriteOk 'wails disponivel'

# --- 3. PNG -> ICO via .NET (sem dependencias externas) ---
WriteStep 'Gerando icon.ico a partir de appicon.png'
$appicon = Join-Path $Root 'build\appicon.png'
$icoOut  = Join-Path $WinDir 'icon.ico'

if (-not (Test-Path $appicon)) {
    WriteWarn ("appicon.png nao encontrado - pulando conversao: $appicon")
} else {
    Add-Type -AssemblyName System.Drawing
    $sizes  = @(256, 128, 64, 48, 32, 16)
    $src    = [System.Drawing.Image]::FromFile((Resolve-Path $appicon).Path)
    $images = @()
    foreach ($sz in $sizes) {
        $bmp = New-Object System.Drawing.Bitmap($sz, $sz)
        $g   = [System.Drawing.Graphics]::FromImage($bmp)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.DrawImage($src, 0, 0, $sz, $sz)
        $g.Dispose()
        $ms = New-Object System.IO.MemoryStream
        $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
        $bmp.Dispose()
        $images += @{ Size = $sz; Bytes = $ms.ToArray() }
        $ms.Dispose()
    }
    $src.Dispose()

    $out = New-Object System.IO.MemoryStream
    $bw  = New-Object System.IO.BinaryWriter($out)
    $bw.Write([uint16]0)
    $bw.Write([uint16]1)
    $bw.Write([uint16]$images.Count)
    $offset = 6 + ($images.Count * 16)
    foreach ($img in $images) {
        $dim = [byte]0
        if ($img.Size -ne 256) { $dim = [byte]$img.Size }
        $bw.Write($dim); $bw.Write($dim)
        $bw.Write([byte]0); $bw.Write([byte]0)
        $bw.Write([uint16]1); $bw.Write([uint16]32)
        $bw.Write([uint32]$img.Bytes.Length)
        $bw.Write([uint32]$offset)
        $offset += $img.Bytes.Length
    }
    foreach ($img in $images) { $bw.Write($img.Bytes) }
    $bw.Flush()
    [System.IO.File]::WriteAllBytes($icoOut, $out.ToArray())
    $bw.Dispose()
    $out.Dispose()
    WriteOk ("icon.ico gerado: $([int]((Get-Item $icoOut).Length / 1KB)) KB ($($sizes.Count) tamanhos)")
}

# --- 4. Certificado de desenvolvimento ---
WriteStep 'Certificado de desenvolvimento'
if (-not (Test-Path $PfxPath)) {
    Write-Host '    Criando certificado autoassinado...' -ForegroundColor Yellow
    $cert = New-SelfSignedCertificate `
        -Subject           'CN=Writtt Dev, O=Marcelo Matzembacher, C=BR' `
        -CertStoreLocation 'Cert:\CurrentUser\My' `
        -Type              CodeSigningCert `
        -KeyUsage          DigitalSignature `
        -KeyAlgorithm      RSA `
        -KeyLength         4096 `
        -NotAfter          (Get-Date).AddYears(3) `
        -HashAlgorithm     SHA256
    $securePwd = ConvertTo-SecureString $PfxPass -AsPlainText -Force
    Export-PfxCertificate -Cert $cert -FilePath $PfxPath -Password $securePwd | Out-Null
    Remove-Item ("Cert:\CurrentUser\My\$($cert.Thumbprint)") -Force
    WriteOk ("Criado: $PfxPath")
    WriteWarn 'AUTOASSINADO - Windows exibira SmartScreen Unknown Publisher.'
}
if (Test-Path $PfxPath) {
    WriteOk ("Usando: $PfxPath")
}

# --- 5. Versao de wails.json (fonte unica de verdade) ---
WriteStep 'Lendo versao de wails.json'
$wailsJson  = Join-Path $Root 'wails.json'
$versionRaw = (Get-Content $wailsJson -Raw | ConvertFrom-Json).info.productVersion
$version    = "v$versionRaw"
WriteOk "Versao: $version"

# --- 6. wails build --nsis ---
WriteStep 'wails build --nsis (windows/amd64)'
Push-Location $Root
try {
    $ldflags = "-X main.CurrentVersion=$version"
    & wails build --nsis --platform windows/amd64 -ldflags "$ldflags"
    if ($LASTEXITCODE -ne 0) { WriteFail "wails build falhou: exit $LASTEXITCODE" }
    WriteOk "Build concluido - binario marcado como $version"
} finally {
    Pop-Location
}

# --- 7. Assinar exe ---
$exe = Join-Path $BinDir 'writtt.exe'
if ($signtool -and (Test-Path $exe)) {
    WriteStep 'Assinando writtt.exe'
    & $signtool sign /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 /f $PfxPath /p $PfxPass $exe
    if ($LASTEXITCODE -ne 0) { WriteFail 'signtool falhou no executavel' }
    WriteOk 'Executavel assinado'
}
if (-not $signtool) { WriteWarn 'Pulando assinatura do .exe - signtool nao disponivel' }

# --- 8. Assinar instalador ---
$inst = Get-ChildItem $BinDir -Filter '*-installer.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($signtool -and $inst) {
    WriteStep "Assinando instalador: $($inst.Name)"
    & $signtool sign /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 /f $PfxPath /p $PfxPass $inst.FullName
    if ($LASTEXITCODE -ne 0) { WriteFail 'signtool falhou no instalador' }
    WriteOk 'Instalador assinado'
}
if (-not $inst) { WriteWarn "Instalador nao encontrado em $BinDir" }

# --- 9. Limpar cache de icones do Windows ---
WriteStep 'Limpando cache de icones do Windows'
$cacheDir   = Join-Path $env:LocalAppData 'Microsoft\Windows\Explorer'
$cacheFiles = Get-ChildItem $cacheDir -Filter 'iconcache_*.db' -ErrorAction SilentlyContinue
if ($cacheFiles) {
    Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 800
    foreach ($f in $cacheFiles) {
        Remove-Item $f.FullName -Force -ErrorAction SilentlyContinue
    }
    Start-Process explorer
    WriteOk "Cache limpo: $($cacheFiles.Count) arquivo(s) removido(s)"
}
if (-not $cacheFiles) { WriteWarn 'Cache de icones nao encontrado (nao e necessario limpar)' }

# --- Done ---
Write-Host ''
Write-Host '  Build concluido!' -ForegroundColor Green
Write-Host ''
if ($inst)          { Write-Host "  Instalador : $($inst.FullName)" }
if (Test-Path $exe) { Write-Host "  Executavel : $exe" }
Write-Host "  Certificado: $PfxPath"
Write-Host ''
