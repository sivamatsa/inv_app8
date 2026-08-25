/* Client-side calculation helpers for instant UI feedback,
   What-If 2.0 Monte Carlo simulation engine, Sharpe & Sortino ratios,
   Asset allocation drift advisor, Tax bracket & capital gains estimator,
   and Waterfall multi-tier return distribution models. */
window.App = window.App || {};

App.calc = (function () {
  function simpleExpectedInterest(principal, annualRoiPct, years) {
    if (!principal || !annualRoiPct || !years) return 0;
    return principal * (annualRoiPct / 100) * years;
  }

  function emiAmount(principal, annualRoiPct, periodsPerYear, totalPeriods) {
    if (!principal || !totalPeriods) return 0;
    const r = (annualRoiPct || 0) / 100 / periodsPerYear;
    if (r <= 0) return principal / totalPeriods;
    return principal * r * Math.pow(1 + r, totalPeriods) / (Math.pow(1 + r, totalPeriods) - 1);
  }

  // Section 33 what-if simulator
  function whatIf(input) {
    const amount = App.utils.parseNum(input.amount) || 0;
    const roi = App.utils.parseNum(input.annualRoiPct) || 0;
    const months = App.utils.parseNum(input.tenureMonths) || 0;
    const monthlyRate = roi / 100 / 12;
    const out = { scenario: input.scenario, inputs: { amount, roi, months } };

    if (input.scenario === 'reinvest_every_payment') {
      const finalValue = amount * Math.pow(1 + monthlyRate, months);
      out.finalPrincipal = finalValue;
      out.totalInterest = finalValue - amount;
      out.cashReceived = finalValue;
      out.annualizedReturn = months > 0 ? (Math.pow(finalValue / amount, 12 / months) - 1) * 100 : 0;
      out.reinvestmentEffect = out.totalInterest - simpleExpectedInterest(amount, roi, months / 12);
    } else if (input.scenario === 'reinvest_principal_only') {
      const cycle1Interest = simpleExpectedInterest(amount, roi, months / 12);
      const cycle2Interest = simpleExpectedInterest(amount, roi, months / 12);
      out.finalPrincipal = amount;
      out.totalInterest = cycle1Interest + cycle2Interest;
      out.cashReceived = cycle1Interest + amount + cycle2Interest;
      out.annualizedReturn = roi;
      out.reinvestmentEffect = cycle2Interest;
      out.note = 'Principal-only reinvestment is modelled as two identical back-to-back cycles at the same rate - illustrative, not a forecast.';
    } else {
      const totalInterest = simpleExpectedInterest(amount, roi, months / 12);
      out.finalPrincipal = amount;
      out.totalInterest = totalInterest;
      out.cashReceived = amount + totalInterest;
      out.annualizedReturn = roi;
      out.reinvestmentEffect = 0;
    }
    return out;
  }

  function compareDeals(deals) {
    return deals.map(({ deal, metrics }) => ({
      id: deal.id,
      name: deal.deal_name,
      amount: deal.invested_amount,
      roi: deal.annual_roi,
      tenureMonths: deal.start_date && deal.maturity_date
        ? Math.round(App.utils.daysBetween(deal.start_date, deal.maturity_date) / 30.44) : null,
      frequency: deal.payment_frequency,
      expectedIncome: deal.expected_total_interest,
      risk: deal.risk_rating,
      reliability: metrics ? metrics.payout_reliability : null,
      maturity: deal.maturity_date,
      platform: deal.platform_id,
    }));
  }

  // =========================================================================
  // 1. Monte Carlo Simulation Engine (What-If 2.0)
  // Geometric Brownian Motion (GBM) with monthly contributions and inflation
  // =========================================================================
  function randNormal() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  function runMonteCarlo(params) {
    const initial = App.utils.parseNum(params.initialCapital) || 100000;
    const monthlySIP = App.utils.parseNum(params.monthlyContribution) || 0;
    const expectedReturnPct = App.utils.parseNum(params.expectedReturnPct) || 12;
    const volPct = App.utils.parseNum(params.volatilityPct) || 14;
    const years = Math.max(1, Math.min(40, App.utils.parseNum(params.years) || 5));
    const iterations = Math.max(100, Math.min(10000, App.utils.parseNum(params.iterations) || 1000));
    const inflationPct = App.utils.parseNum(params.inflationPct) || 0;
    const targetGoal = App.utils.parseNum(params.targetGoal) || 0;

    const totalMonths = Math.round(years * 12);
    const dt = 1 / 12;
    const mu = (expectedReturnPct - inflationPct) / 100;
    const sigma = volPct / 100;
    const drift = (mu - 0.5 * sigma * sigma) * dt;
    const volDt = sigma * Math.sqrt(dt);

    const simulationRuns = [];
    const monthlyTraj = Array.from({ length: totalMonths + 1 }, () => []);

    for (let i = 0; i < iterations; i++) {
      let balance = initial;
      monthlyTraj[0].push(balance);

      for (let m = 1; m <= totalMonths; m++) {
        const shock = randNormal();
        const growthFactor = Math.exp(drift + volDt * shock);
        balance = balance * growthFactor + monthlySIP;
        if (balance < 0) balance = 0;
        monthlyTraj[m].push(balance);
      }
      simulationRuns.push(balance);
    }

    // Sort iterations at each month step to build percentile trajectories
    const timeLabels = [];
    const p10 = [], p25 = [], p50 = [], p75 = [], p90 = [];

    for (let m = 0; m <= totalMonths; m++) {
      if (m % 3 === 0 || m === totalMonths) {
        timeLabels.push(m === 0 ? 'Start' : `${(m / 12).toFixed(1)}Y`);
        const values = monthlyTraj[m].slice().sort((a, b) => a - b);
        const len = values.length;
        p10.push(values[Math.floor(len * 0.10)]);
        p25.push(values[Math.floor(len * 0.25)]);
        p50.push(values[Math.floor(len * 0.50)]); // Median
        p75.push(values[Math.floor(len * 0.75)]);
        p90.push(values[Math.floor(len * 0.90)]);
      }
    }

    const finalValues = simulationRuns.slice().sort((a, b) => a - b);
    const len = finalValues.length;
    const medianFinal = finalValues[Math.floor(len * 0.50)];
    const worstCase10th = finalValues[Math.floor(len * 0.10)];
    const bestCase90th = finalValues[Math.floor(len * 0.90)];
    const totalDeposited = initial + monthlySIP * totalMonths;

    // Goal Success Probability
    const goalHits = targetGoal > 0 ? finalValues.filter((v) => v >= targetGoal).length : null;
    const goalProbability = goalHits !== null ? (goalHits / len) * 100 : null;

    // Value at Risk (VaR 95% 1-Year equivalent relative to deposit)
    const var95Value = finalValues[Math.floor(len * 0.05)];
    const var95Loss = Math.max(0, totalDeposited - var95Value);

    return {
      inputs: { initial, monthlySIP, expectedReturnPct, volPct, years, iterations, inflationPct, targetGoal },
      totalDeposited,
      medianFinal,
      worstCase10th,
      bestCase90th,
      p10, p25, p50, p75, p90,
      timeLabels,
      goalProbability,
      var95Value,
      var95Loss,
      finalValuesSample: finalValues.filter((_, idx) => idx % Math.floor(len / 50) === 0)
    };
  }

  // =========================================================================
  // 2. Sharpe & Sortino Ratio Calculator
  // =========================================================================
  function computeRatios(returns, riskFreeRatePct = 6.5, targetReturnPct = 7.0) {
    if (!returns || returns.length < 2) {
      return {
        meanReturn: 0,
        volatility: 0,
        downsideDeviation: 0,
        sharpeRatio: 0,
        sortinoRatio: 0,
        calmarRatio: 0,
        maxDrawdown: 0,
        sampleCount: (returns || []).length
      };
    }

    const n = returns.length;
    const mean = returns.reduce((a, b) => a + b, 0) / n;

    // Total Volatility (Standard Deviation)
    const variance = returns.reduce((a, r) => a + Math.pow(r - mean, 2), 0) / (n - 1);
    const volatility = Math.sqrt(variance);

    // Downside Deviation (Semi-deviation penalizing only returns below target/Rf)
    const downsideTarget = targetReturnPct || riskFreeRatePct;
    const downsideVariance = returns.reduce((a, r) => a + (r < downsideTarget ? Math.pow(downsideTarget - r, 2) : 0), 0) / n;
    const downsideDeviation = Math.sqrt(downsideVariance);

    // Sharpe Ratio = (Mean - RiskFree) / Volatility
    const sharpeRatio = volatility > 0 ? (mean - riskFreeRatePct) / volatility : 0;

    // Sortino Ratio = (Mean - Target) / DownsideDeviation
    const sortinoRatio = downsideDeviation > 0 ? (mean - downsideTarget) / downsideDeviation : (mean > downsideTarget ? 9.99 : 0);

    // Max Drawdown calculation from compounding cumulative series
    let peak = 100, current = 100, maxDrawdown = 0;
    returns.forEach((r) => {
      current = current * (1 + r / 100);
      if (current > peak) peak = current;
      const dd = ((peak - current) / peak) * 100;
      if (dd > maxDrawdown) maxDrawdown = dd;
    });

    const calmarRatio = maxDrawdown > 0 ? (mean - riskFreeRatePct) / maxDrawdown : 0;

    return {
      meanReturn: mean,
      riskFreeRate: riskFreeRatePct,
      targetReturn: targetReturnPct,
      volatility,
      downsideDeviation,
      sharpeRatio,
      sortinoRatio,
      calmarRatio,
      maxDrawdown,
      sampleCount: n
    };
  }

  // =========================================================================
  // 3. Asset Allocation & Rebalancing Drift Advisor
  // =========================================================================
  function computeRebalancing(currentHoldings, targetAllocations, totalCashAvailable = 0, thresholdPct = 5) {
    // Categories: Fixed Income, P2P Lending, Gold/Precious Metals, Equity/MFs, Real Estate, Cash/Liquid
    const categories = Object.keys(targetAllocations);
    const totalCurrentVal = Object.values(currentHoldings).reduce((a, b) => a + (Number(b) || 0), 0);
    const totalPortfolioVal = totalCurrentVal + (Number(totalCashAvailable) || 0);

    const rows = categories.map((cat) => {
      const currentAmt = Number(currentHoldings[cat]) || 0;
      const targetPct = Number(targetAllocations[cat]) || 0;
      const currentPct = totalPortfolioVal > 0 ? (currentAmt / totalPortfolioVal) * 100 : 0;
      const driftPct = currentPct - targetPct;
      const targetAmt = totalPortfolioVal * (targetPct / 100);
      const adjustmentAmt = targetAmt - currentAmt; // positive = BUY/ADD, negative = TRIM/SELL

      return {
        category: cat,
        currentAmt,
        currentPct,
        targetPct,
        targetAmt,
        driftPct,
        adjustmentAmt,
        isTriggered: Math.abs(driftPct) >= thresholdPct,
        action: adjustmentAmt > 50 ? 'BUY / ALLOCATE' : adjustmentAmt < -50 ? 'TRIM / REBALANCE' : 'BALANCED'
      };
    });

    const totalDrift = rows.reduce((a, r) => a + Math.abs(r.driftPct), 0) / 2;
    const rebalanceRequired = rows.some((r) => r.isTriggered);

    return {
      totalPortfolioVal,
      totalCurrentVal,
      totalCashAvailable,
      totalDrift,
      thresholdPct,
      rebalanceRequired,
      rows
    };
  }

  // =========================================================================
  // 4. Tax Bracket & Capital Gains Estimator (FY 2024-25 / 2025-26)
  // =========================================================================
  function computeTaxLiability(params) {
    const salaryIncome = App.utils.parseNum(params.salaryIncome) || 0;
    const interestIncome = App.utils.parseNum(params.interestIncome) || 0;
    const otherIncome = App.utils.parseNum(params.otherIncome) || 0;
    const equitySTCG = App.utils.parseNum(params.equitySTCG) || 0;
    const equityLTCG = App.utils.parseNum(params.equityLTCG) || 0;
    const goldSTCG = App.utils.parseNum(params.goldSTCG) || 0;
    const goldLTCG = App.utils.parseNum(params.goldLTCG) || 0;
    const deductions80C = Math.min(150000, App.utils.parseNum(params.deductions80C) || 0);
    const deductions80D = Math.min(75000, App.utils.parseNum(params.deductions80D) || 0);
    const tdsDeducted = App.utils.parseNum(params.tdsDeducted) || 0;
    const regime = params.regime || 'NEW'; // 'NEW' or 'OLD'

    // Slab Income (Salary + Deal Interest + Debt/P2P Gains + Gold STCG + Other)
    let standardDeduction = regime === 'NEW' ? 75000 : 50000;
    let netSalary = Math.max(0, salaryIncome - standardDeduction);
    let grossSlabIncome = netSalary + interestIncome + otherIncome + goldSTCG;

    let netTaxableSlabIncome = grossSlabIncome;
    if (regime === 'OLD') {
      netTaxableSlabIncome = Math.max(0, grossSlabIncome - deductions80C - deductions80D);
    }

    // Compute Slab Tax
    let slabTax = 0;
    if (regime === 'NEW') {
      // New Tax Regime Slabs FY 2024-25 / 2025-26
      // 0 - 3L: 0%
      // 3L - 7L: 5%
      // 7L - 10L: 10%
      // 10L - 12L: 15%
      // 12L - 15L: 20%
      // Above 15L: 30%
      const inc = netTaxableSlabIncome;
      if (inc <= 300000) slabTax = 0;
      else if (inc <= 700000) slabTax = (inc - 300000) * 0.05;
      else if (inc <= 1000000) slabTax = 20000 + (inc - 700000) * 0.10;
      else if (inc <= 1200000) slabTax = 50000 + (inc - 1000000) * 0.15;
      else if (inc <= 1500000) slabTax = 80000 + (inc - 1200000) * 0.20;
      else slabTax = 140000 + (inc - 1500000) * 0.30;

      // Section 87A Rebate: if total taxable income <= 7,00,000, tax is NIL
      if (inc <= 700000) slabTax = 0;
    } else {
      // Old Tax Regime Slabs
      const inc = netTaxableSlabIncome;
      if (inc <= 250000) slabTax = 0;
      else if (inc <= 500000) slabTax = (inc - 250000) * 0.05;
      else if (inc <= 1000000) slabTax = 12500 + (inc - 500000) * 0.20;
      else slabTax = 112500 + (inc - 1000000) * 0.30;

      // Section 87A Rebate (Old regime): <= 5,00,000
      if (inc <= 500000) slabTax = 0;
    }

    // Capital Gains Taxes (Budget 2024 / FY 24-25 onwards rules)
    // Equity STCG: 20%
    const taxEquitySTCG = equitySTCG > 0 ? equitySTCG * 0.20 : 0;
    // Equity LTCG: 12.5% on gains exceeding Rs. 1,25,000 exemption limit
    const taxableEquityLTCG = Math.max(0, equityLTCG - 125000);
    const taxEquityLTCG = taxableEquityLTCG * 0.125;

    // Gold LTCG (Holding > 24 mo): 12.5% without indexation
    const taxGoldLTCG = goldLTCG > 0 ? goldLTCG * 0.125 : 0;

    const baseTax = slabTax + taxEquitySTCG + taxEquityLTCG + taxGoldLTCG;

    // Health & Education Cess (4%)
    const cess = baseTax * 0.04;
    const grossTotalTax = baseTax + cess;
    const netTaxPayable = Math.max(0, grossTotalTax - tdsDeducted);
    const refundDue = Math.max(0, tdsDeducted - grossTotalTax);

    // Advance Tax Installment Schedule (15%, 45%, 75%, 100%)
    const advanceTaxSchedule = [
      { date: '15 June', pct: '15%', cumulativeDue: grossTotalTax * 0.15 },
      { date: '15 September', pct: '45%', cumulativeDue: grossTotalTax * 0.45 },
      { date: '15 December', pct: '75%', cumulativeDue: grossTotalTax * 0.75 },
      { date: '15 March', pct: '100%', cumulativeDue: grossTotalTax * 1.00 },
    ];

    return {
      regime,
      grossSlabIncome,
      netTaxableSlabIncome,
      slabTax,
      taxEquitySTCG,
      taxEquityLTCG,
      taxGoldLTCG,
      baseTax,
      cess,
      grossTotalTax,
      tdsDeducted,
      netTaxPayable,
      refundDue,
      effectiveTaxRate: (grossSlabIncome + equitySTCG + equityLTCG + goldLTCG) > 0 ? (grossTotalTax / (grossSlabIncome + equitySTCG + equityLTCG + goldLTCG)) * 100 : 0,
      advanceTaxSchedule
    };
  }

  // =========================================================================
  // 5. Waterfall & Multi-Tier Return Distribution
  // =========================================================================
  function computeWaterfallDistribution(params) {
    const totalProceeds = App.utils.parseNum(params.totalProceeds) || 2000000;
    const investedCapital = App.utils.parseNum(params.investedCapital) || 1000000;
    const hurdleRatePct = App.utils.parseNum(params.hurdleRatePct) || 8;
    const tenureYears = App.utils.parseNum(params.tenureYears) || 3;
    const gpCatchUpPct = App.utils.parseNum(params.gpCatchUpPct) || 100;
    const lpSplitPct = App.utils.parseNum(params.lpCarriedInterestPct) || 80;
    const gpSplitPct = 100 - lpSplitPct;

    let remainingCash = totalProceeds;
    let lpTotal = 0;
    let gpTotal = 0;

    // Tier 1: Return of Capital (100% to LP until principal returned)
    const tier1LP = Math.min(remainingCash, investedCapital);
    const tier1GP = 0;
    lpTotal += tier1LP;
    remainingCash -= tier1LP;

    // Tier 2: Preferred Return (Hurdle Rate Compounded)
    const prefReturnRequired = investedCapital * (Math.pow(1 + hurdleRatePct / 100, tenureYears) - 1);
    const tier2LP = Math.min(remainingCash, prefReturnRequired);
    const tier2GP = 0;
    lpTotal += tier2LP;
    remainingCash -= tier2LP;

    // Tier 3: GP Catch-Up
    // Catch-up to bring GP to target carried interest ratio on profits distributed so far
    let tier3LP = 0;
    let tier3GP = 0;
    if (remainingCash > 0 && gpCatchUpPct > 0) {
      const profitsDistributedLP = tier2LP;
      const targetGPCatchUp = (profitsDistributedLP * (gpSplitPct / 100)) / (lpSplitPct / 100);
      tier3GP = Math.min(remainingCash, targetGPCatchUp * (gpCatchUpPct / 100));
      gpTotal += tier3GP;
      remainingCash -= tier3GP;
    }

    // Tier 4: Final Carried Interest Split (Residual)
    let tier4LP = 0;
    let tier4GP = 0;
    if (remainingCash > 0) {
      tier4LP = remainingCash * (lpSplitPct / 100);
      tier4GP = remainingCash * (gpSplitPct / 100);
      lpTotal += tier4LP;
      gpTotal += tier4GP;
      remainingCash = 0;
    }

    // Performance Metrics
    const lpMOIC = investedCapital > 0 ? lpTotal / investedCapital : 0;
    const lpProfit = lpTotal - investedCapital;
    const lpIRR = tenureYears > 0 ? (Math.pow(lpTotal / investedCapital, 1 / tenureYears) - 1) * 100 : 0;

    return {
      inputs: { totalProceeds, investedCapital, hurdleRatePct, tenureYears, gpCatchUpPct, lpSplitPct, gpSplitPct },
      tiers: [
        { name: 'Tier 1: Return of Capital', lp: tier1LP, gp: tier1GP, total: tier1LP + tier1GP, desc: '100% to Investor until original principal is returned' },
        { name: `Tier 2: Preferred Return (${hurdleRatePct}% Hurdle)`, lp: tier2LP, gp: tier2GP, total: tier2LP + tier2GP, desc: 'Compounded hurdle return to Investor' },
        { name: `Tier 3: GP Catch-Up (${gpCatchUpPct}%)`, lp: tier3LP, gp: tier3GP, total: tier3LP + tier3GP, desc: 'Sponsor catch-up to target profit allocation' },
        { name: `Tier 4: Carried Interest Split (${lpSplitPct}/${gpSplitPct})`, lp: tier4LP, gp: tier4GP, total: tier4LP + tier4GP, desc: 'Residual profits split according to agreed carry' }
      ],
      lpTotal,
      gpTotal,
      lpMOIC,
      lpProfit,
      lpIRR,
      totalProceeds
    };
  }

  return {
    simpleExpectedInterest,
    emiAmount,
    whatIf,
    compareDeals,
    runMonteCarlo,
    computeRatios,
    computeRebalancing,
    computeTaxLiability,
    computeWaterfallDistribution
  };
})();
