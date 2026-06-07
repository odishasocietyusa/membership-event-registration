import { z } from 'zod'

export const CreateCommentSchema = z.object({
  body: z.string().min(1, 'Comment cannot be empty').max(500, 'Comment must be 500 characters or fewer'),
})

export type CreateCommentInput = z.infer<typeof CreateCommentSchema>
