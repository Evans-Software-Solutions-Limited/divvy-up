// Loads Bricolage Grotesque + Hanken Grotesk via expo-font so Tamagui's
// `$display` / `$body` / `$mono` families resolve to the real typefaces on
// iOS + Android. The map keys are the face names referenced by `fonts.ts`.

import {
  BricolageGrotesque_400Regular,
  BricolageGrotesque_500Medium,
  BricolageGrotesque_600SemiBold,
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
} from "@expo-google-fonts/bricolage-grotesque";
import {
  HankenGrotesk_400Regular,
  HankenGrotesk_400Regular_Italic,
  HankenGrotesk_500Medium,
  HankenGrotesk_500Medium_Italic,
  HankenGrotesk_600SemiBold,
  HankenGrotesk_600SemiBold_Italic,
} from "@expo-google-fonts/hanken-grotesk";
import { useFonts } from "expo-font";

/**
 * The full face map loaded at app boot. Only the weights the design system
 * uses are bundled (display 400-800, body 400-600) to keep the bundle lean.
 */
export const APP_FONT_MAP = {
  // Bricolage Grotesque (display)
  BricolageGrotesque_400Regular,
  BricolageGrotesque_500Medium,
  BricolageGrotesque_600SemiBold,
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
  // Hanken Grotesk (body + mono)
  HankenGrotesk_400Regular,
  HankenGrotesk_400Regular_Italic,
  HankenGrotesk_500Medium,
  HankenGrotesk_500Medium_Italic,
  HankenGrotesk_600SemiBold,
  HankenGrotesk_600SemiBold_Italic,
} as const;

/**
 * Hook that loads the Divvy Up typefaces. Returns `[loaded, error]`.
 */
export function useAppFonts(): readonly [boolean, Error | null] {
  const [loaded, error] = useFonts(APP_FONT_MAP);
  return [loaded, error] as const;
}
