import { useState, useCallback } from "react";
import { useRouter } from "expo-router";
import { View } from "@tamagui/core";
import { Screen, Text, Input, Button } from "../../src/ui/components";
import { useAuth } from "../../src/ui/hooks/useAuth";

export default function SignUp() {
  const router = useRouter();
  const { signUp } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    setError(null);
    setNotice(null);
    if (!email.trim() || !password.trim()) {
      setError("Please enter email and password");
      return;
    }
    setIsLoading(true);
    try {
      const { confirmationRequired } = await signUp(email, password);
      if (confirmationRequired) {
        setNotice("Check your email to confirm your account.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed");
    } finally {
      setIsLoading(false);
    }
  }, [email, password, signUp]);

  return (
    <Screen padded centered>
      <View gap="$base" width="100%" maxWidth={400}>
        <Text variant="h1" align="center">
          Create account
        </Text>
        <Input
          label="Email"
          placeholder="you@example.com"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          testID="sign-up-email"
        />
        <Input
          label="Password"
          placeholder="••••••••"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          error={error ?? undefined}
          helperText={notice ?? undefined}
          testID="sign-up-password"
        />
        <Button
          label="Sign up"
          onPress={handleSubmit}
          isLoading={isLoading}
          fullWidth
          testID="sign-up-submit"
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
