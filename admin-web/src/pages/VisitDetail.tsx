import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

interface VisitData {
  date: string;
  score_percent: number | null;
  category: string | null;
  notes: string | null;
  warehouse_rating: number | null;
  fridge_rating: number | null;
  shelf_rating: number | null;
  shops: { shop_number: string; name: string; location: string | null } | null;
  checker: { full_name: string } | null;
}

interface Photo { position: string; storage_path: string; signedUrl: string }

const CATEGORY_COLORS: Record<string, string> = {
  A: 'bg-green-100 text-green-700',
  B: 'bg-blue-100 text-blue-700',
  C: 'bg-yellow-100 text-yellow-700',
  D: 'bg-red-100 text-red-700',
};

export default function VisitDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [visit, setVisit] = useState<VisitData | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    supabase
      .from('visits')
      .select('date, warehouse_rating, fridge_rating, shelf_rating, score_percent, category, notes, shops(shop_number, name, location), checker:checker_id(full_name)')
      .eq('id', id)
      .single()
      .then(async ({ data, error }) => {
        if (error || !data) { setLoading(false); return; }
        setVisit(data as unknown as VisitData);

        const { data: photoRows } = await supabase
          .from('photos')
          .select('position, storage_path')
          .eq('visit_id', id);

        if (photoRows?.length) {
          const { data: signedUrls } = await supabase.storage
            .from('photos')
            .createSignedUrls(photoRows.map(r => r.storage_path), 3600);

          const urlMap = Object.fromEntries((signedUrls ?? []).map(s => [s.path, s.signedUrl]));
          setPhotos(photoRows.map(row => ({
            position: row.position,
            storage_path: row.storage_path,
            signedUrl: urlMap[row.storage_path] ?? '',
          })));
        }

        setLoading(false);
      });
  }, [id]);

  if (loading) return <div className="p-6 text-sm text-gray-400">იტვირთება...</div>;
  if (!visit) return <div className="p-6 text-sm text-gray-400">ვიზიტი ვერ მოიძებნა</div>;

  const shop = visit.shops;
  const checkerName = visit.checker?.full_name ?? '—';

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <button
        onClick={() => navigate('/visits')}
        className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
      >
        ← უკან
      </button>

      <div>
        <h1 className="text-xl font-bold text-gray-900">ვიზიტის დეტალები</h1>
        <p className="text-sm text-gray-400">{visit.date}</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-5 grid grid-cols-2 gap-5">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">მაღაზია</p>
          <p className="text-sm font-semibold text-gray-900">
            {shop ? `#${shop.shop_number} ${shop.name}` : '—'}
          </p>
          {shop?.location && <p className="text-xs text-gray-400 mt-0.5">{shop.location}</p>}
        </div>
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">ჩეკერი</p>
          <p className="text-sm font-semibold text-gray-900">{checkerName}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">საერთო ქულა</p>
          <p className="text-2xl font-bold text-gray-900">
            {visit.score_percent != null ? `${visit.score_percent}%` : '—'}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">კატეგორია</p>
          {visit.category ? (
            <span className={`inline-block px-3 py-1 rounded-full text-sm font-bold ${CATEGORY_COLORS[visit.category] ?? 'bg-gray-100 text-gray-600'}`}>
              {visit.category}
            </span>
          ) : <p className="text-sm text-gray-400">—</p>}
        </div>

        {(visit.warehouse_rating != null || visit.fridge_rating != null || visit.shelf_rating != null) && (
          <div className="col-span-2 grid grid-cols-3 gap-3 pt-2 border-t border-gray-50">
            {[
              { label: 'საწყობი', value: visit.warehouse_rating },
              { label: 'მაცივარი', value: visit.fridge_rating },
              { label: 'თარო', value: visit.shelf_rating },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{label}</p>
                <p className="text-lg font-bold text-gray-900">{value != null ? `${value}%` : '—'}</p>
              </div>
            ))}
          </div>
        )}

        {visit.notes && (
          <div className="col-span-2">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">შენიშვნები</p>
            <p className="text-sm text-gray-700">{visit.notes}</p>
          </div>
        )}
      </div>

      {photos.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">ფოტოები ({photos.length})</h2>
          <div className="grid grid-cols-3 gap-3">
            {photos.map((photo, i) => (
              <div key={i} className="space-y-1">
                <img
                  src={photo.signedUrl}
                  alt={photo.position}
                  className="w-full aspect-square object-cover rounded-xl cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={() => setLightbox(photo.signedUrl)}
                />
                {photo.position && (
                  <p className="text-xs text-center text-gray-400">{photo.position}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => setLightbox(null)}
        >
          <img
            src={lightbox}
            alt="full"
            className="max-w-full max-h-full object-contain rounded-xl"
          />
        </div>
      )}
    </div>
  );
}
