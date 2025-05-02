"use client";

// All the imports from the original page.tsx
import { useState, useEffect, useRef, useCallback } from "react";
import {
  Trash2,
  Power,
  PowerOff,
  Edit,
  Download,
  Save,
  List,
  Pencil,
  ChevronDown,
  Check,
} from "lucide-react";
import { AddNewCard } from "../components/dashboard/AddNewCard";
import { ConfigModal } from "../components/dashboard/ConfigModal";
import { ControlPanel } from "../components/dashboard/ControlPanel";
import {
  ComponentGroup,
  ConnectionStatus,
  ConfiguredComponent,
  HardwareConfig,
  NewComponentFormState,
} from "../components/dashboard/types";
import { motion, AnimatePresence } from "framer-motion";

// Add necessary imports from shadcn/ui and lucide-react
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Type for storing component states received from ESP32
interface ComponentStates {
  [componentId: string]: number | boolean | string | undefined;
}

// Type for the list of available configs fetched from API
interface AvailableConfig {
  _id: string;
  name: string;
}

// Type for the full config data fetched from API
interface FullConfigData extends AvailableConfig {
  hardware: HardwareConfig;
  createdAt?: Date; // Optional fields
  updatedAt?: Date;
}

// Define application stages
type AppStage =
  | "configSelection"
  | "connecting"
  | "dashboard"
  | "loadingConfig";

// Initial state for the new component form, typed correctly
const initialNewComponentState: NewComponentFormState = {
  name: "",
  type: "",
  pin: "",
  pulPin: "",
  dirPin: "",
  enaPin: "",
  pins: "",
  pullMode: null,
};

// Initial empty hardware config
const initialHardwareConfig: HardwareConfig = {
  servos: [],
  steppers: [],
  sensors: [],
  relays: [],
  pins: [],
};

// Renamed the component to DashboardClient
export default function DashboardClient() {
  // Remove useSearchParams
  // const searchParams = useSearchParams();

  // All the state, refs, handlers, and JSX from the original Dashboard component go here
  const [appStage, setAppStage] = useState<AppStage>("loadingConfig"); // Start at loading config list
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [infoMessage, setInfoMessage] = useState(""); // For success/info messages
  const [activeGroup, setActiveGroup] = useState<ComponentGroup>("servos");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isFetchingIp, setIsFetchingIp] = useState(false); // State for IP fetching

  // Hardware configuration state
  const [hardwareConfig, setHardwareConfig] = useState<HardwareConfig>(
    initialHardwareConfig
  );

  // State to hold real-time component states from ESP32
  const [componentStates, setComponentStates] = useState<ComponentStates>({});

  // Component configuration modal state
  const [configMode, setConfigMode] = useState(false);
  const [configModalMode, setConfigModalMode] = useState<"add" | "edit">("add");
  const [editingComponent, setEditingComponent] =
    useState<ConfiguredComponent | null>(null);

  // New component form state - use the correctly typed initial state
  const [newComponent, setNewComponent] = useState<NewComponentFormState>(
    initialNewComponentState
  );

  // State for the currently selected component for the detail panel
  const [selectedComponent, setSelectedComponent] =
    useState<ConfiguredComponent | null>(null);
  const [isControlPanelOpen, setIsControlPanelOpen] = useState(false);

  // State for WebSocket instance using useRef to avoid re-renders on change
  const ws = useRef<WebSocket | null>(null);

  // --- Configuration State ---
  const [availableConfigs, setAvailableConfigs] = useState<AvailableConfig[]>(
    []
  );
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);
  const [selectedConfigName, setSelectedConfigName] = useState<string>(""); // Store name for display
  const [newConfigName, setNewConfigName] = useState("");
  const [isProcessingConfig, setIsProcessingConfig] = useState(false); // Loading/saving/deleting state

  // State for Rename Dialog
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [renamingConfigId, setRenamingConfigId] = useState<string | null>(null);
  const [renamingConfigCurrentName, setRenamingConfigCurrentName] =
    useState("");
  const [configNewName, setConfigNewName] = useState("");

  // State for Delete Dialog
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deletingConfigId, setDeletingConfigId] = useState<string | null>(null);
  const [deletingConfigName, setDeletingConfigName] = useState("");

  // --- Connection State ---
  const [lastIpOctet, setLastIpOctet] = useState(""); // <-- Add this back

  // --- Fetch Available Configurations On Mount ---
  useEffect(() => {
    const fetchConfigs = async () => {
      console.log("Fetching available configurations...");
      setAppStage("loadingConfig");
      setErrorMessage("");
      setInfoMessage("");
      try {
        const response = await fetch("/api/configs");
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(
            errorData.message || `HTTP error! status: ${response.status}`
          );
        }
        const data: AvailableConfig[] = await response.json();
        setAvailableConfigs(data);
        console.log("Fetched configurations:", data);
        setAppStage("configSelection"); // Move to selection stage
      } catch (error) {
        console.error("Failed to fetch configurations:", error);
        setErrorMessage(
          `Failed to load configurations: ${
            (error as Error).message
          }. Please ensure the backend and database are running.`
        );
        setAppStage("configSelection"); // Still go to selection, but show error
      }
    };

    fetchConfigs();
    // Run only once on mount
  }, []);

  // --- Send Message Function --- (Moved Before Sync)
  const sendMessage = useCallback((message: object) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      try {
        const jsonMessage = JSON.stringify(message);
        console.log("Sending WebSocket message:", jsonMessage);
        ws.current.send(jsonMessage);
      } catch (error) {
        console.error("Failed to stringify or send WebSocket message:", error);
      }
    } else {
      console.warn("WebSocket not open. Cannot send message:", message);
    }
  }, []); // No dependency on syncConfig

  // --- Configuration Handlers ---
  const handleLoadConfig = async () => {
    if (!selectedConfigId) {
      setErrorMessage("Please select a configuration to load.");
      return;
    }
    console.log(`Loading configuration: ${selectedConfigId}`);
    setIsProcessingConfig(true);
    setErrorMessage("");
    setInfoMessage("");
    try {
      const response = await fetch(`/api/configs/${selectedConfigId}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.message || `HTTP error! status: ${response.status}`
        );
      }
      const configData: FullConfigData = await response.json();
      console.log("Loaded configuration data:", configData);
      setHardwareConfig(configData.hardware || initialHardwareConfig);
      setSelectedConfigName(configData.name);

      // Sync with controller if already connected
      if (
        connectionStatus === "connected" &&
        ws.current?.readyState === WebSocket.OPEN
      ) {
        syncConfigWithESP32();
      }

      setAppStage("connecting");
      setLastIpOctet("");
      setConnectionStatus("idle");
    } catch (error) {
      console.error("Failed to load configuration:", error);
      setErrorMessage(
        `Failed to load configuration: ${(error as Error).message}`
      );
    } finally {
      setIsProcessingConfig(false);
    }
  };

  const handleCreateConfig = async () => {
    const trimmedName = newConfigName.trim();
    if (!trimmedName) {
      setErrorMessage("Please enter a name for the new configuration.");
      return;
    }
    console.log(`Creating new configuration: ${trimmedName}`);
    setIsProcessingConfig(true);
    setErrorMessage("");
    setInfoMessage("");
    try {
      const response = await fetch("/api/configs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.message || `HTTP error! status: ${response.status}`
        );
      }
      const newConfig: FullConfigData = await response.json();
      console.log("Created new configuration:", newConfig);
      setAvailableConfigs((prev) =>
        [...prev, { _id: newConfig._id, name: newConfig.name }].sort((a, b) =>
          a.name.localeCompare(b.name)
        )
      );
      setSelectedConfigId(newConfig._id);
      setSelectedConfigName(newConfig.name);
      setHardwareConfig(initialHardwareConfig); // Start with empty config
      setNewConfigName(""); // Clear input
      setAppStage("connecting"); // Proceed to connection stage
      setLastIpOctet(""); // Reset IP octet
      setConnectionStatus("idle"); // Reset connection status
    } catch (error) {
      console.error("Failed to create configuration:", error);
      setErrorMessage(
        `Failed to create configuration: ${(error as Error).message}`
      );
    } finally {
      setIsProcessingConfig(false);
    }
  };

  const handleSaveConfig = async () => {
    if (!selectedConfigId) {
      setErrorMessage("Cannot save: No configuration selected.");
      return;
    }
    console.log(`Saving configuration: ${selectedConfigId}`);
    setIsProcessingConfig(true);
    setErrorMessage("");
    setInfoMessage("");
    try {
      const response = await fetch(`/api/configs/${selectedConfigId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hardware: hardwareConfig }), // Send current hardware state
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.message || `HTTP error! status: ${response.status}`
        );
      }
      const updatedConfig = await response.json(); // Get updated config back (optional)
      console.log("Configuration saved successfully:", updatedConfig);
      setInfoMessage(
        `Configuration '${selectedConfigName}' saved successfully!`
      );
      // Optionally update local timestamp if needed
      setTimeout(() => setInfoMessage(""), 3000); // Clear message
    } catch (error) {
      console.error("Failed to save configuration:", error);
      setErrorMessage(
        `Failed to save configuration: ${(error as Error).message}`
      );
    } finally {
      setIsProcessingConfig(false);
    }
  };

  // --- Handler for Deleting a Configuration (now takes ID) ---
  const handleDeleteConfig = async (
    idToDelete: string,
    nameToDelete: string
  ) => {
    if (!idToDelete) {
      setErrorMessage("Error: No config selected for deletion.");
      return;
    }
    // Confirmation is handled by the AlertDialog, so we can proceed

    console.log(`Deleting configuration: ${idToDelete} ('${nameToDelete}')`);
    setIsProcessingConfig(true);
    setErrorMessage("");
    setInfoMessage("");
    try {
      const response = await fetch(`/api/configs/${idToDelete}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.message || `HTTP error! status: ${response.status}`
        );
      }
      console.log("Configuration deleted successfully.");
      setAvailableConfigs((prev) =>
        prev.filter((config) => config._id !== selectedConfigId)
      );
      setSelectedConfigId(null); // Reset selection
      setSelectedConfigName("");
      setHardwareConfig(initialHardwareConfig); // Reset hardware config
      setInfoMessage("Configuration deleted.");
      // Stay on configSelection stage
    } catch (error) {
      console.error("Failed to delete configuration:", error);
      setErrorMessage(
        `Failed to delete configuration: ${(error as Error).message}`
      );
    } finally {
      setIsProcessingConfig(false);
    }
  };

  // --- ESP32 Synchronization ---
  const syncConfigWithESP32 = useCallback(() => {
    // Check WebSocket readiness directly before sending
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
      console.warn("Cannot sync config: WebSocket not open.");
      return;
    }

    console.log("Syncing loaded configuration with ESP32...");

    const allComponents: ConfiguredComponent[] =
      Object.values(hardwareConfig).flat();

    if (allComponents.length === 0) {
      console.log("No components in the current configuration to sync.");
      return;
    }

    allComponents.forEach((component) => {
      let componentGroup: keyof HardwareConfig | "io" | null = null;
      let configPayload: any = { id: component.id, name: component.name };

      if (hardwareConfig.servos.some((c) => c.id === component.id)) {
        componentGroup = "servos";
        configPayload.pin = component.pins[0];
        // Add limits if they exist
        if (component.minAngle !== undefined)
          configPayload.minAngle = component.minAngle;
        if (component.maxAngle !== undefined)
          configPayload.maxAngle = component.maxAngle;
      } else if (hardwareConfig.steppers.some((c) => c.id === component.id)) {
        componentGroup = "steppers";
        configPayload.pulPin = component.pins[0];
        configPayload.dirPin = component.pins[1];
        if (component.pins.length > 2) configPayload.enaPin = component.pins[2];
      } else if (hardwareConfig.sensors.some((c) => c.id === component.id)) {
        componentGroup = "sensors";
        configPayload.type = component.type;
        configPayload.pins = component.pins;
      } else if (hardwareConfig.relays.some((c) => c.id === component.id)) {
        componentGroup = "relays";
        configPayload.pin = component.pins[0];
        configPayload.type = component.type;
      } else if (hardwareConfig.pins.some((c) => c.id === component.id)) {
        componentGroup = "pins";
        configPayload.pin = component.pins[0];
        configPayload.type = component.type;
      }

      if (componentGroup) {
        console.log(
          `Sync: Sending configure message for ${componentGroup}: ${component.name} (ID: ${component.id})`
        );
        sendMessage({
          action: "configure",
          componentGroup: componentGroup,
          config: configPayload,
        });
      } else {
        console.warn(
          `Sync: Could not determine group for component ID: ${component.id}`
        );
      }
    });
    console.log("Finished sending initial configuration sync to ESP32.");
  }, [hardwareConfig, sendMessage]);

  // --- WebSocket Message Handling ---
  const handleWebSocketMessage = useCallback(
    (event: MessageEvent) => {
      console.log("WebSocket message received:", event.data);
      try {
        // First, check if it's likely JSON before parsing
        if (
          event.data &&
          typeof event.data === "string" &&
          event.data.startsWith("{")
        ) {
          const message = JSON.parse(event.data);

          // Process message based on its type/content
          if (
            message.type === "pinUpdate" &&
            message.id &&
            message.state !== undefined
          ) {
            console.log(
              `Updating state for pin ${message.id}: ${message.state}`
            );
            setComponentStates((prevStates) => ({
              ...prevStates,
              [message.id]: message.state,
            }));
          } else if (
            message.type === "relayUpdate" &&
            message.id &&
            message.state !== undefined
          ) {
            console.log(
              `Updating state for relay ${message.id}: ${message.state}`
            );
            setComponentStates((prevStates) => ({
              ...prevStates,
              [message.id]: message.state,
            }));
          } else if (
            message.type === "sensorUpdate" &&
            message.id &&
            message.value !== undefined
          ) {
            console.log(
              `Updating value for sensor ${message.id}: ${message.value}`
            );
            setComponentStates((prevStates) => ({
              ...prevStates,
              [message.id]: message.value,
            }));
          } else if (
            message.type === "stepperUpdate" &&
            message.id &&
            message.position !== undefined
          ) {
            console.log(
              `Updating position for stepper ${message.id}: ${message.position}`
            );
            setComponentStates((prevStates) => ({
              ...prevStates,
              [message.id]: message.position,
            }));
          } else {
            console.log("Received unhandled JSON message type:", message.type);
          }
        } else if (typeof event.data === "string") {
          // Handle non-JSON string messages (like OK: or ERROR:)
          console.log("Received text message from ESP32:", event.data);
          if (event.data.startsWith("ERROR:")) {
            // Optionally display these errors more prominently
            setErrorMessage(event.data);
            setTimeout(() => setErrorMessage(""), 5000); // Clear after 5s
          } else if (event.data.startsWith("OK:")) {
            // Optionally show temporary info messages
            // setInfoMessage(event.data);
            // setTimeout(() => setInfoMessage(""), 1500);
          }
        }
      } catch (error) {
        console.error(
          "Failed to process WebSocket message:",
          event.data,
          error
        );
      }
    },
    [setComponentStates, setErrorMessage] // Added setErrorMessage dependency
  );

  // --- WebSocket Connection Logic --- // <-- Fix dependency array here too
  const handleConnect = useCallback(
    (lastOctet: string) => {
      if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        console.log("WebSocket already open.");
        setAppStage("dashboard"); // Already connected, go to dashboard
        return;
      }
      if (ws.current) {
        ws.current.close();
      }
      setConnectionStatus("connecting");
      setErrorMessage("");
      setInfoMessage("Connecting to device...");
      const octetNum = parseInt(lastOctet, 10);
      if (isNaN(octetNum) || octetNum < 0 || octetNum > 255) {
        setConnectionStatus("error");
        setErrorMessage("Invalid IP address ending (must be 0-255)");
        setInfoMessage("");
        return;
      }
      const fullIp = `192.168.1.${lastOctet}`;
      const wsUrl = `ws://${fullIp}/ws`;
      console.log(`Attempting to connect to WebSocket: ${wsUrl}`);
      try {
        ws.current = new WebSocket(wsUrl);
        ws.current.onopen = () => {
          console.log("WebSocket connection established");
          setConnectionStatus("connected");
          setErrorMessage("");
          setInfoMessage("Connected! Syncing configuration...");
          setIsFetchingIp(false); // IP fetch successful
          // *** Sync config AFTER connection is established ***
          syncConfigWithESP32();
          setAppStage("dashboard"); // Move to dashboard stage
          setTimeout(() => setInfoMessage(""), 2000); // Clear sync message
        };
        ws.current.onmessage = handleWebSocketMessage;
        ws.current.onerror = (event) => {
          console.error("WebSocket error:", event);
          setConnectionStatus("error");
          setErrorMessage("Connection error. Check IP and ESP32 status.");
          setInfoMessage("");
          ws.current = null;
          // Don't change appStage here, let user retry connection
        };
      } catch (error) {
        console.error("Failed to create WebSocket:", error);
        setConnectionStatus("error");
        setErrorMessage("Failed to initiate connection.");
        setInfoMessage("");
        ws.current = null;
        setIsFetchingIp(true); // Reset fetching state
      }
    },
    [
      // Add all necessary dependencies
      setAppStage,
      setConnectionStatus,
      setErrorMessage,
      setInfoMessage,
      setIsFetchingIp,
      syncConfigWithESP32,
      handleWebSocketMessage,
    ]
  );

  // --- Effects ---

  // Effect to connect to SSE endpoint for IP detection (Keep as is, but trigger based on appStage)
  useEffect(() => {
    let eventSource: EventSource | null = null;

    // Only run this effect if we are in the 'connecting' stage
    if (
      appStage === "connecting" &&
      connectionStatus === "idle" &&
      !lastIpOctet
    ) {
      console.log("Setting up EventSource for IP detection...");
      setIsFetchingIp(true);
      eventSource = new EventSource("/api/ip");

      const handleIpDetected = (event: MessageEvent) => {
        console.log("SSE: IP Detected Event Received");
        const ipData = event.data;
        console.log("SSE: Received IP data:", ipData);
        eventSource?.removeEventListener("ip_detected", handleIpDetected); // Remove listener
        eventSource?.close(); // Close SSE connection
        console.log("SSE: Connection closed after IP detection.");

        if (ipData) {
          const prefix = "192.168.1.";
          if (ipData.startsWith(prefix)) {
            const octet = ipData.substring(prefix.length);
            const octetNum = parseInt(octet, 10);
            if (!isNaN(octetNum) && octetNum >= 0 && octetNum <= 255) {
              console.log(
                `SSE: Extracted last octet: ${octet}. Attempting connection.`
              );
              setLastIpOctet(octet);
              handleConnect(octet); // Connect automatically
            } else {
              console.error("SSE: Invalid IP format received:", ipData);
              setErrorMessage("Received invalid IP format from device.");
              setIsFetchingIp(false);
              // Don't set connectionStatus to error here, let user retry manual
            }
          } else {
            console.error(
              "SSE: IP received doesn't start with 192.168.1.:",
              ipData
            );
            setErrorMessage("Received unexpected IP format from device.");
            setIsFetchingIp(false);
          }
        } else {
          console.warn("SSE: Received ip_detected event with no data.");
          setIsFetchingIp(false); // Stop fetching if data is empty
          setErrorMessage(
            "IP detection failed (empty data). Try manual connection."
          );
        }
      };

      const handleSseError = (error: Event) => {
        console.error("EventSource failed:", error);
        setErrorMessage(
          "Error connecting to IP detection service. Try manual connection."
        );
        setIsFetchingIp(false);
        // Don't set connectionStatus to error here
        eventSource?.close();
      };

      eventSource.addEventListener("ip_detected", handleIpDetected);
      eventSource.onerror = handleSseError;
    }

    // Cleanup function
    return () => {
      if (eventSource) {
        console.log("Cleaning up EventSource.");
        // Type assertion to satisfy TS about removeEventListener method
        const es = eventSource as any;
        if (es.listeners && es.listeners("ip_detected")) {
          es.removeEventListener("ip_detected", es.listeners("ip_detected")[0]);
        }
        if (es.onerror) {
          es.onerror = null; // Remove error handler
        }
        eventSource.close();
        setIsFetchingIp(false); // Ensure fetching state is reset
      }
    };
    // Trigger when appStage becomes 'connecting' or connectionStatus resets
  }, [appStage, connectionStatus, handleConnect, lastIpOctet]);

  // Cleanup WebSocket on component unmount
  useEffect(() => {
    return () => {
      if (ws.current) {
        console.log("Closing WebSocket connection on unmount");
        setConnectionStatus("idle");
        ws.current.close();
        ws.current = null;
      }
    };
  }, []);

  // --- Component Configuration Submit Logic ---
  const handleConfigSubmit = () => {
    const groupKey = activeGroup === "io" ? "pins" : activeGroup;
    const group = groupKey as keyof HardwareConfig;
    let pinsToConfigure: number[] = [];
    let typeToConfigure = newComponent.type;
    let isValid = false;
    let configPayload: any = { name: newComponent.name };
    if (!newComponent.name) return;
    switch (group) {
      case "servos":
        const servoPin = parseInt(newComponent.pin.trim());
        if (!isNaN(servoPin)) {
          pinsToConfigure = [servoPin];
          typeToConfigure = "Servo";
          configPayload.pin = servoPin;
          // Add default limits for new servos
          configPayload.minAngle = 0;
          configPayload.maxAngle = 180;
          isValid = true;
        }
        break;
      case "steppers":
        const pulPin = parseInt(newComponent.pulPin.trim());
        const dirPin = parseInt(newComponent.dirPin.trim());
        const enaPin = parseInt(newComponent.enaPin.trim());
        if (!isNaN(pulPin) && !isNaN(dirPin)) {
          pinsToConfigure = isNaN(enaPin)
            ? [pulPin, dirPin]
            : [pulPin, dirPin, enaPin];
          typeToConfigure = "Stepper";
          configPayload.pulPin = pulPin;
          configPayload.dirPin = dirPin;
          if (!isNaN(enaPin)) configPayload.enaPin = enaPin;
          isValid = true;
        }
        break;
      case "sensors":
      case "relays":
        if (!newComponent.type) return;
        pinsToConfigure = newComponent.pins
          .split(",")
          .map((p) => parseInt(p.trim()))
          .filter((p) => !isNaN(p));
        if (pinsToConfigure.length > 0) {
          configPayload.type = newComponent.type;
          configPayload.pins = pinsToConfigure;
          isValid = true;
          typeToConfigure = newComponent.type;
        }
        break;
      case "pins":
        const ioPin = parseInt(newComponent.pin.trim());
        if (!isNaN(ioPin) && newComponent.type) {
          pinsToConfigure = [ioPin];
          configPayload.pin = ioPin;
          configPayload.type = newComponent.type;
          isValid = true;
          typeToConfigure = newComponent.type;
        }
        break;
    }
    if (!isValid) {
      console.error("Invalid input for component configuration");
      return;
    }
    const componentData: ConfiguredComponent = {
      id: editingComponent ? editingComponent.id : `${group}-${Date.now()}`,
      name: newComponent.name,
      type: typeToConfigure,
      pins: pinsToConfigure,
      // Add limits to the component data for servos
      ...(group === "servos" && {
        minAngle: configPayload.minAngle,
        maxAngle: configPayload.maxAngle,
      }),
    };
    // Update local hardware config state
    setHardwareConfig((prev) => ({
      ...prev,
      [group]:
        configModalMode === "edit" && editingComponent
          ? prev[group].map((comp) =>
              comp.id === editingComponent.id ? componentData : comp
            )
          : [...prev[group], componentData],
    }));

    // ALSO send to ESP32 immediately if connected
    sendMessage({
      action: "configure",
      componentGroup: group,
      config: { ...configPayload, id: componentData.id },
    });

    // Close modal and reset form
    setConfigMode(false);
    setNewComponent(initialNewComponentState);
    setEditingComponent(null);
    setConfigModalMode("add");

    // TODO: Trigger a save or indicate unsaved changes
    setInfoMessage(
      "Component change applied. Remember to save the configuration."
    );
    setTimeout(() => setInfoMessage(""), 3000); // Clear info message after 3s
  };

  // --- Handle Opening Modal for Editing ---
  const handleEditClick = (component: ConfiguredComponent) => {
    const groupKey = activeGroup === "io" ? "pins" : activeGroup;
    setEditingComponent(component);
    setConfigModalMode("edit");
    let formState: Partial<NewComponentFormState> = { name: component.name };
    switch (groupKey) {
      case "servos":
        formState.pin = component.pins[0]?.toString() || "";
        break;
      case "steppers":
        formState.pulPin = component.pins[0]?.toString() || "";
        formState.dirPin = component.pins[1]?.toString() || "";
        formState.enaPin = component.pins[2]?.toString() || "";
        break;
      case "sensors":
      case "relays":
        formState.type = component.type;
        formState.pins = component.pins.join(", ");
        break;
      case "pins":
        formState.pin = component.pins[0]?.toString() || "";
        formState.type = component.type;
        formState.pullMode = null;
        break;
    }
    setNewComponent({ ...initialNewComponentState, ...formState });
    setConfigMode(true);
  };

  // --- Handle Closing Modal ---
  const handleCloseConfigModal = () => {
    setConfigMode(false);
    setNewComponent(initialNewComponentState);
    setEditingComponent(null);
    setConfigModalMode("add");
  };

  // --- Remove Component Logic ---
  const removeComponent = (group: keyof HardwareConfig, id: string) => {
    console.log(`Requesting removal of ${group} with id ${id}`);
    // Send remove message to ESP32 first
    sendMessage({ action: "remove", componentGroup: group, id: id });

    // Update local hardware config state
    setHardwareConfig((prev) => ({
      ...prev,
      [group]: prev[group].filter((comp) => comp.id !== id),
    }));

    // Update local component states
    setComponentStates((prev) => {
      const newStates = { ...prev };
      delete newStates[id];
      return newStates;
    });

    // Close control panel if the deleted component was selected
    if (selectedComponent?.id === id) {
      closeControlPanel();
    }

    // TODO: Trigger a save or indicate unsaved changes
    setInfoMessage("Component removed. Remember to save the configuration.");
    setTimeout(() => setInfoMessage(""), 3000); // Clear info message after 3s
  };

  // --- Control Panel Logic ---
  const openControlPanel = (component: ConfiguredComponent) => {
    setSelectedComponent(component);
    setIsControlPanelOpen(true);
    console.log("Opening control panel for:", component.name);
  };

  const closeControlPanel = () => {
    setIsControlPanelOpen(false);
    setSelectedComponent(null);
  };

  // --- Callback to update servo limits in local state ---
  const handleServoLimitUpdate = useCallback(
    (id: string, minAngle: number, maxAngle: number) => {
      setHardwareConfig((prev) => {
        const newServos = prev.servos.map((servo) => {
          if (servo.id === id) {
            return { ...servo, minAngle, maxAngle };
          }
          return servo;
        });
        return { ...prev, servos: newServos };
      });
      // Indicate unsaved changes - maybe a visual cue?
      // Note: We don't send this update live to ESP32 currently,
      // limits are sent during configure/sync.
      console.log(
        `Updated limits for servo ${id} locally: ${minAngle}-${maxAngle}`
      );
      setInfoMessage(
        "Servo limits updated locally. Save configuration to persist."
      );
      setTimeout(() => setInfoMessage(""), 3000);
    },
    [] // No dependencies needed as it only uses setters and IDs/values
  );

  // --- Callback to update stepper parameters in local state ---
  const handleStepperParamUpdate = useCallback(
    (id: string, maxSpeed: number, acceleration: number) => {
      setHardwareConfig((prev) => {
        const newSteppers = prev.steppers.map((stepper) => {
          if (stepper.id === id) {
            return { ...stepper, maxSpeed, acceleration };
          }
          return stepper;
        });
        return { ...prev, steppers: newSteppers };
      });
      console.log(
        `Updated parameters for stepper ${id} locally: speed=${maxSpeed}, accel=${acceleration}`
      );
      setInfoMessage(
        "Stepper parameters updated locally. Save configuration to persist."
      );
      setTimeout(() => setInfoMessage(""), 3000);
    },
    [] // No dependencies needed as it only uses setters and IDs/values
  );

  // --- Define constants/components used in Dashboard stage ---
  const addNewCardLabel =
    activeGroup === "servos"
      ? "Servo"
      : activeGroup === "steppers"
      ? "Stepper Motor"
      : activeGroup === "sensors"
      ? "Sensor"
      : activeGroup === "relays"
      ? "Relay"
      : "I/O Pin";

  const CardActionButton = ({
    icon: Icon,
    label,
    onClick,
    className = "",
  }: {
    icon: React.ElementType;
    label: string;
    onClick: (e: React.MouseEvent) => void;
    className?: string;
  }) => (
    <motion.button
      whileHover={{ scale: 1.1, backgroundColor: "rgba(255, 255, 255, 0.1)" }}
      whileTap={{ scale: 0.9 }}
      transition={{ type: "spring", stiffness: 400, damping: 17 }}
      onClick={onClick}
      className={`p-2 rounded text-gray-400 hover:text-white transition-colors ${className}`}
      aria-label={label}
    >
      <Icon size={16} />
    </motion.button>
  );

  const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { type: "spring", stiffness: 100 },
    },
    exit: { opacity: 0, y: -10, transition: { duration: 0.15 } },
  };

  const gridContainerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05,
        delayChildren: 0.1,
      },
    },
  };

  // --- Handler for Renaming a Configuration ---
  const handleRenameConfig = async () => {
    const trimmedNewName = configNewName.trim();
    if (
      !renamingConfigId ||
      !trimmedNewName ||
      trimmedNewName === renamingConfigCurrentName
    ) {
      setErrorMessage(
        !renamingConfigId
          ? "Error: No config selected for rename."
          : !trimmedNewName
          ? "Please enter a valid new name."
          : "New name is the same as the current name."
      );
      // Keep dialog open for correction if name is invalid/same
      if (!renamingConfigId) setIsRenameDialogOpen(false); // Close if ID somehow missing
      return;
    }

    console.log(
      `Renaming config ${renamingConfigId} from '${renamingConfigCurrentName}' to '${trimmedNewName}'`
    );
    setIsProcessingConfig(true);
    setErrorMessage(""); // Clear error message from previous attempt in dialog
    setInfoMessage("");

    try {
      const response = await fetch(`/api/configs/${renamingConfigId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedNewName }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.message || `HTTP error! status: ${response.status}`
        );
      }

      setAvailableConfigs((prev) =>
        prev
          .map((config) =>
            config._id === renamingConfigId
              ? { ...config, name: trimmedNewName }
              : config
          )
          .sort((a, b) => a.name.localeCompare(b.name))
      );

      if (selectedConfigId === renamingConfigId) {
        setSelectedConfigName(trimmedNewName);
      }

      setInfoMessage(`Configuration renamed to '${trimmedNewName}'.`);
      setTimeout(() => setInfoMessage(""), 3000);
      setIsRenameDialogOpen(false); // Close dialog on success
    } catch (error) {
      console.error("Failed to rename configuration:", error);
      setErrorMessage(
        // Set error message to display in dialog
        `Failed to rename: ${(error as Error).message}`
      );
      // Keep dialog open on error
      // setIsRenameDialogOpen(false);
    } finally {
      setIsProcessingConfig(false);
      // Reset state only if dialog is closed (on success or manual cancel)
      if (!isRenameDialogOpen) {
        setRenamingConfigId(null);
        setRenamingConfigCurrentName("");
        setConfigNewName("");
        setErrorMessage(""); // Clear error message when dialog fully closes
      }
    }
  };

  // --- Main Return Logic with Conditional Rendering ---
  return (
    <>
      {appStage === "loadingConfig" && (
        <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
          <div className="flex flex-col items-center space-y-3">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400"></div>
            <p className="text-lg">Loading configurations...</p>
          </div>
        </div>
      )}

      {appStage === "configSelection" && (
        <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="max-w-lg w-full mx-auto bg-gray-800 rounded-lg shadow-xl p-6 md:p-8"
          >
            <h1 className="text-3xl font-bold text-white mb-6 text-center">
              Select or Create Configuration
            </h1>

            {/* Display Messages */}
            <AnimatePresence>
              {errorMessage && (
                <motion.div
                  key="error-msg-config"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mb-4 p-3 rounded-md bg-red-900/50 text-red-200 text-sm"
                >
                  {errorMessage}
                </motion.div>
              )}
              {infoMessage && (
                <motion.div
                  key="info-msg-config"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mb-4 p-3 rounded-md bg-blue-900/50 text-blue-200 text-sm"
                >
                  {infoMessage}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Load Existing Configuration - REVISED UI */}
            <div className="mb-6 space-y-3">
              <Label className="block text-sm font-medium text-gray-300">
                Load Configuration
              </Label>
              <div className="flex gap-2 items-center">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      className="flex-grow justify-between bg-gray-700 border-gray-600 hover:bg-gray-600 text-white" // Ensure text color
                      disabled={isProcessingConfig} // Disable trigger during any processing
                    >
                      <span className="truncate pr-2">
                        {selectedConfigName || "-- Select Configuration --"}
                      </span>
                      <ChevronDown className="h-4 w-4 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width] bg-gray-700 border-gray-600 text-white">
                    <DropdownMenuLabel>
                      Available Configurations
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator className="bg-gray-600" />
                    {availableConfigs.length === 0 && (
                      <DropdownMenuItem
                        disabled
                        className="italic text-gray-400"
                      >
                        No configurations found.
                      </DropdownMenuItem>
                    )}
                    {availableConfigs.map((config) => (
                      <DropdownMenuItem
                        key={config._id}
                        className="flex justify-between items-center group hover:bg-gray-600 focus:bg-gray-600 relative pr-8" // Added relative pr-8
                        onSelect={(event) => {
                          const target = event.target as HTMLElement;
                          if (
                            target.closest(
                              'button[aria-label^="Rename"], button[aria-label^="Delete"]'
                            )
                          ) {
                            return;
                          }
                          setSelectedConfigId(config._id);
                          setSelectedConfigName(config.name);
                          console.log(
                            `Selected config: ${config.name} (ID: ${config._id})`
                          );
                        }}
                      >
                        {/* Add Check mark if selected */}
                        {selectedConfigId === config._id && (
                          <Check className="absolute left-2 h-4 w-4 text-blue-400" />
                        )}
                        <span className="truncate flex-grow pl-6">
                          {config.name}
                        </span>{" "}
                        {/* Added pl-6 */}
                        {/* Action Buttons Container */}
                        <div className="flex items-center ml-2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-within:opacity-100 transition-opacity duration-150">
                          {/* Rename Button */}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-gray-400 hover:text-white hover:bg-gray-500/50"
                            onClick={(e) => {
                              e.stopPropagation();
                              setRenamingConfigId(config._id);
                              setRenamingConfigCurrentName(config.name);
                              setConfigNewName(config.name);
                              setErrorMessage("");
                              setIsRenameDialogOpen(true);
                            }}
                            aria-label={`Rename ${config.name}`}
                            disabled={isProcessingConfig}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {/* Delete Button */}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-red-500/80 hover:text-red-400 hover:bg-red-900/30"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletingConfigId(config._id);
                              setDeletingConfigName(config.name);
                              setIsDeleteDialogOpen(true);
                            }}
                            aria-label={`Delete ${config.name}`}
                            disabled={isProcessingConfig}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Explicit Load Button */}
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleLoadConfig}
                  disabled={!selectedConfigId || isProcessingConfig} // Keep this logic
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                >
                  {/* Loading indicator still generic as multiple actions can disable it */}
                  {isProcessingConfig ? "Processing..." : "Load"}
                </motion.button>
              </div>
            </div>

            <hr className="border-gray-600 my-6" />

            {/* Create New Configuration */}
            <div className="space-y-3">
              <label
                htmlFor="new-config-name"
                className="block text-sm font-medium text-gray-300"
              >
                Create New Configuration
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  id="new-config-name"
                  value={newConfigName}
                  onChange={(e) => setNewConfigName(e.target.value)}
                  placeholder="Enter new configuration name"
                  disabled={isProcessingConfig}
                  className="flex-grow rounded-md border border-gray-600 px-3 py-2 text-white bg-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                />
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleCreateConfig}
                  disabled={!newConfigName.trim() || isProcessingConfig}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                >
                  {isProcessingConfig ? "Creating..." : "Create New"}
                </motion.button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {appStage === "connecting" && (
        <>
          {isFetchingIp ? (
            <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5 }}
                className="text-center px-4"
              >
                <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-2">
                  Connecting to Board...
                </h2>
                <p className="text-lg text-gray-600 dark:text-gray-300 mb-4">
                  Attempting automatic IP detection via USB...
                </p>
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
                <AnimatePresence>
                  {errorMessage && (
                    <motion.p
                      key="error-msg-conn"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-4 text-sm text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 p-2 rounded"
                    >
                      {errorMessage}
                    </motion.p>
                  )}
                  {infoMessage && !errorMessage && (
                    <motion.p
                      key="info-msg-conn"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-4 text-sm text-blue-600 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/30 p-2 rounded"
                    >
                      {infoMessage}
                    </motion.p>
                  )}
                </AnimatePresence>
                <button
                  onClick={() => {
                    console.log(
                      "Manual Connection button clicked from fetching screen"
                    );
                    setIsFetchingIp(false);
                    setErrorMessage("");
                  }}
                  className="mt-6 px-4 py-2 text-sm bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Enter IP Manually
                </button>
              </motion.div>
            </div>
          ) : (
            <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="max-w-md w-full mx-auto px-4 py-16 sm:px-6 lg:px-8"
              >
                <div className="text-center mb-12">
                  <motion.h1
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.1 }}
                    className="text-4xl font-bold text-gray-900 dark:text-white mb-4"
                  >
                    Board Connection
                  </motion.h1>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                    Loaded Config:{" "}
                    <span className="font-medium text-gray-700 dark:text-gray-300">
                      {selectedConfigName || "New Configuration"}
                    </span>
                  </p>
                  <motion.p
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.2 }}
                    className="text-lg text-gray-600 dark:text-gray-300"
                  >
                    Enter the last part of the board's IP address
                  </motion.p>
                </div>
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.3 }}
                  className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6"
                >
                  <div className="space-y-6">
                    <div>
                      <label
                        htmlFor="ip-last-octet-manual"
                        className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                      >
                        Board IP Address
                      </label>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500 dark:text-gray-400 font-mono pt-2">
                          192.168.1.
                        </span>
                        <input
                          type="text"
                          id="ip-last-octet-manual"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={3}
                          value={lastIpOctet}
                          onChange={(e) => {
                            const value = e.target.value;
                            if (/^\d{0,3}$/.test(value)) {
                              const num = parseInt(value, 10);
                              if (value === "" || (num >= 0 && num <= 255)) {
                                setLastIpOctet(value);
                                if (connectionStatus === "error")
                                  setErrorMessage("");
                              }
                            }
                          }}
                          onKeyDown={(e) => {
                            if (
                              e.key === "Enter" &&
                              lastIpOctet &&
                              parseInt(lastIpOctet, 10) <= 255
                            ) {
                              handleConnect(lastIpOctet);
                            }
                          }}
                          placeholder="XXX"
                          disabled={connectionStatus === "connecting"}
                          className="flex-1 w-20 rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-70 font-mono text-center"
                        />
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handleConnect(lastIpOctet)}
                          disabled={
                            connectionStatus === "connecting" ||
                            !lastIpOctet ||
                            parseInt(lastIpOctet, 10) > 255
                          }
                          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {connectionStatus === "connecting"
                            ? "Connecting..."
                            : "Connect Manually"}
                        </motion.button>
                      </div>
                    </div>
                    <AnimatePresence>
                      {(connectionStatus === "connecting" ||
                        connectionStatus === "error") && (
                        <motion.div
                          key="connection-status-msg-manual"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.3 }}
                          className={`p-3 rounded-md overflow-hidden text-sm ${
                            connectionStatus === "error"
                              ? "bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-200"
                              : "bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200"
                          }`}
                        >
                          {connectionStatus === "error"
                            ? errorMessage ||
                              "An unknown connection error occurred."
                            : infoMessage || "Attempting to connect..."}
                        </motion.div>
                      )}
                    </AnimatePresence>
                    <button
                      onClick={() => {
                        console.log("Retry automatic detection...");
                        setIsFetchingIp(true);
                        setConnectionStatus("idle");
                        setErrorMessage("");
                        setInfoMessage("");
                        setLastIpOctet("");
                      }}
                      className="w-full mt-2 px-4 py-2 text-sm bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                    >
                      Try Automatic Detection Again
                    </button>
                    <button
                      onClick={() => {
                        setAppStage("configSelection");
                        setSelectedConfigId(null);
                        setSelectedConfigName("");
                        setHardwareConfig(initialHardwareConfig);
                        setConnectionStatus("idle");
                        setErrorMessage("");
                        setInfoMessage("");
                      }}
                      className="w-full mt-2 px-4 py-2 text-sm bg-gray-600 dark:bg-gray-500 text-white rounded hover:bg-gray-700 dark:hover:bg-gray-600 transition-colors"
                    >
                      Back to Configuration Selection
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            </div>
          )}
        </>
      )}

      {appStage === "dashboard" && (
        <div className="h-screen flex flex-col md:flex-row bg-gray-100 dark:bg-gray-900 overflow-hidden">
          {/* Mobile Header */}
          <div className="md:hidden bg-gray-800 text-white p-4 flex justify-between items-center">
            <h2 className="text-xl font-semibold">
              {selectedConfigName || "Board Control"}
            </h2>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-md hover:bg-gray-700"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-6 h-6"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
                />
              </svg>
            </button>
          </div>

          {/* Mobile Navigation Menu */}
          <AnimatePresence>
            {mobileMenuOpen && (
              <motion.div
                key="mobile-nav"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className="md:hidden bg-gray-800 text-white overflow-hidden"
              >
                <nav className="p-4 space-y-2">
                  <button
                    onClick={handleSaveConfig}
                    disabled={isProcessingConfig}
                    className="w-full text-left px-4 py-3 rounded-md transition-colors bg-green-700 hover:bg-green-600 disabled:opacity-50 flex items-center gap-2"
                  >
                    {" "}
                    <Save size={18} />{" "}
                    {isProcessingConfig ? "Saving..." : "Save Configuration"}{" "}
                  </button>
                  <button
                    onClick={() => {
                      setAppStage("configSelection");
                      setSelectedConfigId(null);
                      setSelectedConfigName("");
                      setHardwareConfig(initialHardwareConfig);
                      setConnectionStatus("idle");
                      if (ws.current) ws.current.close();
                      setErrorMessage("");
                      setInfoMessage("");
                      setMobileMenuOpen(false);
                    }}
                    className="w-full text-left px-4 py-3 rounded-md transition-colors bg-gray-600 hover:bg-gray-500 flex items-center gap-2"
                  >
                    {" "}
                    <List size={18} /> Change Configuration{" "}
                  </button>
                  <hr className="border-gray-700 my-2" />
                  <button
                    onClick={() => {
                      setActiveGroup("servos");
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full text-left px-4 py-3 rounded-md transition-colors ${
                      activeGroup === "servos"
                        ? "bg-blue-600"
                        : "hover:bg-gray-700"
                    }`}
                  >
                    {" "}
                    Servos{" "}
                  </button>
                  <button
                    onClick={() => {
                      setActiveGroup("steppers");
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full text-left px-4 py-3 rounded-md transition-colors ${
                      activeGroup === "steppers"
                        ? "bg-blue-600"
                        : "hover:bg-gray-700"
                    }`}
                  >
                    {" "}
                    Steppers{" "}
                  </button>
                  <button
                    onClick={() => {
                      setActiveGroup("sensors");
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full text-left px-4 py-3 rounded-md transition-colors ${
                      activeGroup === "sensors"
                        ? "bg-blue-600"
                        : "hover:bg-gray-700"
                    }`}
                  >
                    {" "}
                    Sensors{" "}
                  </button>
                  <button
                    onClick={() => {
                      setActiveGroup("io");
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full text-left px-4 py-3 rounded-md transition-colors ${
                      activeGroup === "io" ? "bg-blue-600" : "hover:bg-gray-700"
                    }`}
                  >
                    {" "}
                    I/O Pins{" "}
                  </button>
                  <button
                    onClick={() => {
                      setActiveGroup("relays");
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full text-left px-4 py-3 rounded-md transition-colors ${
                      activeGroup === "relays"
                        ? "bg-blue-600"
                        : "hover:bg-gray-700"
                    }`}
                  >
                    {" "}
                    Relays{" "}
                  </button>
                </nav>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Desktop Sidebar */}
          <div className="hidden md:flex w-64 bg-gray-800 text-white flex-col flex-shrink-0">
            <div className="p-4 border-b border-gray-700">
              <h2
                className="text-xl font-semibold truncate"
                title={selectedConfigName}
              >
                {selectedConfigName || "Board Control"}
              </h2>
              <p className="text-sm text-gray-400">
                {" "}
                IP:{" "}
                {lastIpOctet &&
                parseInt(lastIpOctet) >= 0 &&
                parseInt(lastIpOctet) <= 255
                  ? `192.168.1.${lastIpOctet}`
                  : "Connecting..."}{" "}
              </p>
              <span
                className={`mt-1 inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                  connectionStatus === "connected"
                    ? "bg-green-600/80 text-green-100"
                    : connectionStatus === "connecting"
                    ? "bg-yellow-600/80 text-yellow-100"
                    : "bg-red-600/80 text-red-100"
                }`}
              >
                {" "}
                {connectionStatus}{" "}
              </span>
            </div>
            <div className="p-4 border-b border-gray-700 space-y-2">
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={handleSaveConfig}
                disabled={isProcessingConfig}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-md transition-colors bg-green-700 hover:bg-green-600 disabled:opacity-50"
              >
                {" "}
                <Save size={18} />{" "}
                {isProcessingConfig ? "Saving..." : "Save Configuration"}{" "}
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => {
                  setAppStage("configSelection");
                  setSelectedConfigId(null);
                  setSelectedConfigName("");
                  setHardwareConfig(initialHardwareConfig);
                  setConnectionStatus("idle");
                  if (ws.current) ws.current.close();
                  setErrorMessage("");
                  setInfoMessage("");
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-md transition-colors bg-gray-600 hover:bg-gray-500"
              >
                {" "}
                <List size={18} /> Change Configuration{" "}
              </motion.button>
            </div>
            <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setActiveGroup("servos")}
                className={`w-full text-left px-4 py-3 rounded-md transition-colors ${
                  activeGroup === "servos" ? "bg-blue-600" : "hover:bg-gray-700"
                }`}
              >
                {" "}
                Servos{" "}
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setActiveGroup("steppers")}
                className={`w-full text-left px-4 py-3 rounded-md transition-colors ${
                  activeGroup === "steppers"
                    ? "bg-blue-600"
                    : "hover:bg-gray-700"
                }`}
              >
                {" "}
                Steppers{" "}
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setActiveGroup("sensors")}
                className={`w-full text-left px-4 py-3 rounded-md transition-colors ${
                  activeGroup === "sensors"
                    ? "bg-blue-600"
                    : "hover:bg-gray-700"
                }`}
              >
                {" "}
                Sensors{" "}
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setActiveGroup("io")}
                className={`w-full text-left px-4 py-3 rounded-md transition-colors ${
                  activeGroup === "io" ? "bg-blue-600" : "hover:bg-gray-700"
                }`}
              >
                {" "}
                I/O Pins{" "}
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setActiveGroup("relays")}
                className={`w-full text-left px-4 py-3 rounded-md transition-colors ${
                  activeGroup === "relays" ? "bg-blue-600" : "hover:bg-gray-700"
                }`}
              >
                {" "}
                Relays{" "}
              </motion.button>
            </nav>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6 relative">
            <AnimatePresence>
              {infoMessage && (
                <motion.div
                  key="info-msg-main"
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="absolute top-4 right-4 z-50 p-3 rounded-md bg-blue-900/80 backdrop-blur-sm text-blue-100 text-sm shadow-lg"
                >
                  {" "}
                  {infoMessage}{" "}
                </motion.div>
              )}
            </AnimatePresence>
            <div className="flex items-center justify-between mb-6">
              <AnimatePresence mode="wait">
                <motion.h1
                  key={activeGroup}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  transition={{ duration: 0.2 }}
                  className="text-2xl font-bold text-gray-900 dark:text-white"
                >
                  {" "}
                  {activeGroup === "servos" && "Servo Controls"}{" "}
                  {activeGroup === "steppers" && "Stepper Motor Controls"}{" "}
                  {activeGroup === "sensors" && "Sensor Readings"}{" "}
                  {activeGroup === "io" && "I/O Pin Controls"}{" "}
                  {activeGroup === "relays" && "Relay Controls"}{" "}
                </motion.h1>
              </AnimatePresence>
            </div>
            <ConfigModal
              isOpen={configMode}
              onClose={handleCloseConfigModal}
              mode={configModalMode}
              activeGroup={activeGroup}
              newComponent={newComponent}
              setNewComponent={setNewComponent}
              onAddComponent={handleConfigSubmit}
            />
            <ControlPanel
              isOpen={isControlPanelOpen}
              onClose={closeControlPanel}
              component={selectedComponent}
              activeGroup={activeGroup}
              componentState={
                selectedComponent
                  ? componentStates[selectedComponent.id]
                  : undefined
              }
              sendMessage={sendMessage}
              onUpdateLimits={handleServoLimitUpdate}
              onUpdateStepperParams={handleStepperParamUpdate}
            />
            <div className="space-y-6">
              <AnimatePresence mode="wait">
                {" "}
                {activeGroup === "servos" && (
                  <motion.div
                    key="servos-group"
                    variants={gridContainerVariants}
                    initial="hidden"
                    animate="visible"
                    exit="hidden"
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
                  >
                    {" "}
                    {hardwareConfig.servos.map((servo) => (
                      <motion.div
                        key={servo.id}
                        layout
                        variants={cardVariants}
                        className="bg-gray-200 dark:bg-gray-800 rounded-lg shadow-md overflow-hidden flex flex-col group"
                      >
                        {" "}
                        <div
                          className="p-4 flex-grow cursor-pointer hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors"
                          onClick={() => openControlPanel(servo)}
                        >
                          {" "}
                          <h3 className="text-lg font-semibold mb-1 truncate text-gray-900 dark:text-white">
                            {" "}
                            {servo.name}{" "}
                          </h3>{" "}
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            {" "}
                            Type: {servo.type}{" "}
                          </p>{" "}
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            {" "}
                            Pin: {servo.pins[0]}{" "}
                          </p>{" "}
                        </div>{" "}
                        <div className="p-2 bg-gray-100 dark:bg-gray-700/50 border-t border-gray-300 dark:border-gray-700 flex justify-end space-x-1">
                          {" "}
                          <CardActionButton
                            icon={Edit}
                            label="Edit"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditClick(servo);
                            }}
                          />{" "}
                          <CardActionButton
                            icon={Download}
                            label="Download Config"
                            onClick={(e) => {
                              e.stopPropagation();
                              console.log("Download clicked", servo.id);
                            }}
                          />{" "}
                          <CardActionButton
                            icon={Trash2}
                            label="Delete"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeComponent("servos", servo.id);
                            }}
                            className="hover:text-red-500"
                          />{" "}
                        </div>{" "}
                      </motion.div>
                    ))}{" "}
                    <motion.div layout variants={cardVariants}>
                      {" "}
                      <AddNewCard
                        label={addNewCardLabel}
                        onClick={() => {
                          setConfigModalMode("add");
                          setEditingComponent(null);
                          setNewComponent(initialNewComponentState);
                          setConfigMode(true);
                        }}
                      />{" "}
                    </motion.div>{" "}
                  </motion.div>
                )}{" "}
                {activeGroup === "steppers" && (
                  <motion.div
                    key="steppers-group"
                    variants={gridContainerVariants}
                    initial="hidden"
                    animate="visible"
                    exit="hidden"
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
                  >
                    {" "}
                    {hardwareConfig.steppers.map((stepper) => (
                      <motion.div
                        key={stepper.id}
                        layout
                        variants={cardVariants}
                        className="bg-gray-200 dark:bg-gray-800 rounded-lg shadow-md overflow-hidden flex flex-col group"
                      >
                        {" "}
                        <div
                          className="p-4 flex-grow cursor-pointer hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors"
                          onClick={() => openControlPanel(stepper)}
                        >
                          {" "}
                          <h3 className="text-lg font-semibold mb-1 truncate text-gray-900 dark:text-white">
                            {" "}
                            {stepper.name}{" "}
                          </h3>{" "}
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            {" "}
                            Type: {stepper.type}{" "}
                          </p>{" "}
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            {" "}
                            PUL: {stepper.pins[0]}, DIR: {stepper.pins[1]}{" "}
                            {stepper.pins.length > 2
                              ? `, ENA: ${stepper.pins[2]}`
                              : ""}{" "}
                          </p>{" "}
                        </div>{" "}
                        <div className="p-2 bg-gray-100 dark:bg-gray-700/50 border-t border-gray-300 dark:border-gray-700 flex justify-end space-x-1">
                          {" "}
                          <CardActionButton
                            icon={Edit}
                            label="Edit"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditClick(stepper);
                            }}
                          />{" "}
                          <CardActionButton
                            icon={Download}
                            label="Download Config"
                            onClick={(e) => {
                              e.stopPropagation();
                              console.log("Download clicked", stepper.id);
                            }}
                          />{" "}
                          <CardActionButton
                            icon={Trash2}
                            label="Delete"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeComponent("steppers", stepper.id);
                            }}
                            className="hover:text-red-500"
                          />{" "}
                        </div>{" "}
                      </motion.div>
                    ))}{" "}
                    <motion.div layout variants={cardVariants}>
                      {" "}
                      <AddNewCard
                        label={addNewCardLabel}
                        onClick={() => {
                          setConfigModalMode("add");
                          setEditingComponent(null);
                          setNewComponent(initialNewComponentState);
                          setConfigMode(true);
                        }}
                      />{" "}
                    </motion.div>{" "}
                  </motion.div>
                )}{" "}
                {activeGroup === "sensors" && (
                  <motion.div
                    key="sensors-group"
                    variants={gridContainerVariants}
                    initial="hidden"
                    animate="visible"
                    exit="hidden"
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
                  >
                    {" "}
                    {hardwareConfig.sensors.map((sensor) => {
                      const sensorValue = componentStates[sensor.id] ?? "--";
                      const displayValue =
                        typeof sensorValue === "number"
                          ? sensorValue.toFixed(2)
                          : sensorValue;
                      return (
                        <motion.div
                          key={sensor.id}
                          layout
                          variants={cardVariants}
                          className="bg-gray-200 dark:bg-gray-800 rounded-lg shadow-md overflow-hidden flex flex-col group"
                        >
                          {" "}
                          <div
                            className="p-4 flex-grow cursor-pointer hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors"
                            onClick={() => openControlPanel(sensor)}
                          >
                            {" "}
                            <h3 className="text-lg font-semibold mb-1 truncate text-gray-900 dark:text-white">
                              {" "}
                              {sensor.name}{" "}
                            </h3>{" "}
                            <p className="text-xs text-gray-600 dark:text-gray-400">
                              {" "}
                              Type: {sensor.type}{" "}
                            </p>{" "}
                            <p className="text-xs text-gray-600 dark:text-gray-400">
                              {" "}
                              Pins: {sensor.pins.join(", ")}{" "}
                            </p>{" "}
                            <div className="mt-2 text-center">
                              {" "}
                              <p className="text-2xl font-bold text-gray-800 dark:text-gray-200">
                                {" "}
                                {displayValue}{" "}
                              </p>{" "}
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {" "}
                                {sensorValue === "--"
                                  ? "No data"
                                  : "Current Value"}{" "}
                              </p>{" "}
                            </div>{" "}
                          </div>{" "}
                          <div className="p-2 bg-gray-100 dark:bg-gray-700/50 border-t border-gray-300 dark:border-gray-700 flex justify-end space-x-1">
                            {" "}
                            <CardActionButton
                              icon={Edit}
                              label="Edit"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditClick(sensor);
                              }}
                            />{" "}
                            <CardActionButton
                              icon={Download}
                              label="Download Config"
                              onClick={(e) => {
                                e.stopPropagation();
                                console.log("Download clicked", sensor.id);
                              }}
                            />{" "}
                            <CardActionButton
                              icon={Trash2}
                              label="Delete"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeComponent("sensors", sensor.id);
                              }}
                              className="hover:text-red-500"
                            />{" "}
                          </div>{" "}
                        </motion.div>
                      );
                    })}{" "}
                    <motion.div layout variants={cardVariants}>
                      {" "}
                      <AddNewCard
                        label={addNewCardLabel}
                        onClick={() => {
                          setConfigModalMode("add");
                          setEditingComponent(null);
                          setNewComponent(initialNewComponentState);
                          setConfigMode(true);
                        }}
                      />{" "}
                    </motion.div>{" "}
                  </motion.div>
                )}{" "}
                {activeGroup === "io" && (
                  <motion.div
                    key="io-group"
                    variants={gridContainerVariants}
                    initial="hidden"
                    animate="visible"
                    exit="hidden"
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
                  >
                    {" "}
                    {hardwareConfig.pins.map((pin) => {
                      const pinState = componentStates[pin.id];
                      const isOutput = pin.type === "Digital Output";
                      const displayState =
                        pinState === 1 ? "HIGH" : pinState === 0 ? "LOW" : "--";
                      return (
                        <motion.div
                          key={pin.id}
                          layout
                          variants={cardVariants}
                          className="bg-gray-200 dark:bg-gray-800 rounded-lg shadow-md overflow-hidden flex flex-col group"
                        >
                          {" "}
                          <div
                            className="p-4 flex-grow cursor-pointer hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors"
                            onClick={() => openControlPanel(pin)}
                          >
                            {" "}
                            <h3 className="text-lg font-semibold mb-1 truncate text-gray-900 dark:text-white">
                              {" "}
                              {pin.name}{" "}
                            </h3>{" "}
                            <p className="text-xs text-gray-600 dark:text-gray-400">
                              {" "}
                              Type: {pin.type}{" "}
                            </p>{" "}
                            <p className="text-xs text-gray-600 dark:text-gray-400">
                              {" "}
                              Pin: {pin.pins[0]}{" "}
                            </p>{" "}
                            <div className="mt-2 flex items-center justify-between">
                              {" "}
                              <span className="text-sm text-gray-700 dark:text-gray-300">
                                {" "}
                                Mode:{" "}
                                <span className="font-medium">
                                  {" "}
                                  {isOutput ? "OUT" : "IN"}{" "}
                                </span>{" "}
                              </span>{" "}
                              <span
                                className={`text-sm font-medium ${
                                  pinState === 1
                                    ? "text-green-600 dark:text-green-400"
                                    : pinState === 0
                                    ? "text-red-600 dark:text-red-400"
                                    : "text-gray-500"
                                }`}
                              >
                                {" "}
                                State: {displayState}{" "}
                              </span>{" "}
                            </div>{" "}
                          </div>{" "}
                          <div className="p-2 bg-gray-100 dark:bg-gray-700/50 border-t border-gray-300 dark:border-gray-700 flex justify-end space-x-1">
                            {" "}
                            <CardActionButton
                              icon={Edit}
                              label="Edit"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditClick(pin);
                              }}
                            />{" "}
                            <CardActionButton
                              icon={Download}
                              label="Download Config"
                              onClick={(e) => {
                                e.stopPropagation();
                                console.log("Download clicked", pin.id);
                              }}
                            />{" "}
                            <CardActionButton
                              icon={Trash2}
                              label="Delete"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeComponent("pins", pin.id);
                              }}
                              className="hover:text-red-500"
                            />{" "}
                          </div>{" "}
                        </motion.div>
                      );
                    })}{" "}
                    <motion.div layout variants={cardVariants}>
                      {" "}
                      <AddNewCard
                        label={addNewCardLabel}
                        onClick={() => {
                          setConfigModalMode("add");
                          setEditingComponent(null);
                          setNewComponent(initialNewComponentState);
                          setConfigMode(true);
                        }}
                      />{" "}
                    </motion.div>{" "}
                  </motion.div>
                )}{" "}
                {activeGroup === "relays" && (
                  <motion.div
                    key="relays-group"
                    variants={gridContainerVariants}
                    initial="hidden"
                    animate="visible"
                    exit="hidden"
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
                  >
                    {" "}
                    {hardwareConfig.relays.map((relay) => {
                      const isRelayOn = componentStates[relay.id] === true;
                      return (
                        <motion.div
                          key={relay.id}
                          layout
                          variants={cardVariants}
                          className="bg-gray-200 dark:bg-gray-800 rounded-lg shadow-md overflow-hidden flex flex-col group"
                        >
                          {" "}
                          <div
                            className="p-4 flex-grow cursor-pointer hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors"
                            onClick={() => openControlPanel(relay)}
                          >
                            {" "}
                            <h3 className="text-lg font-semibold mb-1 truncate text-gray-900 dark:text-white">
                              {" "}
                              {relay.name}{" "}
                            </h3>{" "}
                            <p className="text-xs text-gray-600 dark:text-gray-400">
                              {" "}
                              Type: {relay.type}{" "}
                            </p>{" "}
                            <p className="text-xs text-gray-600 dark:text-gray-400">
                              {" "}
                              Pin: {relay.pins[0]}{" "}
                            </p>{" "}
                            <div
                              className={`mt-2 font-medium text-sm ${
                                isRelayOn
                                  ? "text-green-600 dark:text-green-400"
                                  : "text-red-600 dark:text-red-400"
                              }`}
                            >
                              {" "}
                              {isRelayOn ? "ON" : "OFF"}{" "}
                            </div>{" "}
                          </div>{" "}
                          <div className="p-2 bg-gray-100 dark:bg-gray-700/50 border-t border-gray-300 dark:border-gray-700 flex justify-end space-x-1">
                            {" "}
                            <CardActionButton
                              icon={isRelayOn ? PowerOff : Power}
                              label={isRelayOn ? "Turn Off" : "Turn On"}
                              onClick={(e) => {
                                e.stopPropagation();
                                sendMessage({
                                  action: "control",
                                  componentGroup: "relays",
                                  id: relay.id,
                                  state: !isRelayOn,
                                });
                                setComponentStates((prev) => ({
                                  ...prev,
                                  [relay.id]: !isRelayOn,
                                }));
                              }}
                              className={
                                isRelayOn
                                  ? "hover:text-red-500"
                                  : "hover:text-green-500"
                              }
                            />{" "}
                            <CardActionButton
                              icon={Edit}
                              label="Edit"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditClick(relay);
                              }}
                            />{" "}
                            <CardActionButton
                              icon={Download}
                              label="Download Config"
                              onClick={(e) => {
                                e.stopPropagation();
                                console.log("Download clicked", relay.id);
                              }}
                            />{" "}
                            <CardActionButton
                              icon={Trash2}
                              label="Delete"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeComponent("relays", relay.id);
                              }}
                              className="hover:text-red-500"
                            />{" "}
                          </div>{" "}
                        </motion.div>
                      );
                    })}{" "}
                    <motion.div layout variants={cardVariants}>
                      {" "}
                      <AddNewCard
                        label={addNewCardLabel}
                        onClick={() => {
                          setConfigModalMode("add");
                          setEditingComponent(null);
                          setNewComponent(initialNewComponentState);
                          setConfigMode(true);
                        }}
                      />{" "}
                    </motion.div>{" "}
                  </motion.div>
                )}{" "}
              </AnimatePresence>
            </div>
          </div>
        </div>
      )}

      {/* Fallback for unexpected stage */}
      {![
        "loadingConfig",
        "configSelection",
        "connecting",
        "dashboard",
      ].includes(appStage) && (
        <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
          Invalid application state.
        </div>
      )}

      {/* Rename Dialog */}
      <Dialog
        open={isRenameDialogOpen}
        onOpenChange={(open) => {
          setIsRenameDialogOpen(open);
          // Reset error when closing dialog manually
          if (!open) {
            setErrorMessage("");
            setRenamingConfigId(null);
            setRenamingConfigCurrentName("");
            setConfigNewName("");
          }
        }}
      >
        <DialogContent className="sm:max-w-[425px] bg-gray-800 border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-white">
              Rename Configuration
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Change the name for '{renamingConfigCurrentName}'.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right text-gray-300">
                New Name
              </Label>
              <Input
                id="name"
                value={configNewName}
                onChange={(e) => setConfigNewName(e.target.value)}
                className="col-span-3 bg-gray-700 border-gray-600 text-white focus-visible:ring-blue-500" // Added focus style
                disabled={isProcessingConfig}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    !isProcessingConfig &&
                    configNewName.trim() &&
                    configNewName.trim() !== renamingConfigCurrentName
                  )
                    handleRenameConfig();
                }} // Allow enter submit
              />
            </div>
            {/* Display error message inside dialog - slight spacing adjustment */}
            {errorMessage && (
              <p className="col-span-4 text-red-400 text-sm px-1 mt-1">
                {errorMessage}
              </p>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button
                variant="outline"
                className="text-gray-300 border-gray-600 hover:bg-gray-700"
              >
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="submit" // Make it type submit
              onClick={handleRenameConfig}
              disabled={
                isProcessingConfig ||
                !configNewName.trim() ||
                configNewName.trim() === renamingConfigCurrentName
              }
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            >
              {isProcessingConfig ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      >
        <AlertDialogContent className="bg-gray-800 border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">
              Are you absolutely sure?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              This action cannot be undone. This will permanently delete the
              <strong className="text-red-400"> '{deletingConfigName}' </strong>
              configuration.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button
                variant="outline"
                className="text-gray-300 border-gray-600 hover:bg-gray-700"
              >
                Cancel
              </Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                variant="destructive" // Use destructive variant
                className="bg-red-700 hover:bg-red-600"
                onClick={(e) => {
                  // e.preventDefault(); // Not needed for AlertDialogAction if not in a form
                  if (deletingConfigId && deletingConfigName) {
                    handleDeleteConfig(deletingConfigId, deletingConfigName);
                  }
                }}
                disabled={isProcessingConfig}
              >
                {isProcessingConfig
                  ? "Deleting..."
                  : "Yes, Delete Configuration"}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
