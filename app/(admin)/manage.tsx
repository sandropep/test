import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, RefreshControl, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';

interface Shop { id: string; shop_number: string; name: string; location: string | null }
interface Checker { id: string; full_name: string; email: string }

export default function ManagePage() {
  const [tab, setTab] = useState<'shops' | 'checkers'>('shops');

  // ── Shops ──
  const [shops, setShops] = useState<Shop[]>([]);
  const [shopsLoading, setShopsLoading] = useState(true);
  const [shopsRefreshing, setShopsRefreshing] = useState(false);
  const [shopNumber, setShopNumber] = useState('');
  const [shopName, setShopName] = useState('');
  const [shopLocation, setShopLocation] = useState('');
  const [shopSaving, setShopSaving] = useState(false);
  const [deletingShop, setDeletingShop] = useState<string | null>(null);

  // ── Checkers ──
  const [checkers, setCheckers] = useState<Checker[]>([]);
  const [checkersLoading, setCheckersLoading] = useState(true);
  const [checkerName, setCheckerName] = useState('');
  const [checkerEmail, setCheckerEmail] = useState('');
  const [checkerPassword, setCheckerPassword] = useState('');
  const [checkerSaving, setCheckerSaving] = useState(false);

  const loadShops = useCallback(async () => {
    const { data } = await supabase
      .from('shops').select('id, shop_number, name, location').order('shop_number');
    setShops(data ?? []);
  }, []);

  const loadCheckers = useCallback(async () => {
    const { data } = await supabase
      .from('users').select('id, full_name, email').eq('role', 'checker').order('full_name');
    setCheckers((data ?? []) as Checker[]);
  }, []);

  useEffect(() => {
    loadShops().finally(() => setShopsLoading(false));
    loadCheckers().finally(() => setCheckersLoading(false));
  }, []);

  async function handleAddShop() {
    if (!shopNumber.trim() || !shopName.trim()) {
      if (Platform.OS === 'web') window.alert('ნომერი და სახელი სავალდებულოა');
      else Alert.alert('შეცდომა', 'ნომერი და სახელი სავალდებულოა');
      return;
    }
    setShopSaving(true);
    const { error } = await supabase.from('shops').insert({
      shop_number: shopNumber.trim(),
      name: shopName.trim(),
      location: shopLocation.trim() || null,
    });
    if (error) {
      if (Platform.OS === 'web') window.alert(error.message);
      else Alert.alert('შეცდომა', error.message);
    } else {
      setShopNumber(''); setShopName(''); setShopLocation('');
      await loadShops();
    }
    setShopSaving(false);
  }

  async function handleDeleteShop(shop: Shop) {
    const doDelete = async () => {
      setDeletingShop(shop.id);
      const { error } = await supabase.from('shops').delete().eq('id', shop.id);
      if (error) {
        if (Platform.OS === 'web') window.alert(error.message);
        else Alert.alert('შეცდომა', error.message);
      } else {
        setShops(prev => prev.filter(s => s.id !== shop.id));
      }
      setDeletingShop(null);
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`წაიშალოს #${shop.shop_number} — ${shop.name}?`)) doDelete();
    } else {
      Alert.alert('მაღაზიის წაშლა', `#${shop.shop_number} — ${shop.name}`, [
        { text: 'გაუქმება', style: 'cancel' },
        { text: 'წაშლა', style: 'destructive', onPress: doDelete },
      ]);
    }
  }

  async function handleAddChecker() {
    if (!checkerName.trim() || !checkerEmail.trim() || !checkerPassword.trim()) {
      if (Platform.OS === 'web') window.alert('ყველა ველი სავალდებულოა');
      else Alert.alert('შეცდომა', 'ყველა ველი სავალდებულოა');
      return;
    }
    if (checkerPassword.length < 6) {
      if (Platform.OS === 'web') window.alert('პაროლი მინიმუმ 6 სიმბოლო');
      else Alert.alert('შეცდომა', 'პაროლი მინიმუმ 6 სიმბოლო');
      return;
    }
    setCheckerSaving(true);

    // Save admin session — signUp auto-signs-in the new user, replacing it
    const { data: { session: adminSession } } = await supabase.auth.getSession();

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: checkerEmail.trim(),
      password: checkerPassword,
    });

    // Restore admin session immediately regardless of outcome
    if (adminSession) {
      await supabase.auth.setSession({
        access_token: adminSession.access_token,
        refresh_token: adminSession.refresh_token,
      });
    }

    if (authError) {
      if (Platform.OS === 'web') window.alert(authError.message);
      else Alert.alert('შეცდომა', authError.message);
      setCheckerSaving(false);
      return;
    }

    const userId = authData.user?.id;
    if (userId) {
      const { error: upsertError } = await supabase.from('users').upsert({
        id: userId,
        full_name: checkerName.trim(),
        email: checkerEmail.trim(),
        role: 'checker',
      }, { onConflict: 'id' });

      if (upsertError) {
        await supabase.from('users').update({
          full_name: checkerName.trim(),
          email: checkerEmail.trim(),
          role: 'checker',
        }).eq('id', userId);
      }
    }
    setCheckerName(''); setCheckerEmail(''); setCheckerPassword('');
    await loadCheckers();
    if (Platform.OS === 'web') window.alert('ჩეკერი დამატებულია');
    else Alert.alert('წარმატება', 'ჩეკერი დამატებულია');
    setCheckerSaving(false);
  }

  return (
    <View style={styles.container}>
      {/* Tab toggle */}
      <View style={styles.tabBar}>
        <View style={styles.tabToggle}>
          <TouchableOpacity
            style={[styles.tabBtn, tab === 'shops' && styles.tabBtnActive]}
            onPress={() => setTab('shops')}
          >
            <Ionicons name="storefront-outline" size={15} color={tab === 'shops' ? '#2563eb' : '#888'} />
            <Text style={[styles.tabBtnText, tab === 'shops' && styles.tabBtnTextActive]}>მაღაზიები</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, tab === 'checkers' && styles.tabBtnActive]}
            onPress={() => setTab('checkers')}
          >
            <Ionicons name="people-outline" size={15} color={tab === 'checkers' ? '#2563eb' : '#888'} />
            <Text style={[styles.tabBtnText, tab === 'checkers' && styles.tabBtnTextActive]}>ჩეკერები</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Shops ── */}
      {tab === 'shops' && (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={shopsRefreshing} onRefresh={async () => { setShopsRefreshing(true); await loadShops(); setShopsRefreshing(false); }} />}
        >
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>მაღაზიის დამატება</Text>
            <TextInput
              style={styles.input}
              value={shopNumber}
              onChangeText={setShopNumber}
              placeholder="მაღაზიის ნომერი *"
              placeholderTextColor="#aaa"
              keyboardType="numeric"
            />
            <TextInput
              style={styles.input}
              value={shopName}
              onChangeText={setShopName}
              placeholder="სახელი *"
              placeholderTextColor="#aaa"
            />
            <TextInput
              style={styles.input}
              value={shopLocation}
              onChangeText={setShopLocation}
              placeholder="მისამართი (სურვილისამებრ)"
              placeholderTextColor="#aaa"
            />
            <TouchableOpacity style={styles.addBtn} onPress={handleAddShop} disabled={shopSaving}>
              {shopSaving
                ? <ActivityIndicator color="#fff" />
                : <><Ionicons name="add" size={18} color="#fff" /><Text style={styles.addBtnText}>დამატება</Text></>
              }
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionTitle}>{shops.length} მაღაზია</Text>
          {shopsLoading
            ? <ActivityIndicator color="#2563eb" style={{ marginTop: 24 }} />
            : shops.map(shop => (
              <View key={shop.id} style={styles.listRow}>
                <View style={styles.listLeft}>
                  <Text style={styles.listPrimary}>#{shop.shop_number} — {shop.name}</Text>
                  {shop.location && <Text style={styles.listSub}>{shop.location}</Text>}
                </View>
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => handleDeleteShop(shop)}
                  disabled={deletingShop === shop.id}
                >
                  {deletingShop === shop.id
                    ? <ActivityIndicator size="small" color="#dc2626" />
                    : <Ionicons name="trash-outline" size={18} color="#dc2626" />
                  }
                </TouchableOpacity>
              </View>
            ))
          }
        </ScrollView>
      )}

      {/* ── Checkers ── */}
      {tab === 'checkers' && (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>ჩეკერის დამატება</Text>
            <TextInput
              style={styles.input}
              value={checkerName}
              onChangeText={setCheckerName}
              placeholder="სრული სახელი *"
              placeholderTextColor="#aaa"
            />
            <TextInput
              style={styles.input}
              value={checkerEmail}
              onChangeText={setCheckerEmail}
              placeholder="ელ-ფოსტა *"
              placeholderTextColor="#aaa"
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <TextInput
              style={styles.input}
              value={checkerPassword}
              onChangeText={setCheckerPassword}
              placeholder="პაროლი (მინ. 6 სიმბოლო) *"
              placeholderTextColor="#aaa"
              secureTextEntry
            />
            <TouchableOpacity style={styles.addBtn} onPress={handleAddChecker} disabled={checkerSaving}>
              {checkerSaving
                ? <ActivityIndicator color="#fff" />
                : <><Ionicons name="add" size={18} color="#fff" /><Text style={styles.addBtnText}>დამატება</Text></>
              }
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionTitle}>{checkers.length} ჩეკერი</Text>
          {checkersLoading
            ? <ActivityIndicator color="#2563eb" style={{ marginTop: 24 }} />
            : checkers.map(c => (
              <View key={c.id} style={styles.listRow}>
                <View style={[styles.listAvatar]}>
                  <Text style={styles.listAvatarText}>{(c.full_name || '?').slice(0, 2).toUpperCase()}</Text>
                </View>
                <View style={styles.listLeft}>
                  <Text style={styles.listPrimary}>{c.full_name || '—'}</Text>
                  <Text style={styles.listSub}>{c.email}</Text>
                </View>
              </View>
            ))
          }
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },

  tabBar: {
    backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderColor: '#eee',
  },
  tabToggle: {
    flexDirection: 'row', backgroundColor: '#f0f2f5',
    borderRadius: 10, padding: 3,
  },
  tabBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 8, borderRadius: 8,
  },
  tabBtnActive: {
    backgroundColor: '#fff',
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
  },
  tabBtnText: { fontSize: 14, fontWeight: '600', color: '#888' },
  tabBtnTextActive: { color: '#2563eb', fontWeight: '700' },

  content: { padding: 16, paddingBottom: 48 },

  formCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 24,
  },
  formTitle: {
    fontSize: 14, fontWeight: '700', color: '#1a1a2e', marginBottom: 14,
  },
  input: {
    backgroundColor: '#f0f2f5', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: '#1a1a2e',
    borderWidth: 1, borderColor: '#e0e0e0', marginBottom: 10,
  },
  addBtn: {
    backgroundColor: '#2563eb', borderRadius: 10,
    paddingVertical: 12, flexDirection: 'row',
    justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 4,
  },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: '#888',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10,
  },

  listRow: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  listAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#2563eb', alignItems: 'center', justifyContent: 'center',
  },
  listAvatarText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  listLeft: { flex: 1 },
  listPrimary: { fontSize: 14, fontWeight: '700', color: '#1a1a2e', marginBottom: 2 },
  listSub: { fontSize: 12, color: '#888' },
  deleteBtn: { padding: 6 },
});
