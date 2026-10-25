// Ported from Job Intelligence (server/engine/gemini.ts)
//
// Portable core module: the original read process.env.GEMINI_API_KEY and built a
// GoogleGenAI client at module level. Here the client is INJECTED via configureGemini().
//   getClient(): client | null   (client is any object exposing models.generateContent)
//   model: model name string (default 'gemini-3.5-flash-lite')
// If no client is available (or a call throws), the deterministic fallbacks are used.

let getClientFn = null;
let modelName = 'gemini-3.5-flash-lite';

export function configureGemini({ getClient, model } = {}) {
  getClientFn = typeof getClient === 'function' ? getClient : null;
  if (model && typeof model === 'string') {
    modelName = model;
  }
}

function getAI() {
  if (!getClientFn) {
    return null;
  }
  try {
    return getClientFn() || null;
  } catch (err) {
    return null;
  }
}

export async function parseNaturalLanguageQuery(queryText) {
  const ai = getAI();
  if (ai) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: `You are a career search parser for the Job Intelligence platform.
Extract structured search parameters from the user's natural language request.
Return strictly a JSON object with this shape:
{
  "keywords": ["SAP VIM", "OpenText"],
  "country": ["India"],
  "locations": ["Hyderabad", "Bangalore"],
  "min_experience": 5,
  "max_experience": 8,
  "remote_only": false,
  "posted_within_days": 7,
  "summary": "SAP VIM roles in India requiring 5+ years experience posted in last 7 days"
}

User query: "${queryText.replace(/"/g, '\\"')}"`,
        config: {
          responseMimeType: 'application/json',
        },
      });

      if (response.text) {
        return JSON.parse(response.text.trim());
      }
    } catch (err) {
      console.warn('Gemini NL query parsing fallback:', err);
    }
  }

  // Resilient fallback rule-based extractor
  const text = queryText.toLowerCase();
  const keywords = [];
  let minExp;
  let postedDays;
  let remoteOnly = false;
  const countries = [];

  if (text.includes('remote')) remoteOnly = true;
  if (text.includes('india')) countries.push('India');
  if (/\b(?:us|usa|united states)\b/.test(text)) countries.push('United States');
  if (/\b(?:germany|europe)\b/.test(text)) countries.push('Europe');

  const expMatch = text.match(/(\d+)\s*\+?\s*(?:to\s*(\d+))?\s*(?:years|yrs|year)/);
  if (expMatch) {
    minExp = parseInt(expMatch[1], 10);
  }

  const daysMatch = text.match(/(\d+)\s*days?/);
  if (daysMatch) {
    postedDays = parseInt(daysMatch[1], 10);
  }

  // Extract clean keywords by removing stop phrases
  const cleaned = queryText
    .replace(/\b(?:find|search|jobs?|openings?|roles?|in|for|with|experience|posted|during|the|last|past)\b|\d+\+?\s*(?:years?|yrs?)\b|\d+\s*days?\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned) {
    keywords.push(cleaned);
  } else {
    keywords.push(queryText.trim());
  }

  return {
    keywords,
    country: countries.length ? countries : undefined,
    min_experience: minExp,
    remote_only: remoteOnly,
    posted_within_days: postedDays || 14,
    summary: `Search for ${keywords.join(', ')}`,
  };
}

export async function matchJobWithProfile(job, profile) {
  const ai = getAI();

  if (ai) {
    try {
      const prompt = `You are the transparency matching engine for Job Intelligence.
Evaluate how well the following job posting matches the user's saved search profile.

IMPORTANT RULES:
- Never invent job facts. Clearly separate what is EXPLICITLY STATED in the posting from what is INFERRED or NOT SPECIFIED.
- List matched criteria with affirmative clarity.
- List potential gaps or missing qualifications with constructive clarity.
- Provide a clear, honest score from 0 to 100.

Job:
Title: ${job.title}
Company: ${job.company}
Location: ${job.location} (Remote mode: ${job.remote_mode})
Skills: ${job.skills.join(', ')}
Experience specified: ${job.min_experience ? job.min_experience + ' years' : 'Not specified'}
Visa sponsorship: ${job.visa_sponsorship}
Description snippet: ${job.description.slice(0, 1500)}

User Search Profile:
Profile Name: ${profile.name}
Keywords: ${profile.keywords.join(', ')}
Target Titles: ${profile.target_titles.join(', ')}
Required Skills: ${profile.required_skills.join(', ')}
Target Experience: ${profile.min_experience} - ${profile.max_experience || 'Any'} years
Target Locations: ${profile.locations.join(', ')}
Allowed Remote Modes: ${profile.remote_mode.join(', ')}

Return strictly JSON format:
{
  "match_score": 85,
  "match_tier": "Strong Match",
  "matched_criteria": ["✓ Primary skill overlap: SAP VIM", "✓ Remote/Hybrid compatibility", "✓ Experience matches 5+ years requirement"],
  "potential_gaps": ["• S/4HANA migration experience not specified", "• ICC validation not explicitly mentioned"],
  "explanation": "High alignment on enterprise invoice workflows and required 5+ years experience. Location aligns with remote preference.",
  "fact_breakdown": {
    "explicitly_stated": ["Role: Lead Consultant", "Location: Hyderabad/Remote", "Skills: SAP VIM, OpenText"],
    "inferred": ["Senior level responsibilities based on architectural scope"],
    "not_specified": ["Exact salary compensation", "Visa sponsorship details"]
  }
}`;

      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        },
      });

      if (response.text) {
        const parsed = JSON.parse(response.text.trim());
        return {
          job_id: job.id,
          profile_id: profile.id,
          match_score: parsed.match_score || 70,
          match_tier: parsed.match_tier || 'Good Match',
          matched_criteria: Array.isArray(parsed.matched_criteria) ? parsed.matched_criteria : ['✓ Keyword overlap identified'],
          potential_gaps: Array.isArray(parsed.potential_gaps) ? parsed.potential_gaps : [],
          explanation: parsed.explanation || 'Analyzed by AI matching engine.',
          fact_breakdown: parsed.fact_breakdown || {
            explicitly_stated: [`Title: ${job.title}`, `Company: ${job.company}`],
            inferred: [],
            not_specified: ['Exact salary not listed'],
          },
        };
      }
    } catch (err) {
      console.warn('Gemini match evaluation fallback:', err);
    }
  }

  // Deterministic transparent fallback evaluator
  let score = 50;
  const matched = [];
  const gaps = [];

  // 1. Keyword / Title match
  const profileKeywords = [...profile.keywords, ...profile.target_titles];
  const titleLower = job.title.toLowerCase();
  const descLower = job.description.toLowerCase();

  let hasKwMatch = false;
  for (const kw of profileKeywords) {
    if (!kw) continue;
    const k = kw.toLowerCase();
    if (titleLower.includes(k) || descLower.includes(k)) {
      matched.push(`✓ Matches keyword: "${kw}"`);
      score += 20;
      hasKwMatch = true;
      break;
    }
  }
  if (!hasKwMatch && profileKeywords.length) {
    gaps.push(`• Title "${job.title}" lacks exact keyword "${profileKeywords[0]}"`);
  }

  // 2. Skill match
  const matchedSkills = (job.skills || []).filter((s) =>
    (profile.required_skills || []).some((rs) => String(rs || '').toLowerCase() === String(s || '').toLowerCase())
  );
  if (matchedSkills.length > 0) {
    matched.push(`✓ Overlapping skills: ${matchedSkills.slice(0, 3).join(', ')}`);
    score += 15;
  } else if (profile.required_skills.length) {
    gaps.push(`• Posting does not explicitly mention ${profile.required_skills.slice(0, 2).join(', ')}`);
  }

  // 3. Remote / Work mode match
  if (profile.remote_mode.includes(job.remote_mode)) {
    matched.push(`✓ Preferred work mode: ${job.remote_mode.toUpperCase()}`);
    score += 10;
  } else {
    gaps.push(`• Work mode is ${job.remote_mode}, user prefers ${profile.remote_mode.join('/')}`);
  }

  // 4. Experience match
  if (job.min_experience !== undefined) {
    if (job.min_experience <= profile.min_experience) {
      matched.push(`✓ Required experience (${job.min_experience} yrs) is within your range (${profile.min_experience}+ yrs)`);
      score += 10;
    } else {
      gaps.push(`• Posting asks for ${job.min_experience}+ years; profile targets ${profile.min_experience} years`);
      score -= 10;
    }
  }

  score = Math.min(98, Math.max(25, score));
  const tier = score >= 80 ? 'Strong Match' : score >= 65 ? 'Good Match' : score >= 45 ? 'Partial Match' : 'Low Match';

  return {
    job_id: job.id,
    profile_id: profile.id,
    match_score: score,
    match_tier: tier,
    matched_criteria: matched.length ? matched : ['✓ Basic domain relevance'],
    potential_gaps: gaps.length ? gaps : ['• Verify specific domain framework credentials'],
    explanation: `Calculated from ${matched.length} matched criteria against "${profile.name}". Transparently reports explicit posting details versus profile preferences.`,
    fact_breakdown: {
      explicitly_stated: [
        `Role: ${job.title}`,
        `Company: ${job.company}`,
        `Location: ${job.location}`,
        job.salary_raw ? `Salary: ${job.salary_raw}` : 'Salary: Not listed in posting',
      ],
      inferred: [`Domain alignment based on technology keywords: ${job.skills.slice(0, 3).join(', ')}`],
      not_specified: [
        job.salary_raw ? '' : 'Compensation not specified',
        job.visa_sponsorship === 'not_specified' ? 'Visa sponsorship not specified' : '',
      ].filter(Boolean),
    },
  };
}

export async function analyzeResumeVsJob(resumeText, job) {
  const ai = getAI();
  if (ai) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: `You are an expert ATS and career advisor for the Job Intelligence platform.
Analyze the candidate's resume text against the target job posting.
Provide an honest, objective evaluation. DO NOT guarantee 100% ATS clearance; provide realistic, grounded feedback.

Job Posting:
Title: ${job.title}
Company: ${job.company}
Required Skills: ${job.skills.join(', ')}
Description: ${job.description.slice(0, 2000)}

Candidate Resume Text:
${resumeText.slice(0, 3000)}

Return strictly JSON with:
{
  "match_score": 78,
  "matched_skills": ["Skill A", "Skill B"],
  "missing_skills": ["Skill C", "Skill D"],
  "ats_keywords_found": ["Keyword 1", "Keyword 2"],
  "ats_keywords_missing": ["Keyword 3", "Keyword 4"],
  "strengths": ["Clear leadership progression", "Strong domain experience in XYZ"],
  "recommendations": ["Highlight quantitative metrics for ABC project", "Add mention of tool XYZ in technical skills section"]
}`,
        config: {
          responseMimeType: 'application/json',
        },
      });

      if (response.text) {
        return { ...JSON.parse(response.text.trim()), engine: 'gemini' };
      }
    } catch (err) {
      console.warn('Gemini resume analysis fallback:', err);
    }
  }

  // Fallback keyword comparison
  const resumeLower = resumeText.toLowerCase();
  const matchedSkills = [];
  const missingSkills = [];

  for (const s of (job.skills || [])) {
    const sStr = typeof s === 'string' ? s : String(s || '');
    if (!sStr) continue;
    if (resumeLower.includes(sStr.toLowerCase())) {
      matchedSkills.push(sStr);
    } else {
      missingSkills.push(sStr);
    }
  }

  const score = Math.round(
    (matchedSkills.length / Math.max(1, job.skills.length)) * 60 + 35
  );

  return {
    engine: 'built-in',
    match_score: Math.min(95, Math.max(30, score)),
    matched_skills: matchedSkills,
    missing_skills: missingSkills,
    ats_keywords_found: matchedSkills.slice(0, 5),
    ats_keywords_missing: missingSkills.slice(0, 5),
    strengths: [
      `Resume demonstrates direct alignment with ${matchedSkills.slice(0, 3).join(', ')}`,
      `Relevant technical vocabulary aligns with ${job.company}'s posting`,
    ],
    recommendations: [
      missingSkills.length ? `Incorporate explicit experience with ${missingSkills.slice(0, 3).join(', ')} if applicable` : 'Ensure quantifiable metrics accompany your achievements',
      `Align your headline and summary section directly with the role title: "${job.title}"`,
    ],
  };
}

export async function generateInterviewPrep(job, roundType) {
  const ai = getAI();
  if (ai) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: `You are an elite interview coach for Job Intelligence.
Generate tailored preparation material for an upcoming ${roundType} interview.
Ground all advice specifically in the target job description.

Job Details:
Role: ${job.title}
Company: ${job.company}
Skills: ${job.skills.join(', ')}
Description: ${job.description.slice(0, 2000)}
Interview Round: ${roundType}

Return strictly JSON with:
{
  "technical_topics": ["Architecture topic 1", "Workflow optimization topic 2"],
  "behavioral_topics": ["Stakeholder conflict resolution", "Production outage response"],
  "practice_questions": [
    "How would you design a scalable pipeline for XYZ?",
    "Describe how you handled a critical production defect in ${job.skills[0] || 'your core technology'}."
  ],
  "questions_to_ask": [
    "What does the current architecture roadmap look like for this team over the next 12 months?",
    "How does the engineering team measure deployment velocity and system reliability?"
  ],
  "revision_tips": [
    "Review core transaction codes / APIs for ${job.skills[0] || 'primary framework'}",
    "Prepare a 2-minute STAR story demonstrating cross-functional impact"
  ]
}`,
        config: {
          responseMimeType: 'application/json',
        },
      });

      if (response.text) {
        return { ...JSON.parse(response.text.trim()), engine: 'gemini' };
      }
    } catch (err) {
      console.warn('Gemini interview prep fallback:', err);
    }
  }

  // Fallback tailored questions
  const primarySkill = job.skills[0] || 'System Engineering';
  const secondarySkill = job.skills[1] || 'Architecture';

  return {
    engine: 'built-in',
    technical_topics: [
      `Deep-dive into ${primarySkill} best practices and design patterns`,
      `Integration architecture between ${primarySkill} and ${secondarySkill}`,
      `Error handling, monitoring, and failover strategies`,
      `Performance tuning and latency optimization in high-volume environments`,
    ],
    behavioral_topics: [
      'Managing conflicting priorities between engineering and product stakeholders',
      'Driving technical decisions during ambiguous or high-stakes requirements',
      'Mentoring junior teammates and establishing quality coding standards',
    ],
    practice_questions: [
      `Can you walk us through an end-to-end implementation project you led involving ${primarySkill}?`,
      `How do you diagnose and troubleshoot latency or bottleneck issues in a ${primarySkill} setup?`,
      `Describe a situation where a project deadline was at risk and how you communicated and mitigated the trade-offs.`,
      `What automated testing or verification workflows do you establish for ${primarySkill} solutions?`,
    ],
    questions_to_ask: [
      `What are the most urgent technical priorities or migration milestones the ${job.company} team aims to accomplish this quarter?`,
      `How does the team balance new feature architecture with technical debt reduction?`,
      `What does success look like in this ${job.title} role in the first 90 days?`,
    ],
    revision_tips: [
      `Review real-world design trade-offs and edge cases for ${primarySkill}.`,
      `Prepare 3 concrete STAR stories (Situation, Task, Action, Result) with quantified business impacts.`,
      `Formulate questions tailored to ${job.company}'s engineering culture and scale.`,
    ],
  };
}
