@echo off
chcp 65001 >nul
echo.
echo  ╔═══════════════════════════════════════════════╗
echo  ║   AZKAR PWA — Despliegue a GitHub Pages      ║
echo  ╚═══════════════════════════════════════════════╝
echo.

REM Verificar que git esta instalado
git --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Git no esta instalado.
    echo Descargalo en: https://git-scm.com/download/win
    pause
    exit /b 1
)

REM Inicializar repo si no existe
if not exist ".git" (
    echo [1/4] Inicializando repositorio...
    git init
    git checkout -b main 2>nul || git branch -M main
) else (
    echo [1/4] Repositorio ya existe, continuando...
)

echo [2/4] Preparando archivos...
git add index.html manifest.json sw.js INSTALAR.html icons/

echo [3/4] Creando commit...
git commit -m "Azkar PWA - actualizacion %date%"

REM Configurar remote si no existe
git remote get-url origin >nul 2>&1
if errorlevel 1 (
    echo Conectando con GitHub...
    git remote add origin https://github.com/asieresquinas1/azkar-app.git
)

echo [4/4] Subiendo a GitHub...
git push -u origin main

echo.
echo  ╔═══════════════════════════════════════════════╗
echo  ║  HECHO! Ahora activa GitHub Pages:            ║
echo  ║                                               ║
echo  ║  1. github.com/asieresquinas1/azkar-app       ║
echo  ║  2. Settings → Pages                          ║
echo  ║  3. Branch: main / (root) → Save              ║
echo  ║                                               ║
echo  ║  Tu app:                                      ║
echo  ║  https://asieresquinas1.github.io/azkar-app/  ║
echo  ╚═══════════════════════════════════════════════╝
echo.
pause
