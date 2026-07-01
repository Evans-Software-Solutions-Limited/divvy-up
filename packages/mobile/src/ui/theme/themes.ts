// Tamagui themes — Divvy Up (dark-first warm indigo).
//
// The dark theme is canonical. The light theme is preserved structurally so
// both expose the same key set. Themes override tokens of the same name.

import { color as t } from "./tokens";

const sharedTokens = {
  // Brand accents
  primary: t.$primary, // #8071F2
  primaryLight: t.$primaryBright, // #A99BFF
  primaryDark: t.$primary7, // #5A4FBF
  secondary: t.$gold, // #FFA968 (amber)
  secondaryLight: t.$goldBright, // #FFC79A
  secondaryDark: t.$gold7,

  // Semantic (money)
  success: t.$success, // #4ADE9E
  successLight: "#86EFAC",
  successDark: "#16A34A",
  warning: t.$warning, // #FFB23E
  warningLight: "#FFC79A",
  warningDark: "#D97706",
  error: t.$error, // #FF7A7A
  errorLight: "#FCA5A5",
  errorDark: "#DC2626",
  info: t.$info, // #4DA8FF
  infoLight: "#93C7FF",
  infoDark: "#1E6FCC",
};

export const darkTheme = {
  ...sharedTokens,

  // Backgrounds
  background: t.$bg, // #0E0D15
  backgroundSecondary: t.$surface, // #1A1928
  backgroundTertiary: t.$surface3, // #2C2A42

  // Surfaces (tonal elevation — lighter = higher)
  surface: t.$surface, // #1A1928
  surfaceSecondary: t.$surface2, // #232136
  surfaceTertiary: t.$surface3, // #2C2A42

  // Text
  color: t.$text, // #F7F5FF
  colorSecondary: t.$text2,
  colorMuted: t.$text3,
  colorInverse: t.$bg,

  // Borders
  borderColor: t.$border,
  borderColorFocus: t.$primary,
  borderColorError: t.$error,

  // Interactive states (indigo-tinted)
  backgroundHover: "rgba(128,113,242,0.08)",
  backgroundPress: "rgba(128,113,242,0.12)",
  backgroundFocus: "rgba(128,113,242,0.16)",
  backgroundDisabled: "rgba(255,255,255,0.08)",
  colorDisabled: t.$text4,

  // Overlay
  overlay: "rgba(14,13,21,0.8)",

  // Shadows
  shadowColor: "rgba(0,0,0,0.4)",
  shadowColorFocus: "rgba(128,113,242,0.25)",

  // Placeholder
  placeholderColor: t.$text3,
};

export const lightTheme = {
  ...sharedTokens,

  // Backgrounds
  background: "#F5F4FA",
  backgroundSecondary: "#FFFFFF",
  backgroundTertiary: "#EBE9F4",

  // Surfaces
  surface: "#FFFFFF",
  surfaceSecondary: "#F5F4FA",
  surfaceTertiary: "#EBE9F4",

  // Text
  color: "#14121F",
  colorSecondary: "#413E55",
  colorMuted: "#5C5872",
  colorInverse: "#FFFFFF",

  // Borders
  borderColor: "#D9D6E6",
  borderColorFocus: t.$primary,
  borderColorError: t.$error,

  // Interactive states
  backgroundHover: "rgba(128,113,242,0.06)",
  backgroundPress: "rgba(128,113,242,0.10)",
  backgroundFocus: "rgba(128,113,242,0.12)",
  backgroundDisabled: "rgba(0,0,0,0.05)",
  colorDisabled: "#9C98B0",

  // Overlay
  overlay: "rgba(0,0,0,0.5)",

  // Shadows
  shadowColor: "rgba(0,0,0,0.08)",
  shadowColorFocus: "rgba(128,113,242,0.15)",

  // Placeholder
  placeholderColor: "#9C98B0",
};

export const themes = {
  dark: darkTheme,
  light: lightTheme,
} as const;
