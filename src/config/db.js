const { Pool } = require("pg");

const env = require("./env");

const pool = new Pool({
  ...env.db,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

module.exports = pool;
