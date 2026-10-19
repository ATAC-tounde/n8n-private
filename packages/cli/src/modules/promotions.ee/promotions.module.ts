import { LICENSE_FEATURES } from '@n8n/constants';
import type { ModuleInterface } from '@n8n/decorators';
import { BackendModule } from '@n8n/decorators';
import { Container } from '@n8n/di';

@BackendModule({
	name: 'promotions',
	// The entitlement is unchanged; only the module name moved.
	licenseFlag: LICENSE_FEATURES.GIT_CONNECTIONS,
	instanceTypes: ['main'],
})
export class PromotionsModule implements ModuleInterface {
	async init() {
		await import('./promotion-changes.controller.js');

		const { PromotionsService } = await import('./promotions.service.js');
		Container.get(PromotionsService);

		const { InboxSourceRegistry } = await import('../inbox/inbox-source.registry.js');
		const { PromotionReviewInboxService } = await import('./promotion-review-inbox.service.js');
		const reviews = Container.get(PromotionReviewInboxService);
		Container.get(InboxSourceRegistry).register({
			type: 'promotion_review',
			isEnabled: async () => reviews.isEnabled(),
			list: async (user, query) => await reviews.listForInbox(user, query),
			count: async (user) => await reviews.countForInbox(user),
		});
	}

	async entities() {
		const { PromotionProvider } = await import('./database/entities/promotion-provider.entity.js');
		const { PromotionConnection } = await import(
			'./database/entities/promotion-connection.entity.js'
		);
		const { PromotionConnectionProject } = await import(
			'./database/entities/promotion-connection-project.entity.js'
		);
		const { PromotionConfig } = await import('./database/entities/promotion-config.entity.js');
		const { PromotionRun } = await import('./database/entities/promotion-run.entity.js');
		const { PromotionReview } = await import('./database/entities/promotion-review.entity.js');
		return [
			PromotionProvider,
			PromotionConnection,
			PromotionConnectionProject,
			PromotionConfig,
			PromotionRun,
			PromotionReview,
		];
	}
}
