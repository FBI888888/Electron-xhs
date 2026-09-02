import type { CollectionConcurrency } from './models'
import { z } from 'zod'

export const accountCreateSchema = z.object({
  remark: z.string().trim().min(1).max(80),
  cookies: z.string().trim().min(1),
  email: z.string().trim().optional(),
  password: z.string().optional()
})

export const accountUpdateSchema = z.object({
  remark: z.string().trim().min(1).max(80).optional(),
  cookies: z.string().trim().min(1).optional(),
  email: z.string().trim().optional(),
  password: z.string().optional(),
  clearCredentials: z.boolean().optional()
})

export const passwordLoginSchema = z.object({
  remark: z.string().trim().min(1).max(80),
  email: z.string().trim().min(1),
  password: z.string().min(1)
})

const concurrencySchema = z
  .number()
  .int()
  .min(1)
  .max(10)
  .transform((value) => value as CollectionConcurrency)

export const settingsSchema = z.object({
  schemaVersion: z.literal(1),
  output: z.object({
    filename: z.string().min(1),
    directory: z.string()
  }),
  performanceFields: z.array(z.string()),
  maxCount: z.number().int().positive().max(99999),
  concurrency: concurrencySchema,
  throttleMs: z.number().int().nonnegative().max(60000),
  splitFansProfile: z.boolean()
})

export const taskInputSchema = z.object({
  targets: z
    .array(
      z.object({
        userId: z.string().min(1),
        pgyUrl: z.string().url(),
        xhsUrl: z.string().url()
      })
    )
    .min(1),
  settings: settingsSchema
})

export const licenseKeySchema = z.string().trim().min(8).max(64)