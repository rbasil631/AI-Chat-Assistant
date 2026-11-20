import { openSse } from '../utils/sse.js';

/**
 * Bridges the chat service to Server-Sent Events.
 * Event order: meta -> delta* -> (done | error).
 * Closing the connection (client "Stop") aborts generation; the partial answer is kept.
 */
export function createChatController(chatService) {
  async function stream(res, prepared) {
    const { conversation, exchange, isNewConversation } = prepared;
    const controller = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) controller.abort();
    });

    const sse = openSse(res);
    sse.send('meta', {
      conversation: { id: String(conversation._id), title: conversation.title, tone: conversation.tone, updatedAt: conversation.updatedAt },
      exchange: { id: String(exchange._id), prompt: exchange.prompt, tone: exchange.tone, status: exchange.status, createdAt: exchange.createdAt },
      isNewConversation,
    });

    try {
      await chatService.runExchange({ conversation, exchange, signal: controller.signal, emit: sse.send });
    } catch (err) {
      console.error('[chat] stream failure:', err);
      sse.send('error', { message: 'Something went wrong while saving the response.' });
    } finally {
      sse.close();
    }
  }

  return {
    async sendMessage(req, res) {
      const { conversationId, prompt, tone } = req.valid.body;
      const prepared = await chatService.prepareMessage({ conversationId, prompt, tone });
      await stream(res, prepared);
    },

    async regenerate(req, res) {
      const { id, exchangeId } = req.valid.params;
      const prepared = await chatService.prepareRegenerate({ conversationId: id, exchangeId, tone: req.valid.body.tone });
      await stream(res, prepared);
    },
  };
}
