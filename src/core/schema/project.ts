import { z } from "zod";

import { transcriptMapSchema } from "./transcript-map.js";

function optionalFromNull<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((value) => (value === null ? undefined : value), schema.optional());
}

const isoDateTimeSchema = z
  .string()
  .datetime({ offset: true })
  .or(z.string().datetime());

export const nodePositionOverrideSchema = z.object({
  x: z.number(),
  y: z.number()
});

export const nodePositionOverridesSchema = z.record(nodePositionOverrideSchema);

export const projectSaveInputSchema = z.object({
  id: optionalFromNull(z.string().uuid()),
  transcript: z.string().trim().min(1),
  map: transcriptMapSchema,
  positionOverrides: nodePositionOverridesSchema.default({}),
  selectedNodeId: optionalFromNull(z.string().min(1))
});

export const projectSummarySchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200),
  summary: z.string().min(1).max(500),
  transcriptPreview: z.string().min(1).max(240),
  sectionCount: z.number().int().nonnegative(),
  nodeCount: z.number().int().nonnegative(),
  edgeCount: z.number().int().nonnegative(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema
});

export const savedProjectSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200),
  transcript: z.string().min(1),
  map: transcriptMapSchema,
  positionOverrides: nodePositionOverridesSchema,
  selectedNodeId: optionalFromNull(z.string().min(1)),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema
});

export type NodePositionOverride = z.infer<typeof nodePositionOverrideSchema>;
export type NodePositionOverrides = z.infer<typeof nodePositionOverridesSchema>;
export type ProjectSaveInput = z.infer<typeof projectSaveInputSchema>;
export type ProjectSummary = z.infer<typeof projectSummarySchema>;
export type SavedProject = z.infer<typeof savedProjectSchema>;

export function parseProjectSaveInput(input: unknown): ProjectSaveInput {
  return projectSaveInputSchema.parse(input);
}

export function parseProjectSummary(input: unknown): ProjectSummary {
  return projectSummarySchema.parse(input);
}

export function parseSavedProject(input: unknown): SavedProject {
  return savedProjectSchema.parse(input);
}
