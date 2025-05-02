import { Plus } from "lucide-react";

interface AddNewCardProps {
  label: string;
  onClick: () => void;
}

export function AddNewCard({ label, onClick }: AddNewCardProps) {
  return (
    <button
      onClick={onClick}
      className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg flex flex-col items-center justify-center text-gray-500 dark:text-gray-400 hover:border-blue-500 hover:text-blue-500 dark:hover:border-blue-600 dark:hover:text-blue-600 transition-colors min-h-[200px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
      aria-label={`Add New ${label}`}
    >
      <Plus size={32} className="mb-2" />
      <span className="text-sm font-medium text-center px-2">
        Add New {label}
      </span>
    </button>
  );
}
