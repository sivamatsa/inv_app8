// Ported from Job Intelligence (server/storage/store.ts)
//
// Portable core: no fs / path / process. Persistence is injected:
//   persistence = { load: async () => object|null, save: async (state) => void }
// Nothing runs at construction/import time; call `await store.init()` once.

import { fetchGreenhouseJobs } from './connectors/greenhouse.js';
import { fetchRemoteOKJobs } from './connectors/remoteok.js';
import { fetchJobicyJobs } from './connectors/jobicy.js';
import { fetchArbeitnowJobs } from './connectors/arbeitnow.js';
import { fetchRemotiveJobs } from './connectors/remotive.js';
import { runSearchDiscovery } from './connectors/search_discovery.js';
import { isSameJob, mergeRawIntoJob, convertRawToJob } from './deduplicator.js';

const PERSIST_DEBOUNCE_MS = 300;

// Order matches the original executeLiveDiscovery connector list.
const CONNECTOR_ORDER = ['greenhouse', 'remoteok', 'remotive', 'jobicy', 'arbeitnow', 'search_discovery'];

const STATE_KEYS = [
  'jobs',
  'searchProfiles',
  'applications',
  'interviews',
  'recruiters',
  'followups',
  'offers',
  'documents',
  'companies',
  'sources',
  'discoveryRuns',
  'notifications',
];

function emptyState() {
  const s = {};
  for (const k of STATE_KEYS) s[k] = [];
  return s;
}

// ---------------------------------------------------------------------------
// Seed data factories (identical content to the original bootstrap)
// ---------------------------------------------------------------------------

function buildRemotiveSource() {
  return {
    id: 'remotive',
    name: 'Remotive Global Tech & Startups',
    type: 'public_feed',
    endpoint: 'https://remotive.com/api/remote-jobs',
    rate_limit: '60 req/min',
    status: 'healthy',
    last_sync: new Date().toISOString(),
    enabled: true,
    total_jobs_found: 0,
    description: 'Worldwide live API covering high-growth startups and global product companies.',
  };
}

// Deliberate change B: the synthetic connector is OFF by default (only when created fresh).
function buildSearchDiscoverySource() {
  return {
    id: 'search_discovery',
    name: 'Enterprise Career Discovery Engine',
    type: 'search_discovery',
    endpoint: 'site:careers.* / structured corporate career crawler',
    rate_limit: '100 req/hour',
    status: 'healthy',
    last_sync: new Date().toISOString(),
    enabled: false,
    total_jobs_found: 0,
    description: 'Crawls and discovers direct enterprise career pages across multinational technology & consulting leaders (Accenture, Deloitte, Capgemini, IBM, SAP).',
  };
}

function buildDefaultSources() {
  return [
    {
      id: 'greenhouse',
      name: 'Greenhouse Career API',
      type: 'official_career_api',
      endpoint: 'https://boards-api.greenhouse.io/v1/boards/{board}/jobs',
      rate_limit: '60 req/min',
      status: 'healthy',
      last_sync: new Date().toISOString(),
      enabled: true,
      total_jobs_found: 0,
      description: 'Official public career API for Greenhouse-hosted enterprise job boards (GitLab, Cloudflare, Figma, Canonical, Automattic, Stripe).',
    },
    {
      id: 'remoteok',
      name: 'RemoteOK Live API',
      type: 'public_feed',
      endpoint: 'https://remoteok.com/api',
      rate_limit: '30 req/min',
      status: 'healthy',
      last_sync: new Date().toISOString(),
      enabled: true,
      total_jobs_found: 0,
      description: 'Real-time public API returning worldwide verified remote openings across technology, data, and management.',
    },
    {
      id: 'jobicy',
      name: 'Jobicy Global Feed',
      type: 'job_board_api',
      endpoint: 'https://jobicy.com/api/v2/remote-jobs',
      rate_limit: '30 req/min',
      status: 'healthy',
      last_sync: new Date().toISOString(),
      enabled: true,
      total_jobs_found: 0,
      description: 'Global remote job feeds spanning software engineering, operations, marketing, and business administration.',
    },
    {
      id: 'arbeitnow',
      name: 'Arbeitnow Career Feed',
      type: 'job_board_api',
      endpoint: 'https://www.arbeitnow.com/api/job-board-api',
      rate_limit: '30 req/min',
      status: 'healthy',
      last_sync: new Date().toISOString(),
      enabled: true,
      total_jobs_found: 0,
      description: 'European & international career feed specializing in enterprise tech, consulting, and visa-friendly roles.',
    },
    buildSearchDiscoverySource(),
  ];
}

function buildGlobalTechProfile(now, isActive) {
  return {
    id: 'profile-global-tech',
    name: 'Global Tech, Product & Cloud Initiatives',
    keywords: ['Software Engineer', 'Full Stack', 'Cloud', 'React', 'Python', 'Distributed Systems'],
    related_keywords: ['Microservices', 'Platform Engineering', 'APIs', 'Docker', 'Kubernetes'],
    excluded_keywords: ['Intern', 'Unpaid'],
    target_titles: ['Senior Software Engineer', 'Staff Full Stack Developer', 'Cloud & Platform Architect', 'Lead Distributed Systems Engineer'],
    required_skills: ['TypeScript', 'Cloud Architecture', 'Python', 'APIs'],
    min_experience: 4,
    max_experience: 12,
    countries: ['United States', 'United Kingdom', 'Germany', 'Canada', 'India', 'Australia', 'Netherlands', 'Global'],
    locations: ['San Francisco', 'London', 'Berlin', 'Toronto', 'Bengaluru', 'Remote'],
    remote_mode: ['remote', 'hybrid', 'on-site'],
    employment_types: ['full-time', 'contract'],
    salary_min: 110000,
    salary_currency: 'USD',
    posted_within_days: 14,
    watched_companies: ['Stripe', 'Spotify', 'JPMorgan Chase & Co.', 'Shopify', 'Novartis', 'BMW Group', 'Nike', 'Canva', 'Datadog'],
    excluded_companies: [],
    sources: ['greenhouse', 'remoteok', 'remotive', 'jobicy', 'arbeitnow', 'search_discovery'],
    visa_preference: 'any',
    created_at: now,
    updated_at: now,
    is_active: isActive,
    discovery_interval: '1h',
  };
}

function buildDefaultSearchProfiles(now) {
  return [
    buildGlobalTechProfile(now, true),
    {
      id: 'profile-enterprise-clients',
      name: 'Enterprise Client Projects & Digital Modernization',
      keywords: ['Solutions Architect', 'Enterprise Integration', 'Cloud Migration', 'Microservices', 'ERP'],
      related_keywords: ['Digital Transformation', 'Data Pipelines', 'System Architecture'],
      excluded_keywords: ['Junior', 'Intern'],
      target_titles: ['Enterprise Solutions Architect', 'Lead Integration Specialist', 'Principal Cloud Consultant'],
      required_skills: ['Cloud Architecture', 'Microservices', 'Enterprise Integration'],
      min_experience: 5,
      max_experience: 15,
      countries: ['United States', 'United Kingdom', 'Germany', 'Singapore', 'India', 'Netherlands', 'Global'],
      locations: ['New York', 'Frankfurt', 'Singapore', 'London', 'Remote'],
      remote_mode: ['remote', 'hybrid'],
      employment_types: ['full-time'],
      salary_min: 120000,
      salary_currency: 'USD',
      posted_within_days: 14,
      watched_companies: ['JPMorgan Chase & Co.', 'Visa Global Innovation', 'Robert Bosch', 'Airbus', 'Schneider Electric', 'Global Banking Transformation Project'],
      excluded_companies: [],
      sources: ['greenhouse', 'remoteok', 'remotive', 'search_discovery'],
      visa_preference: 'any',
      created_at: now,
      updated_at: now,
      is_active: false,
      discovery_interval: '1h',
    },
    {
      id: 'profile-cloud-arch',
      name: 'Senior Cloud & DevOps Architect',
      keywords: ['Cloud Architect', 'Kubernetes', 'DevOps', 'AWS', 'GCP'],
      related_keywords: ['Terraform', 'Platform Engineering', 'CI/CD'],
      excluded_keywords: ['Junior', 'Graduate'],
      target_titles: ['Principal Cloud Architect', 'Staff Platform Engineer', 'Lead DevOps Engineer'],
      required_skills: ['Kubernetes', 'Terraform', 'Cloud Architecture'],
      min_experience: 6,
      countries: ['United States', 'India', 'Europe', 'Global'],
      locations: ['Remote', 'San Francisco', 'London', 'Munich'],
      remote_mode: ['remote', 'hybrid'],
      employment_types: ['full-time', 'contract'],
      salary_min: 140000,
      salary_currency: 'USD',
      posted_within_days: 7,
      watched_companies: ['GitLab', 'Cloudflare', 'Figma', 'Datadog', 'Canonical'],
      excluded_companies: [],
      sources: ['greenhouse', 'remoteok', 'jobicy', 'remotive'],
      visa_preference: 'any',
      created_at: now,
      updated_at: now,
      is_active: false,
      discovery_interval: '30m',
    },
    {
      id: 'profile-sap-vim',
      name: 'SAP & ERP Enterprise Solutions',
      keywords: ['SAP VIM', 'OpenText VIM', 'Vendor Invoice Management'],
      related_keywords: ['Invoice Automation', 'SAP FI/CO', 'Invoice Processing', 'SAP Workflow'],
      excluded_keywords: ['Intern', 'Unpaid'],
      target_titles: ['Lead SAP Consultant', 'Senior Consultant - Invoice Automation', 'Solution Architect - SAP'],
      required_skills: ['SAP VIM', 'OpenText', 'Invoice Workflow'],
      min_experience: 5,
      max_experience: 10,
      countries: ['India', 'United States', 'Germany'],
      locations: ['Hyderabad', 'Bengaluru', 'Pune', 'Remote'],
      remote_mode: ['remote', 'hybrid', 'on-site'],
      employment_types: ['full-time'],
      salary_min: 100000,
      salary_currency: 'USD',
      posted_within_days: 14,
      watched_companies: ['Accenture', 'Deloitte', 'Capgemini', 'SAP SE'],
      excluded_companies: [],
      sources: ['greenhouse', 'remoteok', 'search_discovery', 'arbeitnow'],
      visa_preference: 'any',
      created_at: now,
      updated_at: now,
      is_active: false,
      discovery_interval: '1h',
    },
  ];
}

function buildDefaultDocuments(now) {
  return [
    {
      id: 'doc-resume-v2',
      name: 'SAP VIM & Enterprise Architect Resume',
      version: 'v2.4 - Senior Lead',
      type: 'resume',
      file_name: 'SAP_VIM_Lead_Architect_v2.pdf',
      file_size: '142 KB',
      uploaded_at: now,
      is_default: true,
      content: `SUMMARY:
Seasoned SAP VIM / OpenText Solution Architect with 7+ years of expertise designing and delivering high-volume invoice processing automation, SAP S/4HANA migrations, and ICC/OCR integrations.

CORE SKILLS:
SAP VIM 7.5/16.3/20.4, OpenText Vendor Invoice Management, SAP FI/CO Integration, ICC, Invoice Capture Center, Workflow Automation, ABAP for VIM enhancements, S/4HANA Migration, BAPI/IDOC interfaces.

EXPERIENCE:
Lead SAP VIM Consultant (2022-Present):
- Spearheaded global end-to-end VIM roll-out across 14 countries processing 2M+ invoices annually.
- Reduced manual invoice processing exceptions by 64% using custom business rules and automatic approval workflows.
- Directed technical S/4HANA upgrade and configured OpenText Core Capture cloud connectors.`,
    },
    {
      id: 'doc-cl-v1',
      name: 'Enterprise Consulting Cover Letter',
      version: 'v1.1',
      type: 'cover_letter',
      file_name: 'Consulting_Cover_Letter.pdf',
      file_size: '88 KB',
      uploaded_at: now,
      content: `Dear Hiring Team,\n\nI am writing to express my strong enthusiasm for the senior consulting position. With extensive hands-on experience orchestrating complex workflow automation and high-scale enterprise implementations, I welcome the opportunity to drive measurable operational excellence for your stakeholders.`,
    },
  ];
}

function buildDefaultRecruiters(now) {
  return [
    {
      id: 'rec-1',
      name: 'Sarah Jenkins',
      company: 'Deloitte Enterprise Solutions',
      email: 'sjenkins@deloitte.com',
      phone: '+1 (415) 890-2341',
      linkedin: 'https://linkedin.com/in/sarah-jenkins-talent',
      role: 'Principal Talent Acquisition Lead',
      source: 'Direct Outreach',
      notes: 'Very responsive. Emphasized strong bonus potential and remote flexibility for senior architecture leads.',
      linked_applications: [],
      last_contacted: new Date(Date.now() - 86400000 * 2).toISOString(),
      next_follow_up: new Date(Date.now() + 86400000 * 2).toISOString(),
      created_at: now,
    },
    {
      id: 'rec-2',
      name: 'Vikram Malhotra',
      company: 'Accenture Careers',
      email: 'v.malhotra@accenture.com',
      phone: '+91 98450 12903',
      linkedin: 'https://linkedin.com/in/vikram-malhotra-hiring',
      role: 'Senior Executive Recruiter',
      source: 'Referral',
      notes: 'Coordinating SAP practice expansion across APAC and EMEA hubs.',
      linked_applications: [],
      last_contacted: new Date(Date.now() - 86400000 * 4).toISOString(),
      next_follow_up: new Date(Date.now() + 86400000).toISOString(),
      created_at: now,
    },
  ];
}

function buildDefaultCompanies(now) {
  return [
    {
      id: 'comp-accenture',
      name: 'Accenture',
      website: 'https://accenture.com',
      career_url: 'https://careers.accenture.com',
      is_watched: true,
      is_muted: false,
      is_blocked: false,
      active_jobs_count: 3,
      hiring_trend: 'Active hiring in SAP, Cloud Architecture, and Enterprise Automation.',
      created_at: now,
    },
    {
      id: 'comp-deloitte',
      name: 'Deloitte',
      website: 'https://deloitte.com',
      career_url: 'https://careers.deloitte.com',
      is_watched: true,
      is_muted: false,
      is_blocked: false,
      active_jobs_count: 2,
      hiring_trend: 'Expanding financial transformation & OpenText practice.',
      created_at: now,
    },
    {
      id: 'comp-gitlab',
      name: 'GitLab',
      website: 'https://about.gitlab.com',
      career_url: 'https://boards.greenhouse.io/gitlab',
      is_watched: true,
      is_muted: false,
      is_blocked: false,
      active_jobs_count: 4,
      hiring_trend: 'All-remote global platform engineering and architecture.',
      created_at: now,
    },
  ];
}

function buildDefaultNotifications(now) {
  return [
    {
      id: 'notif-1',
      title: 'Job Intelligence System Ready',
      message: 'Multi-source connector framework initialized. Real-time discovery ready for all professions.',
      type: 'new_match',
      created_at: now,
      read: false,
    },
  ];
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export class JobIntelStore {
  /**
   * @param {{ persistence?: { load: Function, save: Function }, connectors?: object, gemini?: object }} [opts]
   */
  constructor({ persistence, connectors, gemini } = {}) {
    this.persistence = persistence || null;
    this.gemini = gemini || null;
    this.connectors = {
      greenhouse: fetchGreenhouseJobs,
      remoteok: fetchRemoteOKJobs,
      remotive: fetchRemotiveJobs,
      jobicy: fetchJobicyJobs,
      arbeitnow: fetchArbeitnowJobs,
      search_discovery: runSearchDiscovery,
      ...(connectors || {}),
    };
    this.state = emptyState();
    this._persistTimer = null;
    this._saving = Promise.resolve();
    this._running = false;
    this._initialized = false;
  }

  get isRunning() {
    return this._running;
  }

  getState() {
    return this.state;
  }

  // Load persisted state (or seed defaults). Pure with respect to the network.
  async init() {
    // NOTE: a load error is deliberately NOT swallowed: bootstrapping and persisting over an
    // unreadable-but-existing database would destroy the user's data.
    const loaded = this.persistence ? await this.persistence.load() : null;
    let bootstrapped = false;

    if (loaded && typeof loaded === 'object' && !Array.isArray(loaded)) {
      this.state = { ...emptyState(), ...loaded };
      for (const k of STATE_KEYS) {
        if (!Array.isArray(this.state[k])) this.state[k] = [];
      }
    } else {
      this.state = emptyState();
      this.bootstrapInitialData();
      bootstrapped = true;
    }

    const sourcesChanged = this.ensureSourcesConfigured();
    const profilesChanged = this.ensureSearchProfilesConfigured();
    this._initialized = true;

    if (bootstrapped || sourcesChanged || profilesChanged) {
      this.persist();
    }
  }

  ensureSourcesConfigured() {
    let changed = false;

    // Ensure Remotive is registered
    if (!this.state.sources.some((s) => s.id === 'remotive')) {
      this.state.sources.push(buildRemotiveSource());
      changed = true;
    }

    // Deliberate change B: a freshly created search_discovery source is disabled by default.
    // An existing stored source keeps its stored `enabled` value.
    if (!this.state.sources.some((s) => s.id === 'search_discovery')) {
      this.state.sources.push(buildSearchDiscoverySource());
      changed = true;
    }

    // Update search discovery definition
    const sd = this.state.sources.find((s) => s.id === 'search_discovery');
    if (sd) {
      const name = 'Direct Companies & Client Projects Discovery';
      const description =
        'Discovers direct openings and client transformation projects across Tech, Healthcare, Banking, Automotive, Retail, Media, and Energy across 18+ countries.';
      if (sd.name !== name || sd.description !== description) {
        sd.name = name;
        sd.description = description;
        changed = true;
      }
    }

    return changed;
  }

  ensureSearchProfilesConfigured() {
    if (!this.state.searchProfiles.some((p) => p.id === 'profile-global-tech')) {
      this.state.searchProfiles.forEach((p) => (p.is_active = false));
      this.state.searchProfiles.unshift(buildGlobalTechProfile(new Date().toISOString(), true));
      return true;
    }
    return false;
  }

  // Debounced (300 ms), non-blocking persistence. Errors are swallowed + logged.
  persist() {
    if (!this.persistence) return;
    if (this._persistTimer) return; // a save is already scheduled; it will capture the latest state
    this._persistTimer = setTimeout(() => {
      this._persistTimer = null;
      this._queueSave();
    }, PERSIST_DEBOUNCE_MS);
  }

  _queueSave() {
    const run = async () => {
      try {
        await this.persistence.save(this.state);
      } catch (e) {
        console.error('[jobintel] persist failed', e && e.message);
      }
    };
    this._saving = this._saving.then(run, run);
    return this._saving;
  }

  // Resolve once every pending/in-flight save has finished.
  async flush() {
    if (this._persistTimer) {
      clearTimeout(this._persistTimer);
      this._persistTimer = null;
      if (this.persistence) this._queueSave();
    }
    await this._saving;
  }

  bootstrapInitialData() {
    const now = new Date().toISOString();

    // 1. Configure default source connectors
    this.state.sources = buildDefaultSources();

    // 2. Default search profiles (Multi-Sector, Global, Enterprise & Cloud)
    this.state.searchProfiles = buildDefaultSearchProfiles(now);

    // 3. Document versions
    this.state.documents = buildDefaultDocuments(now);

    // 4. Sample Recruiters
    this.state.recruiters = buildDefaultRecruiters(now);

    // 5. Watched Companies
    this.state.companies = buildDefaultCompanies(now);

    // 6. Notifications
    this.state.notifications = buildDefaultNotifications(now);
  }

  // Jobs
  getJobs(filter) {
    let result = [...this.state.jobs];

    if (filter && filter.query && String(filter.query).trim()) {
      const q = String(filter.query).toLowerCase().trim();
      result = result.filter(
        (j) =>
          (j.title || '').toLowerCase().includes(q) ||
          (j.company || '').toLowerCase().includes(q) ||
          (j.skills || []).some((s) => {
            const str =
              typeof s === 'string' ? s : s && typeof s.name === 'string' ? s.name : String(s || '');
            return str.toLowerCase().includes(q);
          }) ||
          (j.location || '').toLowerCase().includes(q) ||
          (j.description || '').toLowerCase().includes(q)
      );
    }

    if (filter && filter.remote && filter.remote !== 'all') {
      result = result.filter((j) => j.remote_mode === filter.remote);
    }

    if (filter && filter.country && filter.country !== 'all') {
      const c = String(filter.country).toLowerCase();
      result = result.filter((j) => (j.country || '').toLowerCase().includes(c));
    }

    if (filter && filter.minExp !== undefined && filter.minExp > 0) {
      result = result.filter((j) => (j.min_experience || 0) <= filter.minExp);
    }

    if (filter && filter.source && filter.source !== 'all') {
      const src = String(filter.source).toLowerCase();
      result = result.filter(
        (j) =>
          j.source_id === filter.source ||
          (j.all_sources || []).some((s) => ((s && s.source_name) || '').toLowerCase().includes(src))
      );
    }

    if (filter && filter.status && filter.status !== 'all') {
      result = result.filter((j) => j.status === filter.status);
    }

    // Sort by latest discovered
    result.sort((a, b) => new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime());

    if (filter && filter.limit) {
      result = result.slice(0, filter.limit);
    }

    return result;
  }

  getJobById(id) {
    return this.state.jobs.find((j) => j.id === id);
  }

  updateJob(job) {
    const idx = this.state.jobs.findIndex((j) => j.id === job.id);
    if (idx !== -1) {
      this.state.jobs[idx] = job;
      this.persist();
    }
  }

  ingestRawJobs(rawJobs) {
    let added = 0;
    let updated = 0;
    let duplicates = 0;

    for (const raw of Array.isArray(rawJobs) ? rawJobs : []) {
      const existingIdx = this.state.jobs.findIndex((j) => isSameJob(raw, j));

      if (existingIdx !== -1) {
        const existing = this.state.jobs[existingIdx];
        const { updatedJob, isNewProvenance, changes } = mergeRawIntoJob(raw, existing);
        this.state.jobs[existingIdx] = updatedJob;

        if (isNewProvenance || changes.length > 0) {
          updated++;
        }
        duplicates++;
      } else {
        const newJob = convertRawToJob(raw);
        // Deliberate change B (defensive): synthetic raws always yield synthetic jobs.
        if (raw && raw.synthetic === true && newJob.is_synthetic !== true) {
          newJob.is_synthetic = true;
        }
        this.state.jobs.unshift(newJob);
        added++;

        // Update company active count
        const comp = this.state.companies.find(
          (c) => (c.name || '').toLowerCase() === (newJob.company || '').toLowerCase()
        );
        if (comp) {
          comp.active_jobs_count = (comp.active_jobs_count || 0) + 1;
        }
      }
    }

    if (added > 0 || updated > 0) {
      this.persist();
    }

    return { added, updated, duplicates };
  }

  // Search Profiles
  getSearchProfiles() {
    return this.state.searchProfiles;
  }

  getSearchProfileById(id) {
    return this.state.searchProfiles.find((p) => p.id === id);
  }

  saveSearchProfile(profile) {
    const idx = this.state.searchProfiles.findIndex((p) => p.id === profile.id);
    if (idx !== -1) {
      this.state.searchProfiles[idx] = profile;
    } else {
      this.state.searchProfiles.push(profile);
    }
    this.persist();
  }

  deleteSearchProfile(id) {
    this.state.searchProfiles = this.state.searchProfiles.filter((p) => p.id !== id);
    this.persist();
  }

  // Applications
  getApplications() {
    return this.state.applications;
  }

  getApplicationById(id) {
    return this.state.applications.find((a) => a.id === id);
  }

  saveApplication(app) {
    const idx = this.state.applications.findIndex((a) => a.id === app.id);
    if (idx !== -1) {
      this.state.applications[idx] = app;
    } else {
      this.state.applications.unshift(app);
    }
    this.persist();
  }

  deleteApplication(id) {
    this.state.applications = this.state.applications.filter((a) => a.id !== id);
    this.persist();
  }

  // Interviews
  getInterviews() {
    return this.state.interviews;
  }

  saveInterview(interview) {
    const idx = this.state.interviews.findIndex((i) => i.id === interview.id);
    if (idx !== -1) {
      this.state.interviews[idx] = interview;
    } else {
      this.state.interviews.unshift(interview);
    }
    this.persist();
  }

  deleteInterview(id) {
    this.state.interviews = this.state.interviews.filter((i) => i.id !== id);
    this.persist();
  }

  // Recruiters
  getRecruiters() {
    return this.state.recruiters;
  }

  saveRecruiter(recruiter) {
    const idx = this.state.recruiters.findIndex((r) => r.id === recruiter.id);
    if (idx !== -1) {
      this.state.recruiters[idx] = recruiter;
    } else {
      this.state.recruiters.unshift(recruiter);
    }
    this.persist();
  }

  deleteRecruiter(id) {
    this.state.recruiters = this.state.recruiters.filter((r) => r.id !== id);
    this.persist();
  }

  // Follow-ups
  getFollowUps() {
    return this.state.followups;
  }

  saveFollowUp(followUp) {
    const idx = this.state.followups.findIndex((f) => f.id === followUp.id);
    if (idx !== -1) {
      this.state.followups[idx] = followUp;
    } else {
      this.state.followups.unshift(followUp);
    }
    this.persist();
  }

  deleteFollowUp(id) {
    this.state.followups = this.state.followups.filter((f) => f.id !== id);
    this.persist();
  }

  // Offers
  getOffers() {
    return this.state.offers;
  }

  saveOffer(offer) {
    const idx = this.state.offers.findIndex((o) => o.id === offer.id);
    if (idx !== -1) {
      this.state.offers[idx] = offer;
    } else {
      this.state.offers.unshift(offer);
    }
    this.persist();
  }

  deleteOffer(id) {
    this.state.offers = this.state.offers.filter((o) => o.id !== id);
    this.persist();
  }

  // Documents
  getDocuments() {
    return this.state.documents;
  }

  saveDocument(doc) {
    const idx = this.state.documents.findIndex((d) => d.id === doc.id);
    if (idx !== -1) {
      this.state.documents[idx] = doc;
    } else {
      this.state.documents.unshift(doc);
    }
    this.persist();
  }

  deleteDocument(id) {
    this.state.documents = this.state.documents.filter((d) => d.id !== id);
    this.persist();
  }

  // Companies
  getCompanies() {
    return this.state.companies;
  }

  saveCompany(comp) {
    const idx = this.state.companies.findIndex((c) => c.id === comp.id);
    if (idx !== -1) {
      this.state.companies[idx] = comp;
    } else {
      this.state.companies.unshift(comp);
    }
    this.persist();
  }

  // Sources & Health
  getSources() {
    return this.state.sources;
  }

  updateSource(id, patch) {
    const s = this.state.sources.find((item) => item.id === id);
    if (s) {
      Object.assign(s, patch);
      this.persist();
      return s;
    }
    return undefined;
  }

  // Discovery Runs
  getDiscoveryRuns() {
    return this.state.discoveryRuns;
  }

  addDiscoveryRun(run) {
    this.state.discoveryRuns.unshift(run);
    if (this.state.discoveryRuns.length > 50) {
      this.state.discoveryRuns.pop();
    }
    this.persist();
  }

  // Notifications
  getNotifications() {
    return this.state.notifications;
  }

  addNotification(item) {
    this.state.notifications.unshift(item);
    if (this.state.notifications.length > 50) {
      this.state.notifications.pop();
    }
    this.persist();
  }

  markNotificationAsRead(id) {
    const n = this.state.notifications.find((i) => i.id === id);
    if (n) {
      n.read = true;
      this.persist();
    }
  }

  markAllNotificationsRead() {
    this.state.notifications.forEach((n) => (n.read = true));
    this.persist();
  }

  // Analytics Engine
  getAnalytics() {
    const totalDiscovered = this.state.jobs.length;
    const viewed = Math.round(totalDiscovered * 0.7);
    const saved = this.state.applications.filter((a) => a.status === 'Saved').length;
    const applied = this.state.applications.filter((a) =>
      ['Applied', 'Screening', 'Technical Round', 'Managerial Round', 'HR Round', 'Offer', 'Accepted', 'Rejected'].includes(a.status)
    ).length;
    const interviews = this.state.interviews.length;
    const offers = this.state.offers.length;
    const accepted = this.state.offers.filter((o) => o.status === 'Accepted').length;
    const rejected = this.state.applications.filter((a) => a.status === 'Rejected').length;

    // Source effectiveness
    const sourceMap = new Map();

    for (const j of this.state.jobs) {
      const src = j.source_name || 'Direct Discovery';
      if (!sourceMap.has(src)) {
        sourceMap.set(src, { discovered: 0, applied: 0, interviews: 0, offers: 0 });
      }
      sourceMap.get(src).discovered++;
    }

    for (const a of this.state.applications) {
      const src = a.source || 'Direct Discovery';
      if (!sourceMap.has(src)) {
        sourceMap.set(src, { discovered: 1, applied: 0, interviews: 0, offers: 0 });
      }
      sourceMap.get(src).applied++;
    }

    for (const i of this.state.interviews) {
      // Find app
      const app = this.state.applications.find((a) => a.id === i.application_id);
      const src = (app && app.source) || 'Enterprise Sources';
      if (!sourceMap.has(src)) {
        sourceMap.set(src, { discovered: 1, applied: 1, interviews: 0, offers: 0 });
      }
      sourceMap.get(src).interviews++;
    }

    for (const o of this.state.offers) {
      const app = this.state.applications.find((a) => a.id === o.application_id);
      const src = (app && app.source) || 'Enterprise Sources';
      if (!sourceMap.has(src)) {
        sourceMap.set(src, { discovered: 1, applied: 1, interviews: 1, offers: 0 });
      }
      sourceMap.get(src).offers++;
    }

    const sources_effectiveness = Array.from(sourceMap.entries()).map(([source, stats]) => ({
      source,
      ...stats,
    }));

    // Top skills frequency (null-prototype map so odd skill names cannot hit Object.prototype)
    const skillCounts = Object.create(null);
    for (const j of this.state.jobs) {
      for (const s of j.skills || []) {
        skillCounts[s] = (skillCounts[s] || 0) + 1;
      }
    }

    const top_skills = Object.entries(skillCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([skill, count]) => ({ skill, count }));

    // Average days from "Applied" to the first later stage change (callback, rejection or offer), from real timelines.
    const RESPONSE_STATUSES = ['Screening', 'Technical Round', 'Managerial Round', 'HR Round', 'Offer', 'Accepted', 'Rejected'];
    const responseDays = [];
    for (const a of this.state.applications) {
      const events = (Array.isArray(a.timeline) ? a.timeline : [])
        .filter((e) => e && typeof e.timestamp === 'string' && !Number.isNaN(Date.parse(e.timestamp)))
        .sort((x, y) => Date.parse(x.timestamp) - Date.parse(y.timestamp));
      const appliedAt = events.find((e) => e.status === 'Applied');
      if (!appliedAt) continue;
      const reply = events.find((e) => Date.parse(e.timestamp) > Date.parse(appliedAt.timestamp) && RESPONSE_STATUSES.includes(e.status));
      if (reply) responseDays.push((Date.parse(reply.timestamp) - Date.parse(appliedAt.timestamp)) / 86400000);
    }
    const avg_response_days = responseDays.length
      ? Math.round((responseDays.reduce((sum, n) => sum + n, 0) / responseDays.length) * 10) / 10
      : null;

    return {
      total_applications: applied,
      active_pipeline: this.state.applications.filter(
        (a) => !['Rejected', 'Ghosted / Inactive', 'Accepted'].includes(a.status)
      ).length,
      response_rate: applied > 0 ? Math.round(((interviews + offers) / Math.max(1, applied)) * 100) : 0,
      interview_rate: applied > 0 ? Math.round((interviews / Math.max(1, applied)) * 100) : 0,
      offer_rate: interviews > 0 ? Math.round((offers / Math.max(1, interviews)) * 100) : 0,
      avg_response_days,
      funnel: {
        discovered: totalDiscovered,
        viewed,
        saved,
        applied,
        interviews,
        offers,
        accepted,
        rejected,
      },
      conversion_rates: {
        view_to_save: viewed > 0 ? Math.round((saved / viewed) * 100) : 0,
        save_to_apply: saved > 0 ? Math.round((applied / saved) * 100) : 0,
        apply_to_interview: applied > 0 ? Math.round((interviews / Math.max(1, applied)) * 100) : 0,
        interview_to_offer: interviews > 0 ? Math.round((offers / Math.max(1, interviews)) * 100) : 0,
        offer_to_accept: offers > 0 ? Math.round((accepted / Math.max(1, offers)) * 100) : 0,
      },
      sources_effectiveness,
      top_skills,
      recent_activity: [
        { date: 'Today', action: 'Jobs Discovered', count: totalDiscovered },
        { date: 'Today', action: 'Applications Tracked', count: applied },
        { date: 'This Week', action: 'Interviews Scheduled', count: interviews },
      ],
    };
  }

  // Multi-Source Live Discovery Runner.
  // options.sourceIds (optional array of source ids) restricts the run to those connectors
  // (used by POST /sources/:id/sync). Disabled sources (stored `enabled === false`) are skipped.
  async executeLiveDiscovery(query, profileId, options) {
    // Deliberate change F: real running flag; a concurrent run is refused.
    if (this._running) {
      const busy = new Error('Discovery already running');
      busy.code = 'DISCOVERY_RUNNING';
      throw busy;
    }
    this._running = true;

    try {
      const runId = `run-${Date.now()}`;
      const startedAt = new Date().toISOString();
      let profileName = 'On-Demand Query';

      // An explicit query (typed live search) wins; otherwise the selected profile's keywords drive the run.
      let effectiveQuery = query || '';
      if (profileId && !effectiveQuery) {
        const profile = this.getSearchProfileById(profileId);
        if (profile) {
          profileName = profile.name;
          effectiveQuery = (profile.keywords || []).join(' ');
        }
      }

      const run = {
        run_id: runId,
        search_query: effectiveQuery || 'Broad Tech & Enterprise Discovery',
        search_profile_name: profileName,
        started_at: startedAt,
        completed_at: '',
        status: 'running',
        sources_checked: 0,
        jobs_scanned: 0,
        jobs_added: 0,
        jobs_updated: 0,
        duplicates_merged: 0,
        errors: 0,
      };

      // Decide which connectors to run (original ran all six, ignoring `enabled`).
      const onlyIds = options && Array.isArray(options.sourceIds) ? options.sourceIds : null;
      const ids = CONNECTOR_ORDER.filter((id) => {
        if (onlyIds && !onlyIds.includes(id)) return false;
        if (typeof this.connectors[id] !== 'function') return false;
        const src = this.state.sources.find((s) => s.id === id);
        if (src && src.enabled === false) return false; // deliberate change B
        return true;
      });

      const results = await Promise.allSettled(
        ids.map(async (id) => {
          const fn = this.connectors[id];
          if (id === 'search_discovery') return fn(effectiveQuery || undefined);
          return fn(effectiveQuery);
        })
      );

      const allDiscoveredRaw = [];

      for (let i = 0; i < results.length; i++) {
        const res = results[i];
        const id = ids[i];
        run.sources_checked++;
        if (res.status === 'fulfilled' && res.value) {
          const syncRes = res.value;
          let jobs = Array.isArray(syncRes.jobs) ? syncRes.jobs : [];
          if (id === 'search_discovery') {
            // Deliberate change B: everything from the synthetic connector is flagged.
            jobs = jobs.map((j) => ({ ...j, synthetic: true }));
          }
          run.jobs_scanned += jobs.length;
          allDiscoveredRaw.push(...jobs);

          // Update connector status in store
          const source = this.state.sources.find((s) => s.id === (syncRes.source_id || id));
          if (source) {
            source.last_sync = new Date().toISOString();
            source.total_jobs_found = (source.total_jobs_found || 0) + jobs.length;
            source.status = syncRes.success ? 'healthy' : 'error';
          }
        } else {
          run.errors++;
        }
      }

      // Run Deduplication and Merge
      const ingestStats = this.ingestRawJobs(allDiscoveredRaw);
      run.jobs_added = ingestStats.added;
      run.jobs_updated = ingestStats.updated;
      run.duplicates_merged = ingestStats.duplicates;
      run.completed_at = new Date().toISOString();
      run.status = 'completed';

      this.addDiscoveryRun(run);

      if (run.jobs_added > 0) {
        this.addNotification({
          id: `notif-run-${Date.now()}`,
          title: `Discovery Run Completed`,
          message: `Discovered ${run.jobs_added} new jobs and updated ${run.jobs_updated} across ${run.sources_checked} sources for "${run.search_query}".`,
          type: 'new_match',
          created_at: new Date().toISOString(),
          read: false,
        });
      }

      return run;
    } finally {
      this._running = false;
    }
  }
}
