import { Routes, Route } from "react-router";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Balances from "./pages/Balances";
import { ReceiptReview } from "./pages/ReceiptReview";
import { AppLayout } from "./components/app-layout";
import { ThemeProvider } from "./components/theme-provider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <Routes>
          {/* App shell with bottom nav */}
          <Route element={<AppLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/balances" element={<Balances />} />
            <Route path="/receipts/:id/review" element={<ReceiptReview />} />
          </Route>

          {/* Full-screen routes (no nav) */}
          <Route path="/login" element={<Login />} />
        </Routes>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
