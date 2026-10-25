// Ported from Job Intelligence (server/connectors/greenhouse.ts)

// Top verified public tech companies using Greenhouse Job Boards API
const KNOWN_GREENHOUSE_BOARDS = [
  { board: 'stripe', name: 'Stripe', country: 'United States' },
  { board: 'figma', name: 'Figma', country: 'United States' },
  { board: 'gitlab', name: 'GitLab', country: 'Global' },
  { board: 'cloudflare', name: 'Cloudflare', country: 'United States' },
  { board: 'canonical', name: 'Canonical (Ubuntu)', country: 'United Kingdom' },
  { board: 'datadog', name: 'Datadog', country: 'France' },
  { board: 'reddit', name: 'Reddit', country: 'United States' },
  { board: 'elastic', name: 'Elastic', country: 'Global' },
  { board: 'samsara', name: 'Samsara', country: 'United States' },
  { board: 'gusto', name: 'Gusto', country: 'United States' },
  { board: 'pinterest', name: 'Pinterest', country: 'United States' },
];

export async function fetchGreenhouseJobs(query) {
  const startTime = Date.now();
  const jobs = [];
  const errors = [];

  // Query up to 8 diverse boards in parallel
  const boardsToCheck = KNOWN_GREENHOUSE_BOARDS.slice(0, 8);

  const fetchPromises = boardsToCheck.map(async (item) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const url = `https://boards-api.greenhouse.io/v1/boards/${item.board}/jobs?content=true`;
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'JobIntelligenceApp/1.0',
        },
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data.jobs && Array.isArray(data.jobs)) {
          let countForBoard = 0;
          for (const ghJob of data.jobs) {
            if (!ghJob || !ghJob.title) continue;

            const title = ghJob.title || 'Role';
            const location = ghJob.location?.name || 'Remote';
            const content = ghJob.content || '';

            // Filter if query is provided
            if (query && query.trim()) {
              const q = query.toLowerCase();
              const matchesTitle = title.toLowerCase().includes(q);
              const matchesContent = content.toLowerCase().includes(q);
              const matchesLocation = location.toLowerCase().includes(q);
              if (!matchesTitle && !matchesContent && !matchesLocation) {
                continue;
              }
            }

            const isRemote =
              location.toLowerCase().includes('remote') ||
              title.toLowerCase().includes('remote') ||
              content.toLowerCase().includes('work from anywhere');

            const isHybrid =
              location.toLowerCase().includes('hybrid') ||
              content.toLowerCase().includes('hybrid');

            // Detect Country
            let country = item.country;
            const locLower = location.toLowerCase();
            if (locLower.includes('india')) country = 'India';
            else if (locLower.includes('germany') || locLower.includes('berlin') || locLower.includes('munich')) country = 'Germany';
            else if (locLower.includes('united kingdom') || locLower.includes('london') || locLower.includes('uk')) country = 'United Kingdom';
            else if (locLower.includes('canada') || locLower.includes('toronto') || locLower.includes('vancouver')) country = 'Canada';
            else if (locLower.includes('australia') || locLower.includes('sydney')) country = 'Australia';
            else if (locLower.includes('france') || locLower.includes('paris')) country = 'France';
            else if (locLower.includes('ireland') || locLower.includes('dublin')) country = 'Ireland';
            else if (locLower.includes('japan') || locLower.includes('tokyo')) country = 'Japan';
            else if (locLower.includes('singapore')) country = 'Singapore';
            else if (locLower.includes('remote') || locLower.includes('worldwide') || locLower.includes('global')) country = 'Global';

            // Extract skills
            const detectedSkills = [];
            const commonTech = [
              'Python', 'Java', 'SAP', 'React', 'TypeScript', 'Go', 'Golang',
              'Kubernetes', 'AWS', 'GCP', 'SQL', 'Docker', 'DevOps', 'PostgreSQL',
              'Distributed Systems', 'Machine Learning', 'AI', 'Node.js', 'Linux',
              'Rust', 'GraphQL', 'Microservices', 'Terraform'
            ];
            for (const t of commonTech) {
              if (title.toLowerCase().includes(t.toLowerCase()) || content.toLowerCase().includes(t.toLowerCase())) {
                detectedSkills.push(t);
              }
            }

            jobs.push({
              external_job_id: `gh-${ghJob.id}`,
              source_id: 'greenhouse',
              source_name: `Greenhouse (${item.name})`,
              source_type: 'official_career_api',
              title: title.trim(),
              company: item.name,
              location: location.trim(),
              country,
              city: location.split(',')[0]?.trim() || location.trim(),
              remote_mode: isRemote ? 'remote' : isHybrid ? 'hybrid' : 'on-site',
              employment_type: 'full-time',
              skills: detectedSkills.length ? detectedSkills.slice(0, 8) : ['Software Engineering', 'Cloud'],
              description: content ? content.replace(/<[^>]+>/g, ' ').slice(0, 3500) : `Official career opening at ${item.name} for ${title}.`,
              summary_30s: `Direct career opening at ${item.name} (${country}): ${title}. Work mode: ${isRemote ? 'Remote' : isHybrid ? 'Hybrid' : 'On-site'}.`,
              original_url: ghJob.absolute_url || `https://boards.greenhouse.io/${item.board}/jobs/${ghJob.id}`,
              company_careers_url: `https://boards.greenhouse.io/${item.board}`,
              posted_at: ghJob.updated_at || new Date().toISOString(),
              visa_sponsorship: 'not_specified',
            });

            countForBoard++;
            if (countForBoard >= 10) break; // allow up to 10 per board
          }
        }
      }
    } catch (err) {
      errors.push(`${item.name}: ${err.message || 'fetch failed'}`);
    }
  });

  await Promise.allSettled(fetchPromises);

  return {
    source_id: 'greenhouse',
    source_name: 'Greenhouse Career API',
    success: jobs.length > 0 || errors.length === 0,
    jobs,
    error: errors.length ? errors.join('; ') : undefined,
    duration_ms: Date.now() - startTime,
  };
}
