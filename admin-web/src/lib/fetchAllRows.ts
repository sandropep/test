const SUPABASE_MAX_ROWS = 1000;

/**
 * Supabase caps any single request at SUPABASE_MAX_ROWS (PostgREST's default max_rows),
 * regardless of .limit(). Paginate with .range() to get every row when an accurate
 * aggregate (distinct counts, averages, etc.) is needed rather than just a row count.
 */
export async function fetchAllRows<T>(queryFactory: () => any): Promise<T[]> {
  let all: T[] = [];
  let from = 0;
  while (true) {
    const { data } = await queryFactory().range(from, from + SUPABASE_MAX_ROWS - 1);
    const rows = (data ?? []) as T[];
    all = all.concat(rows);
    if (rows.length < SUPABASE_MAX_ROWS) break;
    from += SUPABASE_MAX_ROWS;
  }
  return all;
}
