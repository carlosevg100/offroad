import {z} from "zod";

export const anchorPrecisionSchema = z.enum(["cell", "row", "block", "page", "document"]);
export type AnchorPrecision = z.infer<typeof anchorPrecisionSchema>;
