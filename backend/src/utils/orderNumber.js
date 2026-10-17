const crypto = require('crypto');
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function istDateString(date = new Date()) {
  // en-CA gives YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(date)
    .replace(/-/g, '');
}

function generateOrderNumber(date = new Date()) {
  let suffix = '';
  for (let i = 0; i < 4; i += 1) suffix += CHARS[crypto.randomInt(CHARS.length)];
  return `SE-${istDateString(date)}-${suffix}`;
}
module.exports = { generateOrderNumber, istDateString };
