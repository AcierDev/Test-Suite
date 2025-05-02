#include <Arduino.h>
#include <ArduinoJson.h>
#include <AsyncEventSource.h>
#include <ESP32Servo.h>
#include <FastAccelStepper.h>
#include <WiFi.h>

#include <map>
#include <memory>
#include <vector>

const char *ssid = "Everwood";
const char *password = "Everwood-Staff";

// FastAccelStepper engine setup
FastAccelStepperEngine engine = FastAccelStepperEngine();

// --- Pin Configuration ---
struct IoPinConfig {
  String id;
  String name;
  uint8_t pin;
  uint8_t mode;
  int lastState;
};

std::vector<IoPinConfig> configuredPins;
std::map<String, unsigned long> lastPinReadTime;
const unsigned long inputReadInterval = 50;

// --- Servo Configuration (uses pointers safely) ---
struct ServoConfig {
  String id;
  String name;
  uint8_t pin;
  Servo *servo = nullptr;
  int minAngle = 0;
  int maxAngle = 180;
  bool isAttached = false;
};

std::vector<ServoConfig> configuredServos;

// --- Stepper Configuration ---
struct StepperConfig {
  String id;
  String name;
  uint8_t pulPin;
  uint8_t dirPin;
  FastAccelStepper *stepper = nullptr;
  long currentPosition = 0;
  long targetPosition = 0;
  float maxSpeed = 1000.0;
  float acceleration = 500.0;
  unsigned long lastPositionReportTime = 0;
};

std::vector<StepperConfig> configuredSteppers;
const unsigned long stepperPositionReportInterval =
    100;  // Report position every 100ms if changed

// IP printing
unsigned long ipPrintStopTime = 0;
unsigned long lastIpPrintTime = 0;
const unsigned long ipPrintDuration = 15000;
const unsigned long ipPrintInterval = 1000;

AsyncWebServer server(80);
AsyncWebSocket ws("/ws");

IoPinConfig *findPinById(const String &id) {
  for (auto &pinConfig : configuredPins) {
    if (pinConfig.id == id) return &pinConfig;
  }
  return nullptr;
}

ServoConfig *findServoById(const String &id) {
  for (auto &servoConfig : configuredServos) {
    if (servoConfig.id == id) return &servoConfig;
  }
  return nullptr;
}

StepperConfig *findStepperById(const String &id) {
  for (auto &stepperConfig : configuredSteppers) {
    if (stepperConfig.id == id) {
      return &stepperConfig;
    }
  }
  return nullptr;
}

void onWebSocketEvent(AsyncWebSocket *server, AsyncWebSocketClient *client,
                      AwsEventType type, void *arg, uint8_t *data, size_t len) {
  switch (type) {
    case WS_EVT_CONNECT:
      Serial.printf("WebSocket client #%u connected from %s\n", client->id(),
                    client->remoteIP().toString().c_str());
      break;

    case WS_EVT_DISCONNECT:
      Serial.printf("WebSocket client #%u disconnected\n", client->id());
      break;

    case WS_EVT_DATA: {
      AwsFrameInfo *info = (AwsFrameInfo *)arg;
      if (info->final && info->index == 0 && info->len == len &&
          info->opcode == WS_TEXT) {
        data[len] = 0;
        Serial.printf("Received WS [%u]: %s\n", client->id(), (char *)data);

        StaticJsonDocument<512> doc;
        DeserializationError error = deserializeJson(doc, (char *)data);
        if (error) {
          client->text("ERROR: Invalid JSON");
          return;
        }

        const char *action = doc["action"];
        const char *group = doc["componentGroup"];
        if (!action || !group) {
          client->text("ERROR: Missing action or componentGroup");
          return;
        }

        if (strcmp(group, "pins") == 0) {
          if (strcmp(action, "configure") == 0) {
            JsonObject config = doc["config"];
            String id = config["id"];
            String name = config["name"];
            uint8_t pin = config["pin"];
            String typeStr = config["type"];

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
            else {
              client->text("ERROR: Invalid pin type specified");
              return;
            }

            IoPinConfig *existingPin = findPinById(id);
            if (existingPin) {
              existingPin->name = name;
              existingPin->pin = pin;
              existingPin->mode = targetMode;
              existingPin->lastState = -1;
              pinMode(pin, targetMode);
              if (targetMode == OUTPUT) digitalWrite(pin, LOW);
            } else {
              IoPinConfig newPin = {id, name, pin, targetMode, -1};
              configuredPins.push_back(newPin);
              pinMode(pin, targetMode);
              if (targetMode == OUTPUT) digitalWrite(pin, LOW);
            }
            client->text("OK: Pin configured");

          } else if (strcmp(action, "control") == 0) {
            String id = doc["id"];
            bool state = doc["state"];
            IoPinConfig *pinToControl = findPinById(id);
            if (pinToControl && pinToControl->mode == OUTPUT) {
              digitalWrite(pinToControl->pin, state ? HIGH : LOW);
              client->text("OK: Pin controlled");
            } else {
              client->text("ERROR: Pin not found or not configured as Output");
            }

          } else if (strcmp(action, "remove") == 0) {
            String id = doc["id"];
            for (auto it = configuredPins.begin(); it != configuredPins.end();
                 ++it) {
              if (it->id == id) {
                pinMode(it->pin, INPUT);
                configuredPins.erase(it);
                lastPinReadTime.erase(id);
                client->text("OK: Pin removed");
                break;
              }
            }
          }
        }

        else if (strcmp(group, "servos") == 0) {
          if (strcmp(action, "configure") == 0) {
            JsonObject config = doc["config"];
            String id = config["id"];
            String name = config["name"];
            uint8_t pin = config["pin"];

            int minAngle = config["minAngle"] | 0;
            int maxAngle = config["maxAngle"] | 180;

            if (id.isEmpty() || name.isEmpty()) {
              client->text("ERROR: Missing required config fields for servo");
              return;
            }

            ServoConfig *existingServo = findServoById(id);
            if (existingServo) {
              if (existingServo->pin != pin) {
                if (existingServo->isAttached) existingServo->servo->detach();
                existingServo->servo->attach(pin);
                existingServo->pin = pin;
                existingServo->isAttached = true;
              } else if (!existingServo->isAttached) {
                existingServo->servo->attach(pin);
                existingServo->isAttached = true;
              }
              existingServo->name = name;
              existingServo->minAngle = minAngle;
              existingServo->maxAngle = maxAngle;
            } else {
              Servo *newServo = new Servo();
              newServo->attach(pin);
              ServoConfig newConfig;
              newConfig.id = id;
              newConfig.name = name;
              newConfig.pin = pin;
              newConfig.servo = newServo;
              newConfig.minAngle = minAngle;
              newConfig.maxAngle = maxAngle;
              newConfig.isAttached = true;
              configuredServos.push_back(newConfig);
            }
            client->text("OK: Servo configured");

          } else if (strcmp(action, "control") == 0) {
            String id = doc["id"];
            ServoConfig *servo = findServoById(id);
            if (!servo) {
              client->text("ERROR: Servo not found");
              return;
            }

            if (doc.containsKey("angle")) {
              int angle = doc["angle"];
              angle = constrain(angle, servo->minAngle, servo->maxAngle);
              if (!servo->isAttached) {
                servo->servo->attach(servo->pin);
                servo->isAttached = true;
              }
              servo->servo->write(angle);
              client->text("OK: Servo angle set");
            } else if (doc.containsKey("command")) {
              String cmd = doc["command"];
              if (cmd == "attach" && !servo->isAttached) {
                servo->servo->attach(servo->pin);
                servo->isAttached = true;
                client->text("OK: Servo attached");
              } else if (cmd == "detach" && servo->isAttached) {
                servo->servo->detach();
                servo->isAttached = false;
                client->text("OK: Servo detached");
              } else if (cmd == "reset") {
                int angle = constrain(90, servo->minAngle, servo->maxAngle);
                if (!servo->isAttached) {
                  servo->servo->attach(servo->pin);
                  servo->isAttached = true;
                }
                servo->servo->write(angle);
                client->text("OK: Servo reset");
              } else {
                client->text("ERROR: Unknown command");
              }
            }

          } else if (strcmp(action, "remove") == 0) {
            String id = doc["id"];
            for (auto it = configuredServos.begin();
                 it != configuredServos.end(); ++it) {
              if (it->id == id) {
                if (it->isAttached) it->servo->detach();
                delete it->servo;
                configuredServos.erase(it);
                client->text("OK: Servo removed");
                break;
              }
            }
          }
        }

        else if (strcmp(group, "steppers") == 0) {
          if (strcmp(action, "configure") == 0) {
            JsonObject config = doc["config"];
            String id = config["id"];
            String name = config["name"];
            uint8_t pulPin = config["pulPin"];
            uint8_t dirPin = config["dirPin"];

            if (id.isEmpty() || name.isEmpty() || pulPin == 0 || dirPin == 0) {
              client->text(
                  "ERROR: Missing required config fields for stepper (id, "
                  "name, pulPin, dirPin)");
              return;
            }

            StepperConfig *existingStepper = findStepperById(id);
            if (existingStepper) {
              Serial.printf("Updating stepper ID %s (%s)\n", id.c_str(),
                            name.c_str());
              existingStepper->name = name;
            } else {
              Serial.printf("Adding stepper ID %s (%s) on PUL %d, DIR %d\n",
                            id.c_str(), name.c_str(), pulPin, dirPin);
              StepperConfig newConfig;
              newConfig.id = id;
              newConfig.name = name;
              newConfig.pulPin = pulPin;
              newConfig.dirPin = dirPin;

              // Create FastAccelStepper instance
              newConfig.stepper = engine.stepperConnectToPin(pulPin);
              if (newConfig.stepper) {
                newConfig.stepper->setDirectionPin(dirPin);
                // Set initial parameters
                newConfig.stepper->setSpeedInHz(
                    newConfig.maxSpeed);  // Hz instead of steps/second
                newConfig.stepper->setAcceleration(newConfig.acceleration);
                // Enable higher speeds by setting auto-enable to false
                newConfig.stepper->setAutoEnable(false);

                configuredSteppers.push_back(newConfig);
              } else {
                client->text("ERROR: Failed to create stepper on pin");
                return;
              }
            }
            client->text("OK: Stepper configured");

          } else if (strcmp(action, "control") == 0) {
            String id = doc["id"];
            StepperConfig *stepper = findStepperById(id);
            if (!stepper || !stepper->stepper) {
              client->text("ERROR: Stepper not found or not initialized");
              return;
            }

            const char *command = doc["command"];
            if (!command) {
              client->text("ERROR: Missing 'command' for stepper control");
              return;
            }

            if (strcmp(command, "setConfig") == 0) {
              if (doc.containsKey("speed")) {
                float speed = doc["speed"].as<float>();
                // Store the requested speed value
                stepper->maxSpeed = speed;
                // Set the speed in Hz (steps per second)
                stepper->stepper->setSpeedInHz(speed);

                // If speed is very high, make sure auto-enable is off
                if (speed > 5000) {
                  stepper->stepper->setAutoEnable(false);
                }

                Serial.printf("Stepper %s: Set speed to %.2f Hz\n", id.c_str(),
                              speed);
              }
              if (doc.containsKey("accel")) {
                float accel = doc["accel"].as<float>();
                stepper->stepper->setAcceleration(accel);
                stepper->acceleration = accel;

                Serial.printf("Stepper %s: Set acceleration to %.2f steps/s²\n",
                              id.c_str(), accel);
              }
              Serial.printf(
                  "Stepper %s: Config updated (speed=%.2f Hz, accel=%.2f "
                  "steps/s²)\n",
                  id.c_str(), stepper->maxSpeed, stepper->acceleration);
              client->text("OK: Stepper config updated");
            } else if (strcmp(command, "move") == 0) {
              if (doc.containsKey("steps")) {
                long steps = doc["steps"].as<long>();
                // Get current position first
                long currentPos = stepper->stepper->getCurrentPosition();
                // Move relative from current position
                stepper->stepper->move(steps);
                stepper->targetPosition = currentPos + steps;

                Serial.printf(
                    "Stepper %s: Moving relative %ld steps (speed=%.2f, "
                    "accel=%.2f)\n",
                    id.c_str(), steps, stepper->maxSpeed,
                    stepper->acceleration);
                client->text("OK: Stepper move initiated");
              }
            } else if (strcmp(command, "moveTo") == 0) {
              if (doc.containsKey("position")) {
                long pos = doc["position"].as<long>();
                stepper->stepper->moveTo(pos);
                stepper->targetPosition = pos;

                Serial.printf(
                    "Stepper %s: Moving to absolute %ld (speed=%.2f, "
                    "accel=%.2f)\n",
                    id.c_str(), pos, stepper->maxSpeed, stepper->acceleration);
                client->text("OK: Stepper moveTo initiated");
              }
            } else if (strcmp(command, "stop") == 0) {
              stepper->stepper->forceStop();
              client->text("OK: Stepper stopped");
            } else {
              client->text("ERROR: Unknown stepper command");
            }

          } else if (strcmp(action, "remove") == 0) {
            String id = doc["id"];
            for (auto it = configuredSteppers.begin();
                 it != configuredSteppers.end(); ++it) {
              if (it->id == id) {
                Serial.printf("Removing stepper ID %s\n", id.c_str());
                if (it->stepper) {
                  it->stepper->forceStop();  // Stop before removing
                }
                // FastAccelStepper is managed by the engine, no need to delete
                configuredSteppers.erase(it);
                client->text("OK: Stepper removed");
                break;
              }
            }
          }
        }

        else {
          // Handle other groups or unknown
          Serial.printf("Received unhandled group: %s\n", group);
          client->text("ERROR: Unhandled component group");
        }
      }
      break;
    }

    case WS_EVT_PONG:
      Serial.printf("WebSocket PONG received from #%u\n", client->id());
      break;

    case WS_EVT_ERROR:
      Serial.printf("WebSocket client #%u error #%u: %s\n", client->id(),
                    *((uint16_t *)arg), (char *)data);
      break;
  }
}

void setup() {
  Serial.begin(115200);
  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  // Initialize FastAccelStepper engine
  engine.init();

  Serial.print("IP_READY:");
  Serial.println(WiFi.localIP());

  ipPrintStopTime = millis() + ipPrintDuration;
  lastIpPrintTime = millis();

  ws.onEvent(onWebSocketEvent);
  server.addHandler(&ws);
  server.begin();
  Serial.println("HTTP server started");
}

void loop() {
  ws.cleanupClients();

  unsigned long now = millis();
  if (ipPrintStopTime && now < ipPrintStopTime &&
      now - lastIpPrintTime >= ipPrintInterval) {
    Serial.print("IP_READY:");
    Serial.println(WiFi.localIP());
    lastIpPrintTime = now;
  }

  for (auto &pin : configuredPins) {
    if (pin.mode == INPUT || pin.mode == INPUT_PULLUP) {
      if (now - lastPinReadTime[pin.id] >= inputReadInterval) {
        lastPinReadTime[pin.id] = now;
        int state = digitalRead(pin.pin);
        if (state != pin.lastState) {
          pin.lastState = state;
          StaticJsonDocument<128> msg;
          msg["type"] = "pinUpdate";
          msg["id"] = pin.id;
          msg["state"] = state;
          String out;
          serializeJson(msg, out);
          ws.textAll(out);
        }
      }
    }
  }

  // --- Run Steppers ---
  for (auto &stepperConfig : configuredSteppers) {
    if (stepperConfig.stepper) {
      unsigned long now = millis();

      // FastAccelStepper doesn't need a run() call in the loop

      // Check and report position periodically
      if (now - stepperConfig.lastPositionReportTime >=
          stepperPositionReportInterval) {
        long currentPos = stepperConfig.stepper->getCurrentPosition();
        if (currentPos != stepperConfig.currentPosition) {
          stepperConfig.currentPosition = currentPos;
          stepperConfig.lastPositionReportTime = now;

          StaticJsonDocument<128> updateDoc;
          updateDoc["type"] = "stepperUpdate";
          updateDoc["id"] = stepperConfig.id;
          updateDoc["position"] = currentPos;

          String output;
          serializeJson(updateDoc, output);
          ws.textAll(output);
        }
      }
    }
  }

  delay(1);  // Small delay is okay, FastAccelStepper uses hardware timers
}
