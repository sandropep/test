import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Platform, RefreshControl,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { fetchAllRows } from '../../lib/fetchAllRows';

const CATEGORY_COLORS: Record<string, string> = {
  A: '#16a34a', B: '#2563eb', C: '#d97706', D: '#dc2626',
};

interface PendingVisit {
  id: string;
  date: string;
  created_at: string;
  score_percent: number;
  category: string;
  notes: string | null;
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

type ActivityPeriod = 'today' | 'week' | 'month' | 'lastMonth' | 'all' | 'custom';

const fmt = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
function formatDateTime(createdAt: string) {
  const d = new Date(createdAt);
  const month = d.toLocaleDateString('ka-GE', { month: 'short' });
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${d.getDate()} ${month} ${h}:${m}`;
}
function formatDateShort(d: Date) {
  return d.toLocaleDateString('ka-GE', { day: '2-digit', month: 'short' });
}

function showInfo(title: string, msg: string) {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${msg}`);
  else Alert.alert(title, msg);
}

const startOfMonth = () => new Date(new Date().getFullYear(), new Date().getMonth(), 1);
function lastMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 0);
  return { start, end };
}
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
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingExpanded, setPendingExpanded] = useState(true);
  const [todayCount, setTodayCount] = useState(0);
  const [monthShopCount, setMonthShopCount] = useState(0);
  const [totalShops, setTotalShops] = useState(0);
  const [monthVisitCount, setMonthVisitCount] = useState(0);
  const [monthAvgScore, setMonthAvgScore] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [checkersList, setCheckersList] = useState<{ id: string; full_name: string }[]>([]);
  const [activityPeriod, setActivityPeriod] = useState<ActivityPeriod>('week');
  const [checkerActivity, setCheckerActivity] = useState<CheckerRow[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityFrom, setActivityFrom] = useState<Date>(() => startOfWeek());
  const [activityTo, setActivityTo] = useState<Date>(() => new Date());
  const [showActFromPicker, setShowActFromPicker] = useState(false);
  const [showActToPicker, setShowActToPicker] = useState(false);
  const actFromPickerEl = useRef<HTMLInputElement | null>(null);
  const actToPickerEl = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const mkInput = (onChange: (v: string) => void) => {
      const el = document.createElement('input');
      el.type = 'date';
      el.style.cssText = 'position:fixed;left:0;top:0;opacity:0;width:1px;height:1px;pointer-events:none;';
      el.addEventListener('change', () => { if (el.value) onChange(el.value); });
      document.body.appendChild(el);
      return el;
    };
    actFromPickerEl.current = mkInput(v => setActivityFrom(new Date(v + 'T00:00:00')));
    actToPickerEl.current = mkInput(v => setActivityTo(new Date(v + 'T00:00:00')));
    return () => {
      actFromPickerEl.current?.remove();
      actToPickerEl.current?.remove();
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (actFromPickerEl.current) { actFromPickerEl.current.value = fmt(activityFrom); actFromPickerEl.current.max = fmt(activityTo); }
    if (actToPickerEl.current) { actToPickerEl.current.value = fmt(activityTo); actToPickerEl.current.min = fmt(activityFrom); actToPickerEl.current.max = fmt(new Date()); }
  }, [activityFrom, activityTo]);

  function openActFromPicker() {
    const el = actFromPickerEl.current;
    if (!el) return;
    el.style.pointerEvents = 'auto';
    el.focus();
    try { (el as any).showPicker(); } catch { el.click(); }
    el.style.pointerEvents = 'none';
  }
  function openActToPicker() {
    const el = actToPickerEl.current;
    if (!el) return;
    el.style.pointerEvents = 'auto';
    el.focus();
    try { (el as any).showPicker(); } catch { el.click(); }
    el.style.pointerEvents = 'none';
  }

  const load = useCallback(async () => {
    const todayStr = fmt(new Date());
    const monthStart = fmt(startOfMonth());

    const [pendingRes, pendingCountRes, todayRes, monthCountRes, shopsRes, checkersRes] = await Promise.all([
      supabase
        .from('visits')
        .select('id, date, created_at, score_percent, category, notes, shops(shop_number, name, location), checker:checker_id(full_name)')
        .eq('status', 'pending')
        .order('date', { ascending: false })
        .limit(50),
      supabase
        .from('visits')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending'),
      supabase
        .from('visits')
        .select('id', { count: 'exact', head: true })
        .eq('date', todayStr),
      supabase
        .from('visits')
        .select('id', { count: 'exact', head: true })
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
    ]);

    const monthVisits = await fetchAllRows<{ shop_id: string; score_percent: number | null }>(() =>
      supabase
        .from('visits')
        .select('shop_id, score_percent')
        .gte('date', monthStart)
        .lte('date', todayStr)
        .neq('status', 'rejected')
    );
    const monthScores = monthVisits.map(v => v.score_percent).filter((s): s is number => s != null);

    setPending((pendingRes.data ?? []) as unknown as PendingVisit[]);
    setPendingCount(pendingCountRes.count ?? 0);
    setTodayCount(todayRes.count ?? 0);
    setMonthShopCount(new Set(monthVisits.map(v => v.shop_id)).size);
    setTotalShops(shopsRes.count ?? 0);
    setMonthVisitCount(monthCountRes.count ?? monthVisits.length);
    setMonthAvgScore(monthScores.length > 0 ? Math.round(monthScores.reduce((s, n) => s + n, 0) / monthScores.length) : null);
    setCheckersList((checkersRes.data ?? []) as { id: string; full_name: string }[]);
  }, []);

  const loadCheckerActivity = useCallback(async (
    period: ActivityPeriod,
    checkersForRows: { id: string; full_name: string }[],
    customFrom: Date,
    customTo: Date,
  ) => {
    if (!checkersForRows.length) {
      setCheckerActivity([]);
      return;
    }
    setActivityLoading(true);
    const todayStr = fmt(new Date());

    const data = await fetchAllRows<{ checker_id: string; score_percent: number | null; category: string | null }>(() => {
      let query = supabase
        .from('visits')
        .select('checker_id, score_percent, category')
        .neq('status', 'rejected');

      if (period === 'today') {
        query = query.eq('date', todayStr);
      } else if (period === 'week') {
        query = query.gte('date', fmt(startOfWeek())).lte('date', todayStr);
      } else if (period === 'month') {
        query = query.gte('date', fmt(startOfMonth())).lte('date', todayStr);
      } else if (period === 'lastMonth') {
        const { start, end } = lastMonthRange();
        query = query.gte('date', fmt(start)).lte('date', fmt(end));
      } else if (period === 'custom') {
        query = query.gte('date', fmt(customFrom)).lte('date', fmt(customTo));
      }
      // 'all' → no date filter
      return query;
    });

    const byChecker: Record<string, { count: number; scores: number[]; categories: string[] }> = {};
    data.forEach(v => {
      if (!byChecker[v.checker_id]) byChecker[v.checker_id] = { count: 0, scores: [], categories: [] };
      byChecker[v.checker_id].count++;
      if (v.score_percent != null) byChecker[v.checker_id].scores.push(v.score_percent);
      if (v.category) byChecker[v.checker_id].categories.push(v.category);
    });

    const rows: CheckerRow[] = checkersForRows.map(c => {
      const entry = byChecker[c.id];
      const scores = entry?.scores ?? [];
      const avgScore = scores.length > 0 ? Math.round(scores.reduce((s, n) => s + n, 0) / scores.length) : null;
      const avgCategory = avgScore == null ? null
        : avgScore >= 90 ? 'A' : avgScore >= 75 ? 'B' : avgScore >= 60 ? 'C' : 'D';
      return { id: c.id, full_name: c.full_name || '—', visitCount: entry?.count ?? 0, avgScore, avgCategory };
    });

    rows.sort((a, b) => b.visitCount - a.visitCount);
    setCheckerActivity(rows);
    setActivityLoading(false);
  }, []);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]));

  useEffect(() => {
    loadCheckerActivity(activityPeriod, checkersList, activityFrom, activityTo);
  }, [activityPeriod, checkersList, activityFrom, activityTo, loadCheckerActivity]);

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
            {pendingCount}
          </Text>
          <View style={styles.statLabelRow}>
            <Text style={styles.statLabel}>განსახილველი</Text>
            <TouchableOpacity
              onPress={() => showInfo('განსახილველი', 'ვიზიტები სტატუსით „მოლოდინში" — ელოდება თქვენს დადასტურებას ან უარყოფას.')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="information-circle-outline" size={13} color="#bbb" />
            </TouchableOpacity>
          </View>
          {hasPending && (
            <View style={styles.statDot} />
          )}
        </View>

        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: '#2563eb' }]}>{todayCount}</Text>
          <View style={styles.statLabelRow}>
            <Text style={styles.statLabel}>დღეს</Text>
            <TouchableOpacity
              onPress={() => showInfo('დღეს', 'დღეს დამატებული ყველა ვიზიტი, სტატუსის მიუხედავად (დადასტურებული, მოლოდინში და უარყოფილიც).')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="information-circle-outline" size={13} color="#bbb" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: '#16a34a' }]}>{monthShopCount}</Text>
          <View style={styles.statLabelRow}>
            <Text style={styles.statLabel}>მაღაზია</Text>
            <TouchableOpacity
              onPress={() => showInfo('მაღაზია', 'რამდენი განსხვავებული მაღაზია მოინახულეს ამ თვეს (უარყოფილი ვიზიტების გარეშე), სულ მაღაზიების რაოდენობიდან.')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="information-circle-outline" size={13} color="#bbb" />
            </TouchableOpacity>
          </View>
          <Text style={styles.statSub}>სულ {totalShops} მაღაზიიდან</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: '#7c3aed' }]}>{monthVisitCount}</Text>
          <View style={styles.statLabelRow}>
            <Text style={styles.statLabel}>ვიზიტი ამ თვეს</Text>
            <TouchableOpacity
              onPress={() => showInfo('ვიზიტი ამ თვეს', 'ამ თვის ვიზიტების რაოდენობა (უარყოფილის გარეშე) და საშუალო ქულა.')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="information-circle-outline" size={13} color="#bbb" />
            </TouchableOpacity>
          </View>
          <Text style={[
            styles.statSub,
            monthAvgScore != null && { color: CATEGORY_COLORS[
              monthAvgScore >= 90 ? 'A' : monthAvgScore >= 75 ? 'B' : monthAvgScore >= 60 ? 'C' : 'D'
            ], fontWeight: '700' },
          ]}>
            {monthAvgScore != null ? `საშ. ქულა ${monthAvgScore}%` : 'ქულა არ არის'}
          </Text>
        </View>
      </View>

      {/* ── Pending visits ── */}
      <TouchableOpacity
        style={styles.collapsibleHeader}
        onPress={() => setPendingExpanded(e => !e)}
        activeOpacity={0.7}
      >
        <Ionicons name="time-outline" size={20} color="#d97706" />
        <Text style={styles.collapsibleTitle}>დასადასტურებელი ვიზიტები</Text>
        {hasPending && (
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{pendingCount}</Text>
          </View>
        )}
        <Ionicons
          name={pendingExpanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color="#d97706"
          style={{ marginLeft: 'auto' }}
        />
      </TouchableOpacity>
      {pendingExpanded && pendingCount > pending.length && (
        <Text style={styles.pendingCapNote}>
          ნაჩვენებია უახლესი {pending.length} — სულ {pendingCount}
        </Text>
      )}

      {!pendingExpanded ? null : !hasPending ? (
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
                      <Text style={styles.visitAddress} numberOfLines={1}>
                        <Text style={styles.visitFieldLabel}>მისამართი: </Text>{shop.location}
                      </Text>
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
                    {formatDateTime(visit.created_at)}
                  </Text>
                </View>

                {visit.notes ? (
                  <Text style={styles.visitNote} numberOfLines={2}>
                    <Text style={styles.visitFieldLabel}>შენიშვნა: </Text>{visit.notes}
                  </Text>
                ) : null}
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
                  onPress={() => router.push(`/(admin)/visit/${visit.id}?from=dashboard` as any)}
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
            {activityLoading && <ActivityIndicator size="small" color="#2563eb" />}
          </View>

          <View style={styles.periodRow}>
            {(['today', 'week', 'month', 'lastMonth', 'all'] as const).map(p => (
              <TouchableOpacity
                key={p}
                style={[styles.periodPill, activityPeriod === p && styles.periodPillActive]}
                onPress={() => setActivityPeriod(p)}
                activeOpacity={0.7}
              >
                <Text style={[styles.periodPillText, activityPeriod === p && styles.periodPillTextActive]}>
                  {p === 'today' ? 'დღეს' : p === 'week' ? 'ეს კვირა' : p === 'month' ? 'ეს თვე' : p === 'lastMonth' ? 'წინა თვე' : 'ყველა'}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.periodPill, styles.periodPillIcon, activityPeriod === 'custom' && styles.periodPillActive]}
              onPress={() => setActivityPeriod('custom')}
              activeOpacity={0.7}
            >
              <Ionicons name="calendar-outline" size={14} color={activityPeriod === 'custom' ? '#2563eb' : '#888'} />
            </TouchableOpacity>
          </View>

          {activityPeriod === 'custom' && (
            <View style={styles.customDateRow}>
              <TouchableOpacity
                style={styles.miniDatePill}
                onPress={Platform.OS === 'web' ? openActFromPicker : () => setShowActFromPicker(true)}
                activeOpacity={0.7}
              >
                <View style={styles.miniDatePillIcon}>
                  <Ionicons name="calendar-outline" size={13} color="#2563eb" />
                </View>
                <View>
                  <Text style={styles.miniDatePillLabel}>დან</Text>
                  <Text suppressHydrationWarning style={styles.miniDatePillValue}>{formatDateShort(activityFrom)}</Text>
                </View>
              </TouchableOpacity>
              <Ionicons name="arrow-forward-outline" size={14} color="#cbd5e1" />
              <TouchableOpacity
                style={styles.miniDatePill}
                onPress={Platform.OS === 'web' ? openActToPicker : () => setShowActToPicker(true)}
                activeOpacity={0.7}
              >
                <View style={styles.miniDatePillIcon}>
                  <Ionicons name="calendar-outline" size={13} color="#2563eb" />
                </View>
                <View>
                  <Text style={styles.miniDatePillLabel}>მდე</Text>
                  <Text suppressHydrationWarning style={styles.miniDatePillValue}>{formatDateShort(activityTo)}</Text>
                </View>
              </TouchableOpacity>
              {Platform.OS !== 'web' && showActFromPicker && (
                <DateTimePicker value={activityFrom} mode="date" maximumDate={activityTo}
                  onChange={(_, d) => { setShowActFromPicker(false); if (d) setActivityFrom(d); }} />
              )}
              {Platform.OS !== 'web' && showActToPicker && (
                <DateTimePicker value={activityTo} mode="date" minimumDate={activityFrom} maximumDate={new Date()}
                  onChange={(_, d) => { setShowActToPicker(false); if (d) setActivityTo(d); }} />
              )}
            </View>
          )}

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
  statLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  statLabel: { fontSize: 11, color: '#888', fontWeight: '600' },
  statSub: { fontSize: 10, color: '#bbb', marginTop: 1 },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  collapsibleHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: 12, borderWidth: 1.5,
    backgroundColor: '#d9770612', borderColor: '#d9770630',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: '#888',
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  collapsibleTitle: { fontSize: 16, fontWeight: '800', color: '#92400e' },
  pendingCapNote: { fontSize: 11, color: '#aaa', marginTop: -6, marginBottom: 10 },
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
  visitNote: { fontSize: 12, color: '#999', fontStyle: 'italic', marginTop: 4 },
  visitFieldLabel: { fontWeight: '700', color: '#888', fontStyle: 'normal' },

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

  periodRow: { flexDirection: 'row', gap: 8, marginBottom: 10, flexWrap: 'wrap' },
  periodPill: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    backgroundColor: '#f0f2f5', borderWidth: 1.5, borderColor: 'transparent',
  },
  periodPillActive: { backgroundColor: '#eff6ff', borderColor: '#2563eb' },
  periodPillText: { fontSize: 12, fontWeight: '600', color: '#888' },
  periodPillTextActive: { color: '#2563eb' },
  periodPillIcon: { paddingHorizontal: 10, justifyContent: 'center', alignItems: 'center' },

  customDateRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10,
  },
  miniDatePill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fff', borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 8,
    borderWidth: 1.5, borderColor: '#dbeafe',
    shadowColor: '#2563eb', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  miniDatePillIcon: {
    width: 24, height: 24, borderRadius: 6,
    backgroundColor: '#eff6ff', alignItems: 'center', justifyContent: 'center',
  },
  miniDatePillLabel: { fontSize: 8, color: '#93c5fd', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  miniDatePillValue: { fontSize: 12, color: '#1e40af', fontWeight: '700', marginTop: 1 },

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
