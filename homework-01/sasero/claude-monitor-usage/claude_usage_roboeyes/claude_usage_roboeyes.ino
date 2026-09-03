/**
 * ============================================================
 *  Claude Usage Monitor — RoboEyes edition
 * ============================================================
 *
 * Uses the FluxGarage RoboEyes library for animated robot faces.
 * Install via Arduino Library Manager: "FluxGarage RoboEyes"
 * https://github.com/FluxGarage/RoboEyes
 *
 * Hardware (same as original):
 *   SSD1306 128×64 OLED  →  GPIO8 (SDA), GPIO9 (SCL), 3.3V, GND
 *   Push button          →  GPIO7 + 3.3V + GND   (INPUT_PULLUP, active LOW)
 *
 * Faces by worst_pct:
 *    0 – 39 %  →  HAPPY   (eyelids squinting up from bottom)
 *   40 – 69 %  →  DEFAULT (wide open eyes)
 *   70 – 100%  →  ANGRY   (slanted top eyelids) + sweat drops
 *   no fetch   →  TIRED   (half-closed)
 *
 * Button:
 *   short press  →  face ↔ stats (cycle)
 *   long press   →  phrase screen (harsh prank)
 *
 * Libraries (Arduino Library Manager):
 *   • FluxGarage RoboEyes
 *   • Adafruit SSD1306
 *   • Adafruit GFX Library
 *   • ArduinoJson ≥ v7
 *   • HTTPClient (built-in with ESP32 core)
 *
 * Board: "ESP32C3 Dev Module"
 * ============================================================
 */

#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <ArduinoJson.h>
#include <FluxGarage_RoboEyes.h>

// ─────────────────────────────────────────────
//  USER CONFIG
// ─────────────────────────────────────────────
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

const char* SERVER_IP   = "YOUR_SERVER_IP";
const int   SERVER_PORT = 3456;

const unsigned long POLL_INTERVAL_MS = 300000UL;  // 5 minutes
const unsigned long LONG_PRESS_MS    =   2000UL;
const int           TYPEWRITER_MS    =     45;     // ms per character
const unsigned long PHRASE_HOLD_MS   =   3000UL;   // hold phrase after typing done

// Autoblinker: fires every BLINK_INTERVAL + random(0..BLINK_VARIATION-1) SECONDS.
// Testing range (10 – 59 s):
const int BLINK_INTERVAL  = 10;
const int BLINK_VARIATION = 50;
// Production range (1 – 3 min): change to BLINK_INTERVAL=60, BLINK_VARIATION=120

// ─────────────────────────────────────────────
//  HARDWARE PINS
// ─────────────────────────────────────────────
#define SDA_PIN  8
#define SCL_PIN  9
#define BTN_PIN  7

// ─────────────────────────────────────────────
//  DISPLAY & ROBOEYES
// ─────────────────────────────────────────────
#define SCREEN_W 128
#define SCREEN_H  64

Adafruit_SSD1306             display(SCREEN_W, SCREEN_H, &Wire, -1);
RoboEyes<Adafruit_SSD1306>   eyes(display);

// ─────────────────────────────────────────────
//  PHRASES
// ─────────────────────────────────────────────
const char* const PHRASES_LOW[10] = {
  "Full tank! Claude is the only reason you look smart.",
  "Tons of tokens! Too bad ideas aren't included.",
  "You barely used anything. Took a nap instead?",
  "Claude is bored waiting for your next disaster.",
  "All fresh! Try not to waste it on dumb prompts.",
  "Low usage. Impressive for someone who needs AI to function.",
  "All green! Claude is still carrying you beautifully.",
  "Tokens to burn. Good, thinking is clearly not your thing.",
  "Barely a dent. Did you work today or just vibes?",
  "Fresh quota! Claude is ready. Are you? Probably not."
};

const char* const PHRASES_MID[10] = {
  "Halfway through. Claude has done more work than you today.",
  "Half your intelligence is currently on loan from an AI.",
  "Decent usage. You'd be lost without Claude and you know it.",
  "You've been busy. Busy letting Claude do all the thinking.",
  "Halfway! Claude is still carrying the team, as usual.",
  "Not bad! For someone who can't function without AI help.",
  "Solid effort. Claude's effort, to be precise.",
  "Moderate usage. Just enough to feel like you contributed.",
  "Half gone. Claude is doing great. Not sure about you.",
  "50 down, 50 to go. Claude thanks you for your dependence."
};

const char* const PHRASES_HIGH[10] = {
  "Almost out! What will you do when Claude can't save you?",
  "Red zone. Your actual brain is next. Scary thought.",
  "Tokens almost gone. Back to being helpless the old way.",
  "Even Claude needs a break from your neediness. Slow down.",
  "Nearly empty. Hope you have a backup plan. You don't.",
  "Critical! One prompt away from having to think yourself.",
  "Maybe learn ONE thing on your own? Just one thing?",
  "Almost dry! Claude has been compensating for you all day.",
  "Last tokens! What are you without Claude? Don't answer.",
  "Out of tokens soon. The real you emerges. Terrifying."
};

// ─────────────────────────────────────────────
//  GLOBAL STATE
// ─────────────────────────────────────────────
int  sessionPct      = 0;
int  weeklyPct       = 0;
int  worstPct        = 0;
int  sessionResetMin = 0;
bool fetchOk         = false;
unsigned long lastPoll = 0;

enum View { VIEW_FACE, VIEW_STATS, VIEW_PHRASE };
View currentView = VIEW_FACE;

String        phraseText       = "";
int           phraseCharIdx    = 0;
unsigned long phraseNextCharAt = 0;
bool          phraseTyped      = false;
unsigned long phraseDismissAt  = 0;

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────
String fmtReset(int minutes) {
  if (minutes <= 0) return "now!";
  if (minutes < 60) return String(minutes) + "m";
  int h = minutes / 60, m = minutes % 60;
  char buf[8]; snprintf(buf, sizeof(buf), "%dh%02d", h, m);
  return String(buf);
}

void drawBar(int x, int y, int w, int h, int pct) {
  display.drawRect(x, y, w, h, SSD1306_WHITE);
  int fill = constrain((int)(w * pct / 100.0f), 0, w);
  if (fill > 0) display.fillRect(x, y, fill, h, SSD1306_WHITE);
}

// ─────────────────────────────────────────────
//  MOOD UPDATE
// ─────────────────────────────────────────────
void updateMood() {
  if (!fetchOk) {
    eyes.setMood(TIRED);
    eyes.setSweat(OFF);
    return;
  }
  if (worstPct < 40) {
    eyes.setMood(HAPPY);
    eyes.setSweat(OFF);
  } else if (worstPct < 70) {
    eyes.setMood(DEFAULT);
    eyes.setSweat(OFF);
  } else {
    eyes.setMood(ANGRY);
    eyes.setSweat(ON);
  }
}

// ─────────────────────────────────────────────
//  SCREENS DRAWN MANUALLY (stats, phrase, splash)
//  NOTE: never call these while VIEW_FACE — eyes.update()
//  owns the display buffer when the face is showing.
// ─────────────────────────────────────────────
void drawSplash(const char* msg) {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);  display.println("Claude Monitor");
  display.drawLine(0, 10, SCREEN_W - 1, 10, SSD1306_WHITE);
  display.setCursor(0, 16); display.println(msg);
  display.display();
}

void drawStats() {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  if (!fetchOk) {
    display.setCursor(20, 24); display.print("Server error");
  } else {
    display.setCursor(10,  4); display.printf("Session: %d%%", sessionPct);
    display.setCursor(10, 16); display.printf("Weekly:  %d%%", weeklyPct);
    display.setCursor(10, 28); display.printf("Reset:   %s",   fmtReset(sessionResetMin).c_str());
    display.setCursor(0, 44); display.print("S"); drawBar(8, 44, 112, 5, sessionPct);
    display.setCursor(0, 54); display.print("W"); drawBar(8, 54, 112, 5, weeklyPct);
  }
  display.display();
}

void drawTypewriterText(const String& text, int visible) {
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  const int MX = 5, CPL = 19, LH = 11;
  int len = min(visible, (int)text.length());
  int i = 0, y = 8;
  while (i < len && y + LH <= SCREEN_H) {
    int end = min(i + CPL, len);
    if (end < len && text[end] != ' ') {
      int sp = end - 1;
      while (sp > i && text[sp] != ' ') sp--;
      if (sp > i) end = sp;
    }
    display.setCursor(MX, y);
    display.print(text.substring(i, end));
    y += LH; i = end;
    while (i < len && text[i] == ' ') i++;
  }
}

void drawPhrase() {
  display.clearDisplay();
  display.drawRect(1, 1, SCREEN_W - 2, SCREEN_H - 2, SSD1306_WHITE);
  drawTypewriterText(phraseText, phraseCharIdx);
  display.display();
}

// ─────────────────────────────────────────────
//  PHRASE TRIGGER
// ─────────────────────────────────────────────
void showRandomPhrase() {
  const char* p;
  if      (worstPct < 40) p = PHRASES_LOW [random(10)];
  else if (worstPct < 70) p = PHRASES_MID [random(10)];
  else                    p = PHRASES_HIGH[random(10)];
  phraseText       = String(p);
  phraseCharIdx    = 0;
  phraseTyped      = false;
  phraseNextCharAt = millis() + TYPEWRITER_MS;
  currentView      = VIEW_PHRASE;
}

// ─────────────────────────────────────────────
//  FETCH
// ─────────────────────────────────────────────
bool fetchUsage() {
  WiFiClient client;
  HTTPClient http;
  String url = String("http://") + SERVER_IP + ":" + SERVER_PORT + "/usage";
  http.setTimeout(15000);
  if (!http.begin(client, url)) { Serial.println("[http] begin failed"); return false; }
  int code = http.GET();
  if (code != HTTP_CODE_OK) {
    Serial.printf("[http] GET /usage → %d\n", code);
    http.end(); return false;
  }
  String body = http.getString();
  http.end();
  JsonDocument doc;
  if (deserializeJson(doc, body)) { Serial.println("[json] parse error"); return false; }
  sessionPct      = doc["session_pct"]           | 0;
  weeklyPct       = doc["weekly_pct"]            | 0;
  worstPct        = doc["worst_pct"]             | 0;
  sessionResetMin = doc["session_reset_minutes"] | 0;
  Serial.printf("[poll] session=%d%%  weekly=%d%%  worst=%d%%\n", sessionPct, weeklyPct, worstPct);
  return true;
}

// ─────────────────────────────────────────────
//  POLL
// ─────────────────────────────────────────────
void poll() {
  drawSplash("Refreshing...");
  fetchOk = fetchUsage();
  updateMood();
  eyes.blink();  // one blink to signal a fresh fetch
}

// ─────────────────────────────────────────────
//  SETUP
// ─────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  delay(400);

  Wire.begin(SDA_PIN, SCL_PIN);
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("[oled] not found!");
    while (true) delay(1000);
  }

  drawSplash("Connecting...");
  pinMode(BTN_PIN, INPUT_PULLUP);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("[wifi] connecting");
  for (int i = 0; i < 40 && WiFi.status() != WL_CONNECTED; i++) {
    delay(500); Serial.print(".");
  }
  if (WiFi.status() != WL_CONNECTED) {
    drawSplash("WiFi FAILED\nCheck creds.");
    while (true) delay(2000);
  }
  Serial.println("\n[wifi] " + WiFi.localIP().toString());

  randomSeed(micros());

  // ── RoboEyes init ────────────────────────────
  eyes.begin(SCREEN_W, SCREEN_H, 30);   // 30 fps cap
  eyes.setWidth(36, 36);
  eyes.setHeight(26, 26);
  eyes.setBorderradius(8, 8);
  eyes.setSpacebetween(10);
  eyes.setAutoblinker(ON, BLINK_INTERVAL, BLINK_VARIATION);
  eyes.setIdleMode(ON, 3, 5);            // subtle random glances every 3-8 s
  eyes.setCuriosity(ON);                 // outer eye grows when glancing sideways

  poll();
  lastPoll = millis();
}

// ─────────────────────────────────────────────
//  LOOP
// ─────────────────────────────────────────────
void loop() {
  unsigned long now = millis();

  // ── Button ────────────────────────────────────
  static unsigned long btnPressAt = 0;
  static bool          btnDown    = false;
  bool btnNow = (digitalRead(BTN_PIN) == LOW);

  if (btnNow && !btnDown) {
    btnPressAt = now;
    btnDown    = true;
  }

  if (!btnNow && btnDown) {
    btnDown = false;
    unsigned long held = now - btnPressAt;
    if (held < 50) {
      // debounce — ignore
    } else if (held >= LONG_PRESS_MS) {
      if (currentView != VIEW_PHRASE) { showRandomPhrase(); drawPhrase(); }
    } else {
      if (currentView == VIEW_PHRASE) {
        currentView = VIEW_FACE;
      } else {
        currentView = (currentView == VIEW_FACE) ? VIEW_STATS : VIEW_FACE;
        if (currentView == VIEW_STATS) drawStats();
      }
    }
  }

  // ── 5-minute poll ─────────────────────────────
  if (now - lastPoll >= POLL_INTERVAL_MS) {
    poll();
    lastPoll = now;
  }

  // ── Phrase typewriter ──────────────────────────
  if (currentView == VIEW_PHRASE) {
    if (!phraseTyped && now >= phraseNextCharAt) {
      phraseCharIdx++;
      phraseNextCharAt = now + TYPEWRITER_MS;
      if (phraseCharIdx >= (int)phraseText.length()) {
        phraseTyped     = true;
        phraseDismissAt = now + PHRASE_HOLD_MS;
      }
      drawPhrase();
    }
    if (phraseTyped && now >= phraseDismissAt) {
      currentView = VIEW_FACE;
    }
    return;  // don't call eyes.update() when displaying a phrase
  }

  // ── Face (RoboEyes owns the display here) ──────
  if (currentView == VIEW_FACE) {
    eyes.update();  // handles framerate limiting, autoblink, idle glances
  }
  // VIEW_STATS is drawn once on switch and then left static — no action needed here
}
