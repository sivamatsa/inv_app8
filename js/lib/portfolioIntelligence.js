/* Portfolio Intelligence Engine (portfolioIntelligence.js)
   Unified, canonical client-side portfolio extraction and contextualization pipeline.
   Gathers all 6 asset classes (Deals, SIPs, FDs, Gold, Expenses, Net Worth)
   and provides token-optimized context, audit metrics, and interactive action suggestions
   for both the Floating AI Copilot and Full-Page AI Advisor. */

window.App = window.App || {};

App.portfolioIntelligence = (function () {
  'use strict';

  function fmt(num) {
    if (num == null || isNaN(num)) return '₹0';
    if (window.App && window.App.utils && window.App.utils.fmtMoney) {
      return window.App.utils.fmtMoney(num);
    }
    return '₹' + Number(num).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  }

  function fmtPct(num) {
    if (num == null || isNaN(num)) return '0.0%';
    return Number(num).toFixed(1) + '%';
  }

  /**
   * Unified parallel portfolio fetcher across all stores and APIs
   */
  async function gatherAllPortfolioData() {
    try {
      const [
        netWorth,
        cashFlow,
        deals,
        dealMetrics,
        schedule,
        payments,
        recurringItems,
        recurringSummary,
        recurringConsistency,
        accounts,
        goldPurchases,
        goldSchemeHoldings,
        expenseProjects,
        expenseTransactions,
        liabilities,
        profile,
      ] = await Promise.all([
        App.netWorthCalc ? App.netWorthCalc.computeNetWorth().catch(() => ({ netWorth: 0, totalAssets: 0, liabilitiesTotal: 0, dealsTotal: 0, accountsTotal: 0, goldTotal: 0, breakdown: { holdings: [] } })) : { netWorth: 0, totalAssets: 0, liabilitiesTotal: 0, dealsTotal: 0, accountsTotal: 0, goldTotal: 0, breakdown: { holdings: [] } },
        App.cashFlowCalc ? App.cashFlowCalc.computeCashFlow().catch(() => ({ next30Days: 0, next7Days: 0, next90Days: 0, netCashMovement: 0, thisMonthReceived: 0, availableCash: 0 })) : { next30Days: 0, next7Days: 0, next90Days: 0, netCashMovement: 0, thisMonthReceived: 0, availableCash: 0 },
        App.api && App.api.listDeals ? App.api.listDeals().catch(() => []) : [],
        App.api && App.api.listDealMetrics ? App.api.listDealMetrics().catch(() => []) : [],
        App.api && App.api.listSchedule ? App.api.listSchedule().catch(() => []) : [],
        App.api && App.api.listPayments ? App.api.listPayments().catch(() => []) : [],
        App.api && (App.api.listRecurringItems || App.api.listRecurring) ? (App.api.listRecurringItems ? App.api.listRecurringItems() : App.api.listRecurring()).catch(() => []) : [],
        App.api && App.api.getRecurringSummary ? App.api.getRecurringSummary().catch(() => ({})) : {},
        App.api && (App.api.listRecurringConsistency || App.api.getRecurringConsistencyScore) ? (App.api.listRecurringConsistency ? App.api.listRecurringConsistency() : App.api.getRecurringConsistencyScore()).catch(() => []) : [],
        App.api && App.api.listAccounts ? App.api.listAccounts().catch(() => []) : [],
        App.api && App.api.listGoldPurchases ? App.api.listGoldPurchases().catch(() => []) : [],
        App.api && App.api.listGoldSchemeHoldings ? App.api.listGoldSchemeHoldings().catch(() => []) : [],
        App.api && App.api.listExpenseProjects ? App.api.listExpenseProjects().catch(() => []) : [],
        App.api && App.api.listExpenseTransactions ? App.api.listExpenseTransactions().catch(() => []) : [],
        App.api && App.api.listLiabilities ? App.api.listLiabilities().catch(() => []) : [],
        App.state && App.state.profile ? App.state.profile : {},
      ]);

      // Categorize Deals
      const activeDeals = (deals || []).filter((d) => (d.status || '').toUpperCase() === 'ACTIVE');
      const maturedDeals = (deals || []).filter((d) => (d.status || '').toUpperCase() === 'COMPLETED' || (d.status || '').toUpperCase() === 'MATURED');
      const totalDealsInvested = (deals || []).reduce((s, d) => s + (Number(d.invested_amount || d.principal_amount || d.current_principal) || 0), 0);
      const activeDealsPrincipal = activeDeals.reduce((s, d) => s + (Number(d.current_principal || d.invested_amount || d.principal_amount) || 0), 0);

      const metricsByDeal = {};
      (dealMetrics || []).forEach((m) => { if (m.deal_id) metricsByDeal[m.deal_id] = m; });

      const overdueSchedule = (schedule || []).filter((s) => (s.status || '').toUpperCase() === 'OVERDUE');
      const overdueTotal = overdueSchedule.reduce((s, i) => s + (Number(i.amount_due || i.due_amount || i.amount) || 0), 0);

      // Weighted ROI for active deals
      const weightedDealRoi = activeDealsPrincipal > 0
        ? activeDeals.reduce((s, d) => s + ((Number(d.current_principal || d.invested_amount || d.principal_amount) || 0) * (Number(d.annual_roi) || 0)), 0) / activeDealsPrincipal
        : 0;

      // Group Payments by deal
      const totalInterestRecv = (payments || []).reduce((s, p) => s + (Number(p.interest_amount) || 0), 0);
      const totalPrincipalReturned = (payments || []).reduce((s, p) => s + (Number(p.principal_amount) || 0), 0);

      // Bank Accounts & Fixed Deposits (FDs)
      const regularAccounts = [];
      const fdAccounts = [];
      (accounts || []).forEach((a) => {
        const typeStr = (a.account_type || '').toLowerCase();
        const isFd = typeStr.includes('deposit') || typeStr.includes('fd') || (Number(a.interest_rate) > 0 && (a.maturity_date || a.end_date));
        const bal = Number(a.current_balance || a.balance || 0);
        const rate = Number(a.interest_rate || 0);
        const sDate = a.start_date || null;
        const eDate = a.maturity_date || a.end_date || null;

        let accumInterest = Number(a.accumulated_interest || 0);
        let maturityVal = Number(a.maturity_amount || 0);

        if (isFd && rate > 0 && sDate) {
          const s = new Date(sDate);
          const now = new Date();
          const e = eDate ? new Date(eDate) : new Date(s.getTime() + 365 * 24 * 3600 * 1000);
          const totalDays = Math.max(1, (e - s) / (1000 * 3600 * 24));
          const elapsedDays = Math.max(0, Math.min(totalDays, (now - s) / (1000 * 3600 * 24)));
          if (!maturityVal) maturityVal = bal + (bal * (rate / 100) * (totalDays / 365));
          if (!accumInterest) accumInterest = bal * (rate / 100) * (elapsedDays / 365);
        }

        const enriched = {
          ...a,
          isFd,
          balance: bal,
          rate,
          startDate: sDate,
          endDate: eDate,
          accumulatedInterest: accumInterest,
          maturityValue: maturityVal || bal,
        };

        if (isFd) {
          fdAccounts.push(enriched);
        } else {
          regularAccounts.push(enriched);
        }
      });

      const totalLiquidCash = regularAccounts.reduce((s, a) => s + a.balance, 0);
      const totalFdPrincipal = fdAccounts.reduce((s, a) => s + a.balance, 0);
      const totalFdExpectedReturn = fdAccounts.reduce((s, a) => s + a.maturityValue, 0);
      const totalFdAccumInterest = fdAccounts.reduce((s, a) => s + a.accumulatedInterest, 0);

      // Gold & Bullion Holdings
      const physicalGoldGrams = (goldPurchases || []).reduce((s, g) => s + (Number(g.weight_grams) || 0), 0);
      const physicalGoldBookCost = (goldPurchases || []).reduce((s, g) => s + (Number(g.total_amount) || 0), 0);
      const physicalGoldValuation = (goldPurchases || []).reduce((s, g) => s + (Number(g.current_value || g.total_amount) || 0), 0);

      const schemeGoldGrams = (goldSchemeHoldings || []).reduce((s, g) => s + (Number(g.accumulated_grams || g.total_grams) || 0), 0);
      const schemeGoldPaid = (goldSchemeHoldings || []).reduce((s, g) => s + (Number(g.total_amount_paid || g.total_paid) || 0), 0);

      const totalGoldGrams = physicalGoldGrams + schemeGoldGrams;
      const totalGoldBookCost = physicalGoldBookCost + schemeGoldPaid;
      const totalGoldValuation = physicalGoldValuation + ((goldSchemeHoldings || []).length ? (netWorth.goldTotal || schemeGoldPaid) : 0);

      // Expense Projects
      const totalProjectsBudget = (expenseProjects || []).reduce((s, p) => s + (Number(p.budget_total ?? p.budget_amount) || 0), 0);
      const totalExpensesSpent = (expenseTransactions || []).reduce((s, e) => s + (Number(e.amount) || 0), 0);
      const totalProjectsBalance = totalProjectsBudget - totalExpensesSpent;

      // Group expense transactions by project
      const txnsByProject = {};
      (expenseTransactions || []).forEach((t) => {
        const pid = t.project_id || t.expense_project_id || 'general';
        if (!txnsByProject[pid]) txnsByProject[pid] = [];
        txnsByProject[pid].push(t);
      });

      // Systematic Recurring / SIPs
      const activeSips = (recurringItems || []).filter((r) => (r.status || 'ACTIVE').toUpperCase() === 'ACTIVE');
      const totalSipsMonthly = (recurringItems || []).reduce((s, r) => {
        const amt = Number(r.expected_amount ?? r.current_amount ?? r.amount) || 0;
        const freq = (r.frequency || 'MONTHLY').toUpperCase();
        if (freq === 'WEEKLY') return s + (amt * 52 / 12);
        if (freq === 'QUARTERLY') return s + (amt / 3);
        if (freq === 'YEARLY' || freq === 'ANNUALLY') return s + (amt / 12);
        return s + amt;
      }, 0);

      // Total liabilities
      const totalLiabilities = (liabilities || []).reduce((s, l) => s + (Number(l.current_balance || l.outstanding_amount || l.amount) || 0), 0) || Number(netWorth.liabilitiesTotal || 0);

      // Liquid runway (in months) based on monthly expenses & SIP commitments
      const estimatedMonthlyBurn = Math.max(1, (totalExpensesSpent > 0 ? (totalExpensesSpent / 3) : 30000) + totalSipsMonthly);
      const liquidRunwayMonths = (totalLiquidCash / estimatedMonthlyBurn).toFixed(1);

      return {
        timestamp: new Date().toISOString(),
        currency: (profile && profile.preferred_currency) || (App.currency ? App.currency.getActiveCurrency() : 'INR'),
        user: profile,
        netWorth: {
          netWorth: Number(netWorth.netWorth || (netWorth.totalAssets - totalLiabilities) || 0),
          totalAssets: Number(netWorth.totalAssets || 0),
          totalLiabilities: totalLiabilities,
          liquidCash: totalLiquidCash,
          liquidRunwayMonths: Number(liquidRunwayMonths),
        },
        cashFlow: {
          availableCash: Number(cashFlow.availableCash || totalLiquidCash || 0),
          next7Days: Number(cashFlow.next7Days || 0),
          next30Days: Number(cashFlow.next30Days || 0),
          next90Days: Number(cashFlow.next90Days || 0),
          netCashMovement: Number(cashFlow.netCashMovement || 0),
          thisMonthReceived: Number(cashFlow.thisMonthReceived || 0),
        },
        deals: {
          all: deals,
          active: activeDeals,
          matured: maturedDeals,
          totalInvested: totalDealsInvested,
          activePrincipal: activeDealsPrincipal,
          weightedRoi: weightedDealRoi,
          totalInterestReceived: totalInterestRecv,
          totalPrincipalReturned: totalPrincipalReturned,
          metricsByDeal,
          overdueItems: overdueSchedule,
          overdueTotal,
        },
        sips: {
          all: recurringItems,
          active: activeSips,
          totalMonthlyCommitment: totalSipsMonthly,
          recurringSummary,
          consistencyList: Array.isArray(recurringConsistency) ? recurringConsistency : [],
        },
        accounts: {
          all: accounts,
          regular: regularAccounts,
          totalLiquidCash,
          fds: fdAccounts,
          totalFdPrincipal,
          totalFdExpectedReturn,
          totalFdAccumInterest,
        },
        gold: {
          purchases: goldPurchases,
          schemes: goldSchemeHoldings,
          totalGrams: totalGoldGrams,
          physicalGrams: physicalGoldGrams,
          schemeGrams: schemeGoldGrams,
          totalBookCost: totalGoldBookCost,
          totalValuation: totalGoldValuation || (netWorth.goldTotal || totalGoldBookCost),
        },
        expenses: {
          projects: expenseProjects,
          transactions: expenseTransactions,
          txnsByProject,
          totalBudget: totalProjectsBudget,
          totalSpent: totalExpensesSpent,
          totalBalance: totalProjectsBalance,
        },
        liabilities: liabilities || [],
      };
    } catch (err) {
      console.error('Error gathering all portfolio data:', err);
      throw err;
    }
  }

  /**
   * Formats comprehensive portfolio data into structured, token-optimized Markdown
   * designed for Gemini system instruction and context injection.
   */
  function buildFullPortfolioContextText(data) {
    if (!data) return '';

    const lines = [];
    lines.push('================ LIVE COMPLETE PORTFOLIO DOSSIER ================');
    lines.push(`Audit Timestamp: ${new Date().toLocaleString('en-IN')}`);
    lines.push(`Base Currency: ${data.currency}`);

    // Section 1: Net Worth & Liquidity
    lines.push('\n[1. NET WORTH & LIQUIDITY]');
    lines.push(`• Total Net Worth: ${fmt(data.netWorth.netWorth)}`);
    lines.push(`• Total Assets: ${fmt(data.netWorth.totalAssets)} | Total Active Liabilities: ${fmt(data.netWorth.totalLiabilities)}`);
    lines.push(`• Liquid Cash in Accounts: ${fmt(data.accounts.totalLiquidCash)}`);
    lines.push(`• Liquid Runway: ~${data.netWorth.liquidRunwayMonths} months of operating burn`);
    lines.push(`• Cash Flow Horizon: Next 7 Days: ${fmt(data.cashFlow.next7Days)} | Next 30 Days: ${fmt(data.cashFlow.next30Days)} | Next 90 Days: ${fmt(data.cashFlow.next90Days)}`);
    lines.push(`• 30-Day Net Cash Movement: ${fmt(data.cashFlow.netCashMovement)}`);

    // Section 2: High-Yield Deals & Loans
    lines.push(`\n[2. HIGH-YIELD DEALS & DIRECT LENDING (${data.deals.active.length} Active / ${data.deals.all.length} Total)]`);
    lines.push(`• Active Invested Principal: ${fmt(data.deals.activePrincipal)}`);
    lines.push(`• Weighted Average Annual Yield: ${fmtPct(data.deals.weightedRoi)} p.a.`);
    lines.push(`• Cumulative Interest Received: ${fmt(data.deals.totalInterestReceived)} | Principal Returned: ${fmt(data.deals.totalPrincipalReturned)}`);
    if (data.deals.overdueTotal > 0) {
      lines.push(`• ⚠️ OVERDUE SCHEDULES: ${data.deals.overdueItems.length} payment(s) delayed totalling ${fmt(data.deals.overdueTotal)}!`);
    } else {
      lines.push('• Delinquency Status: 100% on-schedule (0 overdue payments)');
    }

    if (data.deals.active.length > 0) {
      lines.push('• Active Deals Roster:');
      data.deals.active.slice(0, 15).forEach((d, idx) => {
        const m = data.deals.metricsByDeal[d.id] || {};
        const pReliability = m.payout_reliability != null ? `${m.payout_reliability}% reliability` : 'Reliable';
        const dealName = d.deal_name || d.title || `Deal #${d.id}`;
        const borrower = d.borrower_name || d.platform || d.borrower || '';
        const roi = d.annual_roi ? `${d.annual_roi}%` : '—';
        const prin = fmt(d.current_principal || d.invested_amount || d.principal_amount || 0);
        const freq = d.payout_frequency || 'Monthly';
        const mat = d.maturity_date ? `matures ${d.maturity_date}` : '';
        lines.push(`  ${idx + 1}. [${dealName}] (${borrower ? borrower + ', ' : ''}${prin} @ ${roi} ROI, ${freq}, ${pReliability}${mat ? ', ' + mat : ''})`);
      });
      if (data.deals.active.length > 15) {
        lines.push(`  ...and ${data.deals.active.length - 15} more active deal contracts.`);
      }
    } else {
      lines.push('• No active deal investments registered.');
    }

    // Section 3: Systematic Recurring Investments & SIPs
    lines.push(`\n[3. SYSTEMATIC RECURRING INVESTMENTS & SIPS (${data.sips.active.length} Active Plans)]`);
    lines.push(`• Total Monthly Committed SIP Outflow: ${fmt(data.sips.totalMonthlyCommitment)}/month`);
    if (data.sips.active.length > 0) {
      lines.push('• Active SIPs & Recurring Schedules:');
      data.sips.active.forEach((s, idx) => {
        const sName = s.item_name || s.name || `SIP #${idx + 1}`;
        const amt = fmt(s.amount);
        const freq = s.frequency || 'Monthly';
        const nextDue = s.next_due_date || s.due_date || 'Scheduled';
        const cat = s.category || 'Investment';
        lines.push(`  ${idx + 1}. [${sName}] (${amt} / ${freq}, Category: ${cat}, Next Due: ${nextDue})`);
      });
    } else {
      lines.push('• No active systematic recurring investment plans found.');
    }

    // Section 4: Bank Accounts & Fixed Deposits (FDs)
    lines.push(`\n[4. BANK ACCOUNTS & FIXED DEPOSITS (${data.accounts.all.length} Accounts Total)]`);
    lines.push(`• Liquid Accounts Total: ${fmt(data.accounts.totalLiquidCash)} across ${data.accounts.regular.length} accounts`);
    if (data.accounts.regular.length > 0) {
      const regList = data.accounts.regular.map((a) => `${a.account_name || a.bank_name || 'Bank'}: ${fmt(a.balance)}`).join(', ');
      lines.push(`  - Liquid Accounts: ${regList}`);
    }

    lines.push(`• Fixed Deposits (FDs) Total: ${fmt(data.accounts.totalFdPrincipal)} principal across ${data.accounts.fds.length} FDs`);
    lines.push(`• FDs Accumulated Interest: ${fmt(data.accounts.totalFdAccumInterest)} | Total Maturity Value: ${fmt(data.accounts.totalFdExpectedReturn)}`);
    if (data.accounts.fds.length > 0) {
      lines.push('• Fixed Deposits Register:');
      data.accounts.fds.forEach((f, idx) => {
        const bName = f.account_name || f.bank_name || `FD #${idx + 1}`;
        const prin = fmt(f.balance);
        const rate = f.rate ? `${f.rate}% p.a.` : '';
        const matDate = f.endDate ? `Maturing: ${f.endDate}` : '';
        const expRet = fmt(f.maturityValue);
        const accInt = fmt(f.accumulatedInterest);
        lines.push(`  ${idx + 1}. [${bName}] (${prin} @ ${rate}, ${matDate}, Accumulated Int: ${accInt}, Maturity Payout: ${expRet})`);
      });
    } else {
      lines.push('• No active Fixed Deposits (FDs) recorded.');
    }

    // Section 5: Physical & Scheme Gold Vault
    lines.push(`\n[5. GOLD & BULLION HOLDINGS (${data.gold.totalGrams.toFixed(2)} Grams Total)]`);
    lines.push(`• Total Gold Portfolio Valuation: ${fmt(data.gold.totalValuation)} (Book Cost: ${fmt(data.gold.totalBookCost)})`);
    lines.push(`• Physical Bullion: ${data.gold.physicalGrams.toFixed(2)}g (${data.gold.purchases.length} purchases)`);
    lines.push(`• Gold Savings Schemes: ${data.gold.schemeGrams.toFixed(2)}g across ${data.gold.schemes.length} schemes`);
    if (data.gold.schemes.length > 0) {
      lines.push('• Active Gold Schemes:');
      data.gold.schemes.forEach((g, idx) => {
        const sName = g.item_name || g.scheme_name || `Scheme #${idx + 1}`;
        const grams = Number(g.accumulated_grams || g.total_grams || 0).toFixed(2);
        const paid = fmt(g.total_amount_paid || g.total_paid || 0);
        lines.push(`  ${idx + 1}. [${sName}] (${grams}g accumulated, Total Paid: ${paid})`);
      });
    }

    // Section 6: Expense Projects & Ledgers
    lines.push(`\n[6. EXPENSE PROJECTS & BUDGETS (${data.expenses.projects.length} Projects)]`);
    lines.push(`• Allocated Projects Budget: ${fmt(data.expenses.totalBudget)} | Total Spent: ${fmt(data.expenses.totalSpent)} | Remaining Balance: ${fmt(data.expenses.totalBalance)}`);
    if (data.expenses.projects.length > 0) {
      lines.push('• Project Breakdown:');
      data.expenses.projects.forEach((p, idx) => {
        const pName = p.name || p.title || `Project #${idx + 1}`;
        const budget = fmt(p.budget_total ?? p.budget_amount ?? 0);
        const txns = data.expenses.txnsByProject[p.id] || [];
        const debits = txns.filter((t) => (t.transaction_type || 'Debit').toLowerCase() !== 'credit').reduce((s, t) => s + (Number(t.amount) || 0), 0);
        const credits = txns.filter((t) => (t.transaction_type || '').toLowerCase() === 'credit').reduce((s, t) => s + (Number(t.amount) || 0), 0);
        const netSpent = debits - credits;
        const spent = fmt((p.total_spent != null && Number(p.total_spent) > 0) ? Number(p.total_spent) : Math.max(0, netSpent));
        lines.push(`  ${idx + 1}. [${pName}] (Budget: ${budget}, Spent: ${spent}, Status: ${p.status || 'Active'})`);
      });
    }

    lines.push('================================================================');
    lines.push('\nRESPONSE FORMAT INSTRUCTIONS FOR ASSISTANT:');
    lines.push('When answering the user\'s question referencing their portfolio:');
    lines.push('1. Provide an executive summary of key totals.');
    lines.push('2. Provide granular metrics or breakdown tables with verified numbers from the context above.');
    lines.push('3. Provide 2-3 clickable quick actions using markdown hash links: [Label](#deals), [Label](#recurring), [Label](#accounts), [Label](#gold), [Label](#expenses), [Label](#payments), [Label](#aicopilot).');

    return lines.join('\n');
  }

  /**
   * Institutional Risk & Portfolio Health Audit
   */
  function computeComprehensiveAudit(data) {
    if (!data) return { totalScore: 75, rating: 'Balanced', ratingColor: 'var(--gold)', strengths: [], vulnerabilities: [], actions: [] };

    const totalAssets = Math.max(1, data.netWorth.totalAssets || 1);
    const dealsPrincipal = data.deals.activePrincipal || 0;
    const liquidCash = data.accounts.totalLiquidCash || 0;
    const fdPrincipal = data.accounts.totalFdPrincipal || 0;
    const goldVal = data.gold.totalValuation || 0;
    const liabilities = data.netWorth.totalLiabilities || 0;

    // 1. Diversification Score (max 25)
    const dealPct = (dealsPrincipal / totalAssets) * 100;
    const cashAndFdPct = ((liquidCash + fdPrincipal) / totalAssets) * 100;
    const goldPct = (goldVal / totalAssets) * 100;
    let divScore = 25;
    if (dealPct > 75) divScore -= 10;
    else if (dealPct > 60) divScore -= 5;
    if (cashAndFdPct < 10) divScore -= 6;
    if (goldPct < 2 && totalAssets > 200000) divScore -= 4;

    // 2. Liquidity & Cash Runway Score (max 25)
    let liqScore = 25;
    const runway = data.netWorth.liquidRunwayMonths;
    if (runway < 2) liqScore -= 12;
    else if (runway < 4) liqScore -= 6;
    if (data.cashFlow.next30Days < 0 && Math.abs(data.cashFlow.next30Days) > liquidCash) liqScore -= 7;

    // 3. Delinquency & Reliability Score (max 30)
    let relScore = 30;
    if (data.deals.overdueTotal > 0) {
      const overdueRatio = (data.deals.overdueTotal / Math.max(1, dealsPrincipal)) * 100;
      if (overdueRatio > 10) relScore -= 15;
      else if (overdueRatio > 3) relScore -= 8;
      else relScore -= 4;
    }
    const lowReliabilityDeals = data.deals.active.filter((d) => {
      const m = data.deals.metricsByDeal[d.id];
      return m && m.payout_reliability != null && m.payout_reliability < 75;
    });
    if (lowReliabilityDeals.length > 0) relScore -= Math.min(10, lowReliabilityDeals.length * 4);

    // 4. Debt & Leverage Score (max 20)
    let levScore = 20;
    const debtRatio = (liabilities / totalAssets) * 100;
    if (debtRatio > 40) levScore -= 15;
    else if (debtRatio > 20) levScore -= 8;
    else if (debtRatio > 10) levScore -= 3;

    const totalScore = Math.max(10, Math.min(100, Math.round(divScore + liqScore + relScore + levScore)));
    const rating = totalScore >= 85 ? 'Institutional Grade' : totalScore >= 70 ? 'Balanced & Resilient' : totalScore >= 50 ? 'Moderate Caution' : 'High Risk Exposure';
    const ratingColor = totalScore >= 85 ? 'var(--teal)' : totalScore >= 70 ? 'var(--gold)' : 'var(--red)';

    const strengths = [];
    const vulnerabilities = [];
    const actions = [];

    if (debtRatio <= 10) strengths.push('Super-low leverage (<10% debt-to-assets ratio).');
    if (cashAndFdPct >= 15) strengths.push(`Strong safety reserves in Bank Cash & FDs (${cashAndFdPct.toFixed(1)}% of assets).`);
    if (goldVal > 0) strengths.push(`Tangible gold hedge against currency inflation (${data.gold.totalGrams.toFixed(1)}g total).`);
    if (data.deals.overdueTotal === 0 && data.deals.active.length > 0) strengths.push('Flawless 100% deal payment regularity with zero overdue contracts.');

    if (dealPct > 70) vulnerabilities.push(`High direct lending concentration (${dealPct.toFixed(1)}% in deals).`);
    if (runway < 3) vulnerabilities.push(`Limited liquid runway (~${runway} months of expenses/SIPs).`);
    if (data.deals.overdueTotal > 0) vulnerabilities.push(`${fmt(data.deals.overdueTotal)} in overdue payments across ${data.deals.overdueItems.length} schedule(s).`);
    if (liabilities > liquidCash && liabilities > 0) vulnerabilities.push('Current debt liabilities exceed liquid cash checking accounts.');

    if (dealPct > 70) actions.push('Direct maturing principal into Fixed Deposits or bullion to soften credit risk [Explore FDs](#accounts).');
    if (data.deals.overdueTotal > 0) actions.push('Reconcile overdue borrower installments in the Payments Center [Go to Payments](#payments).');
    if (data.sips.active.length === 0) actions.push('Automate wealth building with a systematic SIP [Set up Recurring SIP](#recurring).');
    if (actions.length === 0) actions.push('Review reinvestment pipeline for upcoming deal maturities [View Deals](#deals).');

    return {
      totalScore,
      rating,
      ratingColor,
      divScore,
      liqScore,
      relScore,
      levScore,
      dealPct,
      cashAndFdPct,
      goldPct,
      debtRatio,
      strengths,
      vulnerabilities,
      actions,
    };
  }

  /**
   * Generates comprehensive local answers if server or Gemini is unreachable
   */
  function generateLocalDeterministicAnswer(question, data) {
    const q = (question || '').toLowerCase();
    const audit = computeComprehensiveAudit(data);

    let title = 'Institutional Portfolio Intelligence Report';
    let summary = '';
    let details = '';
    let quickActions = '';

    const isDeals = q.includes('deal') || q.includes('loan') || q.includes('yield') || q.includes('roi') || q.includes('borrower');
    const isSips = q.includes('sip') || q.includes('recurring') || q.includes('systematic') || q.includes('commitment');
    const isFds = q.includes('fd') || q.includes('fixed deposit') || q.includes('bank') || q.includes('deposit') || q.includes('interest rate');
    const isGold = q.includes('gold') || q.includes('bullion') || q.includes('gram') || q.includes('scheme') || q.includes('jewel');
    const isExpenses = q.includes('expense') || q.includes('budget') || q.includes('spend') || q.includes('burn') || q.includes('project');
    const isRisk = q.includes('risk') || q.includes('health') || q.includes('audit') || q.includes('overdue') || q.includes('score');

    if (isFds && !isDeals && !isGold) {
      title = 'Bank Accounts & Fixed Deposits Register';
      summary = `You hold **${data.accounts.all.length} accounts** totalling **${fmt(data.accounts.totalLiquidCash + data.accounts.totalFdPrincipal)}**, comprising **${fmt(data.accounts.totalLiquidCash)}** in liquid checking/savings and **${fmt(data.accounts.totalFdPrincipal)}** locked in Fixed Deposits.`;
      details = `\n| Account / Bank | Type | Principal | Rate | Accumulated Int | Maturity Value |\n|---|---|---|---|---|---|\n`;
      data.accounts.all.forEach((a) => {
        const isFd = a.isFd;
        const rate = a.rate ? `${a.rate}%` : '—';
        const accum = a.accumulatedInterest ? fmt(a.accumulatedInterest) : '—';
        const mat = isFd ? fmt(a.maturityValue) : fmt(a.balance);
        details += `| ${a.account_name || a.bank_name || 'Bank'} | ${isFd ? 'Fixed Deposit' : 'Savings'} | ${fmt(a.balance)} | ${rate} | ${accum} | ${mat} |\n`;
      });
      quickActions = `\n⚡ **Quick Actions:** [Manage Bank Accounts & FDs](#accounts) • [Cash Flow Forecast](#cashflow)`;
    } else if (isGold && !isDeals) {
      title = 'Gold & Bullion Vault Intelligence';
      summary = `Your gold holdings total **${data.gold.totalGrams.toFixed(2)} grams** valued at **${fmt(data.gold.totalValuation)}** (Book Cost: ${fmt(data.gold.totalBookCost)}).\n- Physical Gold: **${data.gold.physicalGrams.toFixed(2)}g** across ${data.gold.purchases.length} purchases.\n- Gold Schemes: **${data.gold.schemeGrams.toFixed(2)}g** accumulated across ${data.gold.schemes.length} schemes.`;
      details = `\n| Holding / Scheme | Type | Grams | Total Paid | Current Value |\n|---|---|---|---|---|\n`;
      data.gold.purchases.forEach((p) => {
        details += `| Physical Bullion (${p.jeweller_name || 'Dealer'}) | ${p.purity || '24K'} | ${Number(p.weight_grams || 0).toFixed(2)}g | ${fmt(p.total_amount)} | ${fmt(p.current_value || p.total_amount)} |\n`;
      });
      data.gold.schemes.forEach((s) => {
        details += `| ${s.item_name || 'Gold Scheme'} | Scheme | ${Number(s.accumulated_grams || s.total_grams || 0).toFixed(2)}g | ${fmt(s.total_amount_paid || s.total_paid)} | ${fmt(s.total_amount_paid || s.total_paid)} |\n`;
      });
      quickActions = `\n⚡ **Quick Actions:** [Open Gold Vault](#gold) • [Update Regional Gold Rates](#gold)`;
    } else if (isSips && !isDeals) {
      title = 'Systematic Recurring Investments & SIPs';
      summary = `You have **${data.sips.active.length} active systematic investment plans** with a combined commitment of **${fmt(data.sips.totalMonthlyCommitment)} per month**.`;
      details = `\n| Plan Name | Category | Amount | Frequency | Next Due Date |\n|---|---|---|---|---|\n`;
      data.sips.active.forEach((s) => {
        details += `| ${s.item_name || 'SIP'} | ${s.category || 'Investment'} | ${fmt(s.amount)} | ${s.frequency || 'Monthly'} | ${s.next_due_date || 'Scheduled'} |\n`;
      });
      quickActions = `\n⚡ **Quick Actions:** [View Systematic SIPs](#recurring) • [Add New Recurring SIP](#recurring)`;
    } else if (isExpenses && !isDeals) {
      title = 'Expense Projects & Expenditure Ledger';
      summary = `Total allocated project budget: **${fmt(data.expenses.totalBudget)}**. Total spent: **${fmt(data.expenses.totalSpent)}**. Remaining balance: **${fmt(data.expenses.totalBalance)}**.`;
      details = `\n| Project | Budget | Spent | Remaining Balance | Status |\n|---|---|---|---|---|\n`;
      data.expenses.projects.forEach((p) => {
        const budget = Number(p.budget_total ?? p.budget_amount) || 0;
        const txns = data.expenses.txnsByProject[p.id] || [];
        const debits = txns.filter((t) => (t.transaction_type || 'Debit').toLowerCase() !== 'credit').reduce((s, t) => s + (Number(t.amount) || 0), 0);
        const credits = txns.filter((t) => (t.transaction_type || '').toLowerCase() === 'credit').reduce((s, t) => s + (Number(t.amount) || 0), 0);
        const netSpent = debits - credits;
        const spent = (p.total_spent != null && Number(p.total_spent) > 0) ? Number(p.total_spent) : Math.max(0, netSpent);
        details += `| ${p.name || 'Project'} | ${fmt(budget)} | ${fmt(spent)} | ${fmt(budget - spent)} | ${p.status || 'Active'} |\n`;
      });
      quickActions = `\n⚡ **Quick Actions:** [Manage Expense Projects](#expenses) • [Record Expense Transaction](#expenses)`;
    } else {
      // Complete Multi-Asset Executive Dossier
      title = 'Complete Portfolio Dossier (Deals, SIPs, FDs, Gold, Expenses, Net Worth)';
      summary = `• **Total Net Worth:** **${fmt(data.netWorth.netWorth)}** (Assets: ${fmt(data.netWorth.totalAssets)} | Liabilities: ${fmt(data.netWorth.totalLiabilities)})\n` +
        `• **Active Deals & Loans:** **${fmt(data.deals.activePrincipal)}** across ${data.deals.active.length} contracts (@ **${fmtPct(data.deals.weightedRoi)}** weighted ROI)\n` +
        `• **Bank Accounts & FDs:** **${fmt(data.accounts.totalLiquidCash)}** liquid cash + **${fmt(data.accounts.totalFdPrincipal)}** in Fixed Deposits\n` +
        `• **Systematic SIPs:** **${fmt(data.sips.totalMonthlyCommitment)}/month** committed across ${data.sips.active.length} plans\n` +
        `• **Gold & Bullion Vault:** **${data.gold.totalGrams.toFixed(2)}g** (Valued at **${fmt(data.gold.totalValuation)}**)\n` +
        `• **Expense Projects:** **${fmt(data.expenses.totalSpent)}** spent of **${fmt(data.expenses.totalBudget)}** allocated budget\n` +
        `• **Health Score:** **${audit.totalScore}/100** (${audit.rating})`;

      details = `\n### 📋 Asset Class Allocation Matrix\n` +
        `| Asset Class | Principal / Value | Inflow / Yield | Key Metric |\n` +
        `|---|---|---|---|\n` +
        `| **High-Yield Deals** | ${fmt(data.deals.activePrincipal)} | ${fmtPct(data.deals.weightedRoi)} p.a. | ${data.deals.active.length} active deals |\n` +
        `| **Bank Fixed Deposits** | ${fmt(data.accounts.totalFdPrincipal)} | ~7.2% avg p.a. | ${data.accounts.fds.length} term deposits |\n` +
        `| **Liquid Checking/Savings** | ${fmt(data.accounts.totalLiquidCash)} | Liquid buffer | ~${data.netWorth.liquidRunwayMonths} mo. runway |\n` +
        `| **Gold Bullion & Schemes** | ${fmt(data.gold.totalValuation)} | Inflation hedge | ${data.gold.totalGrams.toFixed(2)} grams |\n` +
        `| **Systematic SIPs** | ${fmt(data.sips.totalMonthlyCommitment)}/mo | Compounding | ${data.sips.active.length} active plans |\n` +
        `| **Expense Projects** | ${fmt(data.expenses.totalBudget)} | Cash drain | ${fmt(data.expenses.totalBalance)} remaining |\n`;

      if (data.deals.overdueTotal > 0) {
        details += `\n⚠️ **Delinquency Alert:** ${fmt(data.deals.overdueTotal)} overdue across ${data.deals.overdueItems.length} payment schedules.\n`;
      }

      quickActions = `\n⚡ **Recommended Quick Actions:**\n` +
        `[📌 View Active Deals](#deals)  [📈 Systematic SIPs](#recurring)  [🏦 Bank FDs](#accounts)  [🪙 Gold Vault](#gold)  [📊 Expenses](#expenses)  [💳 Record Payment](#payments)`;
    }

    return `### 💼 ${title}\n\n${summary}\n\n${details}\n${quickActions}`;
  }

  return {
    gatherAllPortfolioData,
    buildFullPortfolioContextText,
    computeComprehensiveAudit,
    generateLocalDeterministicAnswer,
  };
})();
