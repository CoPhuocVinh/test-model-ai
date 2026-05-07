import { z } from "zod";

export const deviceQuerySchema = z.object({
  raw: z.string().optional(),
  name: z.string().optional(),
  room: z.string().optional(),
  type: z.string().optional()
});

export const actionSchema = z.object({
  property: z.string(),
  operation: z.enum(["set", "add", "subtract"]).default("set"),
  value: z.unknown()
});

export const parsedIntentSchema = z.object({
  intent: z.enum([
    "read_device_state",
    "write_device_value",
    "search_devices",
    "out_of_scope",
    "harmful_intent",
    "clarification_needed",
    "unsupported"
  ]),
  device_query: deviceQuerySchema.default({}),
  property: z.string().nullable().optional(),
  action: actionSchema.nullable().optional(),
  confidence: z.number().min(0).max(1).default(0.5)
});

export type ParsedIntent = z.infer<typeof parsedIntentSchema>;
export type DeviceQuery = z.infer<typeof deviceQuerySchema>;
export type DeviceAction = z.infer<typeof actionSchema>;
