<script setup lang="ts">
import {
	N8nActionToggle,
	N8nButton,
	N8nIcon,
	N8nIconButton,
	N8nSettingsRow,
	N8nSettingsRowGroup,
	N8nText,
} from '@n8n/design-system';
import { useI18n } from '@n8n/i18n';
import { getResourcePermissions } from '@n8n/permissions';
import { useUsersStore } from '@n8n/stores/users.store';
import { computed, ref } from 'vue';

import type { PromotionEnvironment } from '../promotionsSettings.api';
import ApplyInstanceDialog from './ApplyInstanceDialog.vue';
import PromoteInstanceDialog from './PromoteInstanceDialog.vue';

const props = defineProps<{
	environment: PromotionEnvironment;
	busy?: 'retry' | 'remove';
	cloneError?: string;
	canClone: boolean;
}>();

const emit = defineEmits<{
	retry: [];
	edit: [];
	remove: [];
}>();

const i18n = useI18n();
const usersStore = useUsersStore();

const dialogOpen = ref(false);

const branch = computed(() =>
	props.environment.direction === 'apply'
		? props.environment.settings.branchName
		: props.environment.settings.baseBranchName,
);

const status = computed(() => {
	const { hasCheckout, matchesConfig } = props.environment.checkout;
	if (!hasCheckout) return 'notConnected';
	return matchesConfig ? 'connected' : 'outOfDate';
});

const canRun = computed(() => {
	const permissions = getResourcePermissions(usersStore.currentUser?.globalScopes).gitConnection;
	return props.environment.direction === 'apply' ? !!permissions.pull : !!permissions.push;
});

const actions = computed(() => [
	{ label: i18n.baseText('generic.edit'), value: 'edit' as const },
	{ label: i18n.baseText('settings.promotions.environment.remove'), value: 'remove' as const },
]);

function onAction(action: 'edit' | 'remove') {
	if (action === 'edit') emit('edit');
	else emit('remove');
}
</script>

<template>
	<N8nSettingsRowGroup>
		<N8nSettingsRow
			:title="i18n.baseText(`settings.promotions.environments.${environment.direction}.title`)"
		>
			<template #action>
				<N8nActionToggle
					:actions="actions"
					:disabled="!!busy"
					data-test-id="promotion-environment-menu"
					@action="onAction"
				>
					<N8nIconButton
						variant="ghost"
						icon="ellipsis"
						size="small"
						:disabled="!!busy"
						:aria-label="i18n.baseText('settings.promotions.environment.menu')"
					/>
				</N8nActionToggle>
			</template>
		</N8nSettingsRow>
		<N8nSettingsRow
			:title="environment.name"
			:description="
				[
					i18n.baseText(`settings.promotions.providers.type.${environment.provider.type}`),
					environment.remote.remoteUrl,
					branch,
				].join(' · ')
			"
		>
			<template #visual>
				<N8nIcon icon="git-branch" color="text-dark" size="xlarge" />
			</template>
		</N8nSettingsRow>
		<N8nSettingsRow>
			<template #info>
				<div role="status" :class="$style.status" data-test-id="promotion-environment-status">
					<div :class="$style.state">
						<N8nIcon v-if="status === 'connected'" icon="circle-check" color="success" />
						<N8nIcon v-else-if="status === 'outOfDate'" icon="triangle-alert" color="warning" />
						<N8nIcon v-else icon="circle-dot" color="text-light" />
						<N8nText size="small" color="text-dark">
							{{ i18n.baseText(`settings.promotions.environment.status.${status}`) }}
						</N8nText>
					</div>
					<N8nText v-if="status === 'outOfDate'" size="small" color="text-light">
						{{ i18n.baseText('settings.promotions.environment.status.outOfDate.description') }}
					</N8nText>
					<N8nText v-if="status !== 'connected' && cloneError" size="small" color="danger">
						{{ cloneError }}
					</N8nText>
				</div>
			</template>
			<template #action>
				<div :class="$style.actions">
					<N8nButton
						v-if="status !== 'connected' && canClone"
						variant="outline"
						size="small"
						:loading="busy === 'retry'"
						:disabled="busy === 'remove'"
						data-test-id="promotion-environment-retry"
						@click="emit('retry')"
					>
						{{
							i18n.baseText(
								status === 'outOfDate'
									? 'settings.promotions.environment.reconnect'
									: 'generic.retry',
							)
						}}
					</N8nButton>
					<N8nButton
						v-if="canRun"
						size="small"
						:disabled="status !== 'connected' || !!busy"
						:data-test-id="`${environment.direction}-instance-button`"
						@click="dialogOpen = true"
					>
						{{ i18n.baseText(`settings.promotions.${environment.direction}.button`) }}
					</N8nButton>
				</div>
			</template>
		</N8nSettingsRow>

		<PromoteInstanceDialog
			v-if="dialogOpen && environment.direction === 'promote'"
			:open="dialogOpen"
			:environment-id="environment.id"
			:base-branch-name="environment.settings.baseBranchName"
			:create-branch-on-promotion="environment.settings.createBranchOnPromotion"
			@update:open="dialogOpen = $event"
		/>
		<ApplyInstanceDialog
			v-if="dialogOpen && environment.direction === 'apply'"
			:open="dialogOpen"
			:environment-id="environment.id"
			:branch-name="environment.settings.branchName"
			@update:open="dialogOpen = $event"
		/>
	</N8nSettingsRowGroup>
</template>

<style lang="scss" module>
.status {
	display: flex;
	flex-direction: column;
	gap: var(--spacing--4xs);
}

.state {
	display: flex;
	align-items: center;
	gap: var(--spacing--3xs);
}

.actions {
	display: flex;
	gap: var(--spacing--2xs);
}
</style>
