interface AvatarProps {
  name: string;
  color: string;
  size?: number;
  placeholder?: boolean;
  ring?: boolean;
  dim?: boolean;
  style?: React.CSSProperties;
}

export function Avatar({
  name,
  color,
  size = 34,
  placeholder = false,
  ring = false,
  dim = false,
  style,
}: AvatarProps) {
  const initials = name
    .split(" ")
    .filter((w) => w.length > 0)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        flexShrink: 0,
        background: placeholder ? "transparent" : color,
        border: placeholder
          ? `1.6px dashed ${color}`
          : ring
            ? "2px solid var(--surface)"
            : "none",
        boxShadow: ring ? "0 0 0 2px var(--surface)" : "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: placeholder ? color : "#fff",
        fontWeight: 700,
        fontSize: size * 0.4,
        letterSpacing: "-0.02em",
        opacity: dim ? 0.35 : 1,
        transition: "opacity .18s, transform .18s",
        ...style,
      }}
    >
      {initials}
    </div>
  );
}

interface AvatarStackProps {
  members: Array<{ name: string; color: string; placeholder?: boolean }>;
  size?: number;
  max?: number;
}

export function AvatarStack({ members, size = 30, max = 5 }: AvatarStackProps) {
  const shown = members.slice(0, max);
  const extra = members.length - shown.length;
  const overlap = 0.34;

  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {shown.map((m, i) => (
        <div
          key={i}
          style={{
            marginLeft: i === 0 ? 0 : -size * overlap,
            zIndex: shown.length - i,
          }}
        >
          <Avatar name={m.name} color={m.color} size={size} ring />
        </div>
      ))}
      {extra > 0 && (
        <div
          style={{
            marginLeft: -size * overlap,
            width: size,
            height: size,
            borderRadius: "50%",
            background: "var(--surface-3)",
            boxShadow: "0 0 0 2px var(--surface)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--ink-2)",
            fontWeight: 700,
            fontSize: size * 0.36,
          }}
        >
          +{extra}
        </div>
      )}
    </div>
  );
}
