// Divvy Up — Tamagui token export.
//
// Dark-first warm-indigo design system. Token STRUCTURE/keys match the shell
// code that references them; the VALUES are Divvy Up's palette (mirrors
// packages/web/src/index.css). The legacy `colorPalette` numeric scale is
// preserved additively and repointed onto the Divvy Up ramp so existing
// primitives keep rendering.

import { createTokens } from "@tamagui/core";

// ════════════════════════════════════════════════════════════
// COLOR
// ════════════════════════════════════════════════════════════
export const color = {
  // ── Background & surfaces (warm-cool dark)
  $bg: "#0E0D15",
  $surface: "#1A1928", // base card
  $surface2: "#232136", // elevated card
  $surface3: "#2C2A42", // input fields, drawer
  $surface4: "#2C2A42", // modal headers (alias of surface3)
  $surface5: "#131220", // bg-2 / overlays base

  // ── Text (ink)
  $text: "#F7F5FF",
  $text2: "rgba(247,245,255,0.74)",
  $text3: "rgba(247,245,255,0.5)",
  $text4: "rgba(247,245,255,0.3)",
  $text5: "rgba(247,245,255,0.3)",

  // ── Borders
  $border: "rgba(255,255,255,0.08)",
  $border2: "rgba(255,255,255,0.14)",
  $border3: "rgba(255,255,255,0.14)",

  // ── Primary (brand indigo)
  $primary: "#8071F2",
  $primaryBright: "#A99BFF",
  $primary7: "#5A4FBF", // dim / pressed
  $primaryGlow: "rgba(128,113,242,0.16)",
  $primaryDim: "rgba(128,113,242,0.16)",
  $primaryInk: "#2A2550", // ink under solid brand

  // ── Gold → Amber accent (repointed)
  $gold: "#FFA968",
  $goldBright: "#FFC79A",
  $gold7: "#FFA968",
  $goldGlow: "rgba(255,169,104,0.20)",
  $goldDim: "rgba(255,169,104,0.10)",
  $goldInk: "#2A1F00",

  // ── Trainer accent → repointed to brand (gym-only concept dropped)
  $accentTrainer: "#8071F2",
  $accentTrainerBright: "#A99BFF",
  $accentTrainer7: "#5A4FBF",
  $accentTrainerGlow: "rgba(128,113,242,0.16)",
  $accentTrainerDim: "rgba(128,113,242,0.10)",
  $accentTrainerInk: "#2A2550",

  // ── Ember → amber energy accent
  $ember: "#FFA968",
  $emberGlow: "rgba(255,169,104,0.20)",
  $emberDim: "rgba(255,169,104,0.10)",

  // ── Semantic (money)
  $success: "#4ADE9E", // positive
  $successDim: "rgba(74,222,158,0.12)",
  $warning: "#FFB23E",
  $error: "#FF7A7A", // negative
  $errorDim: "rgba(255,122,122,0.12)",
  $info: "#4DA8FF",

  // ── People palette (avatars / split members)
  $p1: "#8071F2",
  $p2: "#FF7A66",
  $p3: "#3BC9B0",
  $p4: "#FFB23E",
  $p5: "#FF6FA5",
  $p6: "#4DA8FF",
  $p7: "#9BD64A",
  $p8: "#C07BFF",
} as const;

// ════════════════════════════════════════════════════════════
// SPACE — used as padding/margin/gap
// ════════════════════════════════════════════════════════════
export const space = {
  $xxs: 2,
  $xs: 4,
  $sm: 8,
  $md: 12,
  $base: 16,
  $lg: 20,
  $xl: 24,
  $2xl: 32,
  $3xl: 48,
  $4xl: 64,
} as const;

// ════════════════════════════════════════════════════════════
// SIZE — explicit dimension tokens
// ════════════════════════════════════════════════════════════
export const size = {
  ...space,
  $touchTarget: 44,
  $tabBarHeight: 72,
  $headerHeight: 54,
  $bottomPadding: 140,
} as const;

// ════════════════════════════════════════════════════════════
// RADIUS — Divvy Up scale
// ════════════════════════════════════════════════════════════
export const radius = {
  $xs: 8,
  $sm: 12,
  $md: 18,
  $lg: 24,
  $xl: 32,
  $2xl: 32,
  $pill: 999,
} as const;

// ════════════════════════════════════════════════════════════
// Z-INDEX
// ════════════════════════════════════════════════════════════
export const zIndex = {
  $0: 0,
  $sticky: 10,
  $tabBar: 40,
  $modal: 90,
  $drawer: 100,
  $sheet: 120,
  $toast: 200,
} as const;

// ════════════════════════════════════════════════════════════
// FONTS — see fonts.ts for the full Tamagui font definition
// (Bricolage Grotesque display / Hanken Grotesk body)
// ════════════════════════════════════════════════════════════
export const fonts = {
  display: {
    family: "Bricolage Grotesque",
    weight: {
      "4": "400",
      "5": "500",
      "6": "600",
      "7": "700",
      "8": "800",
      "9": "800",
    },
    letterSpacing: {
      tight: "-0.04em",
      snug: "-0.03em",
      normal: "-0.02em",
      wide: "0",
      eyebrow: "0.16em",
    },
    size: {
      xs: 10.5,
      sm: 12,
      md: 14,
      lg: 16,
      xl: 18,
      "2xl": 22,
      "3xl": 24,
      "4xl": 32,
      "5xl": 44,
    },
  },
  body: {
    family: "Hanken Grotesk",
    weight: { "4": "400", "5": "500", "6": "600" },
    size: { xs: 11, sm: 12, md: 13, lg: 14, xl: 16 },
    lineHeight: { tight: 1.25, normal: 1.45, relaxed: 1.55 },
  },
  mono: {
    // No dedicated mono face in Divvy Up — repointed to the body family.
    family: "Hanken Grotesk",
    weight: { "4": "400", "5": "500", "6": "600" },
    size: { xs: 10, sm: 11, md: 13, lg: 16, xl: 20, "2xl": 28, "3xl": 40 },
    features: ["tnum"],
  },
} as const;

// ════════════════════════════════════════════════════════════
// SHADOW
// ════════════════════════════════════════════════════════════
export const shadow = {
  card: "0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px rgba(0,0,0,0.4)",
  glowPrimary: "0 0 24px rgba(128,113,242,0.35)",
  glowGold: "0 0 24px rgba(255,169,104,0.30)",
  glowTrainer: "0 0 24px rgba(128,113,242,0.30)",
  sheet: "0 -20px 60px rgba(0,0,0,0.5)",
} as const;

// ════════════════════════════════════════════════════════════
// LEGACY SURFACE (preserved additively — repointed to Divvy Up ramp)
// ════════════════════════════════════════════════════════════

/**
 * Legacy numbered colour scale consumed as plain JS by a few in-tree
 * primitives (ErrorBoundary, PLogoDrawLoader). Repointed onto the Divvy Up
 * palette so those keep rendering with the new brand.
 *
 * @deprecated Use the semantic `$`-prefixed tokens above.
 */
export const colorPalette = {
  // Primary — brand indigo ramp
  primary50: "#EEEBFF",
  primary100: "#D9D3FF",
  primary200: "#C3B9FF",
  primary300: "#A99BFF",
  primary400: "#9384F7",
  primary500: "#8071F2",
  primary600: "#6E5FE0",
  primary700: "#5A4FBF",
  primary800: "#453C99",
  primary900: "#2A2550",

  // Secondary — amber accent
  gold50: "#FFF3E9",
  gold100: "#FFE1CB",
  gold200: "#FFC79A",
  gold300: "#FFB884",
  gold400: "#FFB07A",
  gold500: "#FFA968",
  gold600: "#F0965A",
  gold700: "#D9814A",
  gold800: "#B36537",
  gold900: "#7A4423",

  // Neutral — Divvy Up warm-indigo darks + ink
  neutral0: "#F7F5FF",
  neutral50: "#EDEBF5",
  neutral100: "#D9D6E6",
  neutral200: "#BDB9CF",
  neutral300: "#9C98B0",
  neutral400: "#7A7690",
  neutral500: "#5C5872",
  neutral600: "#413E55",
  neutral700: "#2C2A42",
  neutral800: "#232136",
  neutral900: "#1A1928",
  neutral950: "#131220",
  neutral1000: "#0E0D15",

  // Semantic (money)
  success: "#4ADE9E",
  successLight: "#86EFAC",
  successDark: "#16A34A",
  warning: "#FFB23E",
  warningLight: "#FFC79A",
  warningDark: "#D97706",
  error: "#FF7A7A",
  errorLight: "#FCA5A5",
  errorDark: "#DC2626",
  info: "#4DA8FF",
  infoLight: "#93C7FF",
  infoDark: "#1E6FCC",

  // Base
  white: "#FFFFFF",
  black: "#000000",
  transparent: "transparent",
} as const;

const legacySpace = {
  0: 0,
  true: 16,
} as const;

const legacySize = {
  0: 0,
  true: 44,
} as const;

const legacyRadius = {
  0: 0,
  full: 9999,
  true: 12,
} as const;

const legacyZIndex = {
  1: 100,
  2: 200,
  3: 300,
  4: 400,
  5: 500,
} as const;

// ════════════════════════════════════════════════════════════
// COMBINED EXPORT
// ════════════════════════════════════════════════════════════
export const tokens = createTokens({
  color: { ...color, ...colorPalette },
  space: { ...space, ...legacySpace },
  size: { ...size, ...legacySize },
  radius: { ...radius, ...legacyRadius },
  zIndex: { ...zIndex, ...legacyZIndex },
});
