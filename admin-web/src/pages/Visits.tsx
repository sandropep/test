import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';

interface Visit {
  id: string;
  date: string;
  score_percent: number | null;
  category: string | null;
  checker_id: string | null;
  shop_id: string | null;
  notes: string | null;
}

interface ExportVisit extends Visit {
  warehouse_rating: number | null;
  fridge_rating: number | null;
  shelf_rating: number | null;
}

interface Shop { id: string; shop_number: string; name: string }
interface Checker { id: string; full_name: string; email: string }

const CATEGORY_COLORS: Record<string, string> = {
  A: 'bg-green-100 text-green-700',
  B: 'bg-blue-100 text-blue-700',
  C: 'bg-yellow-100 text-yellow-700',
  D: 'bg-red-100 text-red-700',
};

export default function Visits() {
  const navigate = useNavigate();
  const [visits, setVisits] = useState<Visit[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [checkers, setCheckers] = useState<Checker[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [checkerId, setCheckerId] = useState('');
  const [shopId, setShopId] = useState('');

  const shopMap = Object.fromEntries(shops.map(s => [s.id, s]));
  const checkerMap = Object.fromEntries(checkers.map(c => [c.id, c]));

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
      .select('id, date, score_percent, category, checker_id, shop_id, notes')
      .order('date', { ascending: false })
      .limit(200);

    if (fromDate) q = q.gte('date', fromDate);
    if (toDate) q = q.lte('date', toDate);
    if (checkerId) q = q.eq('checker_id', checkerId);
    if (shopId) q = q.eq('shop_id', shopId);

    q.then(({ data }) => {
      setVisits(data ?? []);
      setLoading(false);
    });
  }, [fromDate, toDate, checkerId, shopId]);

  async function handleExport() {
    setExporting(true);

    // Fetch full detail for all matching visits (no limit), join checker directly
    let q = supabase
      .from('visits')
      .select('id, date, score_percent, category, checker_id, shop_id, notes, warehouse_rating, fridge_rating, shelf_rating, checker:checker_id(full_name, email)')
      .order('date', { ascending: false });

    if (fromDate) q = q.gte('date', fromDate);
    if (toDate) q = q.lte('date', toDate);
    if (checkerId) q = q.eq('checker_id', checkerId);
    if (shopId) q = q.eq('shop_id', shopId);

    const { data } = await q;
    const rows = (data ?? []) as (ExportVisit & { checker: { full_name: string; email: string } | null })[];

    // --- Column definitions: change label or field here to customise ---
    const sheetData = rows.map(v => ({
      'თარიღი': v.date,
      'მაღაზია #': shopMap[v.shop_id ?? '']?.shop_number ?? '',
      'მაღაზია სახელი': shopMap[v.shop_id ?? '']?.name ?? '',
      'ჩეკერი': v.checker?.full_name ?? v.checker?.email ?? '',
      'საერთო ქულა %': v.score_percent ?? '',
      'კატეგორია': v.category ?? '',
      'საწყობის ქულა': v.warehouse_rating ?? '',
      'მაცივრის ქულა': v.fridge_rating ?? '',
      'თაროს ქულა': v.shelf_rating ?? '',
      'შენიშვნები': v.notes ?? '',
    }));
    // ------------------------------------------------------------------

    const worksheet = XLSX.utils.json_to_sheet(sheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'ვიზიტები');

    // Auto-width columns
    const colWidths = Object.keys(sheetData[0] ?? {}).map(key => ({
      wch: Math.max(key.length, ...sheetData.map(r => String((r as Record<string, unknown>)[key] ?? '').length)) + 2,
    }));
    worksheet['!cols'] = colWidths;

    const dateRange = [fromDate, toDate].filter(Boolean).join('_') || 'all';
    XLSX.writeFile(workbook, `visits_${dateRange}.xlsx`);

    setExporting(false);
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">ვიზიტები</h1>
          <p className="text-sm text-gray-400">{visits.length} ჩანაწერი</p>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting || loading || visits.length === 0}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          {exporting ? (
            <>
              <span className="animate-spin">⏳</span>
              ექსპორტი...
            </>
          ) : (
            <>
              <span>⬇</span>
              Excel ექსპორტი
            </>
          )}
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">თარიღი (დან)</label>
          <input
            type="date"
            value={fromDate}
            onChange={e => setFromDate(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">თარიღი (მდე)</label>
          <input
            type="date"
            value={toDate}
            onChange={e => setToDate(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">ჩეკერი</label>
          <select
            value={checkerId}
            onChange={e => setCheckerId(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {loading ? (
          <p className="text-sm text-gray-400 p-6">იტვირთება...</p>
        ) : visits.length === 0 ? (
          <p className="text-sm text-gray-400 p-6">ვიზიტები არ მოიძებნა</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">თარიღი</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">მაღაზია</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">ჩეკერი</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">ქულა</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">კატ.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {visits.map(v => {
                const shop = shopMap[v.shop_id ?? ''];
                const checker = checkerMap[v.checker_id ?? ''];
                return (
                  <tr
                    key={v.id}
                    onClick={() => navigate(`/visits/${v.id}`)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 text-gray-600">{v.date}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {shop ? `#${shop.shop_number} ${shop.name}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {checker?.full_name || checker?.email || '—'}
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-900">
                      {v.score_percent != null ? `${v.score_percent}%` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {v.category ? (
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${CATEGORY_COLORS[v.category] ?? 'bg-gray-100 text-gray-600'}`}>
                          {v.category}
                        </span>
                      ) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
