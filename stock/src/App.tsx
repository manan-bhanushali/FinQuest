import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Navbar from "@/components/Navbar";
import HomePage from "./pages/HomePage";
import MarketPage from "./pages/MarketPage";
import PatternsPage from "./pages/PatternsPage";
import NewsPage from "./pages/NewsPage";
import GlobePage from "./pages/GlobePage";
import LearnPage from "./pages/LearnPage";
import NotFound from "./pages/NotFound";
import SignalsPage from "./pages/SignalsPage";
import AuthPage from "./pages/AuthPage";
import { AuthProvider } from "@/components/AuthContext";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <div className="min-h-screen bg-background">
            <Navbar />
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/market" element={<MarketPage />} />
              <Route path="/patterns" element={<PatternsPage />} />
              <Route path="/news" element={<NewsPage />} />
              <Route path="/globe" element={<GlobePage />} /> 
              <Route path="/learn" element={<LearnPage />} />
              <Route path="/signals" element={<SignalsPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </div>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
