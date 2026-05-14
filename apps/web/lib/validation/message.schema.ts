import { z } from 'zod'

export const CreateMessageSchema = z.object({
  recipientMemberId: z.string().uuid(),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(10_000),
})
export type CreateMessageInput = z.infer<typeof CreateMessageSchema>

export const ListMessagesQuerySchema = z.object({
  type: z.enum(['sent', 'received']),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})
export type ListMessagesQuery = z.infer<typeof ListMessagesQuerySchema>
