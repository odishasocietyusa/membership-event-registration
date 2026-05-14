import { z } from 'zod';

export const AccountSchema = z
  .object({
    email: z.string().email('Enter a valid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const PersonalInfoSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  phone: z
    .string()
    .regex(/^\+?[1-9]\d{1,14}$/, 'Enter a valid phone number (e.g. +12125551234)')
    .or(z.literal(''))
    .optional(),
  bio: z.string().max(500, 'Bio must be 500 characters or fewer').or(z.literal('')).optional(),
});

export const ChildSchema = z.object({
  name: z.string().min(1, 'Child name is required'),
  age: z
    .string()
    .regex(/^\d+$/, 'Age must be a number')
    .refine((v) => parseInt(v, 10) <= 25, 'Age must be 25 or under'),
  gender: z.enum(['M', 'F', 'Other'], { errorMap: () => ({ message: 'Select a gender' }) }),
});

export const FamilyInfoSchema = z.object({
  spouseName: z.string().or(z.literal('')).optional(),
  children: z.array(ChildSchema).max(10),
});

export const AddressSchema = z.object({
  street: z.string().min(1, 'Street is required'),
  city: z.string().min(1, 'City is required'),
  state: z.string().min(1, 'State is required'),
  zip: z.string().min(5, 'ZIP code is required').max(10),
  country: z.string().min(1, 'Country is required'),
});

export type AccountInput = z.infer<typeof AccountSchema>;
export type PersonalInfoInput = z.infer<typeof PersonalInfoSchema>;
export type ChildInput = z.infer<typeof ChildSchema>;
export type FamilyInfoInput = z.infer<typeof FamilyInfoSchema>;
export type AddressInput = z.infer<typeof AddressSchema>;
