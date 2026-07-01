import { fmt } from "@/lib/people";

interface MoneyProps {
  pence: number;
  size?: number;
  weight?: number;
  color?: string;
  sign?: boolean;
  style?: React.CSSProperties;
}

export function Money({
  pence,
  size = 17,
  weight = 700,
  color,
  sign = false,
  style,
}: MoneyProps) {
  const col =
    color ||
    (sign
      ? pence < 0
        ? "var(--neg)"
        : pence > 0
          ? "var(--pos)"
          : "var(--ink-2)"
      : "var(--ink)");

  return (
    <span
      className="dd-num"
      style={{
        fontSize: size,
        fontWeight: weight,
        color: col,
        letterSpacing: "-0.01em",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {fmt(pence, { sign })}
    </span>
  );
}
