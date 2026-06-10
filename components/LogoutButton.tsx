import { TouchableOpacity, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

export function LogoutButton() {
  function handleLogout() {
    if (Platform.OS === 'web') {
      if (window.confirm('დარწმუნებული ხართ?')) {
        supabase.auth.signOut();
      }
      return;
    }
    Alert.alert('გასვლა', 'დარწმუნებული ხართ?', [
      { text: 'გაუქმება', style: 'cancel' },
      { text: 'გასვლა', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ]);
  }

  return (
    <TouchableOpacity onPress={handleLogout} style={{ marginRight: 16 }}>
      <Ionicons name="log-out-outline" size={24} color="#2563eb" />
    </TouchableOpacity>
  );
}
