import { z } from "zod";

export const TrackQuerySchema = z
  .object({
    appleMusicId: z.string().trim().min(1).max(256).optional(),
    title: z.string().trim().min(1).max(512),
    artist: z.string().trim().min(1).max(512),
    album: z.string().trim().max(512),
    durationMs: z.number().finite().positive().max(24 * 60 * 60 * 1000).optional(),
    isrc: z
      .string()
      .trim()
      .regex(/^[A-Z]{2}-?[A-Z0-9]{3}-?\d{2}-?\d{5}$/i)
      .optional(),
  })
  .strict();

export const SearchRequestSchema = z
  .object({
    track: TrackQuerySchema,
    query: z.string().trim().min(1).max(1024).optional(),
  })
  .strict();

export const NeteaseIdSchema = z.string().regex(/^\d{1,20}$/);

export type SearchRequest = z.infer<typeof SearchRequestSchema>;
