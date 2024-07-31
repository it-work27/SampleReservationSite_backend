// backend/db.js
const { Pool } = require('pg');

// 環境変数からデータベースURLを取得
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

module.exports = pool;
