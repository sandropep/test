#!/usr/bin/env node
/**
 * One-off / re-runnable import: reads the "shops" sheet of the monitoring
 * Excel and upserts shop -> checker ownership into public.shop_checkers.
 *
 * Usage:
 *   SUPABASE_ADMIN_EMAIL=you@example.com SUPABASE_ADMIN_PASSWORD=... \
 *     node scripts/import-shop-checkers.js "C:\path\to\file.xlsx" [--dry-run]
 *
 * --dry-run does all the matching and prints the same report, but writes
 * nothing — use it to sanity-check shop_number / checker matches first.
 *
 * Matches rows by shops.shop_number (text) and users.full_name (checker,
 * exact match). Anything that doesn't match is reported, never guessed at.
 * Rows whose checker column is blank or "არ გაწერილა" are skipped (shop
 * stays unassigned).
 */
const XLSX = require('xlsx');

const SUPABASE_URL = 'https://mkumxedlfoxjqggsnctq.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Ud7dAsBGhUVIO7KHjJR6FQ_HTu5n6VN';
const UNASSIGNED_SENTINEL = 'არ გაწერილა';
const SHEET_NAME = 'shops';
const BATCH_SIZE = 500;

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const filePath = args.find(a => !a.startsWith('--'));
  const email = process.env.SUPABASE_ADMIN_EMAIL;
  const password = process.env.SUPABASE_ADMIN_PASSWORD;

  if (!filePath) {
    console.error('Usage: node scripts/import-shop-checkers.js <path-to-excel.xlsx> [--dry-run]');
    process.exit(1);
  }
  if (!email || !password) {
    console.error('Set SUPABASE_ADMIN_EMAIL and SUPABASE_ADMIN_PASSWORD (an admin account) in the environment.');
    process.exit(1);
  }

  const accessToken = await signIn(email, password);

  const [shops, checkers] = await Promise.all([
    fetchAllRows('shops', 'id,shop_number', accessToken),
    fetchAllRows('users', 'id,full_name', accessToken, 'role=eq.checker'),
  ]);
  const shopByNumber = new Map(shops.map(s => [String(s.shop_number).trim(), s.id]));
  const checkerByName = new Map(checkers.map(c => [c.full_name.trim(), c.id]));
  console.log(`Loaded ${shops.length} shops and ${checkers.length} checkers from Supabase.`);

  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[SHEET_NAME];
  if (!ws) {
    console.error(`Sheet "${SHEET_NAME}" not found. Sheets in file: ${wb.SheetNames.join(', ')}`);
    process.exit(1);
  }
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }).slice(1); // drop header row

  const upserts = [];
  const unmatchedShopNumbers = new Set();
  const unmatchedCheckerNames = new Set();
  const excelShopNumbers = new Set();
  let skippedUnassigned = 0;

  for (const row of rows) {
    const shopNumber = String(row[0] ?? '').trim();
    const checkerLatin = String(row[4] ?? '').trim(); // column E: clean latin slug
    if (!shopNumber) continue;
    excelShopNumbers.add(shopNumber);
    if (!checkerLatin || checkerLatin === UNASSIGNED_SENTINEL) { skippedUnassigned++; continue; }

    const shopId = shopByNumber.get(shopNumber);
    const checkerId = checkerByName.get(checkerLatin);
    if (!shopId) { unmatchedShopNumbers.add(shopNumber); continue; }
    if (!checkerId) { unmatchedCheckerNames.add(checkerLatin); continue; }

    upserts.push({ shop_id: shopId, checker_id: checkerId, updated_at: new Date().toISOString() });
  }

  const shopsMissingFromExcel = [...shopByNumber.keys()].filter(n => !excelShopNumbers.has(n));

  console.log(`\nExcel shop rows: ${excelShopNumbers.size} unique shop_number(s)`);
  console.log(`Rows to upsert: ${upserts.length}`);
  console.log(`Skipped (unassigned in Excel): ${skippedUnassigned}`);
  if (unmatchedShopNumbers.size) {
    console.log(`\nExcel shop numbers NOT found in Supabase shops table (${unmatchedShopNumbers.size}):`);
    console.log('  ' + [...unmatchedShopNumbers].join(', '));
  } else {
    console.log('\nEvery shop_number in the Excel matches a row in the shops table.');
  }
  if (shopsMissingFromExcel.length) {
    console.log(`\nSupabase shops NOT present in the Excel at all (${shopsMissingFromExcel.length}) — these will stay unassigned:`);
    console.log('  ' + shopsMissingFromExcel.join(', '));
  }
  if (unmatchedCheckerNames.size) {
    console.log(`\nChecker names not found in Supabase (${unmatchedCheckerNames.size}):`);
    console.log('  ' + [...unmatchedCheckerNames].join(', '));
  }

  if (dryRun) {
    console.log('\n--dry-run: nothing was written.');
    return;
  }

  if (!upserts.length) {
    console.log('\nNothing to write.');
    return;
  }

  for (let i = 0; i < upserts.length; i += BATCH_SIZE) {
    const batch = upserts.slice(i, i + BATCH_SIZE);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/shop_checkers?on_conflict=shop_id`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(batch),
    });
    if (!res.ok) {
      console.error(`Batch ${i / BATCH_SIZE + 1} failed: ${res.status} ${await res.text()}`);
      process.exit(1);
    }
    console.log(`Upserted rows ${i + 1}-${i + batch.length} / ${upserts.length}`);
  }

  console.log('\nDone.');
}

async function signIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Sign-in failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.access_token;
}

async function fetchAllRows(table, select, accessToken, extraQuery) {
  const pageSize = 1000;
  let from = 0;
  let all = [];
  while (true) {
    const qs = new URLSearchParams({ select });
    const url = `${SUPABASE_URL}/rest/v1/${table}?${qs}${extraQuery ? `&${extraQuery}` : ''}`;
    const res = await fetch(url, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
        Range: `${from}-${from + pageSize - 1}`,
      },
    });
    if (!res.ok) throw new Error(`Fetch ${table} failed: ${res.status} ${await res.text()}`);
    const page = await res.json();
    all = all.concat(page);
    if (page.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
