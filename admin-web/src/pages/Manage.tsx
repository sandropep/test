import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

interface Shop { id: string; shop_number: string; name: string; location: string | null }
interface Checker { id: string; full_name: string; email: string }

export default function Manage() {
  const [tab, setTab] = useState<'shops' | 'checkers'>('shops');

  // Shops state
  const [shops, setShops] = useState<Shop[]>([]);
  const [shopsLoading, setShopsLoading] = useState(true);
  const [shopNumber, setShopNumber] = useState('');
  const [shopName, setShopName] = useState('');
  const [shopLocation, setShopLocation] = useState('');
  const [shopSaving, setShopSaving] = useState(false);
  const [shopError, setShopError] = useState('');
  const [deletingShop, setDeletingShop] = useState<string | null>(null);

  // Checkers state
  const [checkers, setCheckers] = useState<Checker[]>([]);
  const [checkersLoading, setCheckersLoading] = useState(true);
  const [checkerName, setCheckerName] = useState('');
  const [checkerEmail, setCheckerEmail] = useState('');
  const [checkerPassword, setCheckerPassword] = useState('');
  const [checkerSaving, setCheckerSaving] = useState(false);
  const [checkerError, setCheckerError] = useState('');
  const [checkerSuccess, setCheckerSuccess] = useState('');

  const loadShops = useCallback(async () => {
    const { data } = await supabase.from('shops').select('id, shop_number, name, location').order('shop_number');
    setShops(data ?? []);
  }, []);

  const loadCheckers = useCallback(async () => {
    const { data } = await supabase.from('users').select('id, full_name, email').eq('role', 'checker').order('full_name');
    setCheckers((data ?? []) as Checker[]);
  }, []);

  useEffect(() => {
    loadShops().finally(() => setShopsLoading(false));
    loadCheckers().finally(() => setCheckersLoading(false));
  }, []);

  async function handleAddShop(e: React.FormEvent) {
    e.preventDefault();
    setShopError('');
    setShopSaving(true);
    const { error } = await supabase.from('shops').insert({
      shop_number: shopNumber.trim(),
      name: shopName.trim(),
      location: shopLocation.trim() || null,
    });
    if (error) {
      setShopError(error.message);
    } else {
      setShopNumber(''); setShopName(''); setShopLocation('');
      await loadShops();
    }
    setShopSaving(false);
  }

  async function handleDeleteShop(shop: Shop) {
    if (!confirm(`წაშლა: #${shop.shop_number} — ${shop.name}?`)) return;
    setDeletingShop(shop.id);
    await supabase.from('shops').delete().eq('id', shop.id);
    setShops(prev => prev.filter(s => s.id !== shop.id));
    setDeletingShop(null);
  }

  async function handleAddChecker(e: React.FormEvent) {
    e.preventDefault();
    setCheckerError('');
    setCheckerSuccess('');
    if (checkerPassword.length < 6) {
      setCheckerError('პაროლი მინიმუმ 6 სიმბოლო');
      return;
    }
    setCheckerSaving(true);

    const { data: { session: adminSession } } = await supabase.auth.getSession();

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: checkerEmail.trim(),
      password: checkerPassword,
    });

    if (adminSession) {
      await supabase.auth.setSession({
        access_token: adminSession.access_token,
        refresh_token: adminSession.refresh_token,
      });
    }

    if (authError) {
      setCheckerError(authError.message);
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
    setCheckerSuccess('ჩეკერი წარმატებით დამატებულია');
    await loadCheckers();
    setCheckerSaving(false);
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">მართვა</h1>
        <p className="text-sm text-gray-400">მაღაზიები და ჩეკერები</p>
      </div>

      {/* Tab toggle */}
      <div className="flex gap-2">
        {(['shops', 'checkers'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              tab === t
                ? 'bg-blue-600 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {t === 'shops' ? '🏪 მაღაზიები' : '👤 ჩეკერები'}
          </button>
        ))}
      </div>

      {tab === 'shops' && (
        <div className="space-y-4">
          <form onSubmit={handleAddShop} className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
            <h2 className="text-sm font-semibold text-gray-700">მაღაზიის დამატება</h2>
            <div className="grid grid-cols-3 gap-3">
              <input
                value={shopNumber}
                onChange={e => setShopNumber(e.target.value)}
                placeholder="ნომერი *"
                required
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                value={shopName}
                onChange={e => setShopName(e.target.value)}
                placeholder="სახელი *"
                required
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                value={shopLocation}
                onChange={e => setShopLocation(e.target.value)}
                placeholder="მისამართი"
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {shopError && <p className="text-xs text-red-600">{shopError}</p>}
            <button
              type="submit"
              disabled={shopSaving}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-lg"
            >
              {shopSaving ? 'ემატება...' : '+ დამატება'}
            </button>
          </form>

          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-50">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{shops.length} მაღაზია</p>
            </div>
            {shopsLoading ? (
              <p className="text-sm text-gray-400 p-5">იტვირთება...</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {shops.map(shop => (
                  <div key={shop.id} className="flex items-center px-5 py-3 gap-3">
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-900">#{shop.shop_number} — {shop.name}</p>
                      {shop.location && <p className="text-xs text-gray-400">{shop.location}</p>}
                    </div>
                    <button
                      onClick={() => handleDeleteShop(shop)}
                      disabled={deletingShop === shop.id}
                      className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40 px-2 py-1"
                    >
                      წაშლა
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'checkers' && (
        <div className="space-y-4">
          <form onSubmit={handleAddChecker} className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
            <h2 className="text-sm font-semibold text-gray-700">ჩეკერის დამატება</h2>
            <div className="grid grid-cols-3 gap-3">
              <input
                value={checkerName}
                onChange={e => setCheckerName(e.target.value)}
                placeholder="სრული სახელი *"
                required
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="email"
                value={checkerEmail}
                onChange={e => setCheckerEmail(e.target.value)}
                placeholder="ელ-ფოსტა *"
                required
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="password"
                value={checkerPassword}
                onChange={e => setCheckerPassword(e.target.value)}
                placeholder="პაროლი (მინ. 6) *"
                required
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {checkerError && <p className="text-xs text-red-600">{checkerError}</p>}
            {checkerSuccess && <p className="text-xs text-green-600">{checkerSuccess}</p>}
            <button
              type="submit"
              disabled={checkerSaving}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-lg"
            >
              {checkerSaving ? 'ემატება...' : '+ დამატება'}
            </button>
          </form>

          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-50">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{checkers.length} ჩეკერი</p>
            </div>
            {checkersLoading ? (
              <p className="text-sm text-gray-400 p-5">იტვირთება...</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {checkers.map(c => (
                  <div key={c.id} className="flex items-center px-5 py-3 gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                      {(c.full_name || '?').slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{c.full_name || '—'}</p>
                      <p className="text-xs text-gray-400">{c.email}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
