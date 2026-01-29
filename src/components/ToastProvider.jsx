import React, { createContext, useContext, useMemo, useRef, useState } from "react";

const ToastCtx = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const addToast = (toast) => {
    const id = ++idRef.current;
    const t = { id, type: toast.type || "info", title: toast.title, message: toast.message, timeout: toast.timeout ?? 3500 };
    setToasts((prev) => [...prev, t]);
    if (t.timeout > 0) {
      setTimeout(() => removeToast(id), t.timeout);
    }
  };

  const removeToast = (id) => setToasts((prev) => prev.filter((t) => t.id !== id));

  const value = useMemo(() => ({ addToast, removeToast }), []);

  return (
    <ToastCtx.Provider value={value}>
      {children}
      {/* container */}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`max-w-sm rounded shadow px-4 py-3 text-sm border bg-white ${
              t.type === "success" ? "border-green-300 bg-green-50" :
              t.type === "error" ? "border-red-300 bg-red-50" :
              t.type === "warning" ? "border-yellow-400 bg-yellow-50" : // Added warning style
              "border-gray-300"
            }`}
          >
            <div className="flex justify-between items-start gap-3">
              <div>
                {t.title && <div className="font-medium">{t.title}</div>}
                {t.message && <div className="text-gray-700">{t.message}</div>}
              </div>
              <button onClick={() => removeToast(t.id)} className="text-gray-500 text-xs hover:underline">Close</button>
            </div>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
