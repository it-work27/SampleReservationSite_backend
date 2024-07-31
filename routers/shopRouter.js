const express = require('express');
const pool = require('../utils/db');

const router = express.Router();

// 店舗名取得エンドポイント
router.get('/shops', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, shop_name FROM shop_mst');
    return res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error during database query:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// 車種名取得エンドポイント
router.get('/carmodels', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, carmodel_name FROM car_model_mst');
    return res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error during database query:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
