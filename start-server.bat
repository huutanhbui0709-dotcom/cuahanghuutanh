@echo off
chcp 65001 >nul
cd /d "%~dp0"

title Cua Hang Vat Tu Ky Thuat

echo.
echo  ================================================
echo    CUA HANG VAT TU KY THUAT - KHOI DONG 😂
echo  ================================================
echo.

:: ===================================================================
:: 1. KIEM TRA NODE.JS
:: ===================================================================
set "LOCAL_NODE=%~dp0node"

where node >nul 2>nul
if %errorlevel% equ 0 (
    echo  [OK] Tim thay Node.js he thong.
    goto :node_ready
)

if exist "%LOCAL_NODE%\node.exe" (
    set "PATH=%LOCAL_NODE%;%PATH%"
    echo  [OK] Tim thay Node.js portable.
    goto :node_ready
)

:: Node chua co - tai ve
echo  [INFO] Chua tim thay Node.js. Dang tai ve ban portable...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0download-node.ps1"

if %errorlevel% neq 0 (
    echo.
    echo  [LOI] Khong the tai Node.js tu dong.
    echo  Vui long cai Node.js thu cong tu: https://nodejs.org
    echo.
    pause
    exit /b 1
)

if not exist "%LOCAL_NODE%\node.exe" (
    echo.
    echo  [LOI] Giai nen Node.js that bai!
    pause
    exit /b 1
)

set "PATH=%LOCAL_NODE%;%PATH%"
echo  [OK] Da cai dat Node.js portable thanh cong!

:node_ready
echo.

:: ===================================================================
:: 2. TAO FILE .env NEU CHUA CO
:: ===================================================================
if not exist ".env" (
    if exist ".env.example" (
        echo  [INFO] Tao file .env tu .env.example...
        copy ".env.example" ".env" >nul
        echo  [OK] Da tao file .env
    )
) else (
    echo  [OK] File .env da san sang.
)

:: ===================================================================
:: 3. CAI DAT DEPENDENCIES
:: ===================================================================
if not exist "node_modules\" (
    echo.
    echo  [INFO] Dang cai dat dependencies...
    echo.
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo  [LOI] Cai dat dependencies that bai!
        pause
        exit /b 1
    )
    echo.
    echo  [OK] Cai dat dependencies thanh cong!
) else (
    echo  [OK] Dependencies da san sang.
)

:: ===================================================================
:: 4. KHOI DONG SERVER VA MO TRINH DUYET
:: ===================================================================
echo.
echo  ================================================
echo   Dang khoi dong server...
echo   Trinh duyet se tu dong mo sau 2 giay.
echo  ------------------------------------------------
echo   Trang khach hang: http://localhost:3000
echo   Trang quan tri:   http://localhost:3000/admin
echo  ------------------------------------------------
echo   Nhan Ctrl+C de dung server.
echo  ================================================
echo.

:: Mo trinh duyet sau 2 giay (chay ngam)
start "" /b powershell -NoProfile -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:3000'"

:: Khoi dong server
call npm start

echo.
echo  ================================================
echo   Server da dung lai.
echo  ================================================
pause
