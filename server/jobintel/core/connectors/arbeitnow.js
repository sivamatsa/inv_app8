// Ported from Job Intelligence (server/connectors/arbeitnow.ts)

export async function fetchArbeitnowJobs(query) {
  const startTime = Date.now();
  const jobs = [];

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch('https://www.arbeitnow.com/api/job-board-api', {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'JobIntelligenceApp/1.0',
      },
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.data)) {
        const q = query ? query.toLowerCase().trim() : '';

        for (const item of data.data) {
          if (!item || !item.slug || !item.title) continue;

          const title = item.title || '';
          const company = item.company_name || 'Employer';
          const tags = Array.isArray(item.tags) ? item.tags : [];
          const description = (item.description || '').replace(/<[^>]+>/g, ' ').slice(0, 3000);
          const location = item.location || 'Europe / Global';

          if (q) {
            const matchesTitle = title.toLowerCase().includes(q);
            const matchesTags = tags.some((t) => t.toLowerCase().includes(q));
            const matchesCompany = company.toLowerCase().includes(q);
            const matchesDesc = description.toLowerCase().includes(q);

            if (!matchesTitle && !matchesTags && !matchesCompany && !matchesDesc) {
              continue;
            }
          }

          const isRemote = Boolean(item.remote);

          jobs.push({
            external_job_id: String(item.slug),
            source_id: 'arbeitnow',
            source_name: 'Arbeitnow Career Feed',
            source_type: 'job_board_api',
            title: title.trim(),
            company: company.trim(),
            location: location.trim(),
            country: location.includes('Germany') ? 'Germany' : location.includes('UK') ? 'United Kingdom' : 'Europe',
            city: location.split(',')[0]?.trim() || location,
            remote_mode: isRemote ? 'remote' : 'hybrid',
            employment_type: 'full-time',
            skills: tags.length ? tags : ['Professional', 'Enterprise'],
            description: description || `Career opportunity at ${company} for ${title}.`,
            original_url: item.url || `https://www.arbeitnow.com/jobs/${item.slug}`,
            posted_at: item.created_at ? new Date(item.created_at * 1000).toISOString() : new Date().toISOString(),
            visa_sponsorship: item.visa_sponsorship ? 'explicitly_offered' : 'not_specified',
          });

          if (jobs.length >= 25) break;
        }
      }
    }
  } catch (err) {
    return {
      source_id: 'arbeitnow',
      source_name: 'Arbeitnow Career Feed',
      success: false,
      jobs: [],
      error: err.message || 'Arbeitnow API request failed',
      duration_ms: Date.now() - startTime,
    };
  }

  return {
    source_id: 'arbeitnow',
    source_name: 'Arbeitnow Career Feed',
    success: true,
    jobs,
    duration_ms: Date.now() - startTime,
  };
}
