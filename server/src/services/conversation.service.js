import { Conversation } from '../models/Conversation.js';
import { notFound } from '../utils/httpError.js';

const PREVIEW_CHARS = 90;

/** Thread summaries for the history sidebar, newest first, cursor-paginated. */
export async function listConversations({ limit, before }) {
  const match = before ? { updatedAt: { $lt: before } } : {};
  const rows = await Conversation.aggregate([
    { $match: match },
    { $sort: { updatedAt: -1, _id: -1 } },
    { $limit: limit + 1 },
    {
      $project: {
        title: 1,
        tone: 1,
        createdAt: 1,
        updatedAt: 1,
        exchangeCount: { $size: '$exchanges' },
        lastPrompt: { $ifNull: [{ $arrayElemAt: ['$exchanges.prompt', -1] }, ''] },
      },
    },
  ]);

  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map(({ _id, lastPrompt, ...rest }) => ({
    id: String(_id),
    ...rest,
    preview: lastPrompt.length > PREVIEW_CHARS ? `${lastPrompt.slice(0, PREVIEW_CHARS).trimEnd()}…` : lastPrompt,
  }));
  return { items, nextCursor: hasMore ? items[items.length - 1].updatedAt.toISOString() : null };
}

export async function getConversation(id) {
  const conversation = await Conversation.findById(id);
  if (!conversation) throw notFound('Conversation not found.', 'CONVERSATION_NOT_FOUND');
  return conversation.toJSON();
}

export async function renameConversation(id, title) {
  const conversation = await Conversation.findByIdAndUpdate(id, { $set: { title } }, { new: true, runValidators: true });
  if (!conversation) throw notFound('Conversation not found.', 'CONVERSATION_NOT_FOUND');
  return { id: String(conversation._id), title: conversation.title, updatedAt: conversation.updatedAt };
}

export async function deleteConversation(id) {
  const res = await Conversation.deleteOne({ _id: id });
  if (res.deletedCount === 0) throw notFound('Conversation not found.', 'CONVERSATION_NOT_FOUND');
}
