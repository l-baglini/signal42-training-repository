#!/bin/bash
# WorkBreak — disinstallazione completa
BOLD="\033[1m"; GREEN="\033[32m"; RESET="\033[0m"
echo -e "\n${BOLD}🗑️  WorkBreak — Disinstallazione${RESET}"

systemctl --user stop workbreak.service 2>/dev/null && echo "  ✓ Servizio fermato"
systemctl --user disable workbreak.service 2>/dev/null && echo "  ✓ Servizio disabilitato"
rm -f "$HOME/.config/systemd/user/workbreak.service"
systemctl --user daemon-reload

rm -rf "$HOME/.local/share/workbreak"
rm -f  "$HOME/.local/bin/workbreak"
rm -f  "$HOME/.local/share/applications/workbreak.desktop"

echo -e "\n${GREEN}✓ WorkBreak rimosso.${RESET}"
echo "  La configurazione è conservata in ~/.config/workbreak/"
echo "  Per rimuoverla: rm -rf ~/.config/workbreak"
