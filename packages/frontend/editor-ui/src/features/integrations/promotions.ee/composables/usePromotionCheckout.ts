import { getResourcePermissions } from '@n8n/permissions';
import { useRootStore } from '@n8n/stores/useRootStore';
import { useUsersStore } from '@n8n/stores/users.store';
import { computed, reactive } from 'vue';

import { clonePromotionCheckout } from '../promotionsSettings.api';

/** The API does not store clone errors, so they live until the page reloads. */
const cloneErrors = reactive(new Map<string, string>());

export function usePromotionCheckout() {
	const rootStore = useRootStore();
	const usersStore = useUsersStore();

	const canClone = computed(
		() => !!getResourcePermissions(usersStore.currentUser?.globalScopes).gitConnection.clone,
	);

	async function clone(environmentId: string): Promise<boolean> {
		try {
			await clonePromotionCheckout(rootStore.publicApiContext, environmentId);
			cloneErrors.delete(environmentId);
			return true;
		} catch (error) {
			cloneErrors.set(environmentId, error instanceof Error ? error.message : String(error));
			return false;
		}
	}

	return { cloneErrors, canClone, clone };
}
