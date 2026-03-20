const pool = require("../config/db");

async function tableExists(tableName, schema = "public") {
  const result = await pool.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = $1
          AND table_name = $2
      ) AS exists
    `,
    [schema, tableName]
  );

  return result.rows[0]?.exists === true;
}

async function findMissingTables(tableNames, schema = "public") {
  const checks = await Promise.all(
    tableNames.map(async (tableName) => ({
      tableName,
      exists: await tableExists(tableName, schema),
    }))
  );

  return checks.filter((item) => !item.exists).map((item) => item.tableName);
}

module.exports = {
  findMissingTables,
  tableExists,
};
