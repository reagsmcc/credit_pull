# Experian Hard Credit Pull — Mock MCP Server

A fully mock Experian hard credit pull MCP server. Returns deterministic, realistic data based on the SSN provided — same SSN always produces the same report.

## Tools

### `hard_credit_pull`
Full hard pull. Returns everything:
- **Tri-merge FICO scores** — Experian FICO 8, Equifax Beacon 5, TransUnion Classic FICO
- **Score factors** — reason codes with impact level
- **Account summary** — utilization, balances, account age, derogatory count
- **Full tradelines** — 24-month payment history, balances, limits, late payments per account
- **Hard inquiries** — last 12 months
- **Public records** — bankruptcies, judgments
- **Collections** — derogatory collection accounts
- **Pre-qualification signal** — likely approvals + estimated APR range

### `get_credit_scores`
Scores + pre-qual only, no tradeline detail.

### `get_tradelines`
Full tradelines + summary, no scores.

---

## Inputs (all tools)

| Field | Format | Description |
|---|---|---|
| `first_name` | string | Consumer first name |
| `last_name` | string | Consumer last name |
| `ssn` | `XXX-XX-XXXX` | Social Security Number |
| `dob` | `YYYY-MM-DD` | Date of birth |
| `address` | string | Current address |
| `purpose` | enum | FCRA permissible purpose |

**Purpose values:** `mortgage`, `auto_loan`, `personal_loan`, `credit_card`, `student_loan`, `employment`, `other`

---

## Running locally

```bash
npm install
node index.js
```

## Claude Desktop config (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "experian-credit-pull": {
      "command": "node",
      "args": ["/absolute/path/to/experian-soft-pull-mcp/index.js"]
    }
  }
}
```

## Railway deployment

1. Push to a GitHub repo
2. Create a new Railway project → Deploy from GitHub
3. Set start command: `node index.js`
4. Expose via Railway's TCP proxy if needed for remote MCP access

---

## Score behavior

Scores are **deterministic by SSN** — the same SSN always returns the same report. Score distribution is weighted 580–780 with tails at both ends. Derogatory marks, collections, and public records only appear on lower-scoring profiles.
