import { useEffect } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { LogoutButton } from '../../components/LogoutButton';

export default function CheckerLayout() {
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          if (data?.role === 'admin') router.replace('/(admin)');
        });
    });
  }, []);

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: '#fff' },
        headerShadowVisible: false,
        headerTintColor: '#1a1a2e',
        headerTitleStyle: { fontWeight: '700', color: '#1a1a2e' },
        headerRight: () => <LogoutButton />,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'მთავარი',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="new-visit"
        options={{
          title: 'ახალი ვიზიტი',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="add-circle-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: 'სტატისტიკა',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="stats-chart-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="visit/[id]"
        options={{
          href: null,
          title: 'ვიზიტი',
          tabBarStyle: { display: 'none' },
        }}
      />
    </Tabs>
  );
}
