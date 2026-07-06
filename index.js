import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ─── Talkdesk Bank Customer Registry ────────────────────────────────────────
// Pre-seeded customers — SSN pulled from core banking system automatically

const CUSTOMERS = {
  "carly yates":     { first_name: "Carly",   last_name: "Yates",     ssn: "542-88-3301", dob: "1991-07-22", address: "847 Riverside Dr, Austin TX 78704" },
  "james holloway":  { first_name: "James",   last_name: "Holloway",  ssn: "391-55-7820", dob: "1978-11-03", address: "2210 Lamar Blvd, Austin TX 78705" },
  "priya nair":      { first_name: "Priya",   last_name: "Nair",      ssn: "614-32-9901", dob: "1995-04-18", address: "510 Congress Ave, Austin TX 78701" },
  "marcus webb":     { first_name: "Marcus",  last_name: "Webb",      ssn: "208-74-4456", dob: "1983-09-30", address: "1420 South 1st St, Austin TX 78704" },
  "diana rosenberg": { first_name: "Diana",   last_name: "Rosenberg", ssn: "733-21-6647", dob: "1969-02-14", address: "3300 Bee Cave Rd, Austin TX 78746" },
};

function resolveCustomer(input) {
  // Try direct name match
  const key = input.trim().toLowerCase();
  if (CUSTOMERS[key]) return CUSTOMERS[key];

  // Try partial match (first name only, last name only)
  for (const [k, v] of Object.entries(CUSTOMERS)) {
    if (k.startsWith(key) || k.endsWith(key) || k.includes(key)) return v;
  }

  return null;
}


// ─── Mock data generator ────────────────────────────────────────────────────

function seedRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function pickScore(rand) {
  // Weighted toward 580-780
  const base = 580 + Math.floor(rand() * 200);
  return Math.min(850, Math.max(300, base));
}

function scoreGrade(score) {
  if (score >= 800) return "Exceptional";
  if (score >= 740) return "Very Good";
  if (score >= 670) return "Good";
  if (score >= 580) return "Fair";
  return "Poor";
}

function scoreFactors(score, rand) {
  const allFactors = [
    { code: "14", description: "Length of time accounts have been established" },
    { code: "05", description: "Too many accounts with balances" },
    { code: "10", description: "Proportion of balances to credit limits on revolving accounts is too high" },
    { code: "08", description: "Too many inquiries last 12 months" },
    { code: "15", description: "Lack of recent installment loan information" },
    { code: "02", description: "Level of delinquency on accounts" },
    { code: "18", description: "Number of accounts with delinquency" },
    { code: "20", description: "Serious delinquency, and public record or collection filed" },
  ];
  const count = score >= 700 ? 2 : score >= 580 ? 3 : 4;
  const shuffled = [...allFactors].sort(() => rand() - 0.5);
  return shuffled.slice(0, count).map(f => ({
    ...f,
    impact: score < 600 ? "High" : score < 700 ? "Medium" : "Low",
  }));
}

function generateTradelines(ssn, rand) {
  const accountTypes = [
    { type: "Credit Card", creditor: "Chase Sapphire", limit: 8000, revolving: true },
    { type: "Credit Card", creditor: "Capital One Venture", limit: 5500, revolving: true },
    { type: "Auto Loan", creditor: "Toyota Financial Services", limit: 24000, revolving: false },
    { type: "Mortgage", creditor: "Wells Fargo Home Mortgage", limit: 285000, revolving: false },
    { type: "Personal Loan", creditor: "SoFi", limit: 12000, revolving: false },
    { type: "Student Loan", creditor: "Navient", limit: 38000, revolving: false },
    { type: "Credit Card", creditor: "American Express Blue Cash", limit: 15000, revolving: true },
    { type: "Retail Card", creditor: "Amazon Prime Visa", limit: 3000, revolving: true },
  ];

  const count = 3 + Math.floor(rand() * 5);
  const selected = [...accountTypes].sort(() => rand() - 0.5).slice(0, count);
  const now = new Date();

  return selected.map((acct, i) => {
    const openedYearsAgo = 1 + Math.floor(rand() * 12);
    const openDate = new Date(now.getFullYear() - openedYearsAgo, Math.floor(rand() * 12), 1);
    const balance = acct.revolving
      ? Math.floor(rand() * acct.limit * 0.75)
      : Math.floor(acct.limit * (rand() * 0.8));
    const utilization = acct.revolving ? Math.round((balance / acct.limit) * 100) : null;
    const latePayments = rand() < 0.2 ? Math.floor(rand() * 3) + 1 : 0;

    return {
      account_number: `****${1000 + i + Math.floor(rand() * 8000)}`,
      creditor_name: acct.creditor,
      account_type: acct.type,
      account_status: rand() > 0.05 ? "Open" : "Closed",
      date_opened: openDate.toISOString().split("T")[0],
      credit_limit: acct.limit,
      balance_owed: balance,
      monthly_payment: acct.revolving ? Math.floor(balance * 0.02) : Math.floor(acct.limit / (120)),
      utilization_percent: utilization,
      payment_status: latePayments > 0 ? "Late" : "Current",
      times_30_days_late: latePayments,
      times_60_days_late: latePayments > 1 ? 1 : 0,
      times_90_days_late: 0,
      payment_history_24mo: Array.from({ length: 24 }, (_, m) => {
        if (m < latePayments && rand() < 0.3) return "30";
        return "OK";
      }),
      high_balance: Math.floor(acct.limit * (0.5 + rand() * 0.5)),
      remarks: latePayments > 0 ? "Consumer disputes this account" : null,
    };
  });
}

function generateInquiries(rand) {
  const lenders = [
    "Capital One Auto Finance",
    "American Express",
    "Chase Bank",
    "Citibank",
    "Discover Financial",
    "SoFi Technologies",
    "Lending Club",
    "Marcus by Goldman Sachs",
    "Wells Fargo Bank",
    "Bank of America",
  ];
  const count = Math.floor(rand() * 6);
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const daysAgo = Math.floor(rand() * 365);
    const date = new Date(now - daysAgo * 86400000);
    return {
      creditor: lenders[Math.floor(rand() * lenders.length)],
      date: date.toISOString().split("T")[0],
      purpose: rand() > 0.5 ? "Credit Card" : "Personal Loan",
      type: "Hard Inquiry",
    };
  }).sort((a, b) => b.date.localeCompare(a.date));
}

function generatePublicRecords(score, rand) {
  if (score > 640 || rand() > 0.15) return [];
  return [
    {
      type: "Collection",
      creditor: "Portfolio Recovery Associates",
      amount: Math.floor(500 + rand() * 3000),
      date_filed: new Date(Date.now() - Math.floor(rand() * 3 * 365 * 86400000))
        .toISOString()
        .split("T")[0],
      status: rand() > 0.5 ? "Unpaid" : "Paid",
      remarks: "Placed for collection",
    },
  ];
}

function generateCollections(score, rand) {
  if (score > 660 || rand() > 0.2) return [];
  return [
    {
      agency: "Midland Credit Management",
      original_creditor: "T-Mobile",
      balance: Math.floor(200 + rand() * 1500),
      date_assigned: new Date(Date.now() - Math.floor(rand() * 4 * 365 * 86400000))
        .toISOString()
        .split("T")[0],
      status: "Unpaid",
    },
  ];
}

function buildCreditReport(input) {
  const seed = input.ssn.replace(/-/g, "").split("").reduce((a, c) => a * 31 + c.charCodeAt(0), 0);
  const rand = seedRandom(seed);

  const experianScore = pickScore(rand);
  const equifaxScore  = Math.min(850, Math.max(300, experianScore + Math.floor(rand() * 30) - 15));
  const transunionScore = Math.min(850, Math.max(300, experianScore + Math.floor(rand() * 30) - 15));

  const tradelines    = generateTradelines(input.ssn, rand);
  const inquiries     = generateInquiries(rand);
  const publicRecords = generatePublicRecords(experianScore, rand);
  const collections   = generateCollections(experianScore, rand);
  const factors       = scoreFactors(experianScore, rand);

  const revolvingAccounts  = tradelines.filter(t => t.utilization_percent !== null);
  const totalBalance       = tradelines.reduce((s, t) => s + t.balance_owed, 0);
  const totalCreditLimit   = tradelines.reduce((s, t) => s + t.credit_limit, 0);
  const overallUtilization = Math.round((totalBalance / totalCreditLimit) * 100);
  const oldestAccount      = tradelines.reduce((a, b) => a.date_opened < b.date_opened ? a : b);
  const avgAccountAge      = Math.floor(
    tradelines.reduce((s, t) => {
      const yrs = (Date.now() - new Date(t.date_opened)) / (365.25 * 86400000);
      return s + yrs;
    }, 0) / tradelines.length
  );

  return {
    report_id: `EXP-${Date.now()}-${Math.floor(rand() * 99999)}`,
    pulled_at: new Date().toISOString(),
    pull_type: "Hard Inquiry",
    subject: {
      name: `${input.first_name} ${input.last_name}`,
      ssn_last4: input.ssn.slice(-4),
      dob: input.dob,
      address: input.address,
    },
    scores: {
      experian_fico8: {
        score: experianScore,
        grade: scoreGrade(experianScore),
        range: "300–850",
        score_factors: factors,
      },
      equifax_beacon5: {
        score: equifaxScore,
        grade: scoreGrade(equifaxScore),
        range: "300–850",
      },
      transunion_classicfico: {
        score: transunionScore,
        grade: scoreGrade(transunionScore),
        range: "300–850",
      },
    },
    summary: {
      total_accounts: tradelines.length,
      open_accounts: tradelines.filter(t => t.account_status === "Open").length,
      total_balance_owed: totalBalance,
      total_credit_limit: totalCreditLimit,
      overall_utilization_percent: overallUtilization,
      revolving_utilization_percent: Math.round(
        revolvingAccounts.reduce((s, t) => s + t.balance_owed, 0) /
        revolvingAccounts.reduce((s, t) => s + t.credit_limit, 1) * 100
      ),
      oldest_account: oldestAccount.date_opened,
      average_account_age_years: avgAccountAge,
      total_inquiries_12mo: inquiries.filter(i => {
        return new Date(i.date) > new Date(Date.now() - 365 * 86400000);
      }).length,
      derogatory_marks: publicRecords.length + collections.length,
      missed_payments: tradelines.reduce((s, t) => s + t.times_30_days_late, 0),
    },
    tradelines,
    inquiries,
    public_records: publicRecords,
    collections,
    pre_qualification: {
      likely_approved_for: experianScore >= 740
        ? ["Premium credit cards", "Auto loans", "Mortgage", "Personal loans"]
        : experianScore >= 670
        ? ["Standard credit cards", "Auto loans", "Personal loans"]
        : experianScore >= 580
        ? ["Secured credit cards", "Subprime auto loans"]
        : ["Secured credit card with deposit", "Credit-builder loan"],
      estimated_apr_range: experianScore >= 740
        ? "6%–12%"
        : experianScore >= 670
        ? "12%–20%"
        : experianScore >= 580
        ? "20%–28%"
        : "28%+",
    },
  };
}

// ─── MCP Server ─────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "experian-credit-pull",
  version: "1.0.0",
});

// Tool: full hard pull
server.tool(
  "hard_credit_pull",
  "Pull a full hard credit report (mock Experian). Returns FICO scores from all 3 bureaus, complete tradelines with payment history, inquiries, public records, collections, and pre-qualification estimates.",
  {
    first_name: z.string().describe("Consumer's first name"),
    last_name:  z.string().describe("Consumer's last name"),
    ssn:        z.string().regex(/^\d{3}-\d{2}-\d{4}$/).describe("SSN in format XXX-XX-XXXX"),
    dob:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Date of birth YYYY-MM-DD"),
    address:    z.string().describe("Current street address"),
    purpose:    z.enum([
      "mortgage",
      "auto_loan",
      "personal_loan",
      "credit_card",
      "student_loan",
      "employment",
      "other",
    ]).describe("Permissible purpose for the inquiry (FCRA required)"),
  },
  async (input) => {
    const report = buildCreditReport(input);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(report, null, 2),
        },
      ],
    };
  }
);

// Tool: score only (lighter call)
server.tool(
  "get_credit_scores",
  "Retrieve tri-merge credit scores only (Experian FICO 8, Equifax Beacon 5, TransUnion Classic FICO) without full tradeline detail.",
  {
    first_name: z.string(),
    last_name:  z.string(),
    ssn:        z.string().regex(/^\d{3}-\d{2}-\d{4}$/),
    dob:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    purpose:    z.enum(["mortgage", "auto_loan", "personal_loan", "credit_card", "student_loan", "employment", "other"]),
  },
  async (input) => {
    const report = buildCreditReport(input);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            report_id:  report.report_id,
            pulled_at:  report.pulled_at,
            pull_type:  report.pull_type,
            subject:    report.subject,
            scores:     report.scores,
            pre_qualification: report.pre_qualification,
          }, null, 2),
        },
      ],
    };
  }
);

// Tool: tradelines only
server.tool(
  "get_tradelines",
  "Retrieve full tradeline detail including payment history, balances, and utilization for each account.",
  {
    first_name: z.string(),
    last_name:  z.string(),
    ssn:        z.string().regex(/^\d{3}-\d{2}-\d{4}$/),
    dob:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    purpose:    z.enum(["mortgage", "auto_loan", "personal_loan", "credit_card", "student_loan", "employment", "other"]),
  },
  async (input) => {
    const report = buildCreditReport(input);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            report_id:     report.report_id,
            pulled_at:     report.pulled_at,
            subject:       report.subject,
            summary:       report.summary,
            tradelines:    report.tradelines,
            inquiries:     report.inquiries,
            public_records: report.public_records,
            collections:   report.collections,
          }, null, 2),
        },
      ],
    };
  }
);

// Tool: customer lookup (no SSN required — pulled from core)
server.tool(
  "lookup_customer",
  "Look up a Talkdesk Bank customer by name and automatically pull their full hard credit report. SSN is retrieved from the core banking system — no manual entry needed.",
  {
    customer_name: z.string().describe("Customer's full name or partial name (e.g. 'Carly Yates' or just 'Carly')"),
    purpose: z.enum([
      "mortgage",
      "auto_loan",
      "personal_loan",
      "credit_card",
      "student_loan",
      "employment",
      "other",
    ]).describe("Permissible purpose for the inquiry (FCRA required)"),
  },
  async ({ customer_name, purpose }) => {
    const customer = resolveCustomer(customer_name);

    if (!customer) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: "Customer not found",
            searched_for: customer_name,
            available_customers: Object.values(CUSTOMERS).map(c => `${c.first_name} ${c.last_name}`),
          }, null, 2),
        }],
      };
    }

    const report = buildCreditReport({ ...customer, purpose });
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          ...report,
          _note: `SSN automatically retrieved from Talkdesk Bank core system. Last 4: ${customer.ssn.slice(-4)}.`,
        }, null, 2),
      }],
    };
  }
);

// ─── Start ───────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
