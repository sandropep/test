const PAGE_SIZE = 1000;

/**
 * Supabase caps any single request at the project's max_rows setting (1000 by default),
 * regardless of .limit(). Paginate with .range() to get every row when an accurate
 * aggregate (distinct counts, averages, etc.) is needed rather than just a row count.
 *
 * - Advances by the number of rows actually returned and stops only on an empty page,
 *   so a server cap smaller than PAGE_SIZE can't silently truncate or skip rows.
 * - Throws on a request error instead of returning a partial result.
 * - The query should have a stable .order() (e.g. on the primary key); offset paging
 *   over an unordered result may repeat or drop rows between pages.
 */
export async function fetchAllRows<T>(queryFactory: () => any): Promise<T[]> {
  let all: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await queryFactory().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    if (rows.length === 0) break;
    all = all.concat(rows);
    from += rows.length;
  }
  return all;
}
