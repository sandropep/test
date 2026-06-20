import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';

const CATEGORY_COLORS: Record<string, string> = {
  A: '#16a34a', B: '#2563eb', C: '#d97706', D: '#dc2626',
};

function startOfMonth(offset = 0) {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() - offset, 1);
}

function getWeekStart(d: Date) {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(d);
  mon.setDate(d.getDate() + diff);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

function delta(current: number, previous: number) {
  return current - previous;
}

function DeltaBadge({ value, reversed = false }: { value: number; reversed?: boolean }) {
  if (value === 0) return <Text style={styles.deltaNeutral}>—</Text>;
  const good = reversed ? value < 0 : value > 0;
  return (
    <Text style={[styles.delta, { color: good ? '#16a34a' : '#dc2626' }]}>
      {value > 0 ? '+' : ''}{value}
    </Text>
  );
}

interface Visit {
  date: string;
  score_percent: number;
  category: string;
  status: string;
}

export default function MyStats() {
  const [fullName, setFullName] = useState('');
  const [totalApproved, setTotalApproved] = useState(0);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const twoMonthsAgo = new Date();
    twoMonthsAgo.setDate(twoMonthsAgo.getDate() - 70);

    const [profileRes, visitsRes, totalRes] = await Promise.all([
      supabase.from('users').select('full_name').eq('id', user.id).single(),
      supabase
        .from('visits')
        .select('date, score_percent, category, status')
        .eq('checker_id', user.id)
        .gte('date', twoMonthsAgo.toISOString().split('T')[0])
        .order('date', { ascending: false }),
      supabase
        .from('visits')
        .select('id', { count: 'exact', head: true })
        .eq('checker_id', user.id)
        .eq('status', 'approved'),
    ]);

    setFullName(profileRes.data?.full_name ?? '');
    setVisits((visitsRes.data ?? []) as Visit[]);
    setTotalApproved(totalRes.count ?? 0);
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

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color="#2563eb" /></View>;
  }

  // ── Computed stats ──
  const thisMonthStart = startOfMonth(0);
  const lastMonthStart = startOfMonth(1);

  const thisMonth = visits.filter(v => new Date(v.date) >= thisMonthStart);
  const lastMonth = visits.filter(v => new Date(v.date) >= lastMonthStart && new Date(v.date) < thisMonthStart);

  const approved = (list: Visit[]) => list.filter(v => v.status === 'approved');
  const rejected = (list: Visit[]) => list.filter(v => v.status === 'rejected');

  const avg = (list: Visit[]) => list.length === 0 ? null
    : Math.round(list.reduce((s, v) => s + v.score_percent, 0) / list.length);

  const tmVisits = thisMonth.length;
  const lmVisits = lastMonth.length;
  const tmAvg = avg(approved(thisMonth));
  const lmAvg = avg(approved(lastMonth));
  const tmRejected = rejected(thisMonth).length;
  const lmRejected = rejected(lastMonth).length;

  // Category breakdown (this month, approved only)
  const catCounts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
  approved(thisMonth).forEach(v => { catCounts[v.category] = (catCounts[v.category] ?? 0) + 1; });
  const approvedThisMonth = approved(thisMonth).length;

  // Last 5 weeks activity
  const now = new Date();
  const currentWeekStart = getWeekStart(now);
  const weeks = Array.from({ length: 5 }, (_, i) => {
    const start = new Date(currentWeekStart);
    start.setDate(currentWeekStart.getDate() - (4 - i) * 7);
    return start;
  });

  const weekCounts = weeks.map(weekStart => {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);
    return visits.filter(v => {
      const d = new Date(v.date);
      return d >= weekStart && d < weekEnd && v.status !== 'rejected';
    }).length;
  });

  const maxWeek = Math.max(...weekCounts, 1);

  const approvalRate = tmVisits > 0
    ? Math.round((tmVisits - tmRejected) / tmVisits * 100)
    : null;

  if (totalApproved === 0 && visits.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>სტატისტიკა არ არის</Text>
        <Text style={styles.emptySubText}>შეასრულეთ პირველი ვიზიტი</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* ── Profile header ── */}
      <View style={styles.profileCard}>
        <View style={styles.profileAvatar}>
          <Text style={styles.profileAvatarText}>
            {(fullName || '?').slice(0, 2).toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.profileName}>{fullName || '—'}</Text>
          <View style={styles.profileStats}>
            <View style={styles.profileStat}>
              <Text style={styles.profileStatValue}>{approvedThisMonth}</Text>
              <Text style={styles.profileStatLabel}>ამ თვეში</Text>
            </View>
            <View style={styles.profileStatDivider} />
            <View style={styles.profileStat}>
              <Text style={styles.profileStatValue}>{totalApproved}</Text>
              <Text style={styles.profileStatLabel}>სულ</Text>
            </View>
          </View>
        </View>
      </View>

      {/* ── Weekly activity ── */}
      <Text style={styles.sectionTitle}>ბოლო 5 კვირა</Text>
      <View style={styles.weekCard}>
        {weekCounts.map((count, i) => {
          const isCurrentWeek = i === 4;
          const barHeight = Math.max(4, Math.round((count / maxWeek) * 72));
          const weekLabel = isCurrentWeek ? 'ამ კვ.' : `${i + 1}`;
          return (
            <View key={i} style={styles.weekCol}>
              <Text style={[styles.weekCount, count === 0 && styles.weekCountZero]}>{count}</Text>
              <View style={styles.weekBarTrack}>
                <View style={[
                  styles.weekBarFill,
                  { height: barHeight, backgroundColor: isCurrentWeek ? '#2563eb' : '#cbd5e1' },
                ]} />
              </View>
              <Text style={[styles.weekLabel, isCurrentWeek && styles.weekLabelActive]}>{weekLabel}</Text>
            </View>
          );
        })}
      </View>

      {/* ── This month vs last month ── */}
      <Text style={[styles.sectionTitle, { marginTop: 24 }]}>ამ თვეში vs გასულ თვეში</Text>
      <View style={styles.compareCard}>
        <View style={styles.compareRow}>
          <Text style={styles.compareLabel}>ვიზიტები</Text>
          <View style={styles.compareValues}>
            <Text style={styles.compareThis}>{tmVisits}</Text>
            <Text style={styles.compareSep}>vs</Text>
            <Text style={styles.comparePrev}>{lmVisits}</Text>
            <DeltaBadge value={delta(tmVisits, lmVisits)} />
          </View>
        </View>
        <View style={styles.compareDivider} />
        <View style={styles.compareRow}>
          <Text style={styles.compareLabel}>საშ. ქულა</Text>
          <View style={styles.compareValues}>
            <Text style={styles.compareThis}>{tmAvg != null ? `${tmAvg}%` : '—'}</Text>
            <Text style={styles.compareSep}>vs</Text>
            <Text style={styles.comparePrev}>{lmAvg != null ? `${lmAvg}%` : '—'}</Text>
            {tmAvg != null && lmAvg != null
              ? <DeltaBadge value={delta(tmAvg, lmAvg)} />
              : <Text style={styles.deltaNeutral}>—</Text>}
          </View>
        </View>
        <View style={styles.compareDivider} />
        <View style={styles.compareRow}>
          <Text style={styles.compareLabel}>უარყოფილი</Text>
          <View style={styles.compareValues}>
            <Text style={[styles.compareThis, tmRejected > 0 && { color: '#dc2626' }]}>
              {tmRejected}
            </Text>
            <Text style={styles.compareSep}>vs</Text>
            <Text style={styles.comparePrev}>{lmRejected}</Text>
            <DeltaBadge value={delta(tmRejected, lmRejected)} reversed />
          </View>
        </View>
        {approvalRate != null && (
          <>
            <View style={styles.compareDivider} />
            <View style={styles.compareRow}>
              <Text style={styles.compareLabel}>დადასტ. %</Text>
              <View style={styles.compareValues}>
                <Text style={[styles.compareThis, { color: approvalRate >= 90 ? '#16a34a' : approvalRate >= 70 ? '#d97706' : '#dc2626' }]}>
                  {approvalRate}%
                </Text>
              </View>
            </View>
          </>
        )}
      </View>

      {/* ── Category breakdown (this month) ── */}
      {approvedThisMonth > 0 && (
        <>
          <Text style={[styles.sectionTitle, { marginTop: 24 }]}>კატეგორიები — ამ თვეში</Text>
          <View style={styles.catCard}>
            {(['A', 'B', 'C', 'D'] as const).map((cat, i, arr) => {
              const count = catCounts[cat] ?? 0;
              const pct = approvedThisMonth > 0 ? count / approvedThisMonth : 0;
              return (
                <View key={cat} style={[styles.catRow, i < arr.length - 1 && styles.catRowBorder]}>
                  <View style={[styles.catDot, { backgroundColor: CATEGORY_COLORS[cat] }]} />
                  <Text style={styles.catName}>კატ. {cat}</Text>
                  <View style={styles.catBarTrack}>
                    <View style={[styles.catBarFill, {
                      width: `${Math.round(pct * 100)}%`,
                      backgroundColor: CATEGORY_COLORS[cat],
                    }]} />
                  </View>
                  <Text style={[styles.catPct, { color: CATEGORY_COLORS[cat] }]}>
                    {count} ({Math.round(pct * 100)}%)
                  </Text>
                </View>
              );
            })}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  content: { padding: 16, paddingBottom: 48 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 },
  emptyText: { fontSize: 17, fontWeight: '600', color: '#555' },
  emptySubText: { fontSize: 14, color: '#aaa' },

  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: '#888',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8,
  },

  profileCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 24,
  },
  profileAvatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#2563eb', alignItems: 'center', justifyContent: 'center',
  },
  profileAvatarText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  profileName: { fontSize: 17, fontWeight: '700', color: '#1a1a2e', marginBottom: 8 },
  profileStats: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  profileStat: { alignItems: 'flex-start' },
  profileStatValue: { fontSize: 18, fontWeight: '800', color: '#1a1a2e', lineHeight: 20 },
  profileStatLabel: { fontSize: 10, color: '#aaa', fontWeight: '600', marginTop: 2 },
  profileStatDivider: { width: 1, height: 28, backgroundColor: '#e0e0e0' },

  compareCard: {
    backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden',
  },
  compareRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 13,
  },
  compareLabel: { fontSize: 13, color: '#888', fontWeight: '600', width: 90 },
  compareValues: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  compareThis: { fontSize: 16, fontWeight: '800', color: '#1a1a2e', minWidth: 36, textAlign: 'right' },
  compareSep: { fontSize: 11, color: '#ccc', fontWeight: '600' },
  comparePrev: { fontSize: 14, fontWeight: '600', color: '#bbb', minWidth: 32, textAlign: 'right' },
  compareDivider: { height: 1, backgroundColor: '#f5f5f5', marginHorizontal: 16 },
  delta: { fontSize: 13, fontWeight: '700', minWidth: 32, textAlign: 'right' },
  deltaNeutral: { fontSize: 13, color: '#ccc', minWidth: 32, textAlign: 'right' },

  weekCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 20,
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
  },
  weekCol: { flex: 1, alignItems: 'center', gap: 6 },
  weekCount: { fontSize: 13, fontWeight: '700', color: '#1a1a2e' },
  weekCountZero: { color: '#ddd' },
  weekBarTrack: { height: 72, justifyContent: 'flex-end', width: '100%', alignItems: 'center' },
  weekBarFill: { width: '60%', borderRadius: 4 },
  weekLabel: { fontSize: 11, color: '#aaa', fontWeight: '600' },
  weekLabelActive: { color: '#2563eb' },

  catCard: { backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden' },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
  catRowBorder: { borderBottomWidth: 1, borderColor: '#f5f5f5' },
  catDot: { width: 9, height: 9, borderRadius: 5, flexShrink: 0 },
  catName: { fontSize: 13, fontWeight: '700', color: '#1a1a2e', width: 48 },
  catBarTrack: { flex: 1, height: 6, backgroundColor: '#f0f0f0', borderRadius: 3, overflow: 'hidden' },
  catBarFill: { height: '100%', borderRadius: 3 },
  catPct: { fontSize: 12, fontWeight: '700', width: 64, textAlign: 'right' },
});
