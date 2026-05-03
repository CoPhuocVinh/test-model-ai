import { z } from "zod";

export const capabilitySchema = z.object({
  property: z.string(),
  type: z.enum(["boolean", "number", "enum", "string"]),
  writable: z.boolean(),
  min: z.number().optional(),
  max: z.number().optional(),
  unit: z.string().optional(),
  values: z.array(z.union([z.string(), z.number(), z.boolean()])).optional()
});

export const deviceSummarySchema = z.object({
  device_id: z.string(),
  name: z.string(),
  room: z.string(),
  type: z.string(),
  online: z.boolean()
});

export const deviceStateSchema = deviceSummarySchema.extend({
  values: z.record(z.unknown()),
  updated_at: z.string()
});

export type DeviceCapability = z.infer<typeof capabilitySchema>;
export type DeviceSummary = z.infer<typeof deviceSummarySchema>;
export type DeviceState = z.infer<typeof deviceStateSchema>;
