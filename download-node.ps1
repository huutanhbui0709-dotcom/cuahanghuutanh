# download-node.ps1 - Tai Node.js portable ve thu muc project
param(
    [string]$TargetDir = (Split-Path -Parent $MyInvocation.MyCommand.Path)
)

$NODE_VERSION = "v22.16.0"
$ARCHIVE_NAME = "node-$NODE_VERSION-win-x64.zip"
$EXTRACT_DIR_NAME = "node-$NODE_VERSION-win-x64"
$NODE_URL = "https://nodejs.org/dist/$NODE_VERSION/$ARCHIVE_NAME"
$ARCHIVE_PATH = Join-Path $TargetDir $ARCHIVE_NAME
$EXTRACT_PATH = Join-Path $TargetDir $EXTRACT_DIR_NAME
$FINAL_DIR = Join-Path $TargetDir "node"

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ProgressPreference = 'SilentlyContinue'

try {
    Write-Host "  Dang tai Node.js $NODE_VERSION..." -ForegroundColor Cyan
    Write-Host "  URL: $NODE_URL"
    Write-Host ""

    Invoke-WebRequest -Uri $NODE_URL -OutFile $ARCHIVE_PATH -UseBasicParsing

    Write-Host "  Download hoan tat. Dang giai nen..." -ForegroundColor Cyan

    if (Test-Path $EXTRACT_PATH) { Remove-Item $EXTRACT_PATH -Recurse -Force }
    Expand-Archive -Path $ARCHIVE_PATH -DestinationPath $TargetDir -Force

    if (Test-Path $FINAL_DIR) { Remove-Item $FINAL_DIR -Recurse -Force }
    Rename-Item -Path $EXTRACT_PATH -NewName "node"

    Remove-Item $ARCHIVE_PATH -Force -ErrorAction SilentlyContinue

    Write-Host "  [OK] Da cai Node.js portable thanh cong!" -ForegroundColor Green
    exit 0
}
catch {
    Write-Host "  [LOI] Tai Node.js that bai: $_" -ForegroundColor Red
    if (Test-Path $ARCHIVE_PATH) { Remove-Item $ARCHIVE_PATH -Force -ErrorAction SilentlyContinue }
    exit 1
}
