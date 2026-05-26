import mongoose from 'mongoose';

const LockSchema = new mongoose.Schema({
  number: {
    type: Number,
    required: true,
  },
  countryid: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },
  serviceid: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },
  locked: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true
});

// TTL index - auto-expire locks after 24 hours
LockSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400, name: 'createdAt_ttl' });

// Compound index for lock lookups in PHP API
LockSchema.index({ number: 1, countryid: 1, serviceid: 1, locked: 1 }, { name: 'lookup_idx' });

const Orders = mongoose.models.Lock || mongoose.model('Lock', LockSchema);

export default Orders;
