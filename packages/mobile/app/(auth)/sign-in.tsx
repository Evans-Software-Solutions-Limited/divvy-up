import { useState, useCallback } from "react";
import { useRouter } from "expo-router";
import { View } from "@tamagui/core";
import { Screen, Text, Input, Button } from "../../src/ui/components";
import { useAuth } from "../../src/ui/hooks/useAuth";

export default function SignIn() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    setError(null);
    if (!email.trim() || !password.trim()) {
      setError("Please enter email and password");
      return;
    }
    setIsLoading(true);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setIsLoading(false);
    }
  }, [email, password, signIn]);

  return (
    <Screen padded centered>
      <View gap="$base" width="100%" maxWidth={400}>
        <Text variant="h1" align="center">
          Divvy Up
        </Text>
        <Input
          label="Email"
          placeholder="you@example.com"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          testID="sign-in-email"
        />
        <Input
          label="Password"
          placeholder="••••••••"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          error={error ?? undefined}
          testID="sign-in-password"
        />
        <Button
          label="Sign in"
          onPress={handleSubmit}
          isLoading={isLoading}
          fullWidth
          testID="sign-in-submit"
        />
        <Button
          label="Forgot password?"
          variant="ghost"
          onPress={() => router.push("/(auth)/forgot-password")}
          fullWidth
        />
        <Button
          label="Create an account"
          variant="ghost"
          onPress={() => router.push("/(auth)/sign-up")}
          fullWidth
        />
      </View>
    </Screen>
  );
}
