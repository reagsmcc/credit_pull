const http = require('http');
const crypto = require('crypto');
const PORT = process.env.PORT || 3000;

// ─── Talkdesk Bank Customer Registry ────────────────────────────────────────
// SSN pulled automatically from core banking — agents never enter it manually

const CUSTOMERS = {
  "carly yates":     { first_name: "Carly",   last_name: "Yates",     ssn: "542-88-3301", dob: "1991-07-22", address: "847 Riverside Dr, Austin TX 78704" },
  "james holloway":  { first_name: "James",   last_name: "Holloway",  ssn: "391-55-7820", dob: "1978-11-03", address: "2210 Lamar Blvd, Austin TX 78705" },
  "priya nair":      { first_name: "Priya",   last_name: "Nair",      ssn: "614-32-9901", dob: "1995-04-18", address: "510 Congress Ave, Austin TX 78701" },
  "marcus webb":     { first_name: "Marcus",  last_name: "Webb",      ssn: "208-74-4456", dob: "1983-09-30", address: "1420 South 1st St, Austin TX 78704" },
  "diana rosenberg": { first_name: "Diana",   last_name: "Rosenberg", ssn: "733-21-6647", dob: "1969-02-14", address: "3300 Bee Cave Rd, Austin TX 78746" },
};

function resolveCustomer(input) {
  const key = (input || '').trim().toLowerCase();
  if (CUSTOMERS[key]) return CUSTOMERS[key];
  for (const [k, v] of Object.entries(CUSTOMERS)) {
    if (k.includes(key) || key.includes(k)) return v;
  }
  return null;
}

// ─── Mock credit report generator ────────────────────────────────────────────

function seedRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function scoreGrade(score) {
  if (score >= 800) return "Exceptional";
  if (score >= 740) return "Very Good";
  if (score >= 670) return "Good";
  if (score >= 580) return "Fair";
  return "Poor";
}

function buildCreditReport(customer, purpose) {
  const seed = customer.ssn.replace(/-/g, '').split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 0);
  const rand = seedRandom(seed);

  const experianScore   = Math.min(850, Math.max(300, 580 + Math.floor(rand() * 200)));
  const equifaxScore    = Math.min(850, Math.max(300, experianScore + Math.floor(rand() * 30) - 15));
  const transunionScore = Math.min(850, Math.max(300, experianScore + Math.floor(rand() * 30) - 15));

  const accountTypes = [
    { type: "Credit Card",   creditor: "Chase Sapphire",            limit: 8000,   revolving: true },
    { type: "Credit Card",   creditor: "Capital One Venture",        limit: 5500,   revolving: true },
    { type: "Auto Loan",     creditor: "Toyota Financial Services",  limit: 24000,  revolving: false },
    { type: "Mortgage",      creditor: "Wells Fargo Home Mortgage",  limit: 285000, revolving: false },
    { type: "Personal Loan", creditor: "SoFi",                      limit: 12000,  revolving: false },
    { type: "Student Loan",  creditor: "Navient",                   limit: 38000,  revolving: false },
    { type: "Credit Card",   creditor: "American Express Blue Cash", limit: 15000,  revolving: true },
    { type: "Retail Card",   creditor: "Amazon Prime Visa",          limit: 3000,   revolving: true },
  ];

  const count = 3 + Math.floor(rand() * 5);
  const now = new Date();
  const tradelines = [...accountTypes].sort(() => rand() - 0.5).slice(0, count).map((acct, i) => {
    const openedYearsAgo = 1 + Math.floor(rand() * 12);
    const openDate = new Date(now.getFullYear() - openedYearsAgo, Math.floor(rand() * 12), 1);
    const balance = acct.revolving ? Math.floor(rand() * acct.limit * 0.75) : Math.floor(acct.limit * rand() * 0.8);
    const latePayments = rand() < 0.2 ? Math.floor(rand() * 3) + 1 : 0;
    return {
      account_number: `****${1000 + i + Math.floor(rand() * 8000)}`,
      creditor_name: acct.creditor,
      account_type: acct.type,
      account_status: rand() > 0.05 ? "Open" : "Closed",
      date_opened: openDate.toISOString().split('T')[0],
      credit_limit: acct.limit,
      balance_owed: balance,
      monthly_payment: acct.revolving ? Math.floor(balance * 0.02) : Math.floor(acct.limit / 120),
      utilization_percent: acct.revolving ? Math.round((balance / acct.limit) * 100) : null,
      payment_status: latePayments > 0 ? "Late" : "Current",
      times_30_days_late: latePayments,
      times_60_days_late: latePayments > 1 ? 1 : 0,
      times_90_days_late: 0,
      payment_history_24mo: Array.from({ length: 24 }, (_, m) => (m < latePayments && rand() < 0.3) ? "30" : "OK"),
    };
  });

  const lenders = ["Capital One Auto Finance","American Express","Chase Bank","Citibank","Discover Financial","SoFi Technologies","Wells Fargo Bank","Bank of America"];
  const inquiryCount = Math.floor(rand() * 6);
  const inquiries = Array.from({ length: inquiryCount }, () => ({
    creditor: lenders[Math.floor(rand() * lenders.length)],
    date: new Date(now - Math.floor(rand() * 365) * 86400000).toISOString().split('T')[0],
    type: "Hard Inquiry",
  })).sort((a, b) => b.date.localeCompare(a.date));

  const collections = (experianScore <= 660 && rand() < 0.2) ? [{
    agency: "Midland Credit Management",
    original_creditor: "T-Mobile",
    balance: Math.floor(200 + rand() * 1500),
    status: "Unpaid",
  }] : [];

  const totalBalance = tradelines.reduce((s, t) => s + t.balance_owed, 0);
  const totalLimit   = tradelines.reduce((s, t) => s + t.credit_limit, 0);

  return {
    report_id: `EXP-${Date.now()}-${Math.floor(rand() * 99999)}`,
    pulled_at: new Date().toISOString(),
    pull_type: "Hard Inquiry",
    purpose: purpose,
    subject: {
      name: `${customer.first_name} ${customer.last_name}`,
      ssn_last4: customer.ssn.slice(-4),
      dob: customer.dob,
      address: customer.address,
    },
    scores: {
      experian_fico8:         { score: experianScore,   grade: scoreGrade(experianScore),   range: "300–850" },
      equifax_beacon5:        { score: equifaxScore,    grade: scoreGrade(equifaxScore),    range: "300–850" },
      transunion_classicfico: { score: transunionScore, grade: scoreGrade(transunionScore), range: "300–850" },
    },
    summary: {
      total_accounts: tradelines.length,
      open_accounts: tradelines.filter(t => t.account_status === "Open").length,
      total_balance_owed: totalBalance,
      total_credit_limit: totalLimit,
      overall_utilization_percent: Math.round((totalBalance / totalLimit) * 100),
      total_inquiries_12mo: inquiries.filter(i => new Date(i.date) > new Date(now - 365 * 86400000)).length,
      derogatory_marks: collections.length,
      missed_payments: tradelines.reduce((s, t) => s + t.times_30_days_late, 0),
    },
    tradelines,
    inquiries,
    collections,
    pre_qualification: {
      likely_approved_for: experianScore >= 740
        ? ["Premium credit cards", "Auto loans", "Mortgage", "Personal loans"]
        : experianScore >= 670
        ? ["Standard credit cards", "Auto loans", "Personal loans"]
        : experianScore >= 580
        ? ["Secured credit cards", "Subprime auto loans"]
        : ["Secured credit card with deposit", "Credit-builder loan"],
      estimated_apr_range: experianScore >= 740 ? "6%–12%" : experianScore >= 670 ? "12%–20%" : experianScore >= 580 ? "20%–28%" : "28%+",
    },
  };
}

// ─── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'lookup_customer_credit',
    description: 'Look up a Talkdesk Bank customer by name and automatically pull their full hard credit report. SSN is retrieved from the core banking system — the agent does not need to ask for it. Returns tri-merge FICO scores (Experian, Equifax, TransUnion), full tradelines with 24-month payment history, inquiries, collections, and pre-qualification estimates.',
    inputSchema: {
      type: 'object',
      properties: {
        customer_name: { type: 'string', description: 'Full or partial customer name, e.g. "Carly Yates" or "Carly"' },
        purpose: {
          type: 'string',
          enum: ['mortgage', 'auto_loan', 'personal_loan', 'credit_card', 'student_loan', 'employment', 'other'],
          description: 'FCRA permissible purpose for the credit inquiry'
        },
      },
      required: ['customer_name', 'purpose'],
    },
  },
  {
    name: 'hard_credit_pull',
    description: 'Pull a full hard credit report using SSN directly. Use lookup_customer_credit instead when the customer is a known Talkdesk Bank member — this tool is for manual lookups only.',
    inputSchema: {
      type: 'object',
      properties: {
        first_name: { type: 'string' },
        last_name:  { type: 'string' },
        ssn:        { type: 'string', description: 'SSN in format XXX-XX-XXXX' },
        dob:        { type: 'string', description: 'Date of birth YYYY-MM-DD' },
        address:    { type: 'string' },
        purpose:    { type: 'string', enum: ['mortgage', 'auto_loan', 'personal_loan', 'credit_card', 'student_loan', 'employment', 'other'] },
      },
      required: ['first_name', 'last_name', 'ssn', 'dob', 'address', 'purpose'],
    },
  },
  {
    name: 'get_credit_scores',
    description: 'Retrieve tri-merge FICO scores and pre-qualification only for a known Talkdesk Bank customer. Faster than a full credit pull — use when only the score is needed.',
    inputSchema: {
      type: 'object',
      properties: {
        customer_name: { type: 'string', description: 'Full or partial customer name' },
        purpose: { type: 'string', enum: ['mortgage', 'auto_loan', 'personal_loan', 'credit_card', 'student_loan', 'employment', 'other'] },
      },
      required: ['customer_name', 'purpose'],
    },
  },
];

// ─── Tool execution ───────────────────────────────────────────────────────────

function callTool(name, args) {
  // ── Normalize camelCase → snake_case (Talkdesk sends camelCase) ──
  if (args.customerName)  args.customer_name  = args.customerName;
  if (args.firstName)     args.first_name     = args.firstName;
  if (args.lastName)      args.last_name      = args.lastName;

  if (name === 'lookup_customer_credit') {
    const customer = resolveCustomer(args.customer_name);
    if (!customer) {
      return {
        success: false,
        error: `Customer "${args.customer_name}" not found in Talkdesk Bank core system.`,
        available_customers: Object.values(CUSTOMERS).map(c => `${c.first_name} ${c.last_name}`),
      };
    }
    const report = buildCreditReport(customer, args.purpose || 'other');
    return { success: true, source: 'Talkdesk Bank Core + Experian', ssn_retrieved_automatically: true, ...report };
  }

  if (name === 'hard_credit_pull') {
    if (!args.ssn || !args.first_name || !args.last_name) {
      return { success: false, error: 'Missing required fields: first_name, last_name, ssn' };
    }
    const customer = { first_name: args.first_name, last_name: args.last_name, ssn: args.ssn, dob: args.dob || 'unknown', address: args.address || 'unknown' };
    const report = buildCreditReport(customer, args.purpose || 'other');
    return { success: true, ...report };
  }

  if (name === 'get_credit_scores') {
    const customer = resolveCustomer(args.customer_name);
    if (!customer) return { success: false, error: `Customer "${args.customer_name}" not found.` };
    const report = buildCreditReport(customer, args.purpose || 'other');
    return {
      success: true,
      report_id: report.report_id,
      pulled_at: report.pulled_at,
      subject: report.subject,
      scores: report.scores,
      pre_qualification: report.pre_qualification,
    };
  }

  return { success: false, error: `Unknown tool: ${name}` };
}

// ─── MCP JSON-RPC handler ─────────────────────────────────────────────────────

function handleMcp(msg) {
  const { id, method, params } = msg;

  if (method === 'initialize') {
    return { jsonrpc: '2.0', id, result: {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'experian-credit-pull', version: '1.0.0' },
    }};
  }

  if (method === 'notifications/initialized') return null;
  if (method === 'ping') return { jsonrpc: '2.0', id, result: {} };

  if (method === 'tools/list') {
    return { jsonrpc: '2.0', id, result: { tools: TOOLS } };
  }

  if (method === 'tools/call') {
    console.log('TOOL CALL:', JSON.stringify({ name: params.name, args: params.arguments }));
    const result = callTool(params.name, params.arguments || {});
    return { jsonrpc: '2.0', id, result: {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      isError: false,
    }};
  }

  return { jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } };
}

// ─── HTTP server (Streamable HTTP — the only transport Talkdesk supports) ────

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Mcp-Session-Id, Last-Event-ID');
  res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'experian-credit-pull-mcp', tools: TOOLS.length }));
    return;
  }

  if (url.pathname === '/mcp') {
    if (req.method === 'POST') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        try {
          const msg = JSON.parse(body);
          const response = handleMcp(msg);
          const sessionId = req.headers['mcp-session-id'] || crypto.randomUUID();
          res.writeHead(200, { 'Content-Type': 'application/json', 'Mcp-Session-Id': sessionId });
          res.end(JSON.stringify(response || {}));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON', message: e.message }));
        }
      });
      return;
    }

    if (req.method === 'GET') {
      const sessionId = req.headers['mcp-session-id'] || crypto.randomUUID();
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Mcp-Session-Id': sessionId,
      });
      res.write(': connected\n\n');
      const ping = setInterval(() => { if (!res.writableEnded) res.write(': ping\n\n'); }, 20000);
      req.on('close', () => clearInterval(ping));
      return;
    }
  }

  res.writeHead(404); res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => console.log(`Experian Credit Pull MCP running on port ${PORT}`));
