import { useEffect } from "react";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  pad?: boolean;
}

export function Sheet({
  open,
  onClose,
  children,
  title,
  pad = true,
}: SheetProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200 }}>
      <div
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.55)",
          animation: "dd-fade .22s ease",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          background: "var(--bg-2)",
          borderRadius: "26px 26px 0 0",
          border: "1px solid var(--hairline)",
          borderBottom: "none",
          maxHeight: "88%",
          display: "flex",
          flexDirection: "column",
          animation: "dd-sheet-up .32s cubic-bezier(.2,.9,.3,1)",
          boxShadow: "var(--shadow-pop)",
        }}
      >
        <div
          style={{ display: "flex", justifyContent: "center", paddingTop: 10 }}
        >
          <div
            style={{
              width: 38,
              height: 5,
              borderRadius: 3,
              background: "var(--hairline-2)",
            }}
          />
        </div>
        {title && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "6px 18px 10px",
            }}
          >
            <div className="dd-display" style={{ fontSize: 21 }}>
              {title}
            </div>
            <button
              onClick={onClose}
              style={{
                width: 34,
                height: 34,
                borderRadius: "50%",
                background: "var(--surface-2)",
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--ink-2)",
              }}
            >
              ✕
            </button>
          </div>
        )}
        <div
          className="dd-scroll"
          style={{ overflow: "auto", padding: pad ? "0 18px 26px" : 0 }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
