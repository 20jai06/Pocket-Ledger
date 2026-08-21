const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

async function init() {
  await pool.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
  await pool.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  console.log('Database schema created.');
  await pool.end();
}
init().catch((err) => { console.error(err); process.exit(1); });
