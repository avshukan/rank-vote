import { NotFound } from '../shared/ui/NotFound';

/** Catch-all route: any URL the router cannot match lands here. */
export function NotFoundPage() {
  return (
    <main className="mx-auto max-w-xl p-6">
      <NotFound />
    </main>
  );
}
