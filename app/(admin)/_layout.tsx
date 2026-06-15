import { Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LogoutButton } from '../../components/LogoutButton';

export default function AdminLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: '#fff' },
        headerShadowVisible: false,
        headerTintColor: '#1a1a2e',
        headerTitleStyle: { fontWeight: '700', color: '#1a1a2e' },
        headerRight: () => <LogoutButton />,
        tabBarStyle: Platform.OS === 'web' ? { paddingBottom: 10, height: 62 } : undefined,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'დეშბორდი',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="grid-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="visits"
        options={{
          title: 'ვიზიტები',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="list-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="manage"
        options={{
          title: 'მართვა',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
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
      <Tabs.Screen
        name="shop/[id]"
        options={{ href: null }}
      />
    </Tabs>
  );
}
