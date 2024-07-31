// utils/validation.js
const isValidDate = (departureDate,returnDate) => {
    const departureD = new Date(departureDate);
    const returnD = new Date(returnDate);

    // 現在の日付
    const today = new Date();
    today.setHours(0, 0, 0, 0); // 時間部分をクリア
    // 開始日と返却日が正しい日付かどうかチェック
    if (isNaN(departureD.getTime()) || isNaN(returnD.getTime())) {
        return { isValid: false, message: 'The date is invalid' };
    }

  // 開始日と返却日が現在日付以上かどうかチェック
  if (departureD < today || returnD < today) {
    return { isValid: false, message: 'The date must be today or later' };
  }

  // 返却日が開始日以上かどうかチェック
  if (returnD < departureD) {
    return { isValid: false, message: 'The return date must be after the departure date' };
  }

  // 全てのチェックをパスした場合
  return { isValid: true };
} 

const validateDateMiddleware = (req, res, next) => {
  const {departureDate, returnDate } = req.body;

  const validation = isValidDate(departureDate,returnDate);
  
  if ((departureDate && returnDate) && !validation.isValid) {
    return res.status(400).json(validation.message);
  }

  next();
}

module.exports = { validateDateMiddleware };

