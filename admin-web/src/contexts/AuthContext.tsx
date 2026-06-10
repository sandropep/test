import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthContextType {
  session: Session | null;
  role: string | null;
  fullName: string | null;
  email: string | null;
  ready: boolean;
}

const AuthContext = createContext<AuthContextType>({ session: null, role: null, fullName: null, email: null, ready: false });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session?.user) {
      supabase
        .from('users')
        .select('role, full_name, email')
        .eq('id', session.user.id)
        .single()
        .then(({ data }) => {
          setRole(data?.role ?? null);
          setFullName(data?.full_name ?? null);
          setEmail(data?.email ?? session.user?.email ?? null);
          setReady(true);
        });
    } else {
      setRole(null);
      setFullName(null);
      setEmail(null);
      setReady(true);
    }
  }, [session]);

  return (
    <AuthContext.Provider value={{ session, role, fullName, email, ready }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
