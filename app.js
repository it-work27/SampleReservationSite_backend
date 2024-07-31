const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const expressWinston = require('express-winston');
const logger = require('./utils/logger');
const authRouter = require('./routers/authRouter');
const reservationRouter = require('./routers/reservationRouter');
const shopRouter = require('./routers/shopRouter');
const userRouter = require('./routers/userRouter');

const app = express();

app.use(cors({ origin: 'http://frontend:3000', credentials: true }));
app.use(bodyParser.json());
app.use(cookieParser());

app.use(expressWinston.logger({
  winstonInstance: logger,
  meta: false,
  msg: "HTTP {{req.method}} {{req.url}}",
  expressFormat: true,
  colorize: false,
  ignoreRoute: function (req, res) { return false; }
}));

app.use('/api', authRouter);
app.use('/api', reservationRouter);
app.use('/api', shopRouter);
app.use('/api/users', userRouter);

app.use(expressWinston.errorLogger({
  winstonInstance: logger
}));

app.use((err, req, res, next) => {
  logger.error(err.message);
  res.status(500).send('Internal server error');
});

module.exports = app;
