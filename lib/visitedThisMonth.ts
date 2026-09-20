import { supabase } from './supabase';
import { fetchAllRows } from './fetchAllRows';

function fmt(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Shop ids with at least one non-rejected visit so far this month, org-wide. */
export async function fetchVisitedShopIdsThisMonth(): Promise<Set<string>> {
  const now = new Date();
  const monthStart = fmt(new Date(now.getFullYear(), now.getMonth(), 1));
  const todayStr = fmt(now);
  const rows = await fetchAllRows<{ shop_id: string }>(() =>
    supabase
      .from('visits')
      .select('shop_id')
      .gte('date', monthStart)
      .lte('date', todayStr)
      .neq('status', 'rejected')
  );
  return new Set(rows.map(r => r.shop_id));
}
