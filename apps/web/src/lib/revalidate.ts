import { revalidatePath as nextRevalidatePath } from 'next/cache';

/**
 * revalidatePath() throws when called OUTSIDE a request/action scope (e.g. from the
 * background job worker in lib/jobRunner, which runs detached from any request).
 * Pages are `force-dynamic` and every device polls job state, so a skipped revalidate
 * just means the cache refreshes on the next navigation — never a correctness issue.
 */
export function safeRevalidate(path: string): void {
  try {
    nextRevalidatePath(path);
  } catch {
    /* outside request scope — ignore */
  }
}
