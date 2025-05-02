#!/usr/bin/env node

// Separate script to handle serial port communication
// avoids bundling issues with Next.js

import { SerialPort } from "serialport";
import { ReadlineParser } from "@serialport/parser-readline";
import fs from "fs";
import path from "path";

const IP_FILE_PATH = path.join(__dirname, "..", ".ip_address"); // Store IP in project root
let port: SerialPort | null = null;
let parser: ReadlineParser | null = null;
let detectionAttempts = 0;
const MAX_DETECTION_ATTEMPTS = 5; // Limit retries

// Function to find the serial port (same as before)
async function findEsp32PortPath(): Promise<string | null> {
  const envPort = process.env.ESP32_SERIAL_PORT;
  if (envPort) {
    console.log(
      `[IP Finder] Using serial port from ESP32_SERIAL_PORT env var: ${envPort}`
    );
    return envPort;
  }
  console.log(
    "[IP Finder] Attempting to automatically detect ESP32 serial port..."
  );
  try {
    const ports = await SerialPort.list();
    console.log(
      "[IP Finder] Available serial ports:",
      ports.map((p) => ({ path: p.path, manufacturer: p.manufacturer }))
    );
    const espPatterns = [/usbserial/i, /ttyusb/i, /ttyacm/i];
    const espManufacturers = [/espressif/i, /wch.cn/i, /silicon_labs/i];
    for (const p of ports) {
      const pathMatches = espPatterns.some((pattern) => pattern.test(p.path));
      const manufacturerMatches =
        p.manufacturer &&
        espManufacturers.some((pattern) => pattern.test(p.manufacturer));
      if (pathMatches || manufacturerMatches) {
        console.log(
          `[IP Finder] Auto-detected potential ESP32 port: ${
            p.path
          } (Manufacturer: ${p.manufacturer || "N/A"})`
        );
        return p.path;
      }
    }
    console.warn(
      "[IP Finder] Could not automatically detect ESP32 serial port. Set ESP32_SERIAL_PORT environment variable or check connection."
    );
    return null;
  } catch (error) {
    console.error("[IP Finder] Error listing serial ports:", error);
    return null;
  }
}

// Function to clean up the IP file
function cleanupIpFile() {
  if (fs.existsSync(IP_FILE_PATH)) {
    console.log("[IP Finder] Cleaning up IP file.");
    try {
      fs.unlinkSync(IP_FILE_PATH);
    } catch (err) {
      console.error("[IP Finder] Error deleting IP file:", err);
    }
  }
}

// Main function to setup and listen
async function startIpDetection() {
  cleanupIpFile(); // Clean up any old file on start
  detectionAttempts++;

  const path = await findEsp32PortPath();
  if (!path) {
    console.error("[IP Finder] Serial port path not found.");
    if (detectionAttempts < MAX_DETECTION_ATTEMPTS) {
      console.log(
        `[IP Finder] Retrying detection in 5 seconds... (${detectionAttempts}/${MAX_DETECTION_ATTEMPTS})`
      );
      setTimeout(startIpDetection, 5000); // Retry after a delay
    } else {
      console.error("[IP Finder] Max detection attempts reached. Exiting.");
      fs.writeFileSync(IP_FILE_PATH, "ERROR: Port not found"); // Signal error
    }
    return;
  }

  console.log(`[IP Finder] Attempting to open serial port: ${path}`);
  port = new SerialPort({ path, baudRate: 115200 });
  parser = port.pipe(new ReadlineParser({ delimiter: "\n" }));

  parser.on("data", (line: string) => {
    console.log(`[IP Finder] Serial data: ${line.trim()}`);
    if (line.startsWith("IP_READY:")) {
      const ip = line.substring("IP_READY:".length).trim();
      console.log(`[IP Finder] *** Detected ESP32 IP Address: ${ip} ***`);
      try {
        fs.writeFileSync(IP_FILE_PATH, ip);
        console.log(`[IP Finder] IP address written to ${IP_FILE_PATH}`);
      } catch (err) {
        console.error("[IP Finder] Error writing IP file:", err);
      }

      // Close port after finding IP
      if (port && port.isOpen) {
        port.close((err) => {
          if (err)
            console.error("[IP Finder] Error closing port:", err.message);
          else console.log("[IP Finder] Serial port closed.");
          port = null;
          parser = null;
          // Script can potentially exit here if desired, or just stop listening
        });
      }
    }
  });

  port.on("error", (err) => {
    console.error("[IP Finder] SerialPort Error:", err.message);
    port = null;
    parser = null;
    if (detectionAttempts < MAX_DETECTION_ATTEMPTS) {
      console.log(
        "[IP Finder] Retrying detection in 5 seconds due to error..."
      );
      setTimeout(startIpDetection, 5000);
    } else {
      console.error(
        "[IP Finder] Max detection attempts reached after error. Exiting."
      );
      fs.writeFileSync(IP_FILE_PATH, `ERROR: ${err.message}`); // Signal error
    }
  });

  port.on("close", () => {
    console.log("[IP Finder] Serial port closed.");
    // If closed unexpectedly before writing IP, maybe retry?
    if (
      !fs.existsSync(IP_FILE_PATH) &&
      detectionAttempts < MAX_DETECTION_ATTEMPTS
    ) {
      console.log(
        "[IP Finder] Port closed unexpectedly, retrying detection..."
      );
      port = null; // Ensure port is nullified
      parser = null;
      setTimeout(startIpDetection, 2000); // Short delay before retry
    } else {
      port = null;
      parser = null;
    }
  });
}

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n[IP Finder] SIGINT received, closing port and cleaning up...");
  cleanupIpFile();
  if (port && port.isOpen) {
    port.close(() => {
      console.log("[IP Finder] Port closed on exit.");
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});

// Start the process
startIpDetection();
