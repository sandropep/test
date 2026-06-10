import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface Visit {
  id: string;
  date: string;
  score_percent: number | null;
  category: string | null;
  checker_id: string | null;
  shop_id: string | null;
}

interface Shop { id: string; shop_number: string; name: string }
interface Checker { id: string; full_name: string; email: string }

const CATEGORY_COLORS: Record<string, string> = {
  A: '#22c55e',
  B: '#3b82f6',
  C: '#f59e0b',
  D: '#ef4444',
};

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

export default function Dashboard() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [checkers, setCheckers] = useState<Checker[]>([]);
  const [loading, setLoading] = useState(true);

  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [checkerId, setCheckerId] = useState('');
  const [shopId, setShopId] = useState('');

  useEffect(() => {
    Promise.all([
      supabase.from('shops').select('id, shop_number, name').order('shop_number'),
      supabase.from('users').select('id, full_name, email').eq('role', 'checker').order('full_name'),
    ]).then(([{ data: s }, { data: c }]) => {
      setShops(s ?? []);
      setCheckers(c ?? []);
    });
  }, []);

  useEffect(() => {
    setLoading(true);
    let q = supabase
      .from('visits')
      .select('id, date, score_percent, category, checker_id, shop_id')
      .order('date', { ascending: false });

    if (fromDate) q = q.gte('date', fromDate);
    if (toDate) q = q.lte('date', toDate);
    if (checkerId) q = q.eq('checker_id', checkerId);
    if (shopId) q = q.eq('shop_id', shopId);

    q.then(({ data }) => {
      setVisits(data ?? []);
      setLoading(false);
    });
  }, [fromDate, toDate, checkerId, shopId]);

  const totalVisits = visits.length;
  const avgScore = visits.length
    ? Math.round(visits.reduce((s, v) => s + (v.score_percent ?? 0), 0) / visits.length)
    : 0;

  const categoryCounts = visits.reduce<Record<string, number>>((acc, v) => {
    const cat = v.category ?? 'N/A';
    acc[cat] = (acc[cat] ?? 0) + 1;
    return acc;
  }, {});

  const uniqueShops = new Set(visits.map(v => v.shop_id)).size;
  const uniqueCheckers = new Set(visits.map(v => v.checker_id)).size;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-400">ვიზიტების მიმოხილვა</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">თარიღი (დან)</label>
          <input
            type="date"
            value={fromDate}
            onChange={e => setFromDate(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">თარიღი (მდე)</label>
          <input
            type="date"
            value={toDate}
            onChange={e => setToDate(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">ჩეკერი</label>
          <select
            value={checkerId}
            onChange={e => setCheckerId(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">ყველა</option>
            {checkers.map(c => (
              <option key={c.id} value={c.id}>{c.full_name || c.email}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">მაღაზია</label>
          <select
            value={shopId}
            onChange={e => setShopId(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">ყველა</option>
            {shops.map(s => (
              <option key={s.id} value={s.id}>#{s.shop_number} {s.name}</option>
            ))}
          </select>
        </div>
        {(fromDate || toDate || checkerId || shopId) && (
          <button
            onClick={() => { setFromDate(''); setToDate(''); setCheckerId(''); setShopId(''); }}
            className="text-xs text-red-500 hover:text-red-700 px-2 py-2"
          >
            გასუფთავება ✕
          </button>
        )}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="სულ ვიზიტი" value={loading ? '...' : totalVisits} />
        <StatCard label="საშ. ქულა" value={loading ? '...' : `${avgScore}%`} />
        <StatCard label="მაღაზია" value={loading ? '...' : uniqueShops} sub="შემოწმდა" />
        <StatCard label="ჩეკერი" value={loading ? '...' : uniqueCheckers} sub="აქტიური" />
      </div>

      {/* Category breakdown */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">კატეგორიები</h2>
        {loading ? (
          <p className="text-sm text-gray-400">იტვირთება...</p>
        ) : totalVisits === 0 ? (
          <p className="text-sm text-gray-400">ვიზიტები არ მოიძებნა</p>
        ) : (
          <div className="space-y-2">
            {['A', 'B', 'C', 'D'].map(cat => {
              const count = categoryCounts[cat] ?? 0;
              const pct = totalVisits > 0 ? Math.round((count / totalVisits) * 100) : 0;
              return (
                <div key={cat} className="flex items-center gap-3">
                  <span
                    className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                    style={{ backgroundColor: CATEGORY_COLORS[cat] }}
                  >
                    {cat}
                  </span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                    <div
                      className="h-2 rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: CATEGORY_COLORS[cat] }}
                    />
                  </div>
                  <span className="text-sm font-semibold text-gray-700 w-12 text-right">
                    {count} <span className="text-gray-400 font-normal">({pct}%)</span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
