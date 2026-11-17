import {z} from 'zod';
import {emailField, jwtField} from './common.js';

export const loginSchema = z.object({
  email: emailField,
  password: z.string('Parola gereklidir').min(1, 'Parola boş olamaz'),
});

export const refreshSchema = z.object({
  refreshToken: jwtField,
});
