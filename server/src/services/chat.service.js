import mongoose from 'mongoose';
import { Conversation, EXCHANGE_STATUS, serializeExchange } from '../models/Conversation.js';
import { buildSystemPrompt, getGenerationParams } from './tone.service.js';
import { buildMessageHistory } from './context.service.js';
import { deriveTitle } from './title.service.js';
import { toUserFacingError } from './llm/index.js';
import { conflict, notFound, unprocessable } from '../utils/httpError.js';

const isAbort = (err, signal) =>
  signal?.aborted || err?.name === 'AbortError' || err?.name === 'APIUserAbortError';

/**
 * Chat orchestration. Split into two phases so the HTTP layer can return a
 * normal JSON error (404/409/422) before it commits to an SSE stream:
 *   1. prepare*()  — validate state and persist the pending exchange
 *   2. runExchange() — stream from the provider and persist the outcome
 */
export function createChatService({ provider, chatConfig, llmConfig, logger = console }) {
  /** Mark exchanges stuck in "streaming" (e.g. after a server crash) as errored. */
  async function releaseStaleStreams(conversationId) {
    const cutoff = new Date(Date.now() - chatConfig.staleStreamMs);
    await Conversation.updateOne(
      { _id: conversationId },
      {
        $set: {
          'exchanges.$[s].status': EXCHANGE_STATUS.ERROR,
          'exchanges.$[s].error': 'Generation was interrupted.',
        },
      },
      { arrayFilters: [{ 's.status': EXCHANGE_STATUS.STREAMING, 's.createdAt': { $lt: cutoff } }] },
    );
  }

  async function prepareMessage({ conversationId, prompt, tone }) {
    const exchange = { _id: new mongoose.Types.ObjectId(), prompt, tone, status: EXCHANGE_STATUS.STREAMING, createdAt: new Date() };

    if (!conversationId) {
      const conversation = await Conversation.create({ title: deriveTitle(prompt), tone, exchanges: [exchange] });
      return { conversation, exchange: conversation.exchanges[0], isNewConversation: true };
    }

    await releaseStaleStreams(conversationId);
    const cap = chatConfig.maxExchangesPerConversation;
    // Atomic guard: only append when nothing is streaming and the cap isn't reached.
    const conversation = await Conversation.findOneAndUpdate(
      {
        _id: conversationId,
        'exchanges.status': { $ne: EXCHANGE_STATUS.STREAMING },
        [`exchanges.${cap - 1}`]: { $exists: false },
      },
      { $push: { exchanges: exchange }, $set: { tone } },
      { new: true },
    );

    if (!conversation) {
      const existing = await Conversation.findById(conversationId, { 'exchanges.status': 1 }).lean();
      if (!existing) throw notFound('Conversation not found.', 'CONVERSATION_NOT_FOUND');
      if (existing.exchanges.length >= cap) {
        throw unprocessable('This conversation is full. Start a new conversation to continue.', 'CONVERSATION_FULL');
      }
      throw conflict('A response is already being generated in this conversation.', 'STREAM_IN_PROGRESS');
    }
    return { conversation, exchange: conversation.exchanges.id(exchange._id), isNewConversation: false };
  }

  async function prepareRegenerate({ conversationId, exchangeId, tone }) {
    await releaseStaleStreams(conversationId);
    const existing = await Conversation.findById(conversationId);
    if (!existing) throw notFound('Conversation not found.', 'CONVERSATION_NOT_FOUND');

    const target = existing.exchanges.id(exchangeId);
    if (!target) throw notFound('Message not found.', 'EXCHANGE_NOT_FOUND');
    const last = existing.exchanges[existing.exchanges.length - 1];
    if (!last._id.equals(target._id)) {
      throw unprocessable('Only the latest response can be regenerated.', 'NOT_LATEST_EXCHANGE');
    }
    if (target.status === EXCHANGE_STATUS.STREAMING) {
      throw conflict('A response is already being generated in this conversation.', 'STREAM_IN_PROGRESS');
    }

    const nextTone = tone ?? target.tone;
    const conversation = await Conversation.findOneAndUpdate(
      { _id: conversationId, exchanges: { $elemMatch: { _id: target._id, status: { $ne: EXCHANGE_STATUS.STREAMING } } } },
      {
        $set: {
          tone: nextTone,
          'exchanges.$.tone': nextTone,
          'exchanges.$.response': '',
          'exchanges.$.status': EXCHANGE_STATUS.STREAMING,
          'exchanges.$.createdAt': new Date(),
        },
        $unset: { 'exchanges.$.error': '', 'exchanges.$.completedAt': '', 'exchanges.$.usage': '', 'exchanges.$.latencyMs': '' },
        $inc: { 'exchanges.$.regeneratedCount': 1 },
      },
      { new: true },
    );
    if (!conversation) throw conflict('A response is already being generated in this conversation.', 'STREAM_IN_PROGRESS');
    return { conversation, exchange: conversation.exchanges.id(target._id), isNewConversation: false };
  }

  /**
   * Stream the provider's answer for a prepared exchange.
   * emit(event, data) receives: 'delta' {text}, then 'done' {exchange} or 'error' {message, exchange}.
   */
  async function runExchange({ conversation, exchange, signal, emit }) {
    const index = conversation.exchanges.findIndex((e) => e._id.equals(exchange._id));
    const history = buildMessageHistory(conversation.exchanges.slice(0, index), {
      maxExchanges: chatConfig.contextExchanges,
      charBudget: chatConfig.contextCharBudget,
    });
    const messages = [...history, { role: 'user', content: exchange.prompt }];
    const params = getGenerationParams(exchange.tone, llmConfig.maxTokens);

    const startedAt = Date.now();
    let response = '';
    let model = provider.model;
    let usage;
    let status = EXCHANGE_STATUS.COMPLETE;
    let errorMessage;

    try {
      for await (const chunk of provider.stream({
        system: buildSystemPrompt(exchange.tone),
        messages,
        temperature: params.temperature,
        maxTokens: params.maxTokens,
        signal,
      })) {
        if (chunk.type === 'delta' && chunk.text) {
          response += chunk.text;
          emit('delta', { text: chunk.text });
        } else if (chunk.type === 'done') {
          model = chunk.model ?? model;
          usage = chunk.usage;
        }
      }
      if (signal?.aborted) status = EXCHANGE_STATUS.STOPPED;
    } catch (err) {
      if (isAbort(err, signal)) {
        status = EXCHANGE_STATUS.STOPPED;
      } else {
        status = EXCHANGE_STATUS.ERROR;
        errorMessage = toUserFacingError(err);
        logger.error?.('[chat] provider error:', err?.message ?? err);
      }
    }

    const update = {
      'exchanges.$.response': response,
      'exchanges.$.status': status,
      'exchanges.$.provider': provider.name,
      'exchanges.$.model': model,
      'exchanges.$.latencyMs': Date.now() - startedAt,
      'exchanges.$.completedAt': new Date(),
    };
    if (usage) update['exchanges.$.usage'] = usage;
    if (errorMessage) update['exchanges.$.error'] = errorMessage;

    const saved = await Conversation.findOneAndUpdate(
      { _id: conversation._id, 'exchanges._id': exchange._id },
      { $set: update },
      { new: true },
    );
    const savedExchange = serializeExchange(saved.exchanges.id(exchange._id));

    if (status === EXCHANGE_STATUS.ERROR) emit('error', { message: errorMessage, exchange: savedExchange });
    else emit('done', { exchange: savedExchange });
    return savedExchange;
  }

  /** Called on boot: anything left "streaming" by a previous process is dead. */
  async function recoverInterruptedStreams() {
    const res = await Conversation.updateMany(
      { 'exchanges.status': EXCHANGE_STATUS.STREAMING },
      { $set: { 'exchanges.$[s].status': EXCHANGE_STATUS.ERROR, 'exchanges.$[s].error': 'Generation was interrupted.' } },
      { arrayFilters: [{ 's.status': EXCHANGE_STATUS.STREAMING }] },
    );
    return res.modifiedCount;
  }

  return { prepareMessage, prepareRegenerate, runExchange, recoverInterruptedStreams };
}
