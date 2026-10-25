// Ported from Job Intelligence (server/connectors/remotive.ts)

export async function fetchRemotiveJobs(query) {
  const startTime = Date.now();
  const jobs = [];

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);

    const targetUrl = query && query.trim()
      ? `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(query.trim())}&limit=40`
      : `https://remotive.com/api/remote-jobs?limit=40`;

    const res = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'JobIntelligenceApp/1.0',
      },
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.jobs)) {
        for (const item of data.jobs) {
          if (!item || !item.id || !item.title) continue;

          const title = item.title.trim();
          const company = (item.company_name || 'Global Client').trim();
          const location = item.candidate_required_location || 'Worldwide Remote';
          const description = (item.description || '').replace(/<[^>]+>/g, ' ').slice(0, 3500);

          // Infer country / region
          let country = 'Global';
          const locLower = location.toLowerCase();
          if (locLower.includes('usa') || locLower.includes('united states') || locLower.includes('us only')) {
            country = 'United States';
          } else if (locLower.includes('uk') || locLower.includes('united kingdom')) {
            country = 'United Kingdom';
          } else if (locLower.includes('germany') || locLower.includes('dach')) {
            country = 'Germany';
          } else if (locLower.includes('canada')) {
            country = 'Canada';
          } else if (locLower.includes('europe')) {
            country = 'Europe';
          } else if (locLower.includes('apac') || locLower.includes('asia') || locLower.includes('india')) {
            country = 'APAC';
          } else if (locLower.includes('latam') || locLower.includes('americas')) {
            country = 'Americas';
          }

          const tags = Array.isArray(item.tags)
            ? item.tags.map((t) => (typeof t === 'string' ? t : String(t || ''))).filter(Boolean)
            : ['Remote', 'Engineering'];

          jobs.push({
            external_job_id: `remotive-${item.id}`,
            source_id: 'remotive',
            source_name: 'Remotive Global Tech',
            source_type: 'public_feed',
            title,
            company,
            location,
            country,
            city: location.split(',')[0]?.trim() || 'Remote',
            remote_mode: 'remote',
            employment_type: item.job_type === 'contract' ? 'contract' : 'full-time',
            salary_raw: item.salary && item.salary.trim() ? item.salary.trim() : undefined,
            skills: tags.length ? tags.slice(0, 8) : ['Remote', 'Software'],
            description: description || `Global remote position at ${company} for ${title}.`,
            summary_30s: `Worldwide remote opportunity: ${title} at ${company} (${location}).`,
            original_url: item.url || `https://remotive.com/remote-jobs/${item.id}`,
            company_careers_url: `https://remotive.com`,
            posted_at: item.publication_date || new Date().toISOString(),
            visa_sponsorship: 'not_specified',
          });
        }
      }
    }

    return {
      source_id: 'remotive',
      source_name: 'Remotive Global Tech',
      success: true,
      jobs,
      duration_ms: Date.now() - startTime,
    };
  } catch (err) {
    return {
      source_id: 'remotive',
      source_name: 'Remotive Global Tech',
      success: false,
      jobs: [],
      error: err.message || 'Remotive fetch failed',
      duration_ms: Date.now() - startTime,
    };
  }
}
