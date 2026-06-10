import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { supabase } from '../lib/supabase';
import type { Session } from '@supabase/supabase-js';

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        setSession(null);
        setRole(null);
        router.replace('/(auth)/login');
        return;
      }
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session?.user) {
      supabase
        .from('users')
        .select('role')
        .eq('id', session.user.id)
        .single()
        .then(({ data }) => {
          setRole(data?.role ?? null);
          setReady(true);
        });
    } else {
      setRole(null);
      setReady(true);
    }
  }, [session]);

  useEffect(() => {
    if (!ready) return;

    const inAuth = segments[0] === '(auth)';

    if (!session && !inAuth) {
      router.replace('/(auth)/login');
    } else if (session && inAuth) {
      if (role === 'admin') {
        router.replace('/(admin)');
      } else {
        router.replace('/(checker)');
      }
    }
  }, [ready, session, role, segments]);

  return (
    <Stack screenOptions={{ headerShown: false }} />
  );
}
