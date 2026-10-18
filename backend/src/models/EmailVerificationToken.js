const mongoose = require('mongoose');

// ONC-001: only the SHA-256 hash of the emailed token is stored. MongoDB removes documents after expiry (TTL).
const schema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('EmailVerificationToken', schema);
