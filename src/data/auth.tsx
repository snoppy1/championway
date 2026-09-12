import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api, post } from '../lib/api';

export type Account = {
  id: string;
  email: string;
  name: string;
  role: 'member' | 'reviewer' | 'admin';
  avatarUrl: string | null;
};

type AuthState = {
  user: Account | null;
  /** ระหว่างที่ยังไม่รู้ว่าล็อกอินอยู่หรือไม่ อย่าเพิ่งตัดสินใจแทนผู้ใช้ */
  loading: boolean;
  googleEnabled: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [googleEnabled, setGoogleEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [me, providers] = await Promise.all([
          api<{ user: Account | null }>('/auth/me'),
          api<{ google: boolean }>('/auth/providers'),
        ]);
        if (cancelled) return;
        setUser(me.user);
        setGoogleEnabled(providers.google);
      } catch {
        // ไม่มีเซิร์ฟเวอร์ก็ยังเปิดหน้าเว็บได้ แค่ถือว่ายังไม่ได้ล็อกอิน
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { user: account } = await post<{ user: Account }>('/auth/login', { email, password });
    setUser(account);
  }, []);

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    const { user: account } = await post<{ user: Account }>('/auth/signup', { name, email, password });
    setUser(account);
  }, []);

  const signOut = useCallback(async () => {
    await post('/auth/logout', {});
    setUser(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, loading, googleEnabled, signIn, signUp, signOut }),
    [user, loading, googleEnabled, signIn, signUp, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth ต้องอยู่ภายใน AuthProvider');
  return value;
}

export function isReviewer(user: Account | null) {
  return user?.role === 'reviewer' || user?.role === 'admin';
}
