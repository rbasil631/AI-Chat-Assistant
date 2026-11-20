import { z } from 'zod';

export const searchSchemas = {
  search: {
    query: z.object({
      q: z.string().trim().min(2, 'Search needs at least 2 characters').max(100, 'Search is too long'),
      limit: z.coerce.number().int().min(1).max(50).default(20),
    }),
  },
};
