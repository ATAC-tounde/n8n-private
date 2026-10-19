import { z } from 'zod';

import { n8nIdSchema } from '../../schemas/id.schema';
import { Z } from '../../zod-class';

/**
 * The state of a Promotion Review. `open` and `changes_requested` mirror the
 * review on the host. `merged` and `closed` are terminal and owned by n8n.
 */
export const promotionReviewStateSchema = z.enum(['open', 'changes_requested', 'merged', 'closed']);
export type PromotionReviewState = z.infer<typeof promotionReviewStateSchema>;

/**
 * Where the review lives. The application checks this value. The database does not.
 */
export const promotionReviewTypeSchema = z.enum(['gitlab']);
export type PromotionReviewType = z.infer<typeof promotionReviewTypeSchema>;

/**
 * Host reference for each review type. Code selects the schema from the type
 * column. GitLab stores `<projectId>!<iid>`. The type column names the host.
 */
export const gitLabRemoteReviewIdSchema = z.string().regex(/^\d+!\d+$/);

export const promotionRemoteReviewIdSchemas = {
	gitlab: gitLabRemoteReviewIdSchema,
} as const;

/** Parse a host reference with the schema for `type`. */
export function parseRemoteReviewId<T extends PromotionReviewType>(
	type: T,
	remoteReviewId: string,
): z.infer<(typeof promotionRemoteReviewIdSchemas)[T]> {
	return promotionRemoteReviewIdSchemas[type].parse(remoteReviewId);
}

const reviewUserSchema = z.object({
	id: z.string(),
	firstName: z.string().nullable(),
	lastName: z.string().nullable(),
	email: z.string().nullable(),
});

/** What the host reports about the review. NULL when the host did not answer. */
const promotionReviewRemoteSchema = z.object({
	title: z.string(),
	webUrl: z.string(),
	hasConflicts: z.boolean(),
});
export type PromotionReviewRemote = z.infer<typeof promotionReviewRemoteSchema>;

/**
 * Why `remote` is NULL. Computed for each request and never stored. `no_connection`
 * means the connection was deleted or its provider no longer matches the review type.
 */
export const promotionReviewRemoteErrorSchema = z.enum([
	'not_found',
	'auth',
	'unreachable',
	'no_connection',
]);
export type PromotionReviewRemoteError = z.infer<typeof promotionReviewRemoteErrorSchema>;

export const promotionReviewSummarySchema = z.object({
	id: n8nIdSchema,
	state: promotionReviewStateSchema,
	/** Host reference for the review type. GitLab stores `<projectId>!<iid>`. NULL when the review lives in n8n. */
	remoteReviewId: z.string().nullable(),
	connection: z.object({ id: n8nIdSchema, name: z.string() }).nullable(),
	createdBy: reviewUserSchema.nullable(),
	approvedBy: reviewUserSchema.nullable(),
	createdAt: z.string().datetime(),
	approvedAt: z.string().datetime().nullable(),
	/** Time of the latest state change. NULL until the first change. */
	lastStateChangeAt: z.string().datetime().nullable(),
	remote: promotionReviewRemoteSchema.nullable(),
	remoteError: promotionReviewRemoteErrorSchema.nullable(),
});
export type PromotionReviewSummary = z.infer<typeof promotionReviewSummarySchema>;

export const promotionReviewDetailSchema = promotionReviewSummarySchema.extend({
	config: z.object({ id: n8nIdSchema, name: z.string() }).nullable(),
	branchName: z.string().nullable(),
	headCommitSha: z.string().nullable(),
});
export type PromotionReviewDetail = z.infer<typeof promotionReviewDetailSchema>;
export class PromotionReviewDetailDto extends Z.class(promotionReviewDetailSchema.shape) {}

/** The merge request a Promote opened, as returned with the promote result. */
export const promotionMergeRequestResultSchema = z.object({
	reviewId: n8nIdSchema,
	iid: z.number().int(),
	webUrl: z.string(),
});
export type PromotionMergeRequestResult = z.infer<typeof promotionMergeRequestResultSchema>;
