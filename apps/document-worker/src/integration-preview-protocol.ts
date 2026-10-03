import {z} from "zod";
const uuid=z.uuid(),hash=z.string().regex(/^[a-f0-9]{64}$/),time=z.iso.datetime({offset:true});
export const capitalBodyRetentionReceiptSchema=z.strictObject({schemaVersion:z.literal("capital-retained-body.v1"),retentionState:z.enum(["allocated","retained"]),
 allocationId:uuid,retainedPayloadId:uuid.nullable(),bodyBasisId:uuid,bucket:z.literal("capital-input-capture"),
 path:z.string().regex(/^[a-f0-9-]{36}\/[a-f0-9-]{36}\/payload\.json$/),payloadFingerprint:hash,
 byteLength:z.number().int().positive().max(1048576),storageObjectId:uuid.nullable(),storageVersion:z.string().min(1).nullable(),
 retainedAt:time,uploadExpiresAt:time,expiresAt:time,purgeAt:time,replayed:z.boolean()});
