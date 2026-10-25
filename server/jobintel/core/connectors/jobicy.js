// Ported from Job Intelligence (server/connectors/jobicy.ts)

export async function fetchJobicyJobs(query) {
  const startTime = Date.now();
  const jobs = [];

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const targetUrl = query && query.trim()
      ? `https://jobicy.com/api/v2/remote-jobs?count=25&tag=${encodeURIComponent(query.trim())}`
      : `https://jobicy.com/api/v2/remote-jobs?count=25`;

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
          if (!item || !item.id || !item.jobTitle) continue;

          const title = item.jobTitle || 'Role';
          const company = item.companyName || 'Company';
          const description = (item.jobDescription || '').replace(/<[^>]+>/g, ' ').slice(0, 3000);
          const location = item.jobGeo || 'Anywhere';

          let salaryMin = item.annualSalaryMin ? Number(item.annualSalaryMin) : undefined;
          let salaryMax = item.annualSalaryMax ? Number(item.annualSalaryMax) : undefined;
          let currency = item.salaryCurrency || 'USD';

          const rawSalary = salaryMin && salaryMax
            ? `${currency} ${salaryMin.toLocaleString()} - ${salaryMax.toLocaleString()}`
            : undefined;

          jobs.push({
            external_job_id: String(item.id),
            source_id: 'jobicy',
            source_name: 'Jobicy Global Feed',
            source_type: 'job_board_api',
            title: title.trim(),
            company: company.trim(),
            location: location,
            country: location.includes('USA') || location.includes('US') ? 'United States' : location.includes('UK') ? 'United Kingdom' : 'Global',
            remote_mode: 'remote',
            employment_type: item.jobType === 'full-time' ? 'full-time' : item.jobType === 'part-time' ? 'part-time' : 'contract',
            salary_min: salaryMin,
            salary_max: salaryMax,
            salary_currency: currency,
            salary_raw: rawSalary,
            skills: item.jobIndustry ? [item.jobIndustry, 'Remote'] : ['Remote'],
            description: description || `Career opportunity at ${company} for ${title}.`,
            original_url: item.url || `https://jobicy.com/jobs/${item.id}`,
            posted_at: item.pubDate || new Date().toISOString(),
            visa_sponsorship: 'not_specified',
          });

          if (jobs.length >= 25) break;
        }
      }
    }
  } catch (err) {
    return {
      source_id: 'jobicy',
      source_name: 'Jobicy Global Feed',
      success: false,
      jobs: [],
      error: err.message || 'Jobicy request failed',
      duration_ms: Date.now() - startTime,
    };
  }

  return {
    source_id: 'jobicy',
    source_name: 'Jobicy Global Feed',
    success: true,
    jobs,
    duration_ms: Date.now() - startTime,
  };
}
