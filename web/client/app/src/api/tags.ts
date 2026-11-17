import { RISK_LEVELS, type RiskLevel } from '../utils/risk.ts';
import { tagSlug } from '../utils/tags.ts';

export interface Tag {
  tag_id: number;
  name: string;
}

export interface TagAudit {
  audit_id: string | number;
  title: string;
  risk_level: RiskLevel | null;
  run_status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | null;
}

export class TagsApiError extends Error {
  readonly status?: number;
  readonly code?: string;

  constructor(message: string, details: { status?: number; code?: string } = {}) {
    super(message);
    this.name = 'TagsApiError';
    this.status = details.status;
    this.code = details.code;
  }
}

type Options = { fetcher?: typeof fetch; signal?: AbortSignal; timeoutMs?: number };
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isId = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

function unexpected(): never {
  throw new TagsApiError('The tag service returned an unexpected response. Please try again.', {
    code: 'UNEXPECTED_RESPONSE',
  });
}

async function getJson(path: string, { fetcher = fetch, signal, timeoutMs = 15_000 }: Options): Promise<unknown> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let response: Response;
  let body: unknown;
  try {
    if (requestSignal.aborted) throw requestSignal.reason;
    response = await fetcher(path, {
      method: 'GET', credentials: 'same-origin', headers: { Accept: 'application/json' }, signal: requestSignal,
    });
    try {
      body = await response.json();
    } catch (error) {
      if (requestSignal.aborted) throw error;
      body = null;
    }
  } catch {
    const code = timeout.aborted ? 'REQUEST_TIMEOUT' : requestSignal.aborted ? 'REQUEST_ABORTED' : 'NETWORK_ERROR';
    const message = timeout.aborted ? 'Loading tags timed out. Please try again.'
      : requestSignal.aborted ? 'Loading tags was cancelled.'
        : 'Could not reach the tag service. Please try again.';
    throw new TagsApiError(message, { code });
  }
  if (!response.ok) {
    const error = isRecord(body) && isRecord(body.error) ? body.error : null;
    throw new TagsApiError(response.status === 401 ? 'Sign in to view tags.'
      : error && typeof error.message === 'string' && error.message.trim() ? error.message
        : 'Unable to load tags. Please try again.', {
      status: response.status, code: error && typeof error.code === 'string' ? error.code : undefined,
    });
  }
  if (response.status !== 200) unexpected();
  return body;
}

export async function fetchTags(options: Options = {}): Promise<Tag[]> {
  const body = await getJson('/api/tag', options);
  if (!Array.isArray(body) || !body.every((value): value is Tag =>
    isRecord(value) && isId(value.tag_id) && typeof value.name === 'string' && value.name.trim().length > 0)) unexpected();
  if (new Set(body.map((tag) => tag.tag_id)).size !== body.length) unexpected();
  return body.map(({ tag_id, name }) => ({ tag_id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchTagAudits(tagId: number, options: Options = {}): Promise<TagAudit[]> {
  if (!isId(tagId)) throw new TagsApiError('Invalid tag identifier.', { code: 'INVALID_TAG' });
  const body = await getJson(`/api/tag/${tagId}`, options);
  if (!Array.isArray(body) || !body.every((value): value is TagAudit => {
    if (!isRecord(value)) return false;
    return (isId(value.audit_id) || (typeof value.audit_id === 'string' && value.audit_id.trim().length > 0))
      && typeof value.title === 'string'
      && (value.risk_level === null || (typeof value.risk_level === 'string' && (RISK_LEVELS as readonly string[]).includes(value.risk_level)))
      && (value.run_status === null || (typeof value.run_status === 'string' && ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED'].includes(value.run_status)));
  })) unexpected();
  if (new Set(body.map((row) => String(row.audit_id))).size !== body.length) unexpected();
  return body.map(({ audit_id, title, risk_level, run_status }) => ({ audit_id, title, risk_level, run_status }));
}

/** Numeric ID links avoid collisions between names such as C++ and C#. */
export function resolveTag(tags: readonly Tag[], segment: string): Tag | undefined {
  if (/^[1-9]\d*$/.test(segment)) {
    const byId = tags.find((tag) => tag.tag_id === Number(segment));
    if (byId) return byId;
  }
  const exact = tags.find((tag) => tag.name === segment);
  if (exact) return exact;
  const slug = tagSlug(segment);
  if (!slug) return undefined;
  const matches = tags.filter((tag) => tagSlug(tag.name) === slug);
  return matches.length === 1 ? matches[0] : undefined;
}
