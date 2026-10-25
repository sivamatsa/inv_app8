// Ported from Job Intelligence (server/connectors/search_discovery.ts)
// NOTE: this connector generates SYNTHETIC (non-real) postings. Every job it
// produces is flagged `synthetic: true` so the dedup layer can carry
// `is_synthetic: true` onto the stored Job. The source is disabled by default.

export const DIVERSE_GLOBAL_DIRECTORY = [
  // 1. Direct Tech & Product Leaders
  { name: 'Stripe', domain: 'stripe.com', prefix: 'STR', region: 'San Francisco, CA / Remote', country: 'United States', sector: 'tech_product', projectContext: 'Core Financial Infrastructure & Global Payments Engine', clientType: 'Direct In-House' },
  { name: 'Shopify', domain: 'shopify.com', prefix: 'SHOP', region: 'Toronto, Canada / Remote', country: 'Canada', sector: 'tech_product', projectContext: 'Global Merchant OS & High-Scale Checkout Modernization', clientType: 'Direct In-House' },
  { name: 'Spotify', domain: 'spotify.com', prefix: 'SPOT', region: 'Stockholm, Sweden / Remote', country: 'Sweden', sector: 'tech_product', projectContext: 'Real-Time Audio Streaming & Recommendation Engine', clientType: 'Direct In-House' },
  { name: 'Atlassian', domain: 'atlassian.com', prefix: 'ATL', region: 'Sydney, Australia / Remote', country: 'Australia', sector: 'tech_product', projectContext: 'Enterprise Collaboration Cloud & Developer Platform', clientType: 'Direct In-House' },
  { name: 'Canva', domain: 'canva.com', prefix: 'CAN', region: 'Sydney, Australia / Hybrid', country: 'Australia', sector: 'tech_product', projectContext: 'Visual AI Generation & Real-Time Collaborative Canvas', clientType: 'Direct In-House' },
  { name: 'Datadog', domain: 'datadoghq.com', prefix: 'DD', region: 'Paris, France / Remote', country: 'France', sector: 'tech_product', projectContext: 'Cloud Observability, APM & Distributed Tracing Platform', clientType: 'High-Growth Tech' },
  { name: 'Airbnb', domain: 'airbnb.com', prefix: 'ABNB', region: 'Austin, TX / Remote', country: 'United States', sector: 'tech_product', projectContext: 'Global Hospitality Marketplace & Host Automation', clientType: 'Direct In-House' },

  // 2. Banking, Financial Services & FinTech Clients
  { name: 'JPMorgan Chase & Co.', domain: 'jpmorganchase.com', prefix: 'JPMC', region: 'New York, NY / Hybrid', country: 'United States', sector: 'banking_finance', projectContext: 'Next-Generation Cloud Banking Platform & Liquidity Architecture', clientType: 'Enterprise Client Project' },
  { name: 'Revolut', domain: 'revolut.com', prefix: 'REV', region: 'London, United Kingdom / Remote', country: 'United Kingdom', sector: 'banking_finance', projectContext: 'Cross-Border Wealth & High-Frequency Crypto Engine', clientType: 'High-Growth Tech' },
  { name: 'Visa Global Innovation', domain: 'visa.com', prefix: 'VISA', region: 'Singapore / Hybrid', country: 'Singapore', sector: 'banking_finance', projectContext: 'Direct Client Settlement & Tokenized Payment Rails', clientType: 'Enterprise Client Project' },
  { name: 'Mastercard Data & Services', domain: 'mastercard.com', prefix: 'MA', region: 'Dublin, Ireland / Hybrid', country: 'Ireland', sector: 'banking_finance', projectContext: 'Global Cyber Intelligence & Transaction Fraud Analytics', clientType: 'Enterprise Client Project' },
  { name: 'Goldman Sachs Asset Tech', domain: 'goldmansachs.com', prefix: 'GS', region: 'Bengaluru, India / Hybrid', country: 'India', sector: 'banking_finance', projectContext: 'Algorithmic Execution Platform & Prime Services Automation', clientType: 'Enterprise Client Project' },

  // 3. Healthcare, Pharma & Life Sciences Clients
  { name: 'Pfizer Global R&D', domain: 'pfizer.com', prefix: 'PFE', region: 'Cambridge, MA / Hybrid', country: 'United States', sector: 'healthcare_pharma', projectContext: 'Genomic Discovery Pipeline & Decentralized Clinical Trials', clientType: 'Enterprise Client Project' },
  { name: 'Roche Diagnostics', domain: 'roche.com', prefix: 'ROC', region: 'Basel, Switzerland / Hybrid', country: 'Switzerland', sector: 'healthcare_pharma', projectContext: 'Precision Oncology Cloud & High-Throughput Diagnostic Devices', clientType: 'Enterprise Client Project' },
  { name: 'Novartis Informatics', domain: 'novartis.com', prefix: 'NVS', region: 'Dublin, Ireland / Remote', country: 'Ireland', sector: 'healthcare_pharma', projectContext: 'Global Biopharma Supply Chain Predictive Intelligence', clientType: 'Enterprise Client Project' },
  { name: 'Johnson & Johnson MedTech', domain: 'jnj.com', prefix: 'JNJ', region: 'Diegem, Belgium / Hybrid', country: 'Belgium', sector: 'healthcare_pharma', projectContext: 'Connected Surgical Robotics & Patient Telemetry System', clientType: 'Enterprise Client Project' },

  // 4. Automotive, Aerospace & Clean Mobility
  { name: 'Tesla Energy & Autonomy', domain: 'tesla.com', prefix: 'TSLA', region: 'Berlin, Germany / On-site', country: 'Germany', sector: 'automotive_manufacturing', projectContext: 'Megapack Grid Management & Gigafactory Manufacturing Cloud', clientType: 'Direct In-House' },
  { name: 'BMW Group IT', domain: 'bmwgroup.com', prefix: 'BMW', region: 'Munich, Germany / Hybrid', country: 'Germany', sector: 'automotive_manufacturing', projectContext: 'Autonomous Drive Compute Stack & Connected Fleet Telematics', clientType: 'Enterprise Client Project' },
  { name: 'Robert Bosch Global Solutions', domain: 'bosch.com', prefix: 'BOS', region: 'Stuttgart, Germany / Hybrid', country: 'Germany', sector: 'automotive_manufacturing', projectContext: 'Industrial IoT Edge Platform & Smart Factory Sensor Fabrics', clientType: 'Global Client Transformation' },
  { name: 'Airbus Digital Systems', domain: 'airbus.com', prefix: 'AIR', region: 'Toulouse, France / Hybrid', country: 'France', sector: 'automotive_manufacturing', projectContext: 'Next-Gen Commercial Flight Operations & Avionics Big Data', clientType: 'Enterprise Client Project' },

  // 5. Retail, Consumer Goods & E-Commerce Clients
  { name: 'Nike Digital Direct', domain: 'nike.com', prefix: 'NKE', region: 'Hilversum, Netherlands / Hybrid', country: 'Netherlands', sector: 'retail_commerce', projectContext: 'Omnichannel Member Commerce & Automated Inventory Routing', clientType: 'Enterprise Client Project' },
  { name: 'IKEA Ingka Digital', domain: 'ikea.com', prefix: 'IKEA', region: 'Amsterdam, Netherlands / Remote', country: 'Netherlands', sector: 'retail_commerce', projectContext: 'Global 3D Spatial Room Planning & Store Fulfillment Engine', clientType: 'Enterprise Client Project' },
  { name: 'Zalando SE', domain: 'zalando.com', prefix: 'ZAL', region: 'Berlin, Germany / Remote', country: 'Germany', sector: 'retail_commerce', projectContext: 'European Fashion Marketplace & Computer Vision Recommendation', clientType: 'High-Growth Tech' },
  { name: 'Target Enterprise Architecture', domain: 'target.com', prefix: 'TGT', region: 'Minneapolis, MN / Remote', country: 'United States', sector: 'retail_commerce', projectContext: 'Zero-Latency Edge POS Infrastructure & Supply Chain Network', clientType: 'Enterprise Client Project' },

  // 6. Media, Telecom, Gaming & Energy
  { name: 'Disney Streaming Services', domain: 'disney.com', prefix: 'DIS', region: 'London, United Kingdom / Hybrid', country: 'United Kingdom', sector: 'media_entertainment', projectContext: 'Global 4K HDR Low-Latency Video Distribution Architecture', clientType: 'Direct In-House' },
  { name: 'Sony Interactive Entertainment', domain: 'playstation.com', prefix: 'SONY', region: 'Tokyo, Japan / Hybrid', country: 'Japan', sector: 'media_entertainment', projectContext: 'PlayStation Cloud Gaming Infrastructure & Identity Platform', clientType: 'Direct In-House' },
  { name: 'Schneider Electric EcoStruxure', domain: 'se.com', prefix: 'SCH', region: 'Paris, France / Remote', country: 'France', sector: 'energy_telecom', projectContext: 'Smart Grid Micro-Energy Analytics & Zero-Carbon Buildings', clientType: 'Global Client Transformation' },
  { name: 'Vodafone Digital & Networks', domain: 'vodafone.com', prefix: 'VOD', region: 'London, United Kingdom / Remote', country: 'United Kingdom', sector: 'energy_telecom', projectContext: 'Open RAN 5G Telecommunications & Edge Microservices Fabric', clientType: 'Enterprise Client Project' },

  // 7. Direct Client Projects & Digital Transformations
  { name: 'Global Banking Transformation Project', domain: 'client-fincloud.org', prefix: 'CBTP', region: 'Singapore / Remote', country: 'Singapore', sector: 'client_project', projectContext: 'Tier-1 International Bank: Migration from Legacy Core to Cloud Microservices', clientType: 'Enterprise Client Project' },
  { name: 'National Telehealth Infrastructure', domain: 'health-cloud-initiative.net', prefix: 'NTI', region: 'Dallas, TX / Remote', country: 'United States', sector: 'client_project', projectContext: 'Multi-Hospital Consortium: HIPAA-Compliant Real-Time Video & Records Integration', clientType: 'Enterprise Client Project' },
  { name: 'Smart Logistics & Port Automation Client', domain: 'port-logistics.eu', prefix: 'SLP', region: 'Rotterdam, Netherlands / Hybrid', country: 'Netherlands', sector: 'client_project', projectContext: 'Container Port Consortium: Autonomous Crane Fleet Dispatching & Vessel Scheduling', clientType: 'Enterprise Client Project' },
  { name: 'Aerospace Defense Modernization Project', domain: 'aero-defense.gov.uk', prefix: 'ADMP', region: 'Bristol, United Kingdom / On-site', country: 'United Kingdom', sector: 'client_project', projectContext: 'Government Aviation Client: Mission Avionics Data Bus & Hardware-in-the-Loop Simulation', clientType: 'Enterprise Client Project' },
  { name: 'Cross-Border B2B Clearing Network', domain: 'fin-clearing.ae', prefix: 'CBCN', region: 'Dubai, UAE / Hybrid', country: 'United Arab Emirates', sector: 'client_project', projectContext: 'Middle East Fintech Consortium: Real-Time Gross Settlement & ISO 20022 Integration', clientType: 'Enterprise Client Project' },
  { name: 'Nordic Renewable Grid Intelligence Client', domain: 'nordic-grid.se', prefix: 'NRGI', region: 'Stockholm, Sweden / Remote', country: 'Sweden', sector: 'client_project', projectContext: 'Wind & Hydro Grid Client: High-Frequency Load Balancing & Energy Arbitrage Engine', clientType: 'Enterprise Client Project' },
  { name: 'Latin America Fintech Unbanked Initiative', domain: 'latam-inclusion.br', prefix: 'LAFI', region: 'São Paulo, Brazil / Remote', country: 'Brazil', sector: 'client_project', projectContext: 'Regional Challenger Bank: Micro-Lending Risk Engine & Pix Instant Payment Rails', clientType: 'Enterprise Client Project' },
  { name: 'APAC Smart City Traffic Analytics', domain: 'smart-transit.jp', prefix: 'SCTA', region: 'Tokyo, Japan / Hybrid', country: 'Japan', sector: 'client_project', projectContext: 'Metropolitan Transit Client: Real-Time Autonomous Bus Routing & Congestion AI', clientType: 'Enterprise Client Project' },

  // 8. Technology & Systems Partners (Available alongside direct clients)
  { name: 'Accenture Cloud Solutions', domain: 'accenture.com', prefix: 'ACN', region: 'Hyderabad, India / Remote', country: 'India', sector: 'enterprise_consulting', projectContext: 'Client Delivery: Multi-Cloud Enterprise Migration & API Management', clientType: 'Strategic Partner' },
  { name: 'Deloitte Digital', domain: 'deloitte.com', prefix: 'DEL', region: 'Bengaluru, India / Remote', country: 'India', sector: 'enterprise_consulting', projectContext: 'Client Delivery: Enterprise ERP Modernization & Financial Analytics', clientType: 'Strategic Partner' },
  { name: 'Capgemini Invent', domain: 'capgemini.com', prefix: 'CAP', region: 'Pune, India / Hybrid', country: 'India', sector: 'enterprise_consulting', projectContext: 'Client Delivery: Supply Chain Optimization & Smart Factory Rollouts', clientType: 'Strategic Partner' },
  { name: 'Siemens Technology Services', domain: 'siemens.com', prefix: 'SIE', region: 'Munich, Germany / Hybrid', country: 'Germany', sector: 'enterprise_consulting', projectContext: 'Client Delivery: Digital Twin Architecture for Manufacturing Clients', clientType: 'Strategic Partner' },
  { name: 'SAP Global Services', domain: 'sap.com', prefix: 'SAP', region: 'Walldorf, Germany / Remote', country: 'Germany', sector: 'enterprise_consulting', projectContext: 'Client Delivery: S/4HANA Cloud Transformation & BTP Extensions', clientType: 'Strategic Partner' },
];

export async function runSearchDiscovery(query) {
  const startTime = Date.now();
  const jobs = [];
  const cleanQ = query && query.trim() ? query.trim() : 'Software Engineer';

  // Extract seniority and clean discipline
  const seniorityLevels = ['Senior', 'Staff', 'Lead', 'Principal', 'Senior Specialist', 'Architect'];
  const seniority = seniorityLevels[Math.floor(Math.random() * seniorityLevels.length)];

  // Filter or prioritize enterprises based on query if appropriate, or select a balanced global sample
  let selectedEnterprises = [];

  const qLower = cleanQ.toLowerCase();

  // If user searched for a specific company or sector
  const matchedDirectory = DIVERSE_GLOBAL_DIRECTORY.filter(
    (e) =>
      e.name.toLowerCase().includes(qLower) ||
      e.country.toLowerCase().includes(qLower) ||
      e.projectContext.toLowerCase().includes(qLower) ||
      e.sector.toLowerCase().includes(qLower)
  );

  if (matchedDirectory.length >= 6) {
    selectedEnterprises = matchedDirectory.slice(0, 16);
  } else {
    // Pick a broad, balanced mix across Tech, Banking, Healthcare, Automotive, Retail, Media, Projects, Countries
    const tech = DIVERSE_GLOBAL_DIRECTORY.filter((e) => e.sector === 'tech_product').slice(0, 3);
    const finance = DIVERSE_GLOBAL_DIRECTORY.filter((e) => e.sector === 'banking_finance').slice(0, 3);
    const health = DIVERSE_GLOBAL_DIRECTORY.filter((e) => e.sector === 'healthcare_pharma').slice(0, 2);
    const auto = DIVERSE_GLOBAL_DIRECTORY.filter((e) => e.sector === 'automotive_manufacturing').slice(0, 2);
    const retail = DIVERSE_GLOBAL_DIRECTORY.filter((e) => e.sector === 'retail_commerce').slice(0, 2);
    const mediaEnergy = DIVERSE_GLOBAL_DIRECTORY.filter((e) => e.sector === 'media_entertainment' || e.sector === 'energy_telecom').slice(0, 2);
    const directProjects = DIVERSE_GLOBAL_DIRECTORY.filter((e) => e.sector === 'client_project').slice(0, 4);
    const consulting = DIVERSE_GLOBAL_DIRECTORY.filter((e) => e.sector === 'enterprise_consulting').slice(0, 2);

    selectedEnterprises = [
      ...matchedDirectory,
      ...tech,
      ...finance,
      ...directProjects,
      ...health,
      ...auto,
      ...retail,
      ...mediaEnergy,
      ...consulting,
    ];

    // Deduplicate by prefix
    const seen = new Set();
    selectedEnterprises = selectedEnterprises.filter((e) => {
      if (seen.has(e.prefix)) return false;
      seen.add(e.prefix);
      return true;
    });
  }

  for (let i = 0; i < selectedEnterprises.length; i++) {
    const ent = selectedEnterprises[i];
    const roleTitle = `${seniority} ${cleanQ}`;
    const externalId = `${ent.prefix}-${Math.floor(100000 + Math.random() * 900000)}`;
    const careerUrl = `https://careers.${ent.domain}/job/${externalId}`;

    // Determine relevant skills tailored to query and sector
    const qUpper = cleanQ.toUpperCase();
    const skillsList = [cleanQ];

    if (qUpper.includes('SAP') || qUpper.includes('VIM') || qUpper.includes('ABAP')) {
      skillsList.push('OpenText VIM', 'SAP S/4HANA', 'Vendor Invoice Management', 'SAP FI/CO', 'Invoice Workflow');
    } else if (qUpper.includes('PYTHON') || qUpper.includes('DATA') || qUpper.includes('AI') || qUpper.includes('MACHINE LEARNING')) {
      skillsList.push('Python', 'Machine Learning', 'SQL', 'Data Pipelines', 'PyTorch', 'Cloud Analytics');
    } else if (qUpper.includes('REACT') || qUpper.includes('FRONTEND') || qUpper.includes('TYPESCRIPT')) {
      skillsList.push('React', 'TypeScript', 'Tailwind CSS', 'Next.js', 'State Management', 'Web Performance');
    } else if (qUpper.includes('JAVA') || qUpper.includes('SPRING') || qUpper.includes('BACKEND')) {
      skillsList.push('Java', 'Spring Boot', 'Microservices', 'PostgreSQL', 'Docker', 'RESTful Architecture');
    } else if (qUpper.includes('CLOUD') || qUpper.includes('AWS') || qUpper.includes('DEVOPS') || qUpper.includes('KUBERNETES')) {
      skillsList.push('Kubernetes', 'Terraform', 'AWS', 'CI/CD Pipelines', 'Docker', 'Site Reliability');
    } else if (qUpper.includes('SECURITY') || qUpper.includes('CYBER')) {
      skillsList.push('Cybersecurity', 'SOC 2', 'Zero-Trust Architecture', 'Penetration Testing', 'SIEM');
    } else {
      skillsList.push('System Architecture', 'Distributed Systems', 'Agile Delivery', 'Problem Solving', 'Cloud Native');
    }

    const minExp = 4 + (i % 5);
    const maxExp = minExp + 3;
    const isRemote = ent.region.toLowerCase().includes('remote');
    const isHybrid = ent.region.toLowerCase().includes('hybrid');

    // Salary estimation based on sector and location
    let salaryMin = 110000 + (i % 6) * 15000;
    let salaryMax = salaryMin + 35000;
    let currency = 'USD';
    if (ent.country === 'Germany' || ent.country === 'France' || ent.country === 'Netherlands' || ent.country === 'Belgium') {
      currency = 'EUR';
      salaryMin = 75000 + (i % 6) * 10000;
      salaryMax = salaryMin + 25000;
    } else if (ent.country === 'United Kingdom') {
      currency = 'GBP';
      salaryMin = 70000 + (i % 6) * 10000;
      salaryMax = salaryMin + 25000;
    } else if (ent.country === 'Switzerland') {
      currency = 'CHF';
      salaryMin = 130000 + (i % 5) * 15000;
      salaryMax = salaryMin + 30000;
    } else if (ent.country === 'Australia') {
      currency = 'AUD';
      salaryMin = 135000 + (i % 5) * 15000;
      salaryMax = salaryMin + 30000;
    }

    const salaryRaw = `${currency} ${salaryMin.toLocaleString()} - ${salaryMax.toLocaleString()}`;

    const clientBadge = ent.clientType === 'Direct In-House'
      ? `Direct Product Company (${ent.name})`
      : ent.clientType === 'Enterprise Client Project'
      ? `Enterprise Client Project at ${ent.name}`
      : ent.clientType === 'Global Client Transformation'
      ? `Global Client Transformation with ${ent.name}`
      : `${ent.clientType} with ${ent.name}`;

    jobs.push({
      external_job_id: externalId,
      source_id: 'search_discovery',
      source_name: `${ent.name} Careers`,
      source_type: 'search_discovery',
      synthetic: true,
      title: roleTitle,
      company: ent.name,
      location: ent.region,
      country: ent.country,
      city: ent.region.split(',')[0].split('/')[0].trim(),
      remote_mode: isRemote ? 'remote' : isHybrid ? 'hybrid' : 'on-site',
      employment_type: 'full-time',
      min_experience: minExp,
      max_experience: maxExp,
      salary_min: salaryMin,
      salary_max: salaryMax,
      salary_currency: currency,
      salary_raw: salaryRaw,
      skills: skillsList,
      required_skills: [cleanQ, skillsList[1] || 'Enterprise Delivery'],
      preferred_skills: skillsList.slice(2),
      description: `Project & Position Overview: ${roleTitle}\nEmployer / Client: ${clientBadge}\nProject Focus: ${ent.projectContext}\nLocation: ${ent.region} (${ent.country})\n\nWe are actively hiring for an experienced ${cleanQ} professional to lead architecture, implementation, and delivery on mission-critical initiatives.\n\nProject Scope & Objectives:\n• Project Assignment: ${ent.projectContext}\n• Work closely with cross-functional product, client stakeholders, and distributed engineering groups.\n• Design high-availability, fault-tolerant solutions aligned with modern cloud-native principles.\n• Ensure high test coverage, robust observability, and continuous integration standards.\n• Troubleshoot complex production issues and optimize pipeline latency.\n\nQualifications & Requirements:\n• Minimum ${minExp}+ years of practical experience in ${cleanQ} and associated ecosystems.\n• Demonstrated success delivering in ${ent.country} or distributed international teams.\n• Proven ability to translate complex business problems into modular technical solutions.\n• Strong verbal and written communication skills across international stakeholder teams.`,
      summary_30s: `${clientBadge} in ${ent.country} (${ent.region}). Project: ${ent.projectContext}. Looking for ${minExp}-${maxExp} yrs experience.`,
      responsibilities: [
        `Drive technical architecture and delivery on "${ent.projectContext}".`,
        `Collaborate directly with product owners and international client teams.`,
        `Implement resilient microservices, data workflows, and automated test suites.`,
        `Mentor engineers, conduct code reviews, and champion engineering excellence.`,
      ],
      original_url: careerUrl,
      company_careers_url: `https://${ent.domain}/careers`,
      posted_at: new Date(Date.now() - (i * 7 + 1) * 3600000).toISOString(),
      visa_sponsorship: ent.country === 'United States' ? 'not_sponsored' : 'explicitly_offered',
    });
  }

  return {
    source_id: 'search_discovery',
    source_name: 'Direct Companies & Client Projects Discovery',
    success: true,
    jobs,
    duration_ms: Date.now() - startTime,
  };
}
