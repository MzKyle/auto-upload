import { useEffect, useState } from "react";

interface ToastItem {
  id: number;
  message: string;
  type: "success" | "error" | "warning";
}

let toastId = 0;
let addToastFn: ((message: string, type: ToastItem["type"]) => void) | null =
  null;

export function showToast(
  message: string,
  type: ToastItem["type"] = "success"
): void {
  addToastFn?.(message, type);
}

const TYPE_CLASSES: Record<ToastItem["type"], string> = {
  success: "bg-green-600 text-white",
  error: "bg-destructive text-destructive-foreground",
  warning: "bg-yellow-600 text-white",
};

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    addToastFn = (message: string, type: ToastItem["type"]) => {
      const id = ++toastId;
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 3000);
    };
    return () => {
      addToastFn = null;
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`px-4 py-2 rounded-md text-sm shadow-lg animate-in fade-in slide-in-from-top-2 ${
            TYPE_CLASSES[toast.type]
          }`}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
