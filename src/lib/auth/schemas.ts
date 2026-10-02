import { z } from "zod";

const email = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address"));

// Supabase (bcrypt) ignores bytes past 72, so cap there.
const newPassword = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(72, "Use at most 72 characters");

export const signupSchema = z.object({
  shopName: z
    .string()
    .trim()
    .min(1, "Enter your store name")
    .max(80, "Use at most 80 characters"),
  email,
  password: newPassword,
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password"),
});

export const resetRequestSchema = z.object({ email });

export const updatePasswordSchema = z
  .object({
    password: newPassword,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Passwords don't match",
    path: ["confirm"],
  });

export type FormState = {
  error?: string;
  message?: string;
  fieldErrors?: Partial<Record<string, string[]>>;
  /** Non-secret inputs echoed back so the form keeps them after an error. */
  values?: Partial<Record<string, string>>;
};
