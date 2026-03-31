#!/usr/bin/env bash
# TrailNav v2.0 - Script de Próximos Pasos Automáticos
# Run: bash SETUP.sh o sh SETUP.sh

echo "🚀 TrailNav v2.0 - Setup Automático"
echo "=================================="
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if in correct directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found"
    echo "Please run this script from the TrailNav root directory"
    exit 1
fi

echo -e "${BLUE}Step 1: Verificando dependencias...${NC}"
npm install
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Dependencias instaladas${NC}\n"
else
    echo -e "${YELLOW}⚠ Algunos packages pueden faltar, continuando...${NC}\n"
fi

echo -e "${BLUE}Step 2: Verificando TypeScript...${NC}"
npx tsc --noEmit
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ TypeScript OK - Sin errores${NC}\n"
else
    echo -e "${YELLOW}⚠ Algunos errores de TypeScript (revisar en editor)${NC}\n"
fi

echo -e "${BLUE}Step 3: Construyendo para producción...${NC}"
npm run build
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Build completado exitosamente${NC}\n"
else
    echo -e "${YELLOW}❌ Hubo errores en el build${NC}\n"
    exit 1
fi

echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}✓ SETUP COMPLETADO${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo ""
echo "Próximos pasos:"
echo "1. Verificar carpeta 'dist' se creó"
echo "2. Testear localmente: npm run preview"
echo "3. Deployar 'dist' a servidor HTTPS"
echo "4. Instalar en Android: Chrome → Instalar app"
echo ""
echo "Documentación:"
echo "- MEJORAS_ANDROID.md - Cambios técnicos"
echo "- GUIA_RAPIDA_ANDROID.md - Guía para usuarios"
echo "- PROXIMOS_PASOS.md - Tareas futuras"
echo ""
