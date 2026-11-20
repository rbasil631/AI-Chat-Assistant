import { searchConversations } from '../services/search.service.js';

export const searchController = {
  async search(req, res) {
    const { q, limit } = req.valid.query;
    res.json({ query: q, results: await searchConversations(q, { limit }) });
  },
};
