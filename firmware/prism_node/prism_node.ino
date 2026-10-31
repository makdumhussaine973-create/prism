/*
 * PRISM sensor node - ESP32 (dual core, FreeRTOS)
 * Core 1: sensor polling task  Core 0: Wi-Fi/MQTT + offline buffer + valve task
 * (spec: ESP8266 single core lost data during concurrent polling + Wi-Fi TX)
 *
 * Libraries: PubSubClient, ArduinoJson (v7), OneWire, DallasTemperature, Adafruit SHT31
 * Wiring: SEN0193 moisture -> GPIO34 | DS18B20 -> GPIO4 (4.7k pull-up to 3V3)
 *         SHT31 -> I2C GPIO21/22     | SEN0169 pH (optional) -> GPIO32
 *         Battery divider 100k/100k -> GPIO35 | Relay (valve) -> GPIO26
 */
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <Adafruit_SHT31.h>
#include <LittleFS.h>
#include <time.h>

const char* WIFI_SSID = "PRISM_GATEWAY";
const char* WIFI_PASS = "change-me";
const char* MQTT_HOST = "192.168.4.1";
const uint16_t MQTT_PORT = 1883;
const char* NODE_ID = "prism-n01";
const uint32_t CYCLE_MS = 15UL * 60UL * 1000UL;
const int SAMPLES = 5;
const int BUF_MAX = 96;
const int MOIST_AIR_RAW = 3000;
const int MOIST_WATER_RAW = 1300;
const bool HAS_PH = true;
const float PH_OFFSET = 0.0f;
const uint32_t VALVE_MAX_MS = 60UL * 60UL * 1000UL;
const int PIN_MOIST = 34, PIN_ONEWIRE = 4, PIN_PH = 32, PIN_BATT = 35, PIN_RELAY = 26;

OneWire oneWire(PIN_ONEWIRE);
DallasTemperature ds18(&oneWire);
Adafruit_SHT31 sht31;
WiFiClient wifi;
PubSubClient mqtt(wifi);
QueueHandle_t readingQ;
String topicTelemetry, topicValve, topicStatus;
volatile uint32_t valveOffAt = 0;

void setup() {
  Serial.begin(115200);
  pinMode(PIN_RELAY, OUTPUT); digitalWrite(PIN_RELAY, LOW);
  analogReadResolution(12);
  analogSetPinAttenuation(PIN_MOIST, ADC_11db);
  LittleFS.begin(true);
  ds18.begin();
  if (!sht31.begin(0x44)) Serial.println("SHT31 not found");
  topicTelemetry = String("prism/") + NODE_ID + "/telemetry";
  topicValve = String("prism/") + NODE_ID + "/valve";
  topicStatus = String("prism/") + NODE_ID + "/status";
  WiFi.mode(WIFI_STA); WiFi.begin(WIFI_SSID, WIFI_PASS);
  configTime(5 * 3600 + 1800, 0, "pool.ntp.org");
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
}

void loop() { vTaskDelay(portMAX_DELAY); }
