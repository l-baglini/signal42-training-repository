#!/bin/bash
# WorkBreak — installer per Ubuntu/Debian
# Uso: chmod +x install.sh && ./install.sh

set -e
BOLD="\033[1m"; GREEN="\033[32m"; YELLOW="\033[33m"; RED="\033[31m"; RESET="\033[0m"
ok()   { echo -e "  ${GREEN}✓${RESET}  $1"; }
warn() { echo -e "  ${YELLOW}⚠${RESET}  $1"; }
fail() { echo -e "  ${RED}✗${RESET}  $1"; }
step() { echo -e "\n${BOLD}$1${RESET}"; }

INSTALL_DIR="$HOME/.local/share/workbreak"
BIN_DIR="$HOME/.local/bin"
SERVICE_DIR="$HOME/.config/systemd/user"
VENV="$INSTALL_DIR/venv"

echo -e "\n${BOLD}🌿  WorkBreak — Installazione${RESET}"
echo    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── 1. Dipendenze di sistema ───────────────────────────────────────────────
step "1/5  Dipendenze di sistema"
MISSING=()
for pkg in python3-tk python3-full python3-venv python3-pip libnotify-bin; do
    dpkg -s "$pkg" &>/dev/null || MISSING+=("$pkg")
done

if [ ${#MISSING[@]} -gt 0 ]; then
    echo "     Installo: ${MISSING[*]}"
    sudo apt-get install -y "${MISSING[@]}" -qq
    ok "Pacchetti installati"
else
    ok "Tutti i pacchetti di sistema già presenti"
fi

# pystray su GNOME richiede AppIndicator
for pkg in python3-gi gir1.2-appindicator3-0.1; do
    dpkg -s "$pkg" &>/dev/null || sudo apt-get install -y "$pkg" -qq
done

# Abilita l'estensione AppIndicator se su GNOME
if command -v gnome-extensions &>/dev/null; then
    gnome-extensions enable ubuntu-appindicators@ubuntu.com 2>/dev/null \
        && ok "AppIndicator GNOME abilitato" \
        || warn "AppIndicator già abilitato o non disponibile (normale su non-GNOME)"
fi

# ── 2. Copia i file ────────────────────────────────────────────────────────
step "2/5  Copia file"
mkdir -p "$INSTALL_DIR"
# Copia solo i file sorgente, non il venv
rsync -a --exclude='venv/' --exclude='__pycache__/' --exclude='*.pyc' \
    "$(dirname "$0")/" "$INSTALL_DIR/" 2>/dev/null \
    || cp -r "$(dirname "$0")/." "$INSTALL_DIR/"
ok "File copiati in $INSTALL_DIR"

# ── 3. Virtual environment ─────────────────────────────────────────────────
step "3/5  Virtual environment Python"
if [ ! -f "$VENV/bin/python" ]; then
    python3 -m venv --system-site-packages "$VENV"
    ok "venv creato"
else
    ok "venv già esistente"
fi

"$VENV/bin/pip" install --upgrade pip -q
ok "pip aggiornato"

step "      Dipendenze Python obbligatorie"
"$VENV/bin/pip" install -q \
    "pillow>=10.0.0" \
    "pystray>=0.19.0" \
    "plyer>=2.1.0" \
    "pygame>=2.5.0" \
    "numpy>=1.24.0"
ok "pillow, pystray, plyer, pygame, numpy installati"

step "      Dipendenze opzionali (webcam detection)"
if "$VENV/bin/pip" install -q "opencv-python>=4.8.0" "mediapipe>=0.10.0" 2>/dev/null; then
    ok "opencv-python + mediapipe installati (rilevamento movimento attivo)"
else
    warn "opencv/mediapipe non installabili — webcam detection disabilitata"
    warn "Puoi installarli dopo con: $VENV/bin/pip install opencv-python mediapipe"
fi

# ── 4. Launcher ────────────────────────────────────────────────────────────
step "4/5  Launcher"
mkdir -p "$BIN_DIR"
LOG_FILE="$HOME/.local/share/workbreak/workbreak.log"

cat > "$INSTALL_DIR/workbreak-launcher" << LAUNCHER
#!/bin/bash
# WorkBreak launcher — avvio silenzioso (nessun terminale visibile)
export PYTHONPATH="$INSTALL_DIR"
export DISPLAY="\${DISPLAY:-:0}"
export DBUS_SESSION_BUS_ADDRESS="\${DBUS_SESSION_BUS_ADDRESS:-unix:path=/run/user/$(id -u)/bus}"
cd "$INSTALL_DIR"

# Se avviato da terminale con --debug, mostra i log sul terminale
if [[ "\$1" == "--debug" ]]; then
    exec "$VENV/bin/python" "$INSTALL_DIR/main.py"
fi

# Altrimenti avvia in background, log su file (rotazione semplice: max 1MB)
if [ -f "$LOG_FILE" ] && [ \$(stat -c%s "$LOG_FILE" 2>/dev/null || echo 0) -gt 1048576 ]; then
    mv "$LOG_FILE" "${LOG_FILE}.old"
fi
nohup "$VENV/bin/python" "$INSTALL_DIR/main.py" \
    >> "$LOG_FILE" 2>&1 &
disown
LAUNCHER
chmod +x "$INSTALL_DIR/workbreak-launcher"
ln -sf "$INSTALL_DIR/workbreak-launcher" "$BIN_DIR/workbreak"

# Aggiunge ~/.local/bin al PATH se non c'è già
if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$HOME/.bashrc"
    warn "Aggiunto ~/.local/bin a PATH in .bashrc (ricarica il terminale per usare 'workbreak')"
fi
ok "Comando 'workbreak' disponibile"

# .desktop per lanciare da launcher GNOME
DESKTOP_DIR="$HOME/.local/share/applications"
mkdir -p "$DESKTOP_DIR"
cat > "$DESKTOP_DIR/workbreak.desktop" << DESKTOP
[Desktop Entry]
Name=WorkBreak
Comment=Pause obbligatorie per la salute
Exec=$INSTALL_DIR/workbreak-launcher
Icon=appointment-soon
Terminal=false
Type=Application
Categories=Utility;
StartupNotify=false
DESKTOP
ok "Voce nel launcher GNOME creata"

# ── 5. Servizio systemd ────────────────────────────────────────────────────
step "5/5  Autostart (systemd)"
mkdir -p "$SERVICE_DIR"
cat > "$SERVICE_DIR/workbreak.service" << SERVICE
[Unit]
Description=WorkBreak — pause salutari per chi lavora al PC
After=graphical-session.target
PartOf=graphical-session.target

[Service]
Type=simple
ExecStart=$INSTALL_DIR/workbreak-launcher
Restart=on-failure
RestartSec=10
Environment=DISPLAY=:0
Environment=DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$(id -u)/bus
Environment=XDG_RUNTIME_DIR=/run/user/$(id -u)

[Install]
WantedBy=graphical-session.target
SERVICE

systemctl --user daemon-reload
systemctl --user enable workbreak.service
systemctl --user start workbreak.service && ok "Servizio avviato" || warn "Avvio servizio fallito — usa 'workbreak' per avviare manualmente"

# ── Fine ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}✅  WorkBreak installato!${RESET}"
echo ""
echo "   Cerca l'icona 🌿 nel system tray."
echo "   Se non appare subito, esegui: workbreak"
echo ""
echo "   Comandi utili:"
echo "   workbreak                            avvio silenzioso (nessun terminale)"
echo "   workbreak --debug                    avvio con log sul terminale"
echo "   tail -f $LOG_FILE   log in tempo reale"
echo "   systemctl --user status workbreak   stato del servizio"
echo "   systemctl --user restart workbreak  riavvia"
echo "   systemctl --user stop workbreak     ferma"
echo ""
