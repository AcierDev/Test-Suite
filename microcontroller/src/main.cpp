#include <Arduino.h>
#include <ArduinoJson.h>       // Include ArduinoJson library
#include <AsyncEventSource.h>  //Include Async Web Server library
#include <ESP32Servo.h>        // Include Servo library
#include <WiFi.h>

#include <map>     // For tracking last read times
#include <vector>  // For storing pin configurations

const char *ssid = "Everwood";
const char *password = "Everwood-Staff";

// --- Pin Configuration ---
struct IoPinConfig {
  String id;    // Unique ID from the frontend
  String name;  // User-defined name
  uint8_t pin;  // GPIO pin number
  uint8_t
      mode;  // Arduino pinMode (INPUT, OUTPUT, INPUT_PULLUP, INPUT_PULLDOWN)
  int lastState;  // Last known state for input pins (-1 for unknown, 0 for LOW,
                  // 1 for HIGH)
};

std::vector<IoPinConfig> configuredPins;
std::map<String, unsigned long>
    lastPinReadTime;  // Track last read time for input pins
const unsigned long inputReadInterval = 50;  // Read inputs every 50ms

// --- Servo Configuration ---
struct ServoConfig {
  String id;                // Unique ID from the frontend
  String name;              // User-defined name
  uint8_t pin;              // GPIO pin number
  Servo servo;              // Servo object
  int minAngle = 0;         // Minimum allowed angle
  int maxAngle = 180;       // Maximum allowed angle
  bool isAttached = false;  // Track attached state
};

std::vector<ServoConfig> configuredServos;

// Globals for repeated IP printing
unsigned long ipPrintStopTime = 0;  // Time when IP printing should stop
unsigned long lastIpPrintTime = 0;  // Last time IP was printed
const unsigned long ipPrintDuration = 15000;  // Print for 15 seconds (15000 ms)
const unsigned long ipPrintInterval = 1000;   // Print every 1 second (1000 ms)

// Create AsyncWebServer object on port 80
AsyncWebServer server(80);
// Create a WebSocket object
AsyncWebSocket ws("/ws");

// --- Helper: Find Pin Config by ID ---
IoPinConfig *findPinById(const String &id) {
  for (auto &pinConfig : configuredPins) {
    if (pinConfig.id == id) {
      return &pinConfig;
    }
  }
  return nullptr;
}

// --- Helper: Find Servo Config by ID ---
ServoConfig *findServoById(const String &id) {
  for (auto &servoConfig : configuredServos) {
    if (servoConfig.id == id) {
      return &servoConfig;
    }
  }
  return nullptr;
}

// Placeholder for WebSocket event handler function
void onWebSocketEvent(AsyncWebSocket *server, AsyncWebSocketClient *client,
                      AwsEventType type, void *arg, uint8_t *data, size_t len) {
  switch (type) {
    case WS_EVT_CONNECT: {
      Serial.printf("WebSocket client #%u connected from %s\n", client->id(),
                    client->remoteIP().toString().c_str());
      // Optionally send current configuration or status
      break;
    }
    case WS_EVT_DISCONNECT: {
      Serial.printf("WebSocket client #%u disconnected\n", client->id());
      break;
    }
    case WS_EVT_DATA: {
      AwsFrameInfo *info = (AwsFrameInfo *)arg;
      if (info->final && info->index == 0 && info->len == len &&
          info->opcode == WS_TEXT) {
        data[len] = 0;  // Null-terminate
        Serial.printf("Received WS [%u]: %s\n", client->id(), (char *)data);

        // Increased JSON buffer size
        StaticJsonDocument<512> doc;
        DeserializationError error = deserializeJson(doc, (char *)data);

        if (error) {
          Serial.print(F("deserializeJson() failed: "));
          Serial.println(error.c_str());
          client->text("ERROR: Invalid JSON");
          return;
        }

        const char *action = doc["action"];
        const char *group = doc["componentGroup"];

        if (!action || !group) {
          Serial.println(
              "ERROR: Missing action or componentGroup in WS message");
          client->text("ERROR: Missing action or componentGroup");
          return;
        }

        // --- Handle PIN messages ---
        if (strcmp(group, "pins") == 0) {
          if (strcmp(action, "configure") == 0) {
            JsonObject config = doc["config"];
            String id = config["id"].as<String>();
            String name = config["name"].as<String>();
            uint8_t pin = config["pin"].as<uint8_t>();
            String typeStr = config["type"].as<String>();
            String pullModeStr = config["pullMode"].as<String>();  // Optional

            if (id.isEmpty() || name.isEmpty() || typeStr.isEmpty()) {
              client->text("ERROR: Missing required config fields for pin");
              return;
            }

            uint8_t targetMode = INPUT;
            if (typeStr == "Digital Output")
              targetMode = OUTPUT;
            else if (typeStr == "Digital Input")
              targetMode = INPUT;
            else if (typeStr == "Digital Input Pullup")
              targetMode = INPUT_PULLUP;
            // Add INPUT_PULLDOWN handling if needed
            else {
              client->text("ERROR: Invalid pin type specified");
              return;
            }

            IoPinConfig *existingPin = findPinById(id);
            if (existingPin) {
              Serial.printf("Updating pin ID %s (%s) on GPIO %d to mode %d\n",
                            id.c_str(), name.c_str(), pin, targetMode);
              existingPin->name = name;
              existingPin->pin = pin;
              existingPin->mode = targetMode;
              existingPin->lastState = -1;
              pinMode(pin, targetMode);
              if (targetMode == OUTPUT) digitalWrite(pin, LOW);
            } else {
              Serial.printf("Adding pin ID %s (%s) on GPIO %d with mode %d\n",
                            id.c_str(), name.c_str(), pin, targetMode);
              IoPinConfig newPin = {id, name, pin, targetMode, -1};
              configuredPins.push_back(newPin);
              pinMode(pin, targetMode);
              if (targetMode == OUTPUT) digitalWrite(pin, LOW);
            }
            client->text("OK: Pin configured");

          } else if (strcmp(action, "control") == 0) {
            String id = doc["id"].as<String>();
            bool state = doc["state"].as<bool>();
            IoPinConfig *pinToControl = findPinById(id);
            if (pinToControl && pinToControl->mode == OUTPUT) {
              Serial.printf("Setting pin ID %s (GPIO %d) to state %s\n",
                            id.c_str(), pinToControl->pin,
                            state ? "HIGH" : "LOW");
              digitalWrite(pinToControl->pin, state ? HIGH : LOW);
              client->text("OK: Pin controlled");
            } else {
              Serial.printf(
                  "WARN: Could not control pin ID %s (not found or not "
                  "OUTPUT)\n",
                  id.c_str());
              client->text("ERROR: Pin not found or not configured as Output");
            }

          } else if (strcmp(action, "remove") == 0) {
            String id = doc["id"].as<String>();
            for (auto it = configuredPins.begin(); it != configuredPins.end();
                 ++it) {
              if (it->id == id) {
                Serial.printf("Removing pin ID %s (GPIO %d)\n", id.c_str(),
                              it->pin);
                pinMode(it->pin, INPUT);
                configuredPins.erase(it);
                lastPinReadTime.erase(id);
                client->text("OK: Pin removed");
                break;  // Use break instead of return to handle other groups
                        // below
              }
            }
            // If loop finishes without finding, send error? (Currently handled
            // implicitly)
          }
          // --- Handle SERVO messages ---
        } else if (strcmp(group, "servos") == 0) {
          if (strcmp(action, "configure") == 0) {
            JsonObject config = doc["config"];
            String id = config["id"].as<String>();
            String name = config["name"].as<String>();
            uint8_t pin = config["pin"].as<uint8_t>();
            // Optional: Get min/max from config if sent later
            // int min_angle = config["minAngle"] | 0; // Default 0 if not
            // present int max_angle = config["maxAngle"] | 180; // Default 180
            // if not present

            if (id.isEmpty() || name.isEmpty() ||
                pin == 0) {  // Pin 0 might be valid but often isn't used
              client->text("ERROR: Missing required config fields for servo");
              return;
            }

            ServoConfig *existingServo = findServoById(id);
            if (existingServo) {
              // Update existing servo - detach old, attach new if pin changes?
              // For simplicity, just update name for now. Pin changes require
              // more handling.
              if (existingServo->pin != pin) {
                Serial.printf(
                    "WARN: Servo pin change requested for %s (GPIO %d -> %d). "
                    "Reconfiguring.\n",
                    id.c_str(), existingServo->pin, pin);
                existingServo->servo.detach();  // Detach from old pin
                existingServo->pin = pin;
                existingServo->servo.attach(pin);  // Attach to new pin
                existingServo->isAttached = true;
              } else if (!existingServo->isAttached) {
                // If only name changed but servo was detached, re-attach
                existingServo->servo.attach(pin);
                existingServo->isAttached = true;
              }
              existingServo->name = name;
              // Update limits if provided in config later
              // existingServo->minAngle = min_angle;
              // existingServo->maxAngle = max_angle;
              Serial.printf("Updating servo ID %s (%s) on GPIO %d\n",
                            id.c_str(), name.c_str(), pin);
            } else {
              // Add new servo
              Serial.printf("Adding servo ID %s (%s) on GPIO %d\n", id.c_str(),
                            name.c_str(), pin);
              ServoConfig newServo;
              newServo.id = id;
              newServo.name = name;
              newServo.pin = pin;
              // newServo.minAngle = min_angle;
              // newServo.maxAngle = max_angle;
              newServo.servo.attach(pin);  // Attach the servo
              newServo.isAttached = true;
              configuredServos.push_back(newServo);
            }
            client->text("OK: Servo configured");

          } else if (strcmp(action, "control") == 0) {
            String id = doc["id"].as<String>();
            ServoConfig *servoToControl = findServoById(id);

            if (servoToControl) {
              if (doc.containsKey("angle")) {
                int angle = doc["angle"].as<int>();
                // Clamp angle based on configured limits
                angle = constrain(angle, servoToControl->minAngle,
                                  servoToControl->maxAngle);
                if (!servoToControl->isAttached) {  // Re-attach if detached
                  servoToControl->servo.attach(servoToControl->pin);
                  servoToControl->isAttached = true;
                  Serial.printf("Re-attaching servo ID %s before write\n",
                                id.c_str());
                  delay(50);  // Small delay after attach may help
                }
                Serial.printf("Setting servo ID %s (GPIO %d) to angle %d\n",
                              id.c_str(), servoToControl->pin, angle);
                servoToControl->servo.write(angle);
                client->text("OK: Servo angle set");
              } else if (doc.containsKey("command")) {
                String command = doc["command"].as<String>();
                if (command == "attach") {
                  if (!servoToControl->isAttached) {
                    Serial.printf("Attaching servo ID %s (GPIO %d)\n",
                                  id.c_str(), servoToControl->pin);
                    servoToControl->servo.attach(servoToControl->pin);
                    servoToControl->isAttached = true;
                    client->text("OK: Servo attached");
                  } else {
                    client->text("INFO: Servo already attached");
                  }
                } else if (command == "detach") {
                  if (servoToControl->isAttached) {
                    Serial.printf("Detaching servo ID %s (GPIO %d)\n",
                                  id.c_str(), servoToControl->pin);
                    servoToControl->servo.detach();
                    servoToControl->isAttached = false;
                    client->text("OK: Servo detached");
                  } else {
                    client->text("INFO: Servo already detached");
                  }
                } else if (command == "reset") {
                  // Optional: Implement a reset command (e.g., go to 90
                  // degrees)
                  int resetAngle = 90;
                  resetAngle = constrain(resetAngle, servoToControl->minAngle,
                                         servoToControl->maxAngle);
                  if (!servoToControl->isAttached) {
                    servoToControl->servo.attach(servoToControl->pin);
                    servoToControl->isAttached = true;
                    delay(50);
                  }
                  Serial.printf("Resetting servo ID %s to %d degrees\n",
                                id.c_str(), resetAngle);
                  servoToControl->servo.write(resetAngle);
                  client->text("OK: Servo reset");
                } else {
                  client->text("ERROR: Unknown servo command");
                }
              }
            } else {
              Serial.printf("WARN: Could not control servo ID %s (not found)\n",
                            id.c_str());
              client->text("ERROR: Servo not found");
            }

          } else if (strcmp(action, "remove") == 0) {
            String id = doc["id"].as<String>();
            for (auto it = configuredServos.begin();
                 it != configuredServos.end(); ++it) {
              if (it->id == id) {
                Serial.printf("Removing servo ID %s (GPIO %d)\n", id.c_str(),
                              it->pin);
                if (it->isAttached) {
                  it->servo.detach();  // Detach before removing
                }
                configuredServos.erase(it);
                client->text("OK: Servo removed");
                break;  // Exit loop once removed
              }
            }
            // If loop finishes without finding, send error?
          }
        } else {
          // Handle other groups (relays, sensors, steppers) or unknown
          // actions/groups
          Serial.printf("Received unhandled group: %s\n", group);
        }
      }
      break;
    }
    case WS_EVT_PONG: {
      Serial.printf("WebSocket PONG received from #%u\n", client->id());
      break;
    }
    case WS_EVT_ERROR: {
      Serial.printf("WebSocket client #%u error #%u: %s\n", client->id(),
                    *((uint16_t *)arg), (char *)data);
      break;
    }
  }
}

void setup() {
  Serial.begin(115200);
  delay(10);

  // We start by connecting to a WiFi network
  Serial.println();
  Serial.print("Connecting to ");
  Serial.println(ssid);

  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("");
  Serial.println("WiFi connected");
  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());

  // --- Initial IP_READY print ---
  Serial.print("IP_READY:");
  Serial.println(WiFi.localIP());
  // --- Start the 15-second printing window ---
  ipPrintStopTime = millis() + ipPrintDuration;
  lastIpPrintTime = millis();  // Record time of first print

  // Print WebSocket URL
  Serial.print("WebSocket server started at ws://");
  Serial.print(WiFi.localIP());
  Serial.println("/ws");

  // Attach WebSocket event handler
  ws.onEvent(onWebSocketEvent);
  // Add WebSocket handler to the server
  server.addHandler(&ws);

  // Start server
  server.begin();
  Serial.println("HTTP server started");
}

void loop() {
  ws.cleanupClients();

  unsigned long currentMillis = millis();

  // --- Repeated IP Printing Logic ---
  if (ipPrintStopTime != 0) {  // Check if printing period is active
    if (currentMillis >= ipPrintStopTime) {
      ipPrintStopTime = 0;  // Stop printing period
      Serial.println("Finished repeated IP printing.");
    } else if (currentMillis - lastIpPrintTime >= ipPrintInterval) {
      // Print again if interval has passed
      Serial.print("IP_READY:");
      Serial.println(WiFi.localIP());
      lastIpPrintTime = currentMillis;
    }
  }

  // --- Read Input Pins ---
  for (auto &pinConfig : configuredPins) {
    // Check if it's an input pin
    if (pinConfig.mode == INPUT || pinConfig.mode == INPUT_PULLUP) {
      // Check if enough time has passed since the last read
      if (currentMillis - lastPinReadTime[pinConfig.id] >= inputReadInterval) {
        lastPinReadTime[pinConfig.id] = currentMillis;

        int currentState = digitalRead(pinConfig.pin);

        // Send update only if state has changed
        if (currentState != pinConfig.lastState) {
          pinConfig.lastState = currentState;

          Serial.printf("Pin ID %s (GPIO %d) changed state to %d\n",
                        pinConfig.id.c_str(), pinConfig.pin, currentState);

          // Create JSON response
          StaticJsonDocument<128> updateDoc;
          updateDoc["type"] = "pinUpdate";
          updateDoc["id"] = pinConfig.id;
          updateDoc["state"] = currentState;  // 0 for LOW, 1 for HIGH

          String output;
          serializeJson(updateDoc, output);

          // Send update to all connected clients
          ws.textAll(output);
        }
      }
    }
  }
  // Small delay to prevent busy-waiting, adjust as needed
  delay(10);
}
