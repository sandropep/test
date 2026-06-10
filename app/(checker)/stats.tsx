import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { supabase } from '../../lib/supabase';

const CATEGORIES = ['A', 'B', 'C', 'D'] as const;
const CATEGORY_COLORS: Record<string, string> = {
  A: '#16a34a',
  B: '#2563eb',
  C: '#d97706',
  D: '#dc2626',
};
const CATEGORY_LABELS: Record<string, string> = {
  A: 'AAA — 100%',
  B: 'AAB — 75%',
  C: 'ABB — 50%',
  D: 'BBB — 25%',
};

interface Stats {
  total: number;
  avgScore: number;
  counts: Record<string, number>;
  thisWeek: number;
  thisMonth: number;
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function MyStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('visits')
      .select('date, score_percent, category')
      .eq('checker_id', user.id)
      .eq('status', 'approved');

    if (!data) return;

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const total = data.length;
    const avgScore = total > 0
      ? Math.round(data.reduce((sum, v) => sum + v.score_percent, 0) / total)
      : 0;

    const counts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
    data.forEach(v => { counts[v.category] = (counts[v.category] ?? 0) + 1; });

    const thisWeek = data.filter(v => new Date(v.date) >= weekAgo).length;
    const thisMonth = data.filter(v => new Date(v.date) >= monthAgo).length;

    setStats({ total, avgScore, counts, thisWeek, thisMonth });
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (!stats || stats.total === 0) {
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
      {/* Summary row */}
      <Text style={styles.sectionTitle}>საერთო</Text>
      <View style={styles.statRow}>
        <StatCard label="სულ ვიზიტი" value={stats.total} />
        <StatCard label="საშ. ქულა" value={`${stats.avgScore}%`} />
        <StatCard label="ბოლო 7 დღე" value={stats.thisWeek} />
        <StatCard label="ბოლო 30 დღე" value={stats.thisMonth} />
      </View>

      {/* Category breakdown */}
      <Text style={[styles.sectionTitle, { marginTop: 24 }]}>კატეგორიები</Text>
      {CATEGORIES.map(cat => {
        const count = stats.counts[cat] ?? 0;
        const pct = stats.total > 0 ? count / stats.total : 0;
        return (
          <View key={cat} style={styles.catRow}>
            <View style={[styles.catDot, { backgroundColor: CATEGORY_COLORS[cat] }]} />
            <View style={styles.catInfo}>
              <View style={styles.catHeader}>
                <Text style={styles.catName}>კატეგორია {cat}</Text>
                <Text style={styles.catLabel}>{CATEGORY_LABELS[cat]}</Text>
              </View>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    { width: `${Math.round(pct * 100)}%`, backgroundColor: CATEGORY_COLORS[cat] },
                  ]}
                />
              </View>
            </View>
            <View style={styles.catCount}>
              <Text style={[styles.catCountNum, { color: CATEGORY_COLORS[cat] }]}>{count}</Text>
              <Text style={styles.catCountPct}>{Math.round(pct * 100)}%</Text>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 },
  emptyText: { fontSize: 17, fontWeight: '600', color: '#555' },
  emptySubText: { fontSize: 14, color: '#aaa' },

  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },

  statRow: { flexDirection: 'row', gap: 8 },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  statValue: { fontSize: 20, fontWeight: '800', color: '#1a1a2e', marginBottom: 2 },
  statLabel: { fontSize: 10, color: '#888', textAlign: 'center' },

  catRow: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  catDot: { width: 10, height: 10, borderRadius: 5 },
  catInfo: { flex: 1 },
  catHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  catName: { fontSize: 14, fontWeight: '700', color: '#1a1a2e' },
  catLabel: { fontSize: 12, color: '#888' },
  barTrack: {
    height: 6,
    backgroundColor: '#f0f0f0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 3 },
  catCount: { alignItems: 'flex-end' },
  catCountNum: { fontSize: 18, fontWeight: '800' },
  catCountPct: { fontSize: 11, color: '#aaa' },
});
