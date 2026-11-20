import { useEffect, useState } from 'react';
import { api } from '../api/http.js';

/** Tone presets come from the server; the client never hard-codes them. */
export function useTones() {
  const [tones, setTones] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    api.tones()
      .then((data) => alive && setTones(data.tones))
      .catch((err) => alive && setError(err.message));
    return () => { alive = false; };
  }, []);

  const defaultTone = tones.find((t) => t.isDefault)?.id ?? tones[0]?.id ?? null;
  return { tones, defaultTone, error };
}
