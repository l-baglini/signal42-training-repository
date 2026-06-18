# 🌿 WorkBreak

**Pause obbligatorie per chi lavora al PC su Linux.**

WorkBreak blocca lo schermo ogni 55 minuti e guida attraverso 5 minuti di stretching, ricordando di bere e di muoversi. Gira in background come servizio systemd e si integra nel system tray di GNOME.

![Ubuntu](https://img.shields.io/badge/Ubuntu-24.04-orange) ![Python](https://img.shields.io/badge/Python-3.10+-blue) ![License](https://img.shields.io/badge/license-MIT-green)

---

## Funzionalità

| | Feature | Descrizione |
|---|---|---|
| ⏱ | Timer 55/5 | Blocco schermo ogni 55 min, pausa di 5 min |
| 🔒 | Blocco multi-monitor | Copre tutti gli schermi collegati |
| 🧘 | Stretching guidato | 10 esercizi (collo, spalle, occhi, polsi, schiena…) |
| 📷 | Rilevamento movimento | Webcam opzionale via OpenCV + MediaPipe |
| 🃏 | Jolly | 2 pause saltabili al giorno per emergenze |
| 💧 | Promemoria acqua | Notifica configurabile (default ogni 45 min) |
| 🍎 | Merenda | Promemoria a orari fissi (es. 10:30, 16:00) |
| 🔔 | Avviso anticipato | Notifica 1 minuto prima del blocco |
| 📅 | Modalità riunione | Rileva uso di webcam/mic e posticipa la pausa |
| 📊 | Dashboard | Statistiche giornaliere + grafico settimanale |
| 🎨 | Temi | 6 palette colori (scuro/chiaro) + sfondi generativi |
| 🎵 | Audio ambientale | Accordo Am, foresta, pioggia, oceano |
| ⚙️ | Impostazioni | Orari, durata pause, jolly, monitor, tema |
| 🔄 | Autostart | Servizio systemd — parte con il login |

---

## Installazione rapida

```bash
git clone https://github.com/TUO_USERNAME/workbreak.git
cd workbreak
chmod +x install.sh
./install.sh
```

L'installer fa tutto in automatico:
- installa `python3-tk`, `python3-venv`, `libnotify-bin` via apt
- crea un virtual environment isolato in `~/.local/share/workbreak/venv`
- installa le dipendenze Python (`pygame`, `numpy`, `pystray`, `pillow`)
- tenta di installare `opencv-python` + `mediapipe` per la webcam (opzionale)
- crea il comando `workbreak` in `~/.local/bin`
- configura il servizio systemd per l'autostart al login
- aggiunge una voce nel launcher di GNOME

Dopo l'installazione cerca l'icona 🌿 nel system tray. Se non appare subito, esegui `workbreak` dal terminale.

---

## Requisiti

- **Ubuntu 22.04+ / Debian 12+** (testato su Ubuntu 24.04 con GNOME Wayland)
- Python 3.10+
- `python3-tk` (tkinter — non installabile via pip)
- Per il system tray su GNOME: estensione **AppIndicator** (installata automaticamente dall'installer)

### Dipendenze Python

| Pacchetto | Uso | Obbligatorio |
|---|---|---|
| `pystray` | Icona system tray | ✅ |
| `pillow` | Rendering icone | ✅ |
| `pygame` | Audio ambientale + chime | ✅ |
| `numpy` | Generazione suoni | ✅ |
| `plyer` | Notifiche (fallback) | ✅ |
| `opencv-python` | Rilevamento movimento webcam | ⬜ opzionale |
| `mediapipe` | Pose estimation webcam | ⬜ opzionale |

---

## Avvio manuale

```bash
cd workbreak/
python3 -m venv --system-site-packages venv
source venv/bin/activate
pip install pillow pystray plyer pygame numpy

# Webcam (opzionale):
pip install opencv-python mediapipe

python main.py
```

---

## Struttura del progetto

```
workbreak/
├── main.py                 # Entry point — avvia timer, tray, dashboard
├── install.sh              # Installer automatico
├── uninstall.sh            # Disinstallazione completa
├── requirements.txt        # Dipendenze Python
├── workbreak.service       # Unit systemd (generato dall'installer)
├── LICENSE
└── modules/
    ├── state.py            # Stato app + persistenza JSON
    ├── timer_engine.py     # Ciclo 55/5, promemoria acqua/merenda, avvisi
    ├── lock_screen.py      # Schermata di blocco fullscreen + audio + webcam
    ├── dashboard.py        # Dashboard statistiche + impostazioni
    ├── themes.py           # Palette colori + rendering sfondi generativi
    ├── notification.py     # Notifiche desktop (notify-send)
    └── tray.py             # Icona system tray (pystray)
```

---

## Configurazione

Le impostazioni si modificano dalla dashboard (clic sull'icona nel tray → Impostazioni).  
Il file di configurazione è in `~/.config/workbreak/state.json`.

Parametri principali:

| Parametro | Default | Descrizione |
|---|---|---|
| `work_start_hour/min` | 8:00 | Inizio orario lavorativo |
| `work_end_hour/min` | 18:30 | Fine orario lavorativo |
| `lunch_start/end` | 12:30–13:30 | Pausa pranzo (timer sospeso) |
| `work_interval_min` | 55 | Minuti di lavoro tra una pausa e l'altra |
| `break_duration_min` | 5 | Durata della pausa |
| `jolly_per_day` | 2 | Pause saltabili al giorno |
| `water_interval_min` | 45 | Intervallo promemoria acqua |
| `webcam_enabled` | false | Rilevamento movimento via webcam |
| `theme` | teal | Tema UI (teal/midnight/sunset/rose/mono/forest_light) |
| `lock_all_monitors` | true | Blocca tutti i monitor collegati |
| `ui_monitor` | primary | Monitor con l'interfaccia di pausa |

---

## Note su monitor e scaling

WorkBreak supporta configurazioni multi-monitor. Su GNOME Wayland con **scaling frazionario misto** (es. 125% su un monitor e 175% sull'altro) il blocco multi-schermo può apparire male — è una limitazione nota di XWayland. Le soluzioni:

- Usare scaling intero (100% o 200%) su tutti i monitor
- Oppure disabilitare "Blocca tutti gli schermi" nelle impostazioni: il blocco apparirà solo sul monitor primario

---

## Disinstallazione

```bash
cd workbreak/
chmod +x uninstall.sh
./uninstall.sh
```

La configurazione (`~/.config/workbreak/`) viene conservata. Per rimuoverla: `rm -rf ~/.config/workbreak`.

---

## Licenza

MIT — fai quello che vuoi, ma prenditi le pause! 🌿
