import mongoose from 'mongoose';
import { z } from 'zod';
import { TONE_IDS } from '../services/tone.service.js';

const objectId = (label) =>
  z.string().refine((v) => mongoose.isValidObjectId(v) && /^[a-f\d]{24}$/i.test(v), { message: `Invalid ${label}` });

const tone = z.enum(TONE_IDS, { errorMap: () => ({ message: `Tone must be one of: ${TONE_IDS.join(', ')}` }) });

export const makeChatSchemas = ({ maxPromptChars }) => ({
  sendMessage: {
    body: z.object({
      conversationId: objectId('conversation id').optional().nullable(),
      prompt: z
        .string({ required_error: 'Message is required' })
        .trim()
        .min(1, 'Message cannot be empty')
        .max(maxPromptChars, `Message is too long (max ${maxPromptChars} characters)`),
      tone,
    }),
  },
  regenerate: {
    params: z.object({ id: objectId('conversation id'), exchangeId: objectId('message id') }),
    body: z.object({ tone: tone.optional() }).default({}),
  },
});

export const conversationSchemas = {
  list: {
    query: z.object({
      limit: z.coerce.number().int().min(1).max(100).default(30),
      before: z.coerce.date().optional(),
    }),
  },
  byId: { params: z.object({ id: objectId('conversation id') }) },
  rename: {
    params: z.object({ id: objectId('conversation id') }),
    body: z.object({ title: z.string().trim().min(1, 'Title cannot be empty').max(120, 'Title is too long (max 120 characters)') }),
  },
};
