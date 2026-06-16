const express = require("express");
const logger = require("./utils/logger");
const { cleanOldDatabaseRecords, getSharedAuditTrail } = require("./utils/db");

const app = express();
const router = express.Router();

app.use(express.json());
app.use("/api", router);

app.get("/api/users", (req, res) => {
  logger("GET /api/users");
  res.json([{ id: 1, name: "Ada Lovelace" }]);
});

app.get("/api/users/:id/status", (req, res) => {
  logger("GET /api/users/:id/status");
  res.json({ id: req.params.id, status: "active" });
});

app.post("/api/billing", (req, res) => {
  logger("POST /api/billing");
  const auditTrail = getSharedAuditTrail();
  res.json({ status: "billing updated", auditTrail });
});

app.delete("/api/billing", (req, res) => {
  const auditTrail = getSharedAuditTrail();
  res.json({ status: "billing deleted", auditTrail });
});

app.get("/api/projects", (req, res) => {
  logger("GET /api/projects");
  res.json([{ id: "cross-prune", status: "active" }]);
});

router.get("/reports", (req, res) => {
  logger("GET /api/reports");
  res.json([{ id: 1, title: "Weekly API usage" }]);
});

app.get("/api/audit-export", (req, res) => {
  logger("GET /api/audit-export");
  res.json({ ready: true });
});

app.post("/api/webhook/events", (req, res) => {
  logger("POST /api/webhook/events");
  res.json({ status: "billing updated" });
});

app.delete("/api/legacy-data", (req, res) => {
  const result = cleanOldDatabaseRecords();
  res.json({ status: "legacy data cleaned", result });
});

const port = process.env.PORT || 3000;

app.listen(port, () => {
  logger(`Server listening on port ${port}`);
});
