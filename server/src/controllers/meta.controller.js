import { listTones } from '../services/tone.service.js';
import { databaseState } from '../db/connect.js';

export const createMetaController = ({ provider }) => ({
  health(_req, res) {
    const db = databaseState();
    res.status(db === 'connected' ? 200 : 503).json({
      status: db === 'connected' ? 'ok' : 'degraded',
      database: db,
      provider: provider.name,
      model: provider.model,
    });
  },
  tones(_req, res) {
    res.json({ tones: listTones() });
  },
});
