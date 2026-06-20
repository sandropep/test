import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, RefreshControl, Platform,
  Modal, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { toCheckerEmail } from '../../lib/checkerEmail';

interface Shop { id: string; shop_number: string; name: string; location: string | null }
interface Checker { id: string; full_name: string }

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
  const [chainPickerVisible, setChainPickerVisible] = useState(false);
  const [customChainMode, setCustomChainMode] = useState(false);
  const [shopSearch, setShopSearch] = useState('');
  const [shopChainFilter, setShopChainFilter] = useState<string | null>(null);

  // ── Checkers ──
  const [checkers, setCheckers] = useState<Checker[]>([]);
  const [checkersLoading, setCheckersLoading] = useState(true);
  const [checkerName, setCheckerName] = useState('');
  const [checkerPassword, setCheckerPassword] = useState('');
  const [checkerSaving, setCheckerSaving] = useState(false);
  const [deletingChecker, setDeletingChecker] = useState<string | null>(null);

  const shopChains = useMemo(
    () => Array.from(new Set(shops.map(s => s.name).filter(Boolean))).sort(),
    [shops]
  );

  const filteredShops = useMemo(() => {
    let list = shops;
    if (shopChainFilter) list = list.filter(s => s.name === shopChainFilter);
    const q = shopSearch.trim().toLowerCase();
    if (q) list = list.filter(s =>
      s.shop_number.toLowerCase().includes(q) ||
      (s.location ?? '').toLowerCase().includes(q)
    );
    return list;
  }, [shops, shopChainFilter, shopSearch]);

  const loadShops = useCallback(async () => {
    const { data } = await supabase
      .from('shops').select('id, shop_number, name, location').order('shop_number');
    setShops(data ?? []);
  }, []);

  const loadCheckers = useCallback(async () => {
    const { data } = await supabase
      .from('users').select('id, full_name').eq('role', 'checker').order('full_name');
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
      setShopNumber(''); setShopName(''); setShopLocation(''); setCustomChainMode(false);
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
    if (!checkerName.trim() || !checkerPassword.trim()) {
      if (Platform.OS === 'web') window.alert('სახელი და პაროლი სავალდებულოა');
      else Alert.alert('შეცდომა', 'სახელი და პაროლი სავალდებულოა');
      return;
    }
    if (checkerPassword.length < 6) {
      if (Platform.OS === 'web') window.alert('პაროლი მინიმუმ 6 სიმბოლო');
      else Alert.alert('შეცდომა', 'პაროლი მინიმუმ 6 სიმბოლო');
      return;
    }
    setCheckerSaving(true);

    const generatedEmail = toCheckerEmail(checkerName);

    // Save admin session — signUp auto-signs-in the new user, replacing it
    const { data: { session: adminSession } } = await supabase.auth.getSession();

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: generatedEmail,
      password: checkerPassword,
    });

    // Restore admin session — signUp auto-signs-in the new user so we must restore
    if (adminSession) {
      const { error: restoreError } = await supabase.auth.setSession({
        access_token: adminSession.access_token,
        refresh_token: adminSession.refresh_token,
      });
      if (restoreError) {
        await supabase.auth.signOut();
        if (Platform.OS === 'web') window.alert('ჩეკერი შეიქმნა, მაგრამ სესია გათიშა — გთხოვთ შეხვიდეთ ხელახლა');
        else Alert.alert('გაფრთხილება', 'ჩეკერი შეიქმნა, მაგრამ სესია გათიშა — გთხოვთ შეხვიდეთ ხელახლა');
        setCheckerSaving(false);
        return;
      }
    }

    if (authError) {
      if (Platform.OS === 'web') window.alert(authError.message);
      else Alert.alert('შეცდომა', authError.message);
      setCheckerSaving(false);
      return;
    }

    const userId = authData.user?.id;
    if (userId) {
      const payload = { id: userId, full_name: checkerName.trim(), email: generatedEmail, role: 'checker' };
      const { error: upsertError } = await supabase.from('users').upsert(payload, { onConflict: 'id' });
      if (upsertError) {
        console.error('[AddChecker] upsert failed, trying update:', upsertError);
        const { error: updateError } = await supabase.from('users').update(payload).eq('id', userId);
        if (updateError) {
          console.error('[AddChecker] update also failed:', updateError);
          if (Platform.OS === 'web') window.alert(`ჩეკერი შეიქმნა, მაგრამ მონაცემები ვერ შეინახა: ${updateError.message}`);
          else Alert.alert('გაფრთხილება', `ჩეკერი შეიქმნა, მაგრამ მონაცემები ვერ შეინახა: ${updateError.message}`);
        }
      }
    }
    setCheckerName(''); setCheckerPassword('');
    await loadCheckers();
    if (Platform.OS === 'web') window.alert('ჩეკერი დამატებულია');
    else Alert.alert('წარმატება', 'ჩეკერი დამატებულია');
    setCheckerSaving(false);
  }

  async function handleDeleteChecker(checker: Checker) {
    const doDelete = async () => {
      setDeletingChecker(checker.id);
      const { error } = await supabase.from('users').delete().eq('id', checker.id);
      if (error) {
        console.error('[DeleteChecker] error:', error);
        if (Platform.OS === 'web') window.alert(error.message);
        else Alert.alert('შეცდომა', error.message);
      } else {
        setCheckers(prev => prev.filter(c => c.id !== checker.id));
      }
      setDeletingChecker(null);
    };
    const msg = checker.full_name;
    if (Platform.OS === 'web') {
      if (window.confirm(`წაიშალოს ჩეკერი?\n${msg}`)) doDelete();
    } else {
      Alert.alert('ჩეკერის წაშლა', msg, [
        { text: 'გაუქმება', style: 'cancel' },
        { text: 'წაშლა', style: 'destructive', onPress: doDelete },
      ]);
    }
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
            {customChainMode ? (
              <View style={styles.customChainRow}>
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  value={shopName}
                  onChangeText={setShopName}
                  placeholder="ქსელის სახელი *"
                  placeholderTextColor="#aaa"
                  autoFocus
                />
                <TouchableOpacity
                  style={styles.customChainBack}
                  onPress={() => { setCustomChainMode(false); setShopName(''); }}
                >
                  <Ionicons name="close" size={18} color="#888" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.chainDropdown}
                onPress={() => setChainPickerVisible(true)}
                activeOpacity={0.7}
              >
                <Text style={shopName ? styles.chainDropdownValue : styles.chainDropdownPlaceholder}>
                  {shopName || 'ქსელი *'}
                </Text>
                <Ionicons name="chevron-down" size={16} color="#aaa" />
              </TouchableOpacity>
            )}

            <Modal visible={chainPickerVisible} transparent animationType="fade">
              <Pressable style={styles.modalOverlay} onPress={() => setChainPickerVisible(false)}>
                <Pressable style={styles.modalSheet}>
                  <Text style={styles.modalTitle}>ქსელის არჩევა</Text>
                  <ScrollView style={{ maxHeight: 320 }}>
                    {shopChains.map(c => (
                      <TouchableOpacity
                        key={c}
                        style={[styles.modalRow, shopName === c && styles.modalRowActive]}
                        onPress={() => { setShopName(c); setChainPickerVisible(false); }}
                      >
                        <Text style={styles.modalRowText}>{c}</Text>
                        {shopName === c && <Ionicons name="checkmark" size={18} color="#2563eb" />}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <TouchableOpacity
                    style={styles.modalNewChain}
                    onPress={() => { setChainPickerVisible(false); setCustomChainMode(true); setShopName(''); }}
                  >
                    <Ionicons name="add-circle-outline" size={16} color="#2563eb" />
                    <Text style={styles.modalNewChainText}>ახალი ქსელის დამატება</Text>
                  </TouchableOpacity>
                </Pressable>
              </Pressable>
            </Modal>
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

          {/* Search + chain filter */}
          <View style={styles.searchBar}>
            <Ionicons name="search-outline" size={15} color="#aaa" />
            <TextInput
              style={styles.searchInput}
              value={shopSearch}
              onChangeText={setShopSearch}
              placeholder="ID ან მისამართი..."
              placeholderTextColor="#aaa"
              autoCorrect={false}
              autoCapitalize="none"
            />
            {shopSearch.length > 0 && (
              <TouchableOpacity onPress={() => setShopSearch('')}>
                <Ionicons name="close-circle" size={16} color="#bbb" />
              </TouchableOpacity>
            )}
          </View>

          {shopChains.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.pillsScroll}
              contentContainerStyle={styles.pillsContent}
              keyboardShouldPersistTaps="always"
            >
              <TouchableOpacity
                style={[styles.pill, !shopChainFilter && styles.pillActive]}
                onPress={() => setShopChainFilter(null)}
              >
                <Text style={[styles.pillText, !shopChainFilter && styles.pillTextActive]}>ყველა</Text>
              </TouchableOpacity>
              {shopChains.map(c => (
                <TouchableOpacity
                  key={c}
                  style={[styles.pill, shopChainFilter === c && styles.pillActive]}
                  onPress={() => setShopChainFilter(prev => prev === c ? null : c)}
                >
                  <Text style={[styles.pillText, shopChainFilter === c && styles.pillTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          <Text style={styles.sectionTitle}>
            {filteredShops.length}{filteredShops.length !== shops.length ? `/${shops.length}` : ''} მაღაზია
          </Text>
          {shopsLoading
            ? <ActivityIndicator color="#2563eb" style={{ marginTop: 24 }} />
            : filteredShops.map(shop => (
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
              placeholder="სახელი (შესვლისთვის) *"
              placeholderTextColor="#aaa"
              autoCapitalize="none"
              autoCorrect={false}
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
                <View style={styles.listAvatar}>
                  <Text style={styles.listAvatarText}>{(c.full_name || '?').slice(0, 2).toUpperCase()}</Text>
                </View>
                <View style={styles.listLeft}>
                  <Text style={styles.listPrimary}>{c.full_name || '—'}</Text>
                </View>
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => handleDeleteChecker(c)}
                  disabled={deletingChecker === c.id}
                >
                  {deletingChecker === c.id
                    ? <ActivityIndicator size="small" color="#dc2626" />
                    : <Ionicons name="trash-outline" size={18} color="#dc2626" />
                  }
                </TouchableOpacity>
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
  chainDropdown: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#f0f2f5', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 11,
    borderWidth: 1, borderColor: '#e0e0e0', marginBottom: 10,
  },
  chainDropdownValue: { fontSize: 14, color: '#1a1a2e' },
  chainDropdownPlaceholder: { fontSize: 14, color: '#aaa' },

  customChainRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  customChainBack: {
    padding: 10, backgroundColor: '#f0f2f5', borderRadius: 10,
    borderWidth: 1, borderColor: '#e0e0e0',
  },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  modalSheet: {
    backgroundColor: '#fff', borderRadius: 16,
    width: '100%', maxWidth: 360,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 12, elevation: 8,
    overflow: 'hidden',
  },
  modalTitle: {
    fontSize: 13, fontWeight: '700', color: '#888',
    textTransform: 'uppercase', letterSpacing: 0.6,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderColor: '#f0f0f0',
  },
  modalRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderColor: '#f5f5f5',
  },
  modalRowActive: { backgroundColor: '#eff6ff' },
  modalRowText: { fontSize: 15, color: '#1a1a2e', fontWeight: '500' },
  modalNewChain: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 14,
    borderTopWidth: 1, borderColor: '#f0f0f0',
  },
  modalNewChainText: { fontSize: 14, color: '#2563eb', fontWeight: '700' },

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

  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fff', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1.5, borderColor: '#e0e0e0',
    marginBottom: 8,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#1a1a2e' },

  pillsScroll: { marginBottom: 10 },
  pillsContent: { gap: 6, paddingRight: 4, flexDirection: 'row' },
  pill: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    backgroundColor: '#f0f2f5', borderWidth: 1.5, borderColor: 'transparent',
  },
  pillActive: { backgroundColor: '#eff6ff', borderColor: '#2563eb' },
  pillText: { fontSize: 12, fontWeight: '600', color: '#888' },
  pillTextActive: { color: '#2563eb' },
});
