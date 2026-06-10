import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';

const CATEGORY_COLORS: Record<string, string> = {
  A: '#16a34a', B: '#2563eb', C: '#d97706', D: '#dc2626',
};
const STATUS_COLORS: Record<string, string> = {
  pending: '#d97706', approved: '#16a34a', rejected: '#dc2626',
};
const STATUS_LABELS: Record<string, string> = {
  pending: 'მოლოდინში', approved: 'დადასტურებული', rejected: 'უარყოფილი',
};

interface Visit {
  id: string;
  date: string;
  created_at: string;
  score_percent: number;
  category: string;
  status: string;
  rejection_note: string | null;
  notes: string | null;
  shops: { shop_number: string; name: string } | null;
}

function CategoryBadge({ category }: { category: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: CATEGORY_COLORS[category] + '20' }]}>
      <Text style={[styles.badgeText, { color: CATEGORY_COLORS[category] }]}>
        {category}
      </Text>
    </View>
  );
}

export default function CheckerHome() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [visits, setVisits] = useState<Visit[]>([]);
  const [todayCount, setTodayCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [profileRes, visitsRes] = await Promise.all([
      supabase.from('users').select('full_name').eq('id', user.id).single(),
      supabase
        .from('visits')
        .select('id, date, created_at, score_percent, category, status, rejection_note, notes, shops(shop_number, name)')
        .eq('checker_id', user.id)
        .order('created_at', { ascending: false })
        .limit(30),
    ]);

    if (profileRes.data) setFullName(profileRes.data.full_name);

    const allVisits = (visitsRes.data as unknown as Visit[]) ?? [];
    setVisits(allVisits);

    const today = new Date().toISOString().split('T')[0];
    setTodayCount(allVisits.filter(v => v.date === today).length);
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  // Refresh list when returning from visit detail
  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  function formatDate(createdAt: string) {
    const d = new Date(createdAt);
    const day = d.getDate();
    const month = d.toLocaleDateString('ka-GE', { month: 'short' });
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    return `${day} ${month} ${h}:${m}`;
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Greeting */}
      <Text style={styles.greeting}>გამარჯობა, {fullName || '—'}!</Text>

      {/* Today card */}
      <View style={styles.todayCard}>
        <View>
          <Text style={styles.todayLabel}>დღეს შესრულებული</Text>
          <Text style={styles.todayCount}>{todayCount} ვიზიტი</Text>
        </View>
        <TouchableOpacity
          style={styles.newVisitBtn}
          onPress={() => router.push('/(checker)/new-visit')}
          activeOpacity={0.8}
        >
          <Text style={styles.newVisitBtnText}>+ ახალი</Text>
        </TouchableOpacity>
      </View>

      {/* Recent visits */}
      <Text style={styles.sectionTitle}>ბოლო ვიზიტები</Text>

      {visits.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>ჯერ ვიზიტი არ არის</Text>
        </View>
      ) : (
        visits.map(visit => {
          const statusColor = STATUS_COLORS[visit.status] ?? '#888';
          const isRejected = visit.status === 'rejected';
          return (
            <TouchableOpacity
              key={visit.id}
              style={[styles.visitRow, isRejected && styles.visitRowRejected]}
              onPress={() => router.push(`/(checker)/visit/${visit.id}`)}
              activeOpacity={0.7}
            >
              <View style={styles.visitLeft}>
                <Text style={styles.visitShop}>
                  #{visit.shops?.shop_number} — {visit.shops?.name}
                </Text>
                <Text style={styles.visitDate}>{formatDate(visit.created_at)}</Text>
                {isRejected && visit.rejection_note ? (
                  <Text style={styles.rejectionNote} numberOfLines={2}>
                    ⚠ {visit.rejection_note}
                  </Text>
                ) : visit.notes ? (
                  <Text style={styles.visitNotes} numberOfLines={1}>{visit.notes}</Text>
                ) : null}
              </View>
              <View style={styles.visitRight}>
                <Text style={styles.visitScore}>{visit.score_percent}%</Text>
                <CategoryBadge category={visit.category} />
                <View style={[styles.badge, { backgroundColor: statusColor + '20' }]}>
                  <Text style={[styles.badgeText, { color: statusColor, fontSize: 10 }]}>
                    {STATUS_LABELS[visit.status] ?? visit.status}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  greeting: { fontSize: 22, fontWeight: '700', color: '#1a1a2e', marginBottom: 16 },

  todayCard: {
    backgroundColor: '#2563eb',
    borderRadius: 14,
    padding: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  todayLabel: { color: '#bfdbfe', fontSize: 13, marginBottom: 4 },
  todayCount: { color: '#fff', fontSize: 28, fontWeight: '800' },
  newVisitBtn: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  newVisitBtnText: { color: '#2563eb', fontWeight: '700', fontSize: 14 },

  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },

  emptyBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
  },
  emptyText: { color: '#aaa', fontSize: 15 },

  visitRow: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  visitRowRejected: {
    borderWidth: 1.5,
    borderColor: '#dc262640',
    backgroundColor: '#fff5f5',
  },
  visitLeft: { flex: 1, marginRight: 12 },
  visitShop: { fontSize: 14, fontWeight: '600', color: '#1a1a2e', marginBottom: 2 },
  visitDate: { fontSize: 12, color: '#888' },
  visitNotes: { fontSize: 12, color: '#aaa', marginTop: 2, fontStyle: 'italic' },
  rejectionNote: { fontSize: 12, color: '#dc2626', marginTop: 4, fontWeight: '500' },
  visitRight: { alignItems: 'flex-end', gap: 4 },
  visitScore: { fontSize: 15, fontWeight: '700', color: '#1a1a2e' },

  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 12, fontWeight: '700' },
});
