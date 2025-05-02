import { useState, useEffect, useCallback } from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Power,
  PowerOff,
  StopCircle,
  Play,
  Settings2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { ConfiguredComponent, ComponentGroup } from "./types";

// Import shadcn/ui components
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";

interface ControlPanelProps {
  isOpen: boolean;
  onClose: () => void;
  component: ConfiguredComponent | null;
  activeGroup: ComponentGroup;
  sendMessage: (message: object) => void;
  componentState: number | boolean | string | undefined;
  onUpdateLimits: (id: string, min: number, max: number) => void;
}

export function ControlPanel({
  isOpen,
  onClose,
  component,
  activeGroup,
  sendMessage,
  componentState,
  onUpdateLimits,
}: ControlPanelProps) {
  const backdropVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.2 } },
    exit: { opacity: 0, transition: { duration: 0.2 } },
  };

  const panelVariants = {
    hidden: { y: "100%" },
    visible: {
      y: 0,
      transition: {
        type: "spring",
        stiffness: 350,
        damping: 40,
      },
    },
    exit: { y: "100%", transition: { duration: 0.25 } },
  };

  if (!component) {
    return (
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="control-panel-placeholder"
            className="fixed inset-0 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
          />
        )}
      </AnimatePresence>
    );
  }

  const [outputState, setOutputState] = useState<boolean>(false);

  // State for Servo Controls
  const [servoAngle, setServoAngle] = useState<number>(90);
  const [minAngle, setMinAngle] = useState<number>(0);
  const [maxAngle, setMaxAngle] = useState<number>(180);
  const [isAttached, setIsAttached] = useState<boolean>(true);

  // State for Stepper Controls
  const [stepperSteps, setStepperSteps] = useState<string>("200");
  const [stepperMaxSpeed, setStepperMaxSpeed] = useState<string>("1000");
  const [stepperAcceleration, setStepperAcceleration] = useState<string>("500");
  const [stepperUseAccel, setStepperUseAccel] = useState<boolean>(true);
  const [stepperCurrentPosition, setStepperCurrentPosition] = useState<
    number | null
  >(null);
  const [isMovingContinuously, setIsMovingContinuously] = useState<
    "forward" | "backward" | null
  >(null);

  useEffect(() => {
    // Reset servo state when component changes
    if (component && component.type === "Servo") {
      setServoAngle(90); // Default to center
      setMinAngle(component.minAngle ?? 0); // Use saved or default 0
      setMaxAngle(component.maxAngle ?? 180); // Use saved or default 180
      setIsAttached(true); // Assume attached by default
    } else if (component?.type === "Digital Output") {
      if (typeof componentState === "boolean") {
        setOutputState(componentState);
      } else if (componentState === 1) {
        setOutputState(true);
      } else if (componentState === 0) {
        setOutputState(false);
      } else {
        setOutputState(false);
      }
    } else if (component?.type === "Stepper") {
      setStepperSteps("200");
      setStepperMaxSpeed("1000");
      setStepperAcceleration("500");
      setStepperUseAccel(true);
      setIsMovingContinuously(null);
      if (typeof componentState === "number") {
        setStepperCurrentPosition(componentState);
      } else {
        setStepperCurrentPosition(null);
      }
    }
    if (component?.type === "Stepper" && typeof componentState === "number") {
      setStepperCurrentPosition(componentState);
    }
  }, [component, componentState]);

  const handleAngleChange = (value: number) => {
    const clampedValue = Math.max(minAngle, Math.min(maxAngle, value));
    setServoAngle(clampedValue);
    // Return the value for immediate use
    return clampedValue;
  };

  const sendServoCommand = (command: string | number) => {
    if (!component) return;
    let message: any = {
      action: "control",
      componentGroup: "servos",
      id: component.id,
    };
    if (typeof command === "number") {
      message.angle = command;
      console.log(`Sending servo angle: ${command}`);
    } else {
      message.command = command;
      console.log(`Sending servo command: ${command}`);
    }
    sendMessage(message);
  };

  const handleAttachToggle = (attach: boolean) => {
    setIsAttached(attach);
    sendServoCommand(attach ? "attach" : "detach");
  };

  // Stepper Control Handlers
  const sendStepperCommand = useCallback(
    (commandPayload: object) => {
      if (!component) return;
      sendMessage({
        action: "control",
        componentGroup: "steppers",
        id: component.id,
        ...commandPayload,
      });
    },
    [component, sendMessage]
  );

  const handleStepperSetConfig = useCallback(() => {
    const speed = parseFloat(stepperMaxSpeed);
    const accel = parseFloat(stepperAcceleration);
    if (isNaN(speed) || isNaN(accel)) return;
    sendStepperCommand({ command: "setConfig", speed, accel });
    console.log(`Stepper SetConfig: Speed=${speed}, Accel=${accel}`);
  }, [sendStepperCommand, stepperMaxSpeed, stepperAcceleration]);

  const handleStepperMove = useCallback(() => {
    const steps = parseInt(stepperSteps, 10);
    if (isNaN(steps)) return;
    sendStepperCommand({ command: "move", steps });
    console.log(`Stepper Move: Steps=${steps}`);
  }, [sendStepperCommand, stepperSteps]);

  const handleStepperContinuous = useCallback(
    (direction: "forward" | "backward") => {
      setIsMovingContinuously(direction);
      handleStepperSetConfig();
      setTimeout(() => {
        sendStepperCommand({ command: "run", direction });
        console.log(`Stepper Run: Direction=${direction}`);
      }, 100);
    },
    [sendStepperCommand, handleStepperSetConfig]
  );

  const handleStepperStop = useCallback(() => {
    setIsMovingContinuously(null);
    sendStepperCommand({ command: "stop" });
    console.log("Stepper Stop");
  }, [sendStepperCommand]);

  const handleStepperEnableToggle = useCallback(
    (enable: boolean) => {
      sendStepperCommand({ command: enable ? "enable" : "disable" });
      console.log(`Stepper ${enable ? "Enable" : "Disable"}`);
    },
    [sendStepperCommand]
  );

  const renderStepperControls = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Configuration</span>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleStepperSetConfig}
              title="Apply Speed/Accel Settings"
            >
              <Settings2 className="h-5 w-5" />
            </Button>
          </CardTitle>
          <CardDescription>
            Set speed and acceleration parameters.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-2">
            <Switch
              id="accel-toggle"
              checked={stepperUseAccel}
              onCheckedChange={setStepperUseAccel}
            />
            <Label htmlFor="accel-toggle">
              Use Acceleration (Applied via AccelStepper library)
            </Label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label
                htmlFor="max-speed"
                className="block text-sm font-medium mb-1"
              >
                Max Speed (steps/s)
              </Label>
              <Input
                id="max-speed"
                type="number"
                value={stepperMaxSpeed}
                onChange={(e) => setStepperMaxSpeed(e.target.value)}
                onBlur={handleStepperSetConfig}
                placeholder="e.g., 1000"
              />
            </div>
            <div>
              <Label
                htmlFor="acceleration"
                className="block text-sm font-medium mb-1"
              >
                Acceleration (steps/s²)
              </Label>
              <Input
                id="acceleration"
                type="number"
                value={stepperAcceleration}
                onChange={(e) => setStepperAcceleration(e.target.value)}
                onBlur={handleStepperSetConfig}
                placeholder="e.g., 500"
                disabled={!stepperUseAccel}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Movement</CardTitle>
          <CardDescription>
            Control relative and continuous movement.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label
              htmlFor="move-steps"
              className="block text-sm font-medium mb-1"
            >
              Move Relative Steps
            </Label>
            <div className="flex gap-2">
              <Input
                id="move-steps"
                type="number"
                placeholder="Enter steps"
                value={stepperSteps}
                onChange={(e) => setStepperSteps(e.target.value)}
                className="flex-1"
              />
              <Button
                onClick={handleStepperMove}
                className="bg-blue-600 text-white hover:bg-blue-700"
              >
                Move
              </Button>
            </div>
          </div>

          <div>
            <Label className="block text-sm font-medium mb-1">
              Continuous Move
            </Label>
            <div className="flex gap-2">
              <Button
                onClick={() => handleStepperContinuous("backward")}
                disabled={isMovingContinuously === "backward"}
                className="flex-1 bg-gray-500 text-white hover:bg-gray-600 flex items-center justify-center gap-1 disabled:opacity-50"
              >
                <ChevronLeft size={18} /> Backward
              </Button>
              <Button
                onClick={handleStepperStop}
                disabled={!isMovingContinuously}
                variant="destructive"
                className="flex-1 flex items-center justify-center gap-1 disabled:opacity-50"
              >
                <StopCircle size={18} /> Stop
              </Button>
              <Button
                onClick={() => handleStepperContinuous("forward")}
                disabled={isMovingContinuously === "forward"}
                className="flex-1 bg-gray-500 text-white hover:bg-gray-600 flex items-center justify-center gap-1 disabled:opacity-50"
              >
                Forward <ChevronRight size={18} />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-around text-center">
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Current Position
            </p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {stepperCurrentPosition ?? "---"} steps
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderServoControls = () => (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Angle Control</CardTitle>
          <CardDescription>
            Set target angle ({minAngle}° - {maxAngle}°)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Slider
              id="servo-angle-slider"
              min={minAngle}
              max={maxAngle}
              step={1}
              value={[servoAngle]}
              onValueChange={(value) => {
                const newAngle = handleAngleChange(value[0]);
                sendServoCommand(newAngle);
              }}
              disabled={!isAttached}
              className="flex-grow disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <Input
              id="servo-angle-input"
              type="number"
              min={minAngle}
              max={maxAngle}
              value={servoAngle}
              onChange={(e) =>
                handleAngleChange(parseInt(e.target.value, 10) || servoAngle)
              }
              disabled={!isAttached}
              className="w-20 text-center font-mono disabled:opacity-50"
            />
          </div>
          <Button
            onClick={() => sendServoCommand(servoAngle)}
            disabled={!isAttached}
            className="w-full disabled:cursor-not-allowed"
          >
            Set Angle {servoAngle}°
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quick Adjustments</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-5 gap-2">
          <Button
            variant="outline"
            onClick={() => {
              const newAngle = handleAngleChange(servoAngle - 5);
              sendServoCommand(newAngle);
            }}
            disabled={!isAttached}
          >
            -5
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              const newAngle = handleAngleChange(servoAngle - 1);
              sendServoCommand(newAngle);
            }}
            disabled={!isAttached}
          >
            -1
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              const newAngle = handleAngleChange(90);
              sendServoCommand(newAngle);
            }}
            disabled={!isAttached}
          >
            Center
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              const newAngle = handleAngleChange(servoAngle + 1);
              sendServoCommand(newAngle);
            }}
            disabled={!isAttached}
          >
            +1
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              const newAngle = handleAngleChange(servoAngle + 5);
              sendServoCommand(newAngle);
            }}
            disabled={!isAttached}
          >
            +5
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="block text-sm font-medium mb-2">
              Angle Limits
            </Label>
            <div className="flex items-center gap-3">
              <Input
                id="min-angle"
                type="number"
                min="0"
                max="180"
                value={minAngle}
                onChange={(e) => {
                  const newMin = Math.max(
                    0,
                    Math.min(parseInt(e.target.value, 10) || 0, maxAngle - 1)
                  );
                  setMinAngle(newMin);
                  if (component) onUpdateLimits(component.id, newMin, maxAngle);
                }}
                className="w-24 text-center font-mono"
                aria-label="Minimum Angle"
              />
              <span className="text-gray-500 dark:text-gray-400">to</span>
              <Input
                id="max-angle"
                type="number"
                min="0"
                max="180"
                value={maxAngle}
                onChange={(e) => {
                  const newMax = Math.min(
                    180,
                    Math.max(parseInt(e.target.value, 10) || 180, minAngle + 1)
                  );
                  setMaxAngle(newMax);
                  if (component) onUpdateLimits(component.id, minAngle, newMax);
                }}
                className="w-24 text-center font-mono"
                aria-label="Maximum Angle"
              />
            </div>
          </div>
          <div className="flex items-center space-x-2 pt-2">
            <Switch
              id={`servo-attach-${component?.id || "servo"}`}
              checked={isAttached}
              onCheckedChange={handleAttachToggle}
            />
            <Label htmlFor={`servo-attach-${component?.id || "servo"}`}>
              {isAttached
                ? "Servo Attached (Active)"
                : "Servo Detached (Inactive)"}
            </Label>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col items-center pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground">Current Target Angle</p>
          <p className="text-lg font-bold">
            {isAttached ? `${servoAngle}°` : "Detached"}
          </p>
        </CardFooter>
      </Card>
    </div>
  );

  const renderSensorDisplay = () => {
    const displayValue =
      typeof componentState === "number"
        ? componentState.toFixed(2)
        : componentState ?? "--";
    return (
      <div className="text-center py-6">
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
          Current Value
        </p>
        <p className="text-4xl font-bold text-gray-900 dark:text-white mt-2">
          {displayValue}
        </p>
      </div>
    );
  };

  const renderIoControls = () => {
    const isInputHigh = componentState === 1;
    const inputValue =
      componentState === 1 ? "HIGH" : componentState === 0 ? "LOW" : "--";

    const handleOutputToggle = (checked: boolean) => {
      setOutputState(checked);
      sendMessage({
        action: "control",
        componentGroup: "pins",
        id: component.id,
        state: checked,
      });
    };

    return (
      <div className="space-y-4">
        {(component?.type === "Digital Input" ||
          component?.type === "Digital Input Pullup") && (
          <div className="text-center p-4 bg-gray-100 dark:bg-gray-700 rounded-md">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
              Current State
            </p>
            <p
              className={`text-2xl font-bold ${
                isInputHigh
                  ? "text-green-600 dark:text-green-400"
                  : componentState === 0
                  ? "text-red-600 dark:text-red-400"
                  : "text-gray-500 dark:text-gray-400"
              }`}
            >
              {inputValue}
            </p>
          </div>
        )}

        {component?.type === "Digital Output" && (
          <div className="flex items-center space-x-2">
            <Switch
              id={`io-output-${component.id}`}
              checked={outputState}
              onCheckedChange={handleOutputToggle}
            />
            <Label htmlFor={`io-output-${component.id}`}>
              Set Output State
            </Label>
          </div>
        )}
      </div>
    );
  };

  const renderRelayControls = () => {
    const isRelayOn = componentState === true;
    return (
      <Button
        className={`w-full text-white flex items-center justify-center gap-2 ${
          isRelayOn
            ? "bg-red-600 hover:bg-red-700"
            : "bg-green-600 hover:bg-green-700"
        }`}
        onClick={() => {
          sendMessage({
            action: "control",
            componentGroup: "relays",
            id: component.id,
            state: !isRelayOn,
          });
        }}
      >
        <Power size={18} />
        {isRelayOn ? "Turn Off" : "Turn On"}
      </Button>
    );
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key={`control-panel-backdrop-${component.id}`}
          variants={backdropVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="fixed inset-0 bg-black/60 flex items-end z-40"
          onClick={onClose}
          aria-modal="true"
          role="dialog"
        >
          <motion.div
            key={`control-panel-content-${component.id}`}
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="w-full max-w-full h-auto max-h-[80vh] bg-white dark:bg-gray-800 rounded-t-lg shadow-xl p-6 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              aria-label="Close control panel"
            >
              <X size={20} />
            </button>
            <h2 className="text-xl font-semibold mb-1 text-gray-900 dark:text-white">
              Control: {component.name}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Type: {component.type} | Pins: {component.pins.join(", ")}
            </p>

            <hr className="my-4 border-gray-200 dark:border-gray-700" />

            {component.type === "Stepper" && renderStepperControls()}
            {component.type === "Servo" && renderServoControls()}
            {(component.type === "Digital Input" ||
              component.type === "Digital Input Pullup" ||
              component.type === "Digital Output") &&
              renderIoControls()}
            {activeGroup === "relays" && renderRelayControls()}
            {activeGroup === "sensors" && renderSensorDisplay()}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
