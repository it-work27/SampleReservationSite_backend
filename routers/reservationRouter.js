const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pool = require('../utils/db');
const { authenticateToken } = require('../middlewares/authenticateToken');
const { validateDateMiddleware } = require('../middlewares/validaeDateMiddleware');

const router = express.Router();

const searchResultsCache = {};

// 予約関連のエンドポイント
router.post('/search/cars', validateDateMiddleware, async (req, res) => {
  const { departureDate, returnDate, shopId, carModelId } = req.body;

  try {
    const availableCarsResult = await pool.query(
      `SELECT c.id
       FROM car_tbl c
       LEFT JOIN reservation_status_view rsv
       ON c.id = rsv.car_id AND
          (rsv.reservation_start_datetime <= $2 AND rsv.reservation_end_datetime >= $1)
       WHERE c.shop_id = $3 AND c.car_model_id = $4 AND rsv.car_id IS NULL`,
      [departureDate, returnDate, shopId, carModelId]
    );

    const availableCarIds = availableCarsResult.rows.map(row => row.id);

    if (availableCarIds.length === 0) {
      return res.status(200).json({ message: 'No available cars' });
    }

    const carDetails = await Promise.all(availableCarIds.map(async (carId) => {
      const carDetailResult = await pool.query(
        `SELECT c.id, cm.carmodel_name, s.shop_name, cr.price
         FROM car_tbl c
         JOIN car_model_mst cm ON c.car_model_id = cm.id
         JOIN car_rank_mst cr ON cm.carmodel_rank_id = cr.id
         JOIN shop_mst s ON c.shop_id = s.id
         WHERE c.id = $1`,
        [carId]
      );

      const carDetail = carDetailResult.rows[0];
      const days = (new Date(returnDate) - new Date(departureDate)) / (1000 * 60 * 60 * 24) + 1;
      const totalPrice = carDetail.price * days;

      return {
        carId: carDetail.id,
        carModelName: carDetail.carmodel_name,
        shopName: carDetail.shop_name,
        departureDate,
        returnDate,
        price: totalPrice
      };
    }));

    const listId = uuidv4();
    searchResultsCache[listId] = carDetails;

    return res.status(200).json({ listId, carDetails });
  } catch (error) {
    console.error('Error during database query:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// 予約確認エンドポイント
router.get('/reservation/:listId/:carId', authenticateToken, async (req, res) => {
  const { listId, carId } = req.params;
  const userId = req.user.id;

  const reservationDetails = searchResultsCache[listId]?.find(car => car.carId === parseInt(carId));

  if (reservationDetails) {
    try {
      const userResult = await pool.query('SELECT username, address, email FROM users_tbl WHERE id = $1', [userId]);
      const userInfo = userResult.rows[0];

      return res.status(200).json({
        ...reservationDetails,
        userName: userInfo.username,
        userAddress: userInfo.address,
        userEmail: userInfo.email
      });
    } catch (error) {
      console.error('Error fetching reservation details:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  } else {
    return res.status(404).json({ message: 'Reservation details not found' });
  }
});

// 予約確定エンドポイント
router.post('/reservation', authenticateToken, async (req, res) => {
  const { listId, carId } = req.body;
  const userId = req.user.id;
  const reservationDetails = searchResultsCache[listId]?.find(car => car.carId === parseInt(carId));

  if (reservationDetails) {
    const { departureDate, returnDate, price } = reservationDetails;

    try {
      const shopResult = await pool.query('SELECT shop_id FROM car_tbl WHERE id = $1', [carId]);
      const shopId = shopResult.rows[0].shop_id;
      let result = {}

      await pool.query('BEGIN');
      try {
        await pool.query('LOCK TABLE reservation_tbl IN EXCLUSIVE MODE');
        const duplicateCheckResult = await pool.query('SELECT * FROM reservation_tbl WHERE car_id = $1 AND (reservation_start_datetime, reservation_end_datetime) OVERLAPS ($2, $3)', [carId, departureDate, returnDate]);

        if (duplicateCheckResult.rows.length > 0) {
          throw new Error('Reservation conflict');
        }

        result = await pool.query(
          `INSERT INTO reservation_tbl (car_id, user_id, shop_id, reservation_start_datetime, reservation_end_datetime, price, create_user, update_user)
           VALUES ($1, $2, $3, $4, $5, $6, 'user', 'user') RETURNING id`,
          [carId, userId, shopId, departureDate, returnDate, price]
        );  
        await pool.query('COMMIT');
      } catch (error) {
        await pool.query('ROLLBACK');
        throw error;
      }

      return res.status(201).json({ message: 'Reservation confirmed', reservationId: result.rows[0].id });
    } catch (error) {
      console.error('Error confirming reservation:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  } else {
    return res.status(404).json({ message: 'Reservation details not found' });
  }
});

module.exports = router;
