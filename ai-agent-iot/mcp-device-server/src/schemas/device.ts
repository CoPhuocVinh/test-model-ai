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

export const backendDeviceListResponseSchema = z.object({
  total: z.number(),
  limit: z.number(),
  skip: z.number(),
  data: z.array(backendDeviceSchema)
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

export const deviceSchema = z.object({
  device_id: z.string(),
  name: z.string(),
  room: z.string(),
  type: z.string(),
  aliases: z.array(z.string()).optional(),
  online: z.boolean(),
  values: z.record(z.unknown()),
  capabilities: z.array(capabilitySchema),
  updated_at: z.string(),
  raw: backendDeviceSchema.optional()
});

export type BackendDevice = z.infer<typeof backendDeviceSchema>;
export type BackendDeviceListResponse = z.infer<typeof backendDeviceListResponseSchema>;
export type DeviceCapability = z.infer<typeof capabilitySchema>;
export type Device = z.infer<typeof deviceSchema>;
