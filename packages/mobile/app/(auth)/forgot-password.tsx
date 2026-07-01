import { useState, useCallback } from "react";
import { useRouter } from "expo-router";
import { View } from "@tamagui/core";
import { Screen, Text, Input, Button } from "../../src/ui/components";
import { useAuth } from "../../src/ui/hooks/useAuth";

export default function ForgotPassword() {
  const router = useRouter();
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    setError(null);
    setNotice(null);
    if (!email.trim()) {
      setError("Please enter your email");
      return;
    }
    setIsLoading(true);
    try {
      await resetPassword(email);
      setNotice("If that email exists, a reset link is on its way.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setIsLoading(false);
    }
  }, [email, resetPassword]);

  return (
    <Screen padded centered>
      <View gap="$base" width="100%" maxWidth={400}>
        <Text variant="h1" align="center">
          Reset password
        </Text>
        <Input
          label="Email"
          placeholder="you@example.com"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          error={error ?? undefined}
          helperText={notice ?? undefined}
          testID="forgot-email"
        />
        <Button
          label="Send reset link"
          onPress={handleSubmit}
          isLoading={isLoading}
          fullWidth
          testID="forgot-submit"
        />
        <Button
          label="Back to sign in"
          variant="ghost"
          onPress={() => router.push("/(auth)/sign-in")}
          fullWidth
        />
      </View>
    </Screen>
  );
}
