import * as conversations from '../services/conversation.service.js';

export const conversationController = {
  async list(req, res) {
    res.json(await conversations.listConversations(req.valid.query));
  },
  async get(req, res) {
    res.json(await conversations.getConversation(req.valid.params.id));
  },
  async rename(req, res) {
    res.json(await conversations.renameConversation(req.valid.params.id, req.valid.body.title));
  },
  async remove(req, res) {
    await conversations.deleteConversation(req.valid.params.id);
    res.status(204).end();
  },
};
