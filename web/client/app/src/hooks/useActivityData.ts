import { useCallback, useEffect, useState } from 'react';
import {
  HomeActivityApiError,
  type ActivityRange,
} from '../api/homeActivity.ts';

export type ActivityLoadState<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error'; error: HomeActivityApiError };

/**
 * Loads one homepage activity series and tracks its request state.
 *
 * The homepage charts each own a request, so they can fail and retry
 * independently: an aggregation error in one chart must not blank the other.
 * `retry` re-issues the request and returns the state to `loading` first, so the
 * panel does not keep showing a stale error while the new request is in flight.
 */
export function useActivityData<T>(
  load: (range: ActivityRange, init: { signal: AbortSignal }) => Promise<T[]>,
  range: ActivityRange = {},
  what = 'activity data',
): { state: ActivityLoadState<T[]>; retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<ActivityLoadState<T[]>>({ status: 'loading' });

  // The range is compared by value below, so a caller that builds an object
  // inline does not re-request on every render.
  const { startDate, endDate, interval } = range;

  useEffect(() => {
    const controller = new AbortController();
    let ignore = false;

    load({ startDate, endDate, interval }, { signal: controller.signal })
      .then((data) => {
        if (!ignore) setState({ status: 'ready', data });
      })
      .catch((failure: unknown) => {
        if (ignore || controller.signal.aborted) return;
        setState({
          status: 'error',
          error:
            failure instanceof HomeActivityApiError
              ? failure
              : new HomeActivityApiError(`Unable to load ${what}. Please try again.`),
        });
      });

    return () => {
      ignore = true;
      controller.abort();
    };
  }, [load, startDate, endDate, interval, attempt, what]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((value) => value + 1);
  }, []);

  return { state, retry };
}
