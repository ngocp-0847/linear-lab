import { z } from "zod";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "màu phải dạng #rrggbb");

export const createCommentSchema = z.object({
  body: z.string().trim().min(1, "comment không được rỗng").max(50_000),
});
export type CreateCommentInput = z.infer<typeof createCommentSchema>;

export const createLabelSchema = z.object({
  name: z.string().trim().min(1).max(50),
  color: hexColor,
});
export type CreateLabelInput = z.infer<typeof createLabelSchema>;

export const PROJECT_STATUSES = ["planned", "active", "completed", "canceled"] as const;
export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(50_000).optional(),
  status: z.enum(PROJECT_STATUSES).default("planned"),
  targetDate: z.string().date().nullable().optional(),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const createCycleSchema = z
  .object({
    name: z.string().trim().min(1).max(200).nullable().optional(),
    startsAt: z.string().date(),
    endsAt: z.string().date(),
  })
  .refine((v) => v.startsAt < v.endsAt, {
    message: "startsAt phải trước endsAt",
    path: ["endsAt"],
  });
export type CreateCycleInput = z.infer<typeof createCycleSchema>;
