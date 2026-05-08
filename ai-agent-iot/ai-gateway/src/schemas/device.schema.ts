import { z } from "zod";

export const backendDeviceSchema = z.object({
  id: z.number(),
  userId: z.number().nullable().optional(),
  name: z.string(),
  model: z.string().nullable().optional(),
  firmwareVersion: z.string().nullable().optional(),
  type: z.string(),
  typeLabel: z.string().nullable().optional(),
  status: z.string(),
  value: z.string(),
  prevalue: z.string().nullable().optional(),
  isOn: z.union([z.number(), z.boolean()]).nullable().optional(),
  roomId: z.union([z.number(), z.string()]).nullable().optional(),
  lastUpdate: z.string().nullable().optional(),
  statusLastDate: z.string().nullable().optional(),
  statusTimeout: z.number().nullable().optional(),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
  code: z.string(),
  inputConfig: z.string().nullable().optional()
}).passthrough();

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
  online: z.boolean(),
  raw: backendDeviceSchema.optional()
});

export const deviceStateSchema = deviceSummarySchema.extend({
  values: z.record(z.unknown()),
  updated_at: z.string()
});

export type BackendDevice = z.infer<typeof backendDeviceSchema>;
export type DeviceCapability = z.infer<typeof capabilitySchema>;
export type DeviceSummary = z.infer<typeof deviceSummarySchema>;
export type DeviceState = z.infer<typeof deviceStateSchema>;
