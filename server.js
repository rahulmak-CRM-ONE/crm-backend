require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mysql = require("mysql2");
const fs = require("fs");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());

const DATA_FILE = path.join(__dirname, "data", "leads.json");
const DEFAULT_FALLBACK_LEADS = [
  {
    id: 1,
    customer: "Ava Johnson",
    company: "Northstar Labs",
    industry: "Technology",
    status: "Qualified",
    stage: "Demo",
    value: "$12,500",
    owner: "Mina",
    source: "Website",
    phone: "+1-555-0101",
    email: "ava@northstarlabs.com",
  },
  {
    id: 2,
    customer: "Daniel Kim",
    company: "Bright Commerce",
    industry: "Retail",
    status: "Follow-up",
    stage: "Proposal",
    value: "$8,200",
    owner: "Leo",
    source: "Referral",
    phone: "+1-555-0102",
    email: "daniel@brightcommerce.com",
  },
  {
    id: 3,
    customer: "Sarah Patel",
    company: "Greenfield Health",
    industry: "Healthcare",
    status: "New",
    stage: "Discovery",
    value: "$5,000",
    owner: "Nia",
    source: "LinkedIn",
    phone: "+1-555-0103",
    email: "sarah@greenfieldhealth.com",
  },
];
let fallbackLeads = [];

const ensureDataDirectory = () => {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const loadFallbackLeads = () => {
  ensureDataDirectory();

  if (!fs.existsSync(DATA_FILE)) {
    const seededLeads = DEFAULT_FALLBACK_LEADS.map((lead) => ({ ...lead }));
    fs.writeFileSync(DATA_FILE, JSON.stringify(seededLeads, null, 2));
    return seededLeads;
  }

  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : DEFAULT_FALLBACK_LEADS;
  } catch (error) {
    console.error("Failed to read fallback leads data:", error);
    return DEFAULT_FALLBACK_LEADS;
  }
};

const saveFallbackLeads = () => {
  ensureDataDirectory();
  fs.writeFileSync(DATA_FILE, JSON.stringify(fallbackLeads, null, 2));
};

fallbackLeads = loadFallbackLeads();

const hasDbConfig = Boolean(
  process.env.DB_HOST &&
    process.env.DB_USER &&
    process.env.DB_PASSWORD &&
    process.env.DB_NAME
);

let db = null;
let dbConnected = false;

if (hasDbConfig) {
  db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  const ensureLeadsTable = () => {
    const createTableSql = `
      CREATE TABLE IF NOT EXISTS leads (
        id INT AUTO_INCREMENT PRIMARY KEY,
        customer VARCHAR(255) NOT NULL,
        company VARCHAR(255),
        industry VARCHAR(255),
        status VARCHAR(100),
        stage VARCHAR(100),
        value VARCHAR(100),
        owner VARCHAR(100),
        source VARCHAR(100),
        phone VARCHAR(50),
        email VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    db.query(createTableSql, (err) => {
      if (err) {
        console.error("Failed to initialize leads table:", err);
        return;
      }

      console.log("Leads table ready ✅");
    });
  };

  db.connect((err) => {
    if (err) {
      console.log("Database Error:", err);
      db = null;
      dbConnected = false;
      return;
    }

    dbConnected = true;
    console.log("MySQL Connected ✅");
    ensureLeadsTable();
  });
} else {
  console.log("Database env vars not configured. Using file-based fallback storage for leads.");
}

app.get("/", (req, res) => {
  res.json({
    message: "CRM backend is running",
    endpoints: ["/api/leads", "/api/leads/:id"],
  });
});

app.get("/api/leads", (req, res) => {
  if (!db || !dbConnected) {
    return res.json(fallbackLeads);
  }

  db.query("SELECT * FROM leads", (err, results) => {
    if (err) {
      return res.status(500).json(err);
    }

    res.json(results);
  });
});

app.delete("/api/leads/:id", (req, res) => {
  const { id } = req.params;

  if (!db || !dbConnected) {
    fallbackLeads = fallbackLeads.filter((lead) => String(lead.id) !== String(id));
    saveFallbackLeads();

    return res.json({
      message: "Lead deleted successfully",
    });
  }

  db.query(
    "DELETE FROM leads WHERE id = ?",
    [id],
    (err, result) => {
      if (err) {
        return res.status(500).json(err);
      }

      res.json({
        message: "Lead deleted successfully",
      });
    }
  );
});

app.post("/api/leads", (req, res) => {
  const {
    customer,
    company,
    industry,
    status,
    stage,
    value,
    owner,
    source,
    phone,
    email,
  } = req.body;

  if (!db || !dbConnected) {
    const newLead = {
      id: Date.now(),
      customer,
      company,
      industry,
      status,
      stage,
      value,
      owner,
      source,
      phone,
      email,
    };

    fallbackLeads = [newLead, ...fallbackLeads];
    saveFallbackLeads();

    return res.json({
      message: "Lead added successfully",
      id: newLead.id,
    });
  }

  const sql = `
    INSERT INTO leads
    (
      customer,
      company,
      industry,
      status,
      stage,
      value,
      owner,
      source,
      phone,
      email
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.query(
    sql,
    [
      customer,
      company,
      industry,
      status,
      stage,
      value,
      owner,
      source,
      phone,
      email,
    ],
    (err, result) => {
      if (err) {
        console.log(err);
        return res.status(500).json(err);
      }

      res.json({
        message: "Lead added successfully",
        id: result.insertId,
      });
    }
  );
});

app.put("/api/leads/:id", (req, res) => {
  const { id } = req.params;

  const {
    customer,
    company,
    industry,
    status,
    phone,
    email,
  } = req.body;

  if (!db || !dbConnected) {
    fallbackLeads = fallbackLeads.map((lead) =>
      String(lead.id) === String(id)
        ? {
            ...lead,
            customer,
            company,
            industry,
            status,
            phone,
            email,
          }
        : lead
    );
    saveFallbackLeads();

    return res.json({
      message: "Lead updated successfully",
    });
  }

  const sql = `
    UPDATE leads
    SET customer=?,
        company=?,
        industry=?,
        status=?,
        phone=?,
        email=?
    WHERE id=?
  `;

  db.query(
    sql,
    [
      customer,
      company,
      industry,
      status,
      phone,
      email,
      id,
    ],
    (err, result) => {
      if (err) {
        return res.status(500).json(err);
      }

      res.json({
        message: "Lead updated successfully",
      });
    }
  );
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});