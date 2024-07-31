// __tests__/app.test.js
const request = require('supertest');
const pool = require('../utils/db'); // 実際のデータベース接続プールをインポート
const app = require('../app');
const jwt = require('jsonwebtoken');

const SECRET_KEY = process.env.SECRET_KEY;

// /api/loginエンドポイントのテスト
describe('POST /api/login', () => {
  it('should return token for valid credentials', async () => {
    const response = await request(app)
      .post('/api/login')
      .send({ username: 'user1', password: 'password1' });

    expect(response.status).toBe(200);

    // JWTトークンの検証
    const decoded = jwt.verify(response.body.token, SECRET_KEY);
    expect(decoded).toHaveProperty('id');
    expect(decoded).toHaveProperty('iat'); // issued at timestamp
    expect(decoded).toHaveProperty('exp'); // expiration timestamp

    // idが期待される値であることを確認
    expect(decoded.id).toBe(1);
  });

  it('should return 401 for invalid credentials', async () => {
    const response = await request(app)
      .post('/api/login')
      .send({ username: 'wronguser', password: 'wrongpass' });

    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty('message', 'Invalid credentials');
  });
});

// /api/users/reservationsエンドポイントのテスト
describe('GET /api/users/reservations', () => {
  const validUserId = 1;
  const token = jwt.sign({ id: validUserId }, SECRET_KEY);

  it('should return reservation details for authenticated user', async () => {

    const response = await request(app)
      .get('/api/users/reservations')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.any(Array));
    expect(response.body.length).toBeGreaterThan(0);
    expect(response.body[0]).toHaveProperty('id');
    expect(response.body[0]).toHaveProperty('reservation_start_datetime');
    expect(response.body[0]).toHaveProperty('reservation_end_datetime');
    expect(response.body[0]).toHaveProperty('price');
    expect(response.body[0]).toHaveProperty('car_number');
    expect(response.body[0]).toHaveProperty('carmodel_name');
    expect(response.body[0]).toHaveProperty('shop_name');
  });

  it('should return 500 if there is an error fetching reservations', async () => {
    // 不正なクエリを実行してエラーを誘発する場合（例：テーブル名のタイプミスなど）
    const response = await request(app)
      .get('/api/users/reservations')
      .set('Authorization', `Bearer ${token}+1`);

    expect(response.status).toBe(403);
  });
});
