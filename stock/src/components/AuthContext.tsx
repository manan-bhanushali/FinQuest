import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';

export interface Order {
  id: number;
  sym: string;
  side: 'buy' | 'sell';
  qty: number;
  entry: number;
  sl: number;
  tp: number;
  ts: number;
}

interface AuthState {
  user: { name: string; email: string } | null;
  token: string | null;
  isLoading: boolean;
  balance: number;
  orders: Order[];
  login: (token: string, user: { name: string; email: string }) => void;
  logout: () => void;
  placeOrder: (order: { sym: string; side: 'buy' | 'sell'; qty: number; entry: number; sl: number; tp: number }) => Promise<void>;
  portfolioLoading: boolean;
}

const AuthContext = createContext<AuthState>({
  user: null,
  token: null,
  isLoading: true,
  balance: 500000,
  orders: [],
  login: () => {},
  logout: () => {},
  placeOrder: async () => {},
  portfolioLoading: false,
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [balance, setBalance] = useState(500000);
  const [orders, setOrders] = useState<Order[]>([]);
  const [portfolioLoading, setPortfolioLoading] = useState(false);

  const fetchPortfolio = useCallback(async () => {
    try {
      setPortfolioLoading(true);
      const data = await api.get('/portfolio/me');
      setBalance(data.balance);
      setOrders(data.orders || []);
    } catch (e) {
      // silently fail — user may not be logged in yet
    } finally {
      setPortfolioLoading(false);
    }
  }, []);

  useEffect(() => {
    const storedToken = localStorage.getItem('auth_token');
    const storedUserStr = localStorage.getItem('auth_user');
    
    if (storedToken && storedUserStr) {
      try {
        setToken(storedToken);
        setUser(JSON.parse(storedUserStr));
      } catch (e) {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
      }
    }
    setIsLoading(false);
  }, []);

  // Fetch portfolio whenever we have a token
  useEffect(() => {
    if (token) {
      fetchPortfolio();
    } else {
      setBalance(500000);
      setOrders([]);
    }
  }, [token, fetchPortfolio]);

  const login = (newToken: string, newUser: { name: string; email: string }) => {
    localStorage.setItem('auth_token', newToken);
    localStorage.setItem('auth_user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
    toast.success(`Welcome back, ${newUser.name}!`);
  };

  const logout = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    setToken(null);
    setUser(null);
    setBalance(500000);
    setOrders([]);
    toast.info('Logged out successfully');
  };

  const placeOrder = async (orderPayload: { sym: string; side: 'buy' | 'sell'; qty: number; entry: number; sl: number; tp: number }) => {
    const data = await api.post('/portfolio/order', orderPayload);
    setBalance(data.balance);
    setOrders(data.orders || []);
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, balance, orders, login, logout, placeOrder, portfolioLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
