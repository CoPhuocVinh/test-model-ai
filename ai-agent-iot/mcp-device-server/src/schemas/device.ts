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

export const deviceSchema = z.object({
  device_id: z.string(),
  name: z.string(),
  room: z.string(),
  type: z.string(),
  aliases: z.array(z.string()).optional(),
  online: z.boolean(),
  values: z.record(z.unknown()),
  capabilities: z.array(capabilitySchema),
  updated_at: z.string()
});

export type DeviceCapability = z.infer<typeof capabilitySchema>;
export type Device = z.infer<typeof deviceSchema>;
