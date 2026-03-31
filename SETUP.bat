@echo off
REM TrailNav v2.0 - Script de Próximos Pasos Automáticos (Windows)
REM Run: SETUP.bat

echo.
echo =========================================
echo TrailNav v2.0 - Setup Automatico (Windows)
echo =========================================
echo.

REM Check if in correct directory
if not exist "package.json" (
    echo Error: package.json not found
    echo Please run this script from the TrailNav root directory
    pause
    exit /b 1
)

echo [1/4] Verificando dependencias...
call npm install
if %ERRORLEVEL% EQU 0 (
    echo [OK] Dependencias instaladas
) else (
    echo [WARNING] Algunos packages pueden faltar, continuando...
)
echo.

echo [2/4] Verificando TypeScript...
call npx tsc --noEmit
if %ERRORLEVEL% EQU 0 (
    echo [OK] TypeScript OK - Sin errores
) else (
    echo [WARNING] Algunos errores de TypeScript (revisar en editor)
)
echo.

echo [3/4] Compilando CSS...
if exist "src\index.css" (
    echo [OK] index.css encontrado
)
echo.

echo [4/4] Construyendo para produccion...
call npm run build
if %ERRORLEVEL% EQU 0 (
    echo [OK] Build completado exitosamente
    echo.
    echo =========================================
    echo Desarrollo = COMPLETADO
    echo =========================================
    echo.
    echo Proximos pasos:
    echo 1. Verificar carpeta 'dist' se creó
    echo 2. Testear localmente: npm run preview
    echo 3. Deployar 'dist' a servidor HTTPS
    echo 4. Instalar en Android: Chrome menu ^> Instalar app
    echo.
    echo Documentacion:
    echo - MEJORAS_ANDROID.md ^- Cambios tecnicos
    echo - GUIA_RAPIDA_ANDROID.md ^- Guia para usuarios
    echo - PROXIMOS_PASOS.md ^- Tareas futuras
    echo.
) else (
    echo [ERROR] Hubo errores en el build
    pause
    exit /b 1
)

pause
