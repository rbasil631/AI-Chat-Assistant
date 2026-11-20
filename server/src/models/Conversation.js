import mongoose from 'mongoose';
import { TONE_IDS, DEFAULT_TONE } from '../services/tone.service.js';

export const EXCHANGE_STATUS = Object.freeze({
  STREAMING: 'streaming',
  COMPLETE: 'complete',
  STOPPED: 'stopped',
  ERROR: 'error',
});

/**
 * One prompt/response round trip. The prompt is written before generation
 * starts (status "streaming") so it survives a crash mid-response.
 */
const exchangeSchema = new mongoose.Schema(
  {
    prompt: { type: String, required: true },
    response: { type: String, default: '' },
    tone: { type: String, enum: TONE_IDS, required: true },
    status: { type: String, enum: Object.values(EXCHANGE_STATUS), default: EXCHANGE_STATUS.STREAMING },
    provider: String,
    model: String,
    usage: {
      inputTokens: Number,
      outputTokens: Number,
    },
    latencyMs: Number,
    error: String,
    regeneratedCount: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    completedAt: Date,
  },
  { _id: true },
);

const conversationSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    tone: { type: String, enum: TONE_IDS, default: DEFAULT_TONE },
    exchanges: { type: [exchangeSchema], default: [] },
  },
  { timestamps: true },
);

conversationSchema.index({ updatedAt: -1, _id: -1 });

const toClient = (_doc, ret) => {
  ret.id = String(ret._id);
  delete ret._id;
  delete ret.__v;
  if (Array.isArray(ret.exchanges)) {
    ret.exchanges = ret.exchanges.map(({ _id, ...rest }) => ({ id: String(_id), ...rest }));
  }
  return ret;
};
conversationSchema.set('toJSON', { transform: toClient });

export const Conversation = mongoose.models.Conversation ?? mongoose.model('Conversation', conversationSchema);

export function serializeExchange(exchange) {
  const obj = typeof exchange.toObject === 'function' ? exchange.toObject() : exchange;
  const { _id, ...rest } = obj;
  return { id: String(_id), ...rest };
}
