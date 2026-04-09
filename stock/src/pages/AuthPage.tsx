import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/components/AuthContext";
import { api } from "@/lib/api";
import { toast } from "sonner";

const AuthPage = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isLogin) {
        const res = await api.post("/auth/login", { email, password });
        login(res.token, res.user);
        navigate("/market");
      } else {
        const res = await api.post("/auth/signup", { name, email, password });
        login(res.token, res.user);
        navigate("/market");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to authenticate");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pt-24 px-4 flex flex-col items-center">
      <div className="w-full max-w-md glass-card p-8 rounded-2xl animate-fade-in relative overflow-hidden">
        {/* Decorative background glow */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -z-10 translate-x-1/2 -translate-y-1/2"></div>
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -z-10 -translate-x-1/2 translate-y-1/2"></div>

        <div className="text-center mb-8">
          <h1 className="font-display text-3xl font-bold text-foreground">
            {isLogin ? "Welcome Back" : "Join "}
            {!isLogin && <span className="neon-text-green">FinQuest</span>}
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            {isLogin ? "Enter your credentials to access your terminal" : "Create an account to start simulating trades"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {!isLogin && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold tracking-wide text-muted-foreground">NAME</label>
              <input 
                type="text" 
                value={name}
                onChange={(e) => setName(e.target.value)}
                required={!isLogin}
                className="bg-card/50 border border-border/50 text-foreground py-2.5 px-4 rounded-xl focus:outline-none focus:border-primary/50 transition-colors"
                placeholder="John Doe"
              />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold tracking-wide text-muted-foreground">EMAIL</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="bg-card/50 border border-border/50 text-foreground py-2.5 px-4 rounded-xl focus:outline-none focus:border-primary/50 transition-colors"
              placeholder="trader@finquest.app"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold tracking-wide text-muted-foreground">PASSWORD</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="bg-card/50 border border-border/50 text-foreground py-2.5 px-4 rounded-xl focus:outline-none focus:border-primary/50 transition-colors"
              placeholder="••••••••"
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="mt-4 bg-primary text-primary-foreground py-3 rounded-xl font-bold tracking-wide hover:shadow-[0_0_20px_rgba(34,197,94,0.3)] transition-all flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? <span className="animate-spin block w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full"></span> : null}
            {isLogin ? "INITIALIZE SESSION" : "CREATE ACCOUNT"}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button 
            onClick={() => { setIsLogin(!isLogin); setName(""); setEmail(""); setPassword(""); }}
            className="text-sm text-muted-foreground hover:text-primary transition-colors cursor-pointer bg-transparent border-none p-0"
          >
            {isLogin ? "Don't have an account? Sign up" : "Already have an account? Log in"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
