import {z} from 'zod';
import {SOCKET_RESERVED_EVENTS} from '../constants/socket.js';

export const getSourceSchema = z.object({
  source: z.string('Kaynak gereklidir').trim().min(1, 'Kaynak boş olamaz'),
});

const roomField = z.string().min(1);

export const relayCommandSchema = z
  .object({
    rooms: z.union([roomField, z.array(roomField).min(1)]),
    event: z
      .string()
      .min(1)
      .refine(name => !SOCKET_RESERVED_EVENTS.includes(name)),
    args: z.array(z.unknown()).default([]),
  })
  .strict();
