// backend/server.js
const express = require('express');
const cors = require('cors');
const pool = require('./utils/db');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const winston = require('winston');
const expressWinston = require('express-winston');
const validateDateMiddleware = require('./validation')

const app = express();

const SECRET_KEY = process.env.SECRET_KEY;

const searchResultsCache = {};

// Winstonの設定
const logger = winston.createLogger({
  level: 'info', // ログレベル
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(), // コンソールにログを出力
    new winston.transports.File({ filename: 'combined.log' }) // ファイルにログを出力
  ]
});

app.use(cors({ origin: 'http://frontend:3000', credentials: true }));
app.use(bodyParser.json());
app.use(cookieParser());

// リクエストロギングのミドルウェア
app.use(expressWinston.logger({
  winstonInstance: logger,
  meta: false, // メタデータを含めるか
  msg: "HTTP {{req.method}} {{req.url}}", // ログメッセージのフォーマット
  expressFormat: true, // Express形式のログにする
  colorize: false, // ログをカラー表示するか
  ignoreRoute: function (req, res) { return false; } // ログを無視するルートを定義
}));

// エラーロギングのミドルウェア
app.use(expressWinston.errorLogger({
  winstonInstance: logger
}));

// エラーハンドラ
app.use((err, req, res, next) => {
  logger.error(err.message); // エラーログの記録
  res.status(500).send('Something broke!');
});

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.sendStatus(401);

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// トークン検証エンドポイント
app.get('/api/verify-token',authenticateToken, (req, res) => {
  return res.sendStatus(200);
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  try {
      const result = await pool.query('SELECT * FROM users_tbl WHERE username = $1 AND password = $2', [username, password]);
      const user = result.rows[0];

      // 検索してヒットしたら認証
    if (result.rows.length === 1) {    
        // tokenの発行。cookieにtokenとして登録
        const token = jwt.sign({ id: user.id }, SECRET_KEY, { expiresIn: '1h' });
        res.cookie('token', token, { httpOnly: true });
        return res.status(200).json({ token });
    } else {
        return res.status(401).json({ message: 'Invalid credentials' });
    }
  } catch (error) {
    console.error('Error during login:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ログアウトエンドポイント
app.post('/api/logout', (req, res) => {
  res.clearCookie('token');
  return res.status(200).json({ message: 'Logout successful' });
});

// 店舗名取得エンドポイント
app.get('/api/shops' ,async (req, res) => {
  try {
    const result = await pool.query('SELECT id, shop_name FROM shop_mst');
    return res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error during database query:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// 車種名取得エンドポイント
app.get('/api/carmodels', async (req, res) => {
  console.log('/api/carmodels');
  try {
    const result = await pool.query('SELECT id, carmodel_name FROM car_model_mst');
    return res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error during database query:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// 検索エンドポイント
app.post('/api/search/cars', validateDateMiddleware, async (req, res) => {
  console.log('/api/search/cars');
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
app.get('/api/reservation/:listId/:carId',authenticateToken, async (req, res) => {
  console.log('/api/reservation/:listId/:carId');
  const { listId, carId } = req.params;

  const userId = req.user.id;

  // 予約確認画面に表示するためのデータを検索APIから取得した結果から取得
  const reservationDetails = searchResultsCache[listId]?.find(car => car.carId === parseInt(carId));

  if (reservationDetails) {
    try {

      console.log(userId);
      // ユーザ情報を取得
      const userResult = await pool.query('SELECT username, address, email FROM users_tbl WHERE id = $1', [userId]);
      const userInfo = userResult.rows[0];
      console.log( userResult.rowCount)

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
app.post('/api/reservation', authenticateToken, async (req, res) => {
  console.log('/api/reservation/');
  const { listId, carId, userId } = req.body;
  const reservationDetails = searchResultsCache[listId]?.find(car => car.carId === parseInt(carId));

  if (reservationDetails) {
    const { departureDate, returnDate, price } = reservationDetails;

    try {
      // carIdからshopIdを取得
      const shopResult = await pool.query('SELECT shop_id FROM car_tbl WHERE id = $1', [carId]);
      const shopId = shopResult.rows[0].shop_id;
      let result = {}

      // PostgreSQLを例に
      await pool.query('BEGIN'); // トランザクションを開始


      try {

        await pool.query('LOCK TABLE reservation_tbl IN EXCLUSIVE MODE');

        // 予約の重複をチェック
        const duplicateCheckResult = await pool.query('SELECT * FROM reservation_tbl WHERE car_id = $1 AND (reservation_start_datetime, reservation_end_datetime) OVERLAPS ($2, $3)', [carId, departureDate, returnDate]);

        if (duplicateCheckResult.rows.length > 0) {
          throw new Error('Reservation conflict');
        }

        // 予約を挿入
        result = await pool.query(
          `INSERT INTO reservation_tbl (car_id, user_id, shop_id, reservation_start_datetime, reservation_end_datetime, price, create_user, update_user)
           VALUES ($1, $2, $3, $4, $5, $6, 'user', 'user') RETURNING id`,
          [carId, userId, shopId, departureDate, returnDate, price]
        );  
        await pool.query('COMMIT'); // トランザクションをコミット
      } catch (error) {
        await pool.query('ROLLBACK'); // エラー発生時にロールバック
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


// ユーザーの予約情報取得エンドポイント
app.get('/api/users/reservations',authenticateToken, async (req, res) => {
  console.log('/api/users/reservations');
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
       WHERE r.user_id = $1`,
      [userId]
    );

    return res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error fetching user reservations:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// 予約確認エンドポイント
app.get('/api/users/reservations/:id', async (req, res) => {
  console.log('/api/users/reservations/:id');

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




module.exports = app;
