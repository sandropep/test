import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Platform, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';

const CATEGORY_COLORS: Record<string, string> = {
  A: '#16a34a', B: '#2563eb', C: '#d97706', D: '#dc2626',
};

interface PendingVisit {
  id: string;
  date: string;
  score_percent: number;
  category: string;
  shops: { shop_number: string; name: string; location: string | null } | null;
  checker: { full_name: string } | null;
}

interface CheckerRow {
  id: string;
  full_name: string;
  visitCount: number;
  avgScore: number | null;
  avgCategory: string | null;
}

const fmt = (d: Date) => d.toISOString().split('T')[0];
const startOfMonth = () => new Date(new Date().getFullYear(), new Date().getMonth(), 1);
function startOfWeek() {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(d);
  mon.setDate(d.getDate() + diff);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

export default function AdminDashboard() {
  const router = useRouter();

  const [pending, setPending] = useState<PendingVisit[]>([]);
  const [todayCount, setTodayCount] = useState(0);
  const [monthShopCount, setMonthShopCount] = useState(0);
  const [totalShops, setTotalShops] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [checkerActivity, setCheckerActivity] = useState<CheckerRow[]>([]);

  const load = useCallback(async () => {
    const todayStr = fmt(new Date());
    const monthStart = fmt(startOfMonth());
    const weekStart = fmt(startOfWeek());

    const [pendingRes, todayRes, monthRes, shopsRes, checkersRes, weekVisitsRes] = await Promise.all([
      supabase
        .from('visits')
        .select('id, date, score_percent, category, shops(shop_number, name, location), checker:checker_id(full_name)')
        .eq('status', 'pending')
        .order('date', { ascending: false })
        .limit(50),
      supabase
        .from('visits')
        .select('id', { count: 'exact', head: true })
        .eq('date', todayStr),
      supabase
        .from('visits')
        .select('shop_id')
        .gte('date', monthStart)
        .lte('date', todayStr)
        .neq('status', 'rejected'),
      supabase
        .from('shops')
        .select('id', { count: 'exact', head: true }),
      supabase
        .from('users')
        .select('id, full_name')
        .eq('role', 'checker')
        .order('full_name'),
      supabase
        .from('visits')
        .select('checker_id, score_percent, category')
        .gte('date', weekStart)
        .lte('date', todayStr)
        .neq('status', 'rejected'),
    ]);

    setPending((pendingRes.data ?? []) as PendingVisit[]);
    setTodayCount(todayRes.count ?? 0);
    setMonthShopCount(new Set((monthRes.data ?? []).map((v: any) => v.shop_id)).size);
    setTotalShops(shopsRes.count ?? 0);

    // Build checker activity rows
    const weekVisits = weekVisitsRes.data ?? [];
    const byChecker: Record<string, { scores: number[]; categories: string[] }> = {};
    weekVisits.forEach((v: any) => {
      if (!byChecker[v.checker_id]) byChecker[v.checker_id] = { scores: [], categories: [] };
      if (v.score_percent != null) byChecker[v.checker_id].scores.push(v.score_percent);
      if (v.category) byChecker[v.checker_id].categories.push(v.category);
    });

    const rows: CheckerRow[] = (checkersRes.data ?? []).map((c: any) => {
      const entry = byChecker[c.id];
      const scores = entry?.scores ?? [];
      const avgScore = scores.length > 0 ? Math.round(scores.reduce((s, n) => s + n, 0) / scores.length) : null;
      const avgCategory = avgScore == null ? null
        : avgScore >= 90 ? 'A' : avgScore >= 75 ? 'B' : avgScore >= 60 ? 'C' : 'D';
      return { id: c.id, full_name: c.full_name || '—', visitCount: entry ? scores.length : 0, avgScore, avgCategory };
    });

    rows.sort((a, b) => b.visitCount - a.visitCount);
    setCheckerActivity(rows);
  }, []);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  async function handleApprove(visitId: string) {
    setApprovingId(visitId);
    const { error } = await supabase
      .from('visits')
      .update({ status: 'approved', rejection_note: null })
      .eq('id', visitId);

    if (error) {
      if (Platform.OS === 'web') window.alert(error.message);
      else Alert.alert('შეცდომა', error.message);
    } else {
      setPending(prev => prev.filter(v => v.id !== visitId));
    }
    setApprovingId(null);
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  const hasPending = pending.length > 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* ── Stat cards ── */}
      <View style={styles.statRow}>
        <View style={[styles.statCard, hasPending && styles.statCardUrgent]}>
          <Text style={[styles.statValue, hasPending && { color: '#d97706' }]}>
            {pending.length}
          </Text>
          <Text style={styles.statLabel}>განსახილველი</Text>
          {hasPending && (
            <View style={styles.statDot} />
          )}
        </View>

        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: '#2563eb' }]}>{todayCount}</Text>
          <Text style={styles.statLabel}>დღეს</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: '#16a34a' }]}>{monthShopCount}</Text>
          <Text style={styles.statLabel}>მაღაზია</Text>
          <Text style={styles.statSub}>სულ {totalShops}</Text>
        </View>
      </View>

      {/* ── Pending visits ── */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>დასადასტურებელი ვიზიტები</Text>
        {hasPending && (
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{pending.length}</Text>
          </View>
        )}
      </View>

      {!hasPending ? (
        <View style={styles.emptyCard}>
          <Ionicons name="checkmark-circle" size={28} color="#16a34a" />
          <Text style={styles.emptyTitle}>დასადასტურებელი ვიზიტი არ არის</Text>
          <Text style={styles.emptySubtitle}>ახალი ვიზიტები გამოჩნდება აქ</Text>
        </View>
      ) : (
        pending.map(visit => {
          const shop = visit.shops;
          const catColor = CATEGORY_COLORS[visit.category] ?? '#888';
          const isApproving = approvingId === visit.id;

          return (
            <View key={visit.id} style={styles.visitCard}>
              <View style={[styles.visitAccent, { backgroundColor: catColor }]} />

              <View style={styles.visitBody}>
                <View style={styles.visitTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.visitShop} numberOfLines={1}>
                      {shop ? `#${shop.shop_number} — ${shop.name}` : '—'}
                    </Text>
                    {shop?.location ? (
                      <Text style={styles.visitAddress} numberOfLines={1}>{shop.location}</Text>
                    ) : null}
                  </View>
                  <View style={[styles.scoreBadge, { backgroundColor: catColor + '18' }]}>
                    <Text style={[styles.scoreText, { color: catColor }]}>
                      {visit.category}  {visit.score_percent}%
                    </Text>
                  </View>
                </View>

                <View style={styles.visitMeta}>
                  <Ionicons name="person-outline" size={11} color="#bbb" />
                  <Text style={styles.visitMetaText}>
                    {(visit.checker as any)?.full_name ?? '—'}
                  </Text>
                  <Text style={styles.visitMetaDot}>·</Text>
                  <Ionicons name="calendar-outline" size={11} color="#bbb" />
                  <Text style={styles.visitMetaText}>
                    {new Date(visit.date).toLocaleDateString('ka-GE', { day: 'numeric', month: 'short' })}
                  </Text>
                </View>
              </View>

              <View style={styles.visitActions}>
                <TouchableOpacity
                  style={styles.approveBtn}
                  onPress={() => handleApprove(visit.id)}
                  disabled={isApproving}
                  activeOpacity={0.8}
                >
                  {isApproving
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Ionicons name="checkmark" size={18} color="#fff" />}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.viewBtn}
                  onPress={() => router.push(`/(admin)/visit/${visit.id}` as any)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="arrow-forward" size={16} color="#2563eb" />
                </TouchableOpacity>
              </View>
            </View>
          );
        })
      )}

      {/* ── Checker activity ── */}
      {checkerActivity.length > 0 && (
        <>
          <View style={[styles.sectionHeader, { marginTop: 24 }]}>
            <Text style={styles.sectionTitle}>ჩეკერების აქტივობა</Text>
            <Text style={styles.sectionSub}>ეს კვირა</Text>
          </View>

          <View style={styles.checkerCard}>
            {checkerActivity.map((c, i) => {
              const isLast = i === checkerActivity.length - 1;
              const initials = c.full_name.slice(0, 2).toUpperCase();
              const active = c.visitCount > 0;
              return (
                <View key={c.id} style={[styles.checkerRow, !isLast && styles.checkerRowBorder]}>
                  <View style={[styles.avatar, !active && styles.avatarInactive]}>
                    <Text style={styles.avatarText}>{initials}</Text>
                  </View>
                  <Text style={[styles.checkerName, !active && styles.checkerNameInactive]} numberOfLines={1}>
                    {c.full_name}
                  </Text>
                  <Text style={[styles.checkerVisits, !active && styles.checkerVisitsInactive]}>
                    {c.visitCount} ვიზიტი
                  </Text>
                  {c.avgScore != null && c.avgCategory != null ? (
                    <View style={[styles.catBadge, { backgroundColor: CATEGORY_COLORS[c.avgCategory] + '18' }]}>
                      <Text style={[styles.catBadgeText, { color: CATEGORY_COLORS[c.avgCategory] }]}>
                        {c.avgCategory} · {c.avgScore}%
                      </Text>
                    </View>
                  ) : (
                    <Text style={styles.noActivity}>—</Text>
                  )}
                </View>
              );
            })}
          </View>
        </>
      )}

      {/* ── Link to full visits list ── */}
      <TouchableOpacity
        style={styles.allVisitsBtn}
        onPress={() => router.push('/(admin)/visits' as any)}
        activeOpacity={0.7}
      >
        <Text style={styles.allVisitsBtnText}>ყველა ვიზიტის ნახვა</Text>
        <Ionicons name="arrow-forward" size={15} color="#2563eb" />
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  content: { padding: 16, paddingBottom: 48 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  statRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  statCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 14,
    padding: 14, alignItems: 'center',
    borderWidth: 1.5, borderColor: 'transparent',
  },
  statCardUrgent: { borderColor: '#d97706', backgroundColor: '#fffbeb' },
  statDot: {
    position: 'absolute', top: 10, right: 10,
    width: 7, height: 7, borderRadius: 4, backgroundColor: '#d97706',
  },
  statValue: { fontSize: 30, fontWeight: '800', color: '#1a1a2e', lineHeight: 34 },
  statLabel: { fontSize: 11, color: '#888', fontWeight: '600', marginTop: 2 },
  statSub: { fontSize: 10, color: '#bbb', marginTop: 1 },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: '#888',
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  countBadge: {
    backgroundColor: '#d97706', borderRadius: 10,
    paddingHorizontal: 7, paddingVertical: 1,
  },
  countBadgeText: { fontSize: 11, fontWeight: '800', color: '#fff' },

  emptyCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 32,
    alignItems: 'center', gap: 8, marginBottom: 16,
    borderWidth: 1, borderColor: '#16a34a20',
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: '#1a1a2e' },
  emptySubtitle: { fontSize: 13, color: '#aaa' },

  visitCard: {
    backgroundColor: '#fff', borderRadius: 14, marginBottom: 10,
    flexDirection: 'row', alignItems: 'stretch', overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  visitAccent: { width: 4 },
  visitBody: { flex: 1, padding: 14, gap: 8 },
  visitTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  visitShop: { fontSize: 14, fontWeight: '700', color: '#1a1a2e', marginBottom: 2 },
  visitAddress: { fontSize: 12, color: '#aaa' },

  scoreBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, alignSelf: 'flex-start' },
  scoreText: { fontSize: 12, fontWeight: '800' },

  visitMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  visitMetaText: { fontSize: 11, color: '#aaa' },
  visitMetaDot: { fontSize: 11, color: '#ddd', marginHorizontal: 2 },

  visitActions: {
    flexDirection: 'column', justifyContent: 'center',
    alignItems: 'center', gap: 8, paddingRight: 12, paddingLeft: 4,
  },
  approveBtn: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: '#16a34a', justifyContent: 'center', alignItems: 'center',
  },
  viewBtn: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: '#eff6ff', justifyContent: 'center', alignItems: 'center',
  },

  sectionSub: { fontSize: 11, color: '#bbb', fontWeight: '600', marginLeft: 4 },

  checkerCard: {
    backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  checkerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  checkerRowBorder: { borderBottomWidth: 1, borderColor: '#f5f5f5' },
  avatar: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#2563eb', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  avatarInactive: { backgroundColor: '#e0e0e0' },
  avatarText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  checkerName: { flex: 1, fontSize: 14, fontWeight: '600', color: '#1a1a2e' },
  checkerNameInactive: { color: '#aaa' },
  checkerVisits: { fontSize: 13, fontWeight: '700', color: '#1a1a2e', marginRight: 4 },
  checkerVisitsInactive: { color: '#ccc' },
  catBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  catBadgeText: { fontSize: 12, fontWeight: '800' },
  noActivity: { fontSize: 13, color: '#ddd', fontWeight: '600', minWidth: 48, textAlign: 'right' },

  allVisitsBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, marginTop: 8, paddingVertical: 14,
    backgroundColor: '#fff', borderRadius: 14,
    borderWidth: 1.5, borderColor: '#e0e0e0',
  },
  allVisitsBtnText: { fontSize: 14, fontWeight: '700', color: '#2563eb' },
});
