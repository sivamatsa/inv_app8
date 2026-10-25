// Ported from Job Intelligence (server/connectors/remoteok.ts)

export async function fetchRemoteOKJobs(query) {
  const startTime = Date.now();
  const jobs = [];

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch('https://remoteok.com/api', {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'JobIntelligenceApp/1.0',
      },
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        // First item in remoteok is legal/metadata
        const items = data.slice(1);
        const q = query ? query.toLowerCase().trim() : '';

        for (const item of items) {
          if (!item || !item.id || !item.position) continue;

          const title = item.position || '';
          const company = item.company || 'Unknown Employer';
          const tags = Array.isArray(item.tags) ? item.tags : [];
          const description = (item.description || '').replace(/<[^>]+>/g, ' ').slice(0, 3000);
          const location = item.location || 'Worldwide Remote';

          if (q) {
            const matchesTitle = title.toLowerCase().includes(q);
            const matchesTags = tags.some((t) => t.toLowerCase().includes(q));
            const matchesCompany = company.toLowerCase().includes(q);
            const matchesDesc = description.toLowerCase().includes(q);

            if (!matchesTitle && !matchesTags && !matchesCompany && !matchesDesc) {
              continue;
            }
          }

          let salaryMin;
          let salaryMax;
          if (item.salary_min) salaryMin = Number(item.salary_min);
          if (item.salary_max) salaryMax = Number(item.salary_max);

          jobs.push({
            external_job_id: String(item.id),
            source_id: 'remoteok',
            source_name: 'RemoteOK Live API',
            source_type: 'public_feed',
            title: title.trim(),
            company: company.trim(),
            location: location.trim(),
            country: location.includes('US') ? 'United States' : location.includes('Europe') ? 'Europe' : 'Global',
            remote_mode: 'remote',
            employment_type: 'full-time',
            salary_min: salaryMin,
            salary_max: salaryMax,
            salary_currency: salaryMin || salaryMax ? 'USD' : undefined,
            salary_raw: salaryMin && salaryMax ? `$${salaryMin.toLocaleString()} - $${salaryMax.toLocaleString()} USD` : undefined,
            skills: tags.length ? tags.map((t) => t.toUpperCase()) : ['Remote', 'Tech'],
            description: description || `Live remote position at ${company} for ${title}.`,
            original_url: item.url || `https://remoteok.com/remote-jobs/${item.id}`,
            company_careers_url: item.company_url || undefined,
            posted_at: item.date || new Date().toISOString(),
            visa_sponsorship: 'not_specified',
          });

          if (jobs.length >= 25) break;
        }
      }
    }
  } catch (err) {
    return {
      source_id: 'remoteok',
      source_name: 'RemoteOK Live API',
      success: false,
      jobs: [],
      error: err.message || 'RemoteOK API request failed',
      duration_ms: Date.now() - startTime,
    };
  }

  return {
    source_id: 'remoteok',
    source_name: 'RemoteOK Live API',
    success: true,
    jobs,
    duration_ms: Date.now() - startTime,
  };
}
