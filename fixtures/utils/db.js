function cleanOldDatabaseRecords() {
  return { deletedRecords: 0 };
}

function getSharedAuditTrail() {
  return [{ event: "billing-updated" }];
}

module.exports = { cleanOldDatabaseRecords, getSharedAuditTrail };
