#!/bin/bash
# install_launchd.sh
# Carga el LaunchAgent que corre esig_scraper.py cada hora en tu Mac.
#
# Uso:
#   bash install_launchd.sh           # instala / recarga el agente
#   bash install_launchd.sh uninstall # lo desinstala

set -euo pipefail

LABEL="com.airobotix.esig-scraper"
PROJECT_DIR="/Users/laurasantos/Documents/Codex/2026-05-18/QA"
SOURCE_PLIST="${PROJECT_DIR}/${LABEL}.plist"
TARGET_DIR="${HOME}/Library/LaunchAgents"
TARGET_PLIST="${TARGET_DIR}/${LABEL}.plist"
GUI_DOMAIN="gui/$(id -u)"

mkdir -p "${TARGET_DIR}"

is_loaded() {
    launchctl print "${GUI_DOMAIN}/${LABEL}" &>/dev/null
}

uninstall() {
    if is_loaded; then
        echo ">> Descargando LaunchAgent existente..."
        launchctl bootout "${GUI_DOMAIN}/${LABEL}" 2>/dev/null || true
    fi
    if [ -f "${TARGET_PLIST}" ]; then
        rm -f "${TARGET_PLIST}"
        echo ">> Eliminado: ${TARGET_PLIST}"
    fi
    echo "Listo. El scraper YA NO corre automaticamente."
}

if [ "${1:-}" = "uninstall" ]; then
    uninstall
    exit 0
fi

# Validaciones previas
if [ ! -f "${SOURCE_PLIST}" ]; then
    echo "ERROR: no existe ${SOURCE_PLIST}"
    exit 1
fi
if [ ! -f "${PROJECT_DIR}/esig_scraper.py" ]; then
    echo "ERROR: no existe ${PROJECT_DIR}/esig_scraper.py"
    exit 1
fi
if [ ! -f "${PROJECT_DIR}/.secrets.enc" ]; then
    echo "AVISO: no se encuentra .secrets.enc. Configura primero:"
    echo "       python3 manage_secrets.py --set-cookies"
    echo "       python3 manage_secrets.py --set-hubspot"
fi

# Si ya esta cargado, lo descargamos para recargarlo limpio
if is_loaded; then
    echo ">> Descargando agente existente para recarga limpia..."
    launchctl bootout "${GUI_DOMAIN}/${LABEL}" 2>/dev/null || true
    sleep 1
fi

cp "${SOURCE_PLIST}" "${TARGET_PLIST}"
chmod 644 "${TARGET_PLIST}"

launchctl bootstrap "${GUI_DOMAIN}" "${TARGET_PLIST}"

echo ""
echo "================================================"
echo "OK. LaunchAgent instalado y cargado."
echo "================================================"
echo "Label              : ${LABEL}"
echo "Plist instalado en : ${TARGET_PLIST}"
echo "Script             : ${PROJECT_DIR}/esig_scraper.py"
echo "Schedule           : cada hora, minuto 0"
echo ""
echo "NOTA: Si ves 'Operation not permitted' en launchd.stderr.log,"
echo "      otorga Full Disk Access a Terminal.app en:"
echo "      Ajustes del Sistema > Privacidad > Acceso total al disco"
echo ""
echo "Comandos utiles:"
echo "  Ver si esta cargado:   launchctl print ${GUI_DOMAIN}/${LABEL}"
echo "  Forzar una corrida:    launchctl kickstart -k ${GUI_DOMAIN}/${LABEL}"
echo "  Ver logs:              tail -f ${PROJECT_DIR}/esig_scraper.log"
echo "  Logs de launchd:       tail -f ${PROJECT_DIR}/launchd.stderr.log"
echo "  Detener / desinstalar: bash ${PROJECT_DIR}/install_launchd.sh uninstall"
