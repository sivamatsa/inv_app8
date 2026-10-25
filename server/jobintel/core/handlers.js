// Ported from Job Intelligence (server.ts route table)
//
// Portable core: no fs / path / process / express. Paths are RELATIVE to the mount point
// (e.g. /api/jobintel), so `/jobs/:id` here is `/api/jobintel/jobs/:id` on the wire.
//
// Route handler signature: async ({ store, params, query, body, ai }) => ({ status, body, headers? })
// The router owns body-size limits, authentication and rate limiting; `auth` is only a hint
// ('read' | 'write' | 'ai' | 'discovery') for the rate limiter.

import {
  parseNaturalLanguageQuery,
  matchJobWithProfile,
  analyzeResumeVsJob,
  generateInterviewPrep,
} from './gemini.js';

const defaultAi = {
  parseNaturalLanguageQuery,
  matchJobWithProfile,
  analyzeResumeVsJob,
  generateInterviewPrep,
};

// ---------------------------------------------------------------------------
// Input hardening (spec item E)
// ---------------------------------------------------------------------------

const MAX_STRING = 20000;
const MAX_ARRAY = 500;
const MAX_DEPTH = 8;
const MAX_IMPORT_ITEMS = 5000;
const ID_RE = /^[A-Za-z0-9_.:-]{1,80}$/;
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
// Managed by the server; a client can never set these through a body.
const SERVER_KEYS = new Set(['id', 'created_at', 'updated_at', 'uploaded_at']);

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// Collision-safe id: original prefix + Date.now().toString(36) + 4 random chars.
function makeId(prefix) {
  let rand = Math.random().toString(36).slice(2, 6);
  while (rand.length < 4) rand += '0';
  return `${prefix}-${Date.now().toString(36)}${rand}`;
}

function cleanString(s) {
  const t = s.trim();
  return t.length > MAX_STRING ? t.slice(0, MAX_STRING) : t;
}

// Recursively sanitize arbitrary JSON-ish data. Returns undefined for values that must be dropped.
function sanitizeDeep(v, depth) {
  if (depth > MAX_DEPTH) return undefined;
  if (v === null) return null;
  if (typeof v === 'string') return cleanString(v);
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'boolean') return v;
  if (Array.isArray(v)) {
    const out = [];
    const n = Math.min(v.length, MAX_ARRAY);
    for (let i = 0; i < n; i++) {
      const item = sanitizeDeep(v[i], depth + 1);
      if (item !== undefined) out.push(item);
    }
    return out;
  }
  if (isPlainObject(v)) {
    const out = {};
    for (const key of Object.keys(v)) {
      if (UNSAFE_KEYS.has(key)) continue;
      const item = sanitizeDeep(v[key], depth + 1);
      if (item !== undefined) out[key] = item;
    }
    return out;
  }
  return undefined;
}

// kind: 's' string, 'n' number, 'b' boolean, 'a' array, 'x' anything JSON-ish
function coerce(kind, v) {
  if (v === null) return { ok: true, value: null };
  switch (kind) {
    case 's':
      if (typeof v === 'string') return { ok: true, value: cleanString(v) };
      if (typeof v === 'number' && Number.isFinite(v)) return { ok: true, value: String(v) };
      return { ok: false };
    case 'n':
      if (typeof v === 'number') return Number.isFinite(v) ? { ok: true, value: v } : { ok: false };
      if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) {
        return { ok: true, value: Number(v) };
      }
      return { ok: false };
    case 'b':
      return typeof v === 'boolean' ? { ok: true, value: v } : { ok: false };
    case 'a':
      return Array.isArray(v) ? { ok: true, value: sanitizeDeep(v, 0) } : { ok: false };
    default: {
      const d = sanitizeDeep(v, 0);
      return d === undefined ? { ok: false } : { ok: true, value: d };
    }
  }
}

function inferKind(v) {
  if (typeof v === 'string') return 's';
  if (typeof v === 'number') return 'n';
  if (typeof v === 'boolean') return 'b';
  if (Array.isArray(v)) return 'a';
  return 'x';
}

function buildKinds(groups) {
  const map = {};
  for (const kind of Object.keys(groups)) {
    for (const key of groups[kind]) map[key] = kind;
  }
  return map;
}

// Keep only allow-listed keys (plus, for updates, keys that already exist on the stored record),
// type-check them lightly and drop everything else.
function sanitizeRecord(body, kinds, existing) {
  const out = {};
  for (const key of Object.keys(body)) {
    if (SERVER_KEYS.has(key) || UNSAFE_KEYS.has(key)) continue;
    let kind = null;
    if (hasOwn(kinds, key)) kind = kinds[key];
    else if (existing && hasOwn(existing, key)) kind = inferKind(existing[key]);
    if (!kind) continue;
    const r = coerce(kind, body[key]);
    if (r.ok) out[key] = r.value;
  }
  return out;
}

// Per-entity allow-lists derived from src/types.ts
const JOB_KINDS = buildKinds({
  s: [
    'external_job_id', 'source_id', 'source_name', 'title', 'normalized_title', 'company', 'company_id',
    'location', 'country', 'city', 'state', 'remote_mode', 'employment_type', 'salary_currency', 'salary_raw',
    'description', 'description_raw', 'summary_30s', 'original_url', 'company_careers_url', 'posted_at',
    'first_seen_at', 'last_seen_at', 'last_changed_at', 'status', 'previous_seen_date', 'content_hash',
    'visa_sponsorship', 'education',
  ],
  n: ['min_experience', 'max_experience', 'salary_min', 'salary_max'],
  b: ['is_repost', 'is_synthetic'],
  a: ['skills', 'required_skills', 'preferred_skills', 'responsibilities', 'all_sources', 'change_history'],
  x: ['ai_match'],
});

const PROFILE_KINDS = buildKinds({
  s: ['name', 'salary_currency', 'visa_preference', 'discovery_interval'],
  n: ['min_experience', 'max_experience', 'salary_min', 'posted_within_days'],
  b: ['is_active'],
  a: [
    'keywords', 'related_keywords', 'excluded_keywords', 'target_titles', 'required_skills', 'countries',
    'locations', 'remote_mode', 'employment_types', 'watched_companies', 'excluded_companies', 'sources',
  ],
});

const APPLICATION_KINDS = buildKinds({
  s: [
    'job_id', 'company', 'role', 'location', 'source', 'original_url', 'job_url', 'status', 'applied_date',
    'application_ref_id', 'application_url', 'application_method', 'resume_version', 'cover_letter_version',
    'recruiter_name', 'recruiter_contact', 'hr_contact', 'expected_currency', 'notice_period',
    'joining_preference', 'rejection_date', 'rejection_reason', 'offer_date', 'accepted_date',
    'withdrawal_reason', 'notes', 'next_action', 'follow_up_date',
  ],
  n: ['expected_salary', 'current_salary'],
  a: ['timeline'],
});

const INTERVIEW_KINDS = buildKinds({
  s: [
    'application_id', 'company', 'role', 'round_name', 'interview_type', 'date', 'time', 'timezone',
    'interviewer', 'meeting_url', 'meeting_link', 'location', 'preparation_notes', 'prep_notes', 'result',
    'status', 'feedback', 'debrief_notes', 'debrief_sentiment', 'next_step',
  ],
  n: ['round_number'],
  a: ['interviewers', 'topics', 'topics_to_revise', 'questions_to_ask'],
  x: ['ai_prep_material', 'ai_prep_questions'],
});

const RECRUITER_KINDS = buildKinds({
  s: [
    'name', 'company', 'email', 'phone', 'linkedin', 'role', 'source', 'notes', 'last_contacted',
    'next_follow_up',
  ],
  a: ['linked_applications'],
});

const FOLLOWUP_KINDS = buildKinds({
  s: [
    'application_id', 'recruiter_id', 'company', 'role', 'title', 'due_date', 'priority', 'status',
    'category', 'notes',
  ],
});

const OFFER_KINDS = buildKinds({
  s: [
    'application_id', 'company', 'role', 'equity_rsu', 'equity_details', 'currency', 'location', 'work_mode',
    'remote_policy', 'notice_period', 'offer_date', 'deadline_date', 'decision_deadline', 'joining_date',
    'start_date', 'insurance_details', 'notes', 'status',
  ],
  n: [
    'base_salary', 'variable_salary', 'variable_pay', 'joining_bonus', 'signing_bonus', 'equity_value',
    'total_ctc',
  ],
  x: ['benefits'],
});

const DOCUMENT_KINDS = buildKinds({
  s: ['name', 'type', 'version', 'content', 'file_name', 'file_size'],
  b: ['is_default'],
});

const COMPANY_KINDS = buildKinds({
  s: ['name', 'website', 'career_url', 'notes', 'hiring_trend'],
  n: ['active_jobs_count'],
  b: ['is_watched', 'is_muted', 'is_blocked'],
});

const SOURCE_KINDS = buildKinds({
  s: ['name', 'type', 'endpoint', 'rate_limit', 'status', 'last_sync', 'description'],
  n: ['total_jobs_found'],
  b: ['enabled'],
});

const PROFILE_ARRAY_DEFAULTS = [
  'keywords', 'related_keywords', 'excluded_keywords', 'target_titles', 'required_skills', 'countries',
  'locations', 'remote_mode', 'employment_types', 'watched_companies', 'excluded_companies', 'sources',
];

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function ok(body, status) {
  return { status: status || 200, body };
}

function fail(status, message) {
  return { status, body: { error: message } };
}

// Pipeline stages the board knows about; a record with any other status would silently vanish from the Kanban board.
const APPLICATION_STATUSES = ['Saved', 'Applied', 'Screening', 'Technical Round', 'Managerial Round', 'HR Round', 'Offer', 'Accepted', 'Rejected'];
function badStatus(b) {
  return b && b.status !== undefined && !APPLICATION_STATUSES.includes(b.status);
}

// Body for routes that REQUIRE an object. Returns null when the body is unusable.
function requireObject(body) {
  return isPlainObject(body) ? body : null;
}

// Body for routes where a body is optional (null/undefined -> {}).
function optionalObject(body) {
  if (body === undefined || body === null) return {};
  return isPlainObject(body) ? body : null;
}

function invalidBody() {
  return fail(400, 'Invalid body');
}

function qget(query, key) {
  if (!query) return undefined;
  let v;
  if (typeof query.get === 'function') {
    v = query.get(key);
    if (v === null) v = undefined;
  } else {
    v = query[key];
  }
  if (Array.isArray(v)) v = v[0];
  return typeof v === 'string' ? v : undefined;
}

function str(v) {
  return typeof v === 'string' ? v : '';
}

// Upsert id resolution (coordinator correction to item E): a client id is honoured ONLY if it matches
// ID_RE. If it exists in `list` the record is updated, otherwise a new record is created with that id.
// With no / invalid id the server generates one.
function resolveId(body, list, prefix) {
  const cid = body.id;
  if (typeof cid === 'string' && ID_RE.test(cid)) {
    return { id: cid, existing: list.find((x) => x.id === cid) };
  }
  return { id: makeId(prefix), existing: undefined };
}

function discoverySummary(run) {
  return {
    jobs_scanned: run.jobs_scanned,
    jobs_added: run.jobs_added,
    jobs_updated: run.jobs_updated,
    duplicates_merged: run.duplicates_merged,
    sources_checked: run.sources_checked,
    errors: run.errors,
  };
}

// Shared by /discovery/run and /discovery/trigger
async function runDiscoveryHandler({ store, body }) {
  const b = optionalObject(body);
  if (!b) return invalidBody();
  if (store.isRunning) return fail(409, 'Discovery already running');
  const query = typeof b.query === 'string' ? cleanString(b.query) : undefined;
  const pid = typeof b.profileId === 'string' && b.profileId ? b.profileId : undefined;
  const spid = typeof b.searchProfileId === 'string' && b.searchProfileId ? b.searchProfileId : undefined;
  try {
    const run = await store.executeLiveDiscovery(query, pid || spid);
    return ok({ ...run, summary: discoverySummary(run) });
  } catch (err) {
    if (err && err.code === 'DISCOVERY_RUNNING') return fail(409, 'Discovery already running');
    console.error('[jobintel] discovery failed', err && err.message);
    return fail(500, (err && err.message) || 'Discovery run failed');
  }
}

function handleMarkAllRead({ store }) {
  store.markAllNotificationsRead();
  return ok({ success: true });
}

// ---------------------------------------------------------------------------
// Route table
// ---------------------------------------------------------------------------

export const routes = [
  // 1. Health check
  {
    method: 'GET',
    path: '/health',
    handler: async ({ store }) =>
      ok({
        status: 'ok',
        timestamp: new Date().toISOString(),
        jobsCount: store.getJobs().length,
      }),
  },

  // 2. Jobs
  {
    method: 'GET',
    path: '/jobs',
    auth: 'read',
    handler: async ({ store, query }) => {
      const minExp = qget(query, 'minExp');
      const limit = qget(query, 'limit');
      const jobs = store.getJobs({
        query: qget(query, 'query'),
        profileId: qget(query, 'profileId'),
        remote: qget(query, 'remote'),
        country: qget(query, 'country'),
        minExp: minExp ? parseInt(minExp, 10) : undefined,
        source: qget(query, 'source'),
        status: qget(query, 'status'),
        limit: limit ? parseInt(limit, 10) : undefined,
      });
      return ok(jobs);
    },
  },
  {
    method: 'GET',
    path: '/jobs/:id',
    auth: 'read',
    handler: async ({ store, params }) => {
      const job = store.getJobById(params.id);
      if (!job) return fail(404, 'Job not found');
      return ok(job);
    },
  },
  {
    method: 'PATCH',
    path: '/jobs/:id',
    auth: 'write',
    handler: async ({ store, params, body }) => {
      const b = requireObject(body);
      if (!b) return invalidBody();
      const job = store.getJobById(params.id);
      if (!job) return fail(404, 'Job not found');
      const updated = { ...job, ...sanitizeRecord(b, JOB_KINDS, job) };
      updated.id = job.id;
      store.updateJob(updated);
      return ok(updated);
    },
  },

  // 3. Discovery
  { method: 'POST', path: '/discovery/run', auth: 'discovery', handler: runDiscoveryHandler },
  { method: 'POST', path: '/discovery/trigger', auth: 'discovery', handler: runDiscoveryHandler },
  {
    method: 'GET',
    path: '/discovery/runs',
    auth: 'read',
    handler: async ({ store }) => ok(store.getDiscoveryRuns()),
  },
  {
    method: 'GET',
    path: '/discovery/status',
    auth: 'read',
    handler: async ({ store }) => {
      const runs = store.getDiscoveryRuns();
      const lastRun = runs[0];
      return ok({
        is_running: store.isRunning,
        last_run_at: lastRun ? lastRun.started_at : null,
        analytics: store.getAnalytics(),
      });
    },
  },

  // 4. Natural language query parsing
  {
    method: 'POST',
    path: '/search/natural-language',
    auth: 'ai',
    handler: async ({ body, ai }) => {
      const b = requireObject(body);
      if (!b) return invalidBody();
      const q = typeof b.query === 'string' ? cleanString(b.query) : '';
      if (!q) return fail(400, 'Query string required');
      try {
        const extracted = await ai.parseNaturalLanguageQuery(q);
        return ok(extracted);
      } catch (err) {
        return fail(500, (err && err.message) || 'NL query parsing failed');
      }
    },
  },

  // 5. Search profiles
  {
    method: 'GET',
    path: '/search-profiles',
    auth: 'read',
    handler: async ({ store }) => ok(store.getSearchProfiles()),
  },
  {
    method: 'GET',
    path: '/profiles',
    auth: 'read',
    handler: async ({ store }) => ok(store.getSearchProfiles()),
  },
  {
    method: 'POST',
    path: '/search-profiles',
    auth: 'write',
    handler: async ({ store, body }) => {
      const b = requireObject(body);
      if (!b) return invalidBody();
      const now = new Date().toISOString();
      const { id, existing } = resolveId(b, store.getSearchProfiles(), 'profile');
      if (existing) {
        const updated = {
          ...existing,
          ...sanitizeRecord(b, PROFILE_KINDS, existing),
          id: existing.id,
          created_at: existing.created_at,
          updated_at: now,
        };
        store.saveSearchProfile(updated);
        return ok(updated, 200);
      }
      const defaults = {};
      for (const k of PROFILE_ARRAY_DEFAULTS) defaults[k] = [];
      const newProfile = {
        ...defaults,
        ...sanitizeRecord(b, PROFILE_KINDS, null),
        id,
        created_at: now,
        updated_at: now,
      };
      store.saveSearchProfile(newProfile);
      return ok(newProfile, 201);
    },
  },
  {
    method: 'PUT',
    path: '/search-profiles/:id',
    auth: 'write',
    handler: async ({ store, params, body }) => {
      const b = requireObject(body);
      if (!b) return invalidBody();
      const profile = store.getSearchProfileById(params.id);
      if (!profile) return fail(404, 'Profile not found');
      const updated = {
        ...profile,
        ...sanitizeRecord(b, PROFILE_KINDS, profile),
        id: profile.id,
        created_at: profile.created_at,
        updated_at: new Date().toISOString(),
      };
      store.saveSearchProfile(updated);
      return ok(updated);
    },
  },
  {
    method: 'DELETE',
    path: '/search-profiles/:id',
    auth: 'write',
    handler: async ({ store, params }) => {
      store.deleteSearchProfile(params.id);
      return ok({ success: true });
    },
  },

  // 6. Applications & CRM
  {
    method: 'GET',
    path: '/applications',
    auth: 'read',
    handler: async ({ store }) => ok(store.getApplications()),
  },
  {
    method: 'POST',
    path: '/applications',
    auth: 'write',
    handler: async ({ store, body }) => {
      const b = requireObject(body);
      if (!b) return invalidBody();
      if (badStatus(b)) return fail(400, 'Unknown application status');
      const now = new Date().toISOString();
      const { id, existing } = resolveId(b, store.getApplications(), 'app');
      if (existing) {
        const updated = {
          ...existing,
          ...sanitizeRecord(b, APPLICATION_KINDS, existing),
          id: existing.id,
          created_at: existing.created_at,
          updated_at: now,
        };
        store.saveApplication(updated);
        return ok(updated, 200);
      }
      const patch = sanitizeRecord(b, APPLICATION_KINDS, null);
      const newApp = {
        ...patch,
        id,
        created_at: now,
        updated_at: now,
        timeline: [
          {
            id: makeId('event'),
            timestamp: now,
            status: patch.status || 'Applied',
            note: patch.notes || 'Application tracked in Job Intelligence',
          },
          ...(Array.isArray(patch.timeline) ? patch.timeline : []),
        ],
      };
      store.saveApplication(newApp);
      return ok(newApp, 201);
    },
  },
  {
    method: 'PUT',
    path: '/applications/:id',
    auth: 'write',
    handler: async ({ store, params, body }) => {
      const b = requireObject(body);
      if (!b) return invalidBody();
      if (badStatus(b)) return fail(400, 'Unknown application status');
      const appItem = store.getApplicationById(params.id);
      if (!appItem) return fail(404, 'Application not found');
      const updated = {
        ...appItem,
        ...sanitizeRecord(b, APPLICATION_KINDS, appItem),
        id: appItem.id,
        created_at: appItem.created_at,
        updated_at: new Date().toISOString(),
      };
      store.saveApplication(updated);
      return ok(updated);
    },
  },
  {
    method: 'POST',
    path: '/applications/:id/status',
    auth: 'write',
    handler: async ({ store, params, body }) => {
      const b = requireObject(body);
      if (!b) return invalidBody();
      const status = typeof b.status === 'string' ? cleanString(b.status) : '';
      if (!status) return fail(400, 'Status required');
      if (!APPLICATION_STATUSES.includes(status)) return fail(400, 'Unknown application status');
      const note = typeof b.note === 'string' ? cleanString(b.note) : '';
      const appItem = store.getApplicationById(params.id);
      if (!appItem) return fail(404, 'Application not found');

      const now = new Date().toISOString();
      const newEvent = {
        id: makeId('event'),
        timestamp: now,
        status,
        note: note || `Status progressed to ${status}`,
      };

      const updated = {
        ...appItem,
        status,
        updated_at: now,
        timeline: [newEvent, ...(Array.isArray(appItem.timeline) ? appItem.timeline : [])],
      };

      store.saveApplication(updated);

      // Add notification
      store.addNotification({
        id: makeId('notif-app'),
        title: `Application Status Changed`,
        message: `${appItem.role} at ${appItem.company} moved to ${status}.`,
        type: 'new_match',
        created_at: now,
        read: false,
        link_id: appItem.id,
        link_type: 'application',
      });

      return ok(updated);
    },
  },
  {
    method: 'DELETE',
    path: '/applications/:id',
    auth: 'write',
    handler: async ({ store, params }) => {
      store.deleteApplication(params.id);
      return ok({ success: true });
    },
  },

  // 7. Interviews
  {
    method: 'GET',
    path: '/interviews',
    auth: 'read',
    handler: async ({ store }) => ok(store.getInterviews()),
  },
  {
    method: 'POST',
    path: '/interviews',
    auth: 'write',
    handler: async ({ store, body }) => {
      const b = requireObject(body);
      if (!b) return invalidBody();
      const { id, existing } = resolveId(b, store.getInterviews(), 'int');
      if (existing) {
        const updated = { ...existing, ...sanitizeRecord(b, INTERVIEW_KINDS, existing), id: existing.id };
        store.saveInterview(updated);
        return ok(updated, 200);
      }
      const newInterview = { ...sanitizeRecord(b, INTERVIEW_KINDS, null), id };
      store.saveInterview(newInterview);

      // Auto-create follow-up task (only when a new interview is created)
      store.saveFollowUp({
        id: makeId('fol-int'),
        application_id: newInterview.application_id,
        company: newInterview.company,
        role: newInterview.role,
        title: `Prepare for ${newInterview.round_name || newInterview.interview_type} interview`,
        due_date: newInterview.date,
        priority: 'High',
        status: 'Pending',
        category: 'Prepare interview',
        created_at: new Date().toISOString(),
      });

      return ok(newInterview, 201);
    },
  },
  {
    method: 'PUT',
    path: '/interviews/:id',
    auth: 'write',
    handler: async ({ store, params, body }) => {
      const b = requireObject(body);
      if (!b) return invalidBody();
      const existing = store.getInterviews().find((i) => i.id === params.id);
      if (!existing) return fail(404, 'Interview not found');
      const updated = { ...existing, ...sanitizeRecord(b, INTERVIEW_KINDS, existing), id: existing.id };
      store.saveInterview(updated);
      return ok(updated);
    },
  },
  {
    method: 'DELETE',
    path: '/interviews/:id',
    auth: 'write',
    handler: async ({ store, params }) => {
      store.deleteInterview(params.id);
      return ok({ success: true });
    },
  },

  // 8. Recruiters
  {
    method: 'GET',
    path: '/recruiters',
    auth: 'read',
    handler: async ({ store }) => ok(store.getRecruiters()),
  },
  {
    method: 'POST',
    path: '/recruiters',
    auth: 'write',
    handler: async ({ store, body }) => {
      const b = requireObject(body);
      if (!b) return invalidBody();
      const { id, existing } = resolveId(b, store.getRecruiters(), 'rec');
      if (existing) {
        const updated = {
          ...existing,
          ...sanitizeRecord(b, RECRUITER_KINDS, existing),
          id: existing.id,
          created_at: existing.created_at,
        };
        store.saveRecruiter(updated);
        return ok(updated, 200);
      }
      const patch = sanitizeRecord(b, RECRUITER_KINDS, null);
      const newRec = {
        ...patch,
        id,
        created_at: new Date().toISOString(),
        linked_applications: patch.linked_applications || [],
      };
      store.saveRecruiter(newRec);
      return ok(newRec, 201);
    },
  },
  {
    method: 'PUT',
    path: '/recruiters/:id',
    auth: 'write',
    handler: async ({ store, params, body }) => {
      const b = requireObject(body);
      if (!b) return invalidBody();
      const existing = store.getRecruiters().find((r) => r.id === params.id);
      if (!existing) return fail(404, 'Recruiter not found');
      const updated = {
        ...existing,
        ...sanitizeRecord(b, RECRUITER_KINDS, existing),
        id: existing.id,
        created_at: existing.created_at,
      };
      store.saveRecruiter(updated);
      return ok(updated);
    },
  },
  {
    method: 'DELETE',
    path: '/recruiters/:id',
    auth: 'write',
    handler: async ({ store, params }) => {
      store.deleteRecruiter(params.id);
      return ok({ success: true });
    },
  },

  // 9. Follow-ups
  {
    method: 'GET',
    path: '/followups',
    auth: 'read',
    handler: async ({ store }) => ok(store.getFollowUps()),
  },
  {
    method: 'POST',
    path: '/followups',
    auth: 'write',
    handler: async ({ store, body }) => {
      const b = requireObject(body);
      if (!b) return invalidBody();
      const { id, existing } = resolveId(b, store.getFollowUps(), 'fol');
      if (existing) {
        const updated = {
          ...existing,
          ...sanitizeRecord(b, FOLLOWUP_KINDS, existing),
          id: existing.id,
          created_at: existing.created_at,
        };
        store.saveFollowUp(updated);
        return ok(updated, 200);
      }
      const newFollowUp = {
        ...sanitizeRecord(b, FOLLOWUP_KINDS, null),
        id,
        created_at: new Date().toISOString(),
      };
      store.saveFollowUp(newFollowUp);
      return ok(newFollowUp, 201);
    },
  },
  {
    method: 'PATCH',
    path: '/followups/:id',
    auth: 'write',
    handler: async ({ store, params, body }) => {
      const b = requireObject(body);
      if (!b) return invalidBody();
      const existing = store.getFollowUps().find((f) => f.id === params.id);
      if (!existing) return fail(404, 'Follow-up not found');
      const updated = {
        ...existing,
        ...sanitizeRecord(b, FOLLOWUP_KINDS, existing),
        id: existing.id,
        created_at: existing.created_at,
      };
      store.saveFollowUp(updated);
      return ok(updated);
    },
  },
  {
    method: 'DELETE',
    path: '/followups/:id',
    auth: 'write',
    handler: async ({ store, params }) => {
      store.deleteFollowUp(params.id);
      return ok({ success: true });
    },
  },

  // 10. Offers
  {
    method: 'GET',
    path: '/offers',
    auth: 'read',
    handler: async ({ store }) => ok(store.getOffers()),
  },
  {
    method: 'POST',
    path: '/offers',
    auth: 'write',
    handler: async ({ store, body }) => {
      const b = requireObject(body);
      if (!b) return invalidBody();
      const { id, existing } = resolveId(b, store.getOffers(), 'off');
      if (existing) {
        const updated = {
          ...existing,
          ...sanitizeRecord(b, OFFER_KINDS, existing),
          id: existing.id,
          created_at: existing.created_at,
        };
        store.saveOffer(updated);
        return ok(updated, 200);
      }
      const newOffer = {
        ...sanitizeRecord(b, OFFER_KINDS, null),
        id,
        created_at: new Date().toISOString(),
      };
      store.saveOffer(newOffer);

      // Send notification (only when a new offer is created)
      store.addNotification({
        id: makeId('notif-offer'),
        title: 'Offer Logged',
        message: `Received offer from ${newOffer.company} (${newOffer.currency} ${Number(newOffer.total_ctc || 0).toLocaleString()}).`,
        type: 'offer_received',
        created_at: new Date().toISOString(),
        read: false,
        link_id: newOffer.id,
        link_type: 'offer',
      });

      return ok(newOffer, 201);
    },
  },
  {
    method: 'PUT',
    path: '/offers/:id',
    auth: 'write',
    handler: async ({ store, params, body }) => {
      const b = requireObject(body);
      if (!b) return invalidBody();
      const existing = store.getOffers().find((o) => o.id === params.id);
      if (!existing) return fail(404, 'Offer not found');
      const updated = {
        ...existing,
        ...sanitizeRecord(b, OFFER_KINDS, existing),
        id: existing.id,
        created_at: existing.created_at,
      };
      store.saveOffer(updated);
      return ok(updated);
    },
  },
  {
    method: 'DELETE',
    path: '/offers/:id',
    auth: 'write',
    handler: async ({ store, params }) => {
      store.deleteOffer(params.id);
      return ok({ success: true });
    },
  },

  // 11. Documents & Resumes
  {
    method: 'GET',
    path: '/documents',
    auth: 'read',
    handler: async ({ store }) => ok(store.getDocuments()),
  },
  {
    method: 'POST',
    path: '/documents',
    auth: 'write',
    handler: async ({ store, body }) => {
      const b = requireObject(body);
      if (!b) return invalidBody();
      const { id, existing } = resolveId(b, store.getDocuments(), 'doc');
      const now = new Date().toISOString();
      if (existing) {
        const updated = {
          ...existing,
          ...sanitizeRecord(b, DOCUMENT_KINDS, existing),
          id: existing.id,
          uploaded_at: now,
        };
        store.saveDocument(updated);
        return ok(updated, 200);
      }
      const newDoc = {
        ...sanitizeRecord(b, DOCUMENT_KINDS, null),
        id,
        uploaded_at: now,
      };
      store.saveDocument(newDoc);
      return ok(newDoc, 201);
    },
  },
  {
    method: 'DELETE',
    path: '/documents/:id',
    auth: 'write',
    handler: async ({ store, params }) => {
      store.deleteDocument(params.id);
      return ok({ success: true });
    },
  },

  // 12. Companies
  {
    method: 'GET',
    path: '/companies',
    auth: 'read',
    handler: async ({ store }) => ok(store.getCompanies()),
  },
  {
    method: 'PATCH',
    path: '/companies/:id',
    auth: 'write',
    handler: async ({ store, params, body }) => {
      const b = requireObject(body);
      if (!b) return invalidBody();
      const comp = store.getCompanies().find((c) => c.id === params.id);
      if (!comp) return fail(404, 'Company not found');
      const updated = {
        ...comp,
        ...sanitizeRecord(b, COMPANY_KINDS, comp),
        id: comp.id,
        created_at: comp.created_at,
      };
      store.saveCompany(updated);
      return ok(updated);
    },
  },
  {
    method: 'POST',
    path: '/companies/:id/watch',
    auth: 'write',
    handler: async ({ store, params, body }) => {
      const b = optionalObject(body);
      if (!b) return invalidBody();
      const comp = store.getCompanies().find((c) => c.id === params.id);
      if (!comp) return fail(404, 'Company not found');
      comp.is_watched = b.watched !== undefined ? !!b.watched : true;
      store.saveCompany(comp);
      return ok(comp);
    },
  },
  {
    method: 'POST',
    path: '/companies/:id/mute',
    auth: 'write',
    handler: async ({ store, params, body }) => {
      const b = optionalObject(body);
      if (!b) return invalidBody();
      const comp = store.getCompanies().find((c) => c.id === params.id);
      if (!comp) return fail(404, 'Company not found');
      comp.is_muted = b.muted !== undefined ? !!b.muted : true;
      store.saveCompany(comp);
      return ok(comp);
    },
  },

  // 13. Sources & Health
  {
    method: 'GET',
    path: '/sources',
    auth: 'read',
    handler: async ({ store }) => ok(store.getSources()),
  },
  {
    method: 'PATCH',
    path: '/sources/:id',
    auth: 'write',
    handler: async ({ store, params, body }) => {
      const b = requireObject(body);
      if (!b) return invalidBody();
      const current = store.getSources().find((s) => s.id === params.id);
      if (!current) return fail(404, 'Source not found');
      const updated = store.updateSource(params.id, sanitizeRecord(b, SOURCE_KINDS, current));
      if (!updated) return fail(404, 'Source not found');
      return ok(updated);
    },
  },
  {
    // Deliberate change F: syncs ONLY this source (the original ignored :id and ran every connector).
    method: 'POST',
    path: '/sources/:id/sync',
    auth: 'discovery',
    handler: async ({ store, params }) => {
      const source = store.getSources().find((s) => s.id === params.id);
      if (!source) return fail(404, 'Source not found');
      if (store.isRunning) return fail(409, 'Discovery already running');
      try {
        const run = await store.executeLiveDiscovery('', undefined, { sourceIds: [params.id] });
        return ok({ success: true, run });
      } catch (err) {
        if (err && err.code === 'DISCOVERY_RUNNING') return fail(409, 'Discovery already running');
        console.error('[jobintel] source sync failed', err && err.message);
        return fail(500, (err && err.message) || 'Sync failed');
      }
    },
  },

  // 14. Notifications
  {
    method: 'GET',
    path: '/notifications',
    auth: 'read',
    handler: async ({ store }) => ok(store.getNotifications()),
  },
  {
    method: 'POST',
    path: '/notifications/:id/read',
    auth: 'write',
    handler: async ({ store, params }) => {
      store.markNotificationAsRead(params.id);
      return ok({ success: true });
    },
  },
  { method: 'POST', path: '/notifications/mark-all-read', auth: 'write', handler: handleMarkAllRead },
  { method: 'POST', path: '/notifications/read-all', auth: 'write', handler: handleMarkAllRead },

  // 15. Analytics
  {
    method: 'GET',
    path: '/analytics',
    auth: 'read',
    handler: async ({ store }) => ok(store.getAnalytics()),
  },

  // 16. Server-side AI endpoints
  {
    method: 'POST',
    path: '/ai/match',
    auth: 'ai',
    handler: async ({ store, body, ai }) => {
      const b = requireObject(body);
      if (!b) return invalidBody();
      try {
        const job = store.getJobById(str(b.jobId));
        const profile = store.getSearchProfileById(str(b.profileId));

        if (!job || !profile) {
          return fail(400, 'Valid jobId and profileId required');
        }

        const matchResult = await ai.matchJobWithProfile(job, profile);
        // Cache on job
        job.ai_match = matchResult;
        store.updateJob(job);

        return ok(matchResult);
      } catch (err) {
        return fail(500, (err && err.message) || 'AI matching failed');
      }
    },
  },
  {
    method: 'POST',
    path: '/ai/resume-analysis',
    auth: 'ai',
    handler: async ({ store, body, ai }) => {
      const b = requireObject(body);
      if (!b) return invalidBody();
      try {
        const resumeText = typeof b.resumeText === 'string' ? cleanString(b.resumeText) : '';
        const job = store.getJobById(str(b.jobId));
        if (!resumeText || !job) {
          return fail(400, 'Resume text and valid jobId required');
        }

        const review = await ai.analyzeResumeVsJob(resumeText, job);
        return ok(review);
      } catch (err) {
        return fail(500, (err && err.message) || 'Resume analysis failed');
      }
    },
  },
  {
    method: 'POST',
    path: '/ai/interview-prep',
    auth: 'ai',
    handler: async ({ store, body, ai }) => {
      const b = requireObject(body);
      if (!b) return invalidBody();
      try {
        const jobId = str(b.jobId);
        const roundType = str(b.roundType);
        const role = str(b.role);
        const company = str(b.company);
        const roundName = str(b.roundName);

        let job = jobId ? store.getJobById(jobId) : null;
        if (!job && (role || company)) {
          const allJobs = store.getJobs();
          job =
            allJobs.find(
              (j) =>
                (company && (j.company || '').toLowerCase().includes(company.toLowerCase())) ||
                (role && (j.title || '').toLowerCase().includes(role.toLowerCase()))
            ) || {
              id: `virtual-${Date.now()}`,
              title: role || 'Enterprise Specialist',
              company: company || 'Enterprise Client',
              skills: ['SAP VIM', 'Enterprise Integration', 'System Design', 'ABAP / OpenText'],
              description: `Role: ${role || 'Specialist'} at ${company || 'Enterprise'}. Target round: ${roundName || roundType || 'Technical'}.`,
            };
        }

        if (!job) {
          return fail(400, 'Valid jobId or role/company required');
        }

        const prep = await ai.generateInterviewPrep(job, roundName || roundType || 'Technical Round');
        return ok(prep);
      } catch (err) {
        return fail(500, (err && err.message) || 'Interview prep generation failed');
      }
    },
  },

  // 17. Export / Import
  {
    method: 'GET',
    path: '/export',
    auth: 'read',
    handler: async ({ store }) => ({
      status: 200,
      body: {
        exported_at: new Date().toISOString(),
        jobs: store.getJobs(),
        applications: store.getApplications(),
        interviews: store.getInterviews(),
        recruiters: store.getRecruiters(),
        offers: store.getOffers(),
        searchProfiles: store.getSearchProfiles(),
      },
      // Same filename the original server.ts sets.
      headers: { 'Content-Disposition': 'attachment; filename="job_intelligence_export.json"' },
    }),
  },
  {
    // Same coverage as the original (applications, interviews, offers). Every entry is validated and
    // allow-list sanitized; records get fresh server ids; nothing is saved unless the whole payload is valid.
    method: 'POST',
    path: '/import',
    auth: 'write',
    handler: async ({ store, body }) => {
      const data = requireObject(body);
      if (!data) return invalidBody();

      const collect = (list, label, kinds, build) => {
        if (!Array.isArray(list)) return [];
        if (list.length > MAX_IMPORT_ITEMS) {
          throw new Error(`Too many ${label} (max ${MAX_IMPORT_ITEMS})`);
        }
        return list.map((item) => {
          if (!isPlainObject(item)) throw new Error(`Invalid ${label} entry`);
          return build(sanitizeRecord(item, kinds, null));
        });
      };

      try {
        const now = new Date().toISOString();
        const apps = collect(data.applications, 'applications', APPLICATION_KINDS, (patch) => ({
          ...patch,
          status: APPLICATION_STATUSES.includes(patch.status) ? patch.status : 'Saved',
          id: makeId('app'),
          created_at: now,
          updated_at: now,
          timeline: Array.isArray(patch.timeline) ? patch.timeline : [],
        }));
        const interviews = collect(data.interviews, 'interviews', INTERVIEW_KINDS, (patch) => ({
          ...patch,
          id: makeId('int'),
        }));
        const offers = collect(data.offers, 'offers', OFFER_KINDS, (patch) => ({
          ...patch,
          id: makeId('off'),
          created_at: now,
        }));

        for (const a of apps) store.saveApplication(a);
        for (const i of interviews) store.saveInterview(i);
        for (const o of offers) store.saveOffer(o);

        return ok({ success: true, importedApplications: apps.length });
      } catch (err) {
        return fail(400, (err && err.message) || 'Import failed');
      }
    },
  },
];

// ---------------------------------------------------------------------------
// Matching + dispatch
// ---------------------------------------------------------------------------

function splitPath(pathname) {
  let p = typeof pathname === 'string' ? pathname : '';
  const cut = p.search(/[?#]/);
  if (cut !== -1) p = p.slice(0, cut);
  return p.split('/').filter((seg) => seg.length > 0);
}

function safeDecode(seg) {
  try {
    return decodeURIComponent(seg);
  } catch (e) {
    return seg;
  }
}

// Pure. Supports `:param` segments; tolerant of trailing slashes. Returns { route, params } or null.
export function matchRoute(method, pathname) {
  const m = String(method || '').toUpperCase();
  const segs = splitPath(pathname);

  for (const route of routes) {
    if (route.method !== m) continue;
    const rsegs = splitPath(route.path);
    if (rsegs.length !== segs.length) continue;

    const params = {};
    let matched = true;
    for (let i = 0; i < rsegs.length; i++) {
      if (rsegs[i].charAt(0) === ':') {
        params[rsegs[i].slice(1)] = safeDecode(segs[i]);
      } else if (rsegs[i] !== segs[i]) {
        matched = false;
        break;
      }
    }
    if (matched) return { route, params };
  }
  return null;
}

// Never throws: unmatched -> 404 JSON, handler error -> 500 JSON.
export async function dispatch({ store, method, pathname, query, body, ai }) {
  const found = matchRoute(method, pathname);
  if (!found) {
    return {
      status: 404,
      body: { error: `API route not found: ${String(method || '').toUpperCase()} ${pathname}` },
    };
  }

  try {
    const result = await found.route.handler({
      store,
      params: found.params,
      query: query || {},
      body: body === undefined ? {} : body,
      ai: { ...defaultAi, ...(ai || {}) },
    });
    const out = { status: result && result.status ? result.status : 200, body: result ? result.body : undefined };
    if (result && result.headers) out.headers = result.headers;
    return out;
  } catch (err) {
    console.error('[jobintel] handler failed', String(method || '').toUpperCase(), pathname, err && err.message);
    return { status: 500, body: { error: (err && err.message) || 'Internal error' } };
  }
}
