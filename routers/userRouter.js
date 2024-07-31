const express = require('express');
const pool = require('../utils/db');
const { authenticateToken } = require('../middlewares/authenticateToken');

const router = express.Router();

// ユーザーの予約情報取得エンドポイント
router.get('/reservations', authenticateToken, async (req, res) => {
  const userId = req.user.id;

  try {
    const result = await pool.query(
      `SELECT r.id, r.reservation_start_datetime, r.reservation_end_datetime, r.price,
              c.car_number, cm.carmodel_name, cr.price AS car_rank_price, 
              s.shop_name
       FROM reservation_tbl r
       JOIN car_tbl c ON r.car_id = c.id
       JOIN car_model_mst cm ON c.car_model_id = cm.id
       JOIN car_rank_mst cr ON cm.carmodel_rank_id = cr.id
       JOIN shop_mst s ON r.shop_id = s.id
       WHERE r.user_id = $1
       ORDER BY r.reservation_start_datetime ASC`,
      [userId]
    );

    return res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error fetching user reservations:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// 予約確認エンドポイント
router.get('/reservations/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `SELECT r.id, r.reservation_start_datetime AS departureDate, r.reservation_end_datetime AS returnDate, r.price,
              c.car_number, cm.carmodel_name AS carModelName, cr.price AS carRankPrice, 
              s.shop_name AS shopName, u.username AS userName, u.address AS userAddress, u.email AS userEmail
       FROM reservation_tbl r
       JOIN car_tbl c ON r.car_id = c.id
       JOIN car_model_mst cm ON c.car_model_id = cm.id
       JOIN car_rank_mst cr ON cm.carmodel_rank_id = cr.id
       JOIN shop_mst s ON r.shop_id = s.id
       JOIN users_tbl u ON r.user_id = u.id
       WHERE r.id = $1`,
      [id]
    );

    if (result.rows.length > 0) {
      return res.status(200).json(result.rows[0]);
    } else {
      return res.status(404).json({ message: 'Reservation details not found' });
    }
  } catch (error) {
    console.error('Error fetching reservation details:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
