// Divvy Up — Bricolage Grotesque + Hanken Grotesk Tamagui font config.
//
// Two families back the design system:
//   $display — Bricolage Grotesque 400-800 (headings, titles, eyebrows)
//   $body    — Hanken Grotesk 400-600 (body copy)
//   $mono    — repointed to Hanken Grotesk (Divvy Up has no dedicated mono)
//
// Face names match the keys registered with expo-font in `useAppFonts.ts`.
// Bricolage Grotesque ships no italic; Hanken Grotesk does. Where Tamagui's
// `face` map wants an italic entry we fall back to the upright face so
// rendering never hits a missing typeface.

import { createFont } from "@tamagui/core";

/** Display face name registered via expo-font (see useAppFonts.ts). */
export const GEIST_FAMILY = "Bricolage Grotesque";
/** Body/mono face name registered via expo-font (see useAppFonts.ts). */
export const GEIST_MONO_FAMILY = "Hanken Grotesk";

/**
 * `$display` — Bricolage Grotesque for headings, titles, eyebrows, button
 * labels. Bricolage has no italic, so every `italic` slot points at the
 * matching upright face.
 */
export const displayFont = createFont({
  family: GEIST_FAMILY,
  size: {
    1: 10.5,
    2: 12,
    3: 14,
    4: 16,
    5: 18,
    6: 22,
    7: 24,
    8: 32,
    9: 44,
    true: 16,
  },
  lineHeight: {
    1: 14,
    2: 16,
    3: 18,
    4: 20,
    5: 24,
    6: 28,
    7: 30,
    8: 38,
    9: 48,
    true: 20,
  },
  weight: {
    1: "400",
    4: "400",
    5: "500",
    6: "600",
    7: "700",
    8: "800",
    9: "800",
    true: "600",
  },
  letterSpacing: {
    1: 2.2,
    4: -0.3,
    5: -0.4,
    6: -0.5,
    7: -0.6,
    8: -1.0,
    9: -1.4,
    true: -0.3,
  },
  face: {
    "400": {
      normal: "BricolageGrotesque_400Regular",
      italic: "BricolageGrotesque_400Regular",
    },
    "500": {
      normal: "BricolageGrotesque_500Medium",
      italic: "BricolageGrotesque_500Medium",
    },
    "600": {
      normal: "BricolageGrotesque_600SemiBold",
      italic: "BricolageGrotesque_600SemiBold",
    },
    "700": {
      normal: "BricolageGrotesque_700Bold",
      italic: "BricolageGrotesque_700Bold",
    },
    "800": {
      normal: "BricolageGrotesque_800ExtraBold",
      italic: "BricolageGrotesque_800ExtraBold",
    },
  },
});

/**
 * `$body` — Hanken Grotesk for body copy. Weights 400-600.
 */
export const bodyFont = createFont({
  family: GEIST_MONO_FAMILY,
  size: {
    1: 11,
    2: 12,
    3: 13,
    4: 14,
    5: 16,
    true: 13,
  },
  lineHeight: {
    1: 16,
    2: 17,
    3: 19,
    4: 20,
    5: 23,
    true: 19,
  },
  weight: {
    1: "400",
    4: "400",
    5: "500",
    6: "600",
    true: "400",
  },
  letterSpacing: {
    4: 0,
    true: 0,
  },
  face: {
    "400": {
      normal: "HankenGrotesk_400Regular",
      italic: "HankenGrotesk_400Regular_Italic",
    },
    "500": {
      normal: "HankenGrotesk_500Medium",
      italic: "HankenGrotesk_500Medium_Italic",
    },
    "600": {
      normal: "HankenGrotesk_600SemiBold",
      italic: "HankenGrotesk_600SemiBold_Italic",
    },
  },
});

/**
 * `$mono` — repointed to Hanken Grotesk. Divvy Up has no dedicated
 * monospace face; numeric display uses tabular-nums (`MONO_FONT_VARIANT`)
 * on the body family instead.
 */
export const monoFont = createFont({
  family: GEIST_MONO_FAMILY,
  size: {
    1: 10,
    2: 11,
    3: 13,
    4: 16,
    5: 20,
    6: 28,
    7: 40,
    true: 16,
  },
  lineHeight: {
    1: 14,
    2: 15,
    3: 18,
    4: 20,
    5: 24,
    6: 32,
    7: 44,
    true: 20,
  },
  weight: {
    1: "400",
    4: "400",
    5: "500",
    6: "600",
    true: "400",
  },
  letterSpacing: {
    4: 0,
    true: 0,
  },
  face: {
    "400": {
      normal: "HankenGrotesk_400Regular",
      italic: "HankenGrotesk_400Regular_Italic",
    },
    "500": {
      normal: "HankenGrotesk_500Medium",
      italic: "HankenGrotesk_500Medium_Italic",
    },
    "600": {
      normal: "HankenGrotesk_600SemiBold",
      italic: "HankenGrotesk_600SemiBold_Italic",
    },
  },
});

/**
 * Tabular-figure font variant for numeric primitives (no-bounce updates).
 */
export const MONO_FONT_VARIANT = ["tabular-nums"] as const;
