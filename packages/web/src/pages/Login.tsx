import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { IconReceipt } from "@tabler/icons-react";

const Login = () => {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-background px-4">
      {/* Brand mark */}
      <div className="mb-8 flex flex-col items-center gap-3">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-primary-gradient">
          <IconReceipt className="size-7 text-white" strokeWidth={1.6} />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Divvy Up</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Split expenses, not friendships.
          </p>
        </div>
      </div>

      {/* Login form */}
      <Card className="w-full max-w-sm">
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Enter your password"
              autoComplete="current-password"
            />
          </div>
          <Button className="w-full" size="lg">
            Sign in
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Don&apos;t have an account?{" "}
            <span className="cursor-pointer font-medium text-primary underline-offset-4 hover:underline">
              Sign up
            </span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;
