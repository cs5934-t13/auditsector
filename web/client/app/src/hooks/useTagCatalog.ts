import { useEffect, useState } from 'react';
import { fetchTags, TagsApiError, type Tag } from '../api/tags';
import { useAuth } from '../auth/AuthContext';

type Result = { key: string; tags?: Tag[]; error?: TagsApiError };

/** Per-page catalog state, cancelled on navigation or a different signed-in user. */
export function useTagCatalog() {
  const { user } = useAuth();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const key = `${user?.username ?? ''}:${attempt}`;
  const current = result?.key === key ? result : null;

  useEffect(() => {
    const controller = new AbortController();
    let ignore = false;
    fetchTags({ signal: controller.signal })
      .then((tags) => { if (!ignore) setResult({ key, tags }); })
      .catch((failure: unknown) => {
        if (ignore || controller.signal.aborted) return;
        const error = failure instanceof TagsApiError ? failure : new TagsApiError('Unable to load tags. Please try again.');
        setResult({ key, error });
      });
    return () => { ignore = true; controller.abort(); };
  }, [key]);

  return { tags: current?.tags ?? [], error: current?.error, loading: current === null,
    retry: () => setAttempt((value) => value + 1) };
}
