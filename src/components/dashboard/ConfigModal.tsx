import { X, Plus, Edit } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { ComponentGroup, NewComponentFormState } from "./types";

interface ConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: "add" | "edit";
  activeGroup: ComponentGroup;
  newComponent: NewComponentFormState;
  setNewComponent: (value: NewComponentFormState) => void;
  onAddComponent: () => void;
}

export function ConfigModal({
  isOpen,
  onClose,
  mode,
  activeGroup,
  newComponent,
  setNewComponent,
  onAddComponent,
}: ConfigModalProps) {
  const backdropVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.2 } },
    exit: { opacity: 0, transition: { duration: 0.2 } },
  };

  const modalVariants = {
    hidden: { opacity: 0, scale: 0.95, y: 20 },
    visible: {
      opacity: 1,
      scale: 1,
      y: 0,
      transition: {
        type: "spring",
        stiffness: 300,
        damping: 30,
        duration: 0.3,
      },
    },
    exit: { opacity: 0, scale: 0.9, y: 10, transition: { duration: 0.2 } },
  };

  const isEditing = mode === "edit";

  const getGroupName = (group: ComponentGroup) => {
    switch (group) {
      case "servos":
        return "Servo";
      case "steppers":
        return "Stepper Motor";
      case "sensors":
        return "Sensor";
      case "relays":
        return "Relay";
      case "io":
        return "I/O Pin";
      default:
        return "Component";
    }
  };

  const getPlaceholder = (
    field: keyof Omit<NewComponentFormState, "pullMode">
  ) => {
    switch (field) {
      case "name":
        return `e.g. Limit Switch ${getGroupName(activeGroup)}`;
      case "pin":
        return activeGroup === "io" || activeGroup === "servos"
          ? "e.g. 23"
          : "";
      case "pulPin":
        return "e.g. 14";
      case "dirPin":
        return "e.g. 15";
      case "enaPin":
        return "e.g. 16 (Optional)";
      case "pins":
        return activeGroup === "sensors" || activeGroup === "relays"
          ? "e.g. 22,23 (Comma-separated)"
          : "";
      case "type":
        switch (activeGroup) {
          case "sensors":
            return "e.g. DHT22";
          case "relays":
            return "e.g. 5V Relay";
          default:
            return "";
        }
      default:
        return "";
    }
  };

  const isSubmitDisabled = () => {
    if (!newComponent.name) return true;
    switch (activeGroup) {
      case "servos":
        return !newComponent.pin;
      case "steppers":
        return !newComponent.pulPin || !newComponent.dirPin;
      case "sensors":
      case "relays":
        return !newComponent.type || !newComponent.pins;
      case "io":
        return !newComponent.type || !newComponent.pin;
      default:
        return true;
    }
  };

  const handleIoTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newType = e.target.value;
    setNewComponent({
      ...newComponent,
      type: newType,
      pullMode: newType === "Digital Input" ? ("none" as const) : null,
    });
  };

  const handlePullModeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setNewComponent({
      ...newComponent,
      pullMode: e.target.value as "none" | "pullup" | "pulldown",
    });
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isSubmitDisabled()) {
      onAddComponent();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="config-modal-backdrop"
          variants={backdropVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50"
          onClick={onClose}
          aria-modal="true"
          role="dialog"
        >
          <motion.div
            key="config-modal-content"
            variants={modalVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md relative"
            onClick={(e) => e.stopPropagation()}
          >
            <form onSubmit={handleSubmit} className="flex flex-col h-full p-6">
              <div className="flex-shrink-0 mb-5">
                <button
                  onClick={onClose}
                  type="button"
                  className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  aria-label="Close configuration modal"
                >
                  <X size={20} />
                </button>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  {isEditing
                    ? `Edit ${getGroupName(activeGroup)}`
                    : `Add New ${getGroupName(activeGroup)}`}
                </h2>
              </div>
              <div className="space-y-4 flex-grow overflow-y-auto pr-2">
                <div>
                  <label
                    htmlFor="comp-name"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                  >
                    Name
                  </label>
                  <input
                    id="comp-name"
                    type="text"
                    value={newComponent.name}
                    onChange={(e) =>
                      setNewComponent({ ...newComponent, name: e.target.value })
                    }
                    placeholder={getPlaceholder("name")}
                    className="w-full rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                {(activeGroup === "sensors" || activeGroup === "relays") && (
                  <div>
                    <label
                      htmlFor="comp-type"
                      className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                    >
                      Type
                    </label>
                    <input
                      id="comp-type"
                      type="text"
                      value={newComponent.type}
                      onChange={(e) =>
                        setNewComponent({
                          ...newComponent,
                          type: e.target.value,
                        })
                      }
                      placeholder={getPlaceholder("type")}
                      className="w-full rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                )}
                {activeGroup === "io" && (
                  <div className="relative">
                    <label
                      htmlFor="comp-io-type"
                      className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                    >
                      Type
                    </label>
                    <select
                      id="comp-io-type"
                      value={newComponent.type}
                      onChange={handleIoTypeChange}
                      className="appearance-none w-full rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="" disabled>
                        Select I/O Type...
                      </option>
                      <option value="Digital Input">Digital Input</option>
                      <option value="Digital Output">Digital Output</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700 dark:text-gray-300 mt-6">
                      <svg
                        className="fill-current h-4 w-4"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                      >
                        <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                      </svg>
                    </div>
                  </div>
                )}
                {activeGroup === "io" &&
                  newComponent.type === "Digital Input" && (
                    <div className="relative">
                      <label
                        htmlFor="comp-pull-mode"
                        className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                      >
                        Pull Mode
                      </label>
                      <select
                        id="comp-pull-mode"
                        value={newComponent.pullMode ?? "none"}
                        onChange={handlePullModeChange}
                        className="appearance-none w-full rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="none">None</option>
                        <option value="pullup">Pullup</option>
                        <option value="pulldown">Pulldown</option>
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700 dark:text-gray-300 mt-6">
                        <svg
                          className="fill-current h-4 w-4"
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                        >
                          <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                        </svg>
                      </div>
                    </div>
                  )}
                {(activeGroup === "servos" || activeGroup === "io") && (
                  <div>
                    <label
                      htmlFor="comp-pin"
                      className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                    >
                      Pin
                    </label>
                    <input
                      id="comp-pin"
                      type="number"
                      value={newComponent.pin}
                      onChange={(e) =>
                        setNewComponent({
                          ...newComponent,
                          pin: e.target.value,
                        })
                      }
                      placeholder={getPlaceholder("pin")}
                      className="w-full rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                )}
                {activeGroup === "steppers" && (
                  <>
                    <div>
                      <label
                        htmlFor="comp-pulPin"
                        className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                      >
                        Pulse (PUL) Pin
                      </label>
                      <input
                        id="comp-pulPin"
                        type="number"
                        value={newComponent.pulPin}
                        onChange={(e) =>
                          setNewComponent({
                            ...newComponent,
                            pulPin: e.target.value,
                          })
                        }
                        placeholder={getPlaceholder("pulPin")}
                        className="w-full rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="comp-dirPin"
                        className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                      >
                        Direction (DIR) Pin
                      </label>
                      <input
                        id="comp-dirPin"
                        type="number"
                        value={newComponent.dirPin}
                        onChange={(e) =>
                          setNewComponent({
                            ...newComponent,
                            dirPin: e.target.value,
                          })
                        }
                        placeholder={getPlaceholder("dirPin")}
                        className="w-full rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="comp-enaPin"
                        className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                      >
                        Enable (ENA) Pin{" "}
                        <span className="text-xs text-gray-500">
                          (Optional)
                        </span>
                      </label>
                      <input
                        id="comp-enaPin"
                        type="number"
                        value={newComponent.enaPin}
                        onChange={(e) =>
                          setNewComponent({
                            ...newComponent,
                            enaPin: e.target.value,
                          })
                        }
                        placeholder={getPlaceholder("enaPin")}
                        className="w-full rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </>
                )}
                {(activeGroup === "sensors" || activeGroup === "relays") && (
                  <div>
                    <label
                      htmlFor="comp-pins"
                      className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                    >
                      Pin(s){" "}
                      <span className="text-xs text-gray-500">
                        (comma-separated)
                      </span>
                    </label>
                    <input
                      id="comp-pins"
                      type="text"
                      value={newComponent.pins}
                      onChange={(e) =>
                        setNewComponent({
                          ...newComponent,
                          pins: e.target.value,
                        })
                      }
                      placeholder={getPlaceholder("pins")}
                      className="w-full rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                )}
              </div>
              <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3 flex-shrink-0">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors"
                >
                  Cancel
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  type="submit"
                  disabled={isSubmitDisabled()}
                  className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 transition-colors"
                >
                  {isEditing ? (
                    <>
                      <Edit size={16} /> Update
                    </>
                  ) : (
                    <>
                      <Plus size={16} /> Add
                    </>
                  )}
                </motion.button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
