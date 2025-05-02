export type ComponentGroup =
  | "servos"
  | "sensors"
  | "io"
  | "relays"
  | "steppers";
export type ConnectionStatus = "idle" | "connecting" | "connected" | "error";

export interface ConfiguredComponent {
  id: string;
  name: string;
  type: string;
  pins: number[];
  minAngle?: number;
  maxAngle?: number;
}

export interface HardwareConfig {
  servos: ConfiguredComponent[];
  steppers: ConfiguredComponent[];
  sensors: ConfiguredComponent[];
  relays: ConfiguredComponent[];
  pins: ConfiguredComponent[];
}

// State for the configuration modal form
export interface NewComponentFormState {
  name: string;
  type: string;
  pin: string;
  pulPin: string;
  dirPin: string;
  enaPin: string;
  pins: string;
  pullMode: "none" | "pullup" | "pulldown" | null;
}
