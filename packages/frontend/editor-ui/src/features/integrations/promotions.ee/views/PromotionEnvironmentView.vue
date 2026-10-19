<script setup lang="ts">
import {
	isPromotionGitHostType,
	promotionProviderTypeSchema,
	type PromotionDirection,
	type PromotionProviderType,
	type PromotionRepository,
} from '@n8n/api-types';
import { useToast } from '@n8n/composables/useToast';
import {
	N8nButton,
	N8nCheckbox,
	N8nIcon,
	N8nInput,
	N8nInputLabel,
	N8nLoading2,
	N8nSettingsLayout,
	N8nSettingsPageHeader,
	N8nSettingsRow,
	N8nSettingsRowGroup,
	N8nSettingsSection,
	N8nText,
} from '@n8n/design-system';
import { useI18n } from '@n8n/i18n';
import { useRootStore } from '@n8n/stores/useRootStore';
import { computed, nextTick, onMounted, reactive, ref, useTemplateRef } from 'vue';
import { onBeforeRouteLeave, useRouter } from 'vue-router';

import { useDocumentTitle } from '@/app/composables/useDocumentTitle';
import PromotionGitHostSelect from '../components/PromotionGitHostSelect.vue';
import PromotionProviderDialog from '../components/PromotionProviderDialog.vue';
import { invalidateInstancePromotionConnection } from '../composables/useInstancePromotionConnection';
import { usePromotionCheckout } from '../composables/usePromotionCheckout';
import { PROMOTIONS_SETTINGS_VIEW } from '../promotions.constants';
import {
	createPromotionEnvironment,
	deleteProviderIfUnused,
	fetchPromotionEnvironment,
	fetchPromotionEnvironments,
	updatePromotionEnvironment,
	type PromotionEnvironment,
	type PromotionEnvironmentSummary,
} from '../promotionsSettings.api';
import type { PromotionProviderChange } from '../promotionsSettings.utils';

const props = defineProps<{
	direction?: PromotionDirection;
	environmentId?: string;
}>();

const i18n = useI18n();
const toast = useToast();
const router = useRouter();
const rootStore = useRootStore();
const { canClone, clone } = usePromotionCheckout();

useDocumentTitle().set(i18n.baseText('settings.promotions.title'));

const overview = { name: PROMOTIONS_SETTINGS_VIEW };

const isLoading = ref(true);
const step = ref<'provider' | 'settings'>(props.environmentId ? 'settings' : 'provider');
const loaded = ref<PromotionEnvironment>();
const otherEnvironment = ref<PromotionEnvironmentSummary>();
const pickedType = ref<PromotionProviderType>();
const sharedProvider = ref<PromotionEnvironment['provider']>();
const createdProviderId = ref<string>();
const dialogOpen = ref(false);
const discoveryRevision = ref(0);
const isSaving = ref(false);
let isSaved = false;
const nameInput = useTemplateRef<InstanceType<typeof N8nInput>>('nameInput');

const form = reactive<{
	name: string;
	remoteUrl: string;
	repositoryPath?: string;
	branch: string;
	createBranchOnPromotion: boolean;
}>({
	name: '',
	remoteUrl: '',
	branch: 'main',
	createBranchOnPromotion: false,
});

const direction = computed(() => loaded.value?.direction ?? props.direction);
const providerId = computed(() => sharedProvider.value?.id ?? createdProviderId.value);
const providerType = computed(() => sharedProvider.value?.type ?? pickedType.value);
const hasHostApi = computed(
	() => !!providerType.value && isPromotionGitHostType(providerType.value),
);
const needsRepositorySelection = computed(
	() => hasHostApi.value && !!form.remoteUrl && !form.repositoryPath,
);
const canSave = computed(
	() =>
		!!form.name.trim() &&
		!!form.remoteUrl.trim() &&
		!!form.branch.trim() &&
		!(hasHostApi.value && !form.repositoryPath),
);

const remoteFieldsOf = (environment: PromotionEnvironment) => ({
	remoteUrl: environment.remote.remoteUrl,
	repositoryPath: environment.remote.repositoryPath,
	branch:
		environment.direction === 'apply'
			? environment.settings.branchName
			: environment.settings.baseBranchName,
});

onMounted(async () => {
	const context = rootStore.publicApiContext;
	try {
		if (props.environmentId) {
			const environment = await fetchPromotionEnvironment(context, props.environmentId);
			loaded.value = environment;
			sharedProvider.value = environment.provider;
			Object.assign(form, remoteFieldsOf(environment), {
				name: environment.name,
				createBranchOnPromotion:
					environment.direction === 'promote' && environment.settings.createBranchOnPromotion,
			});
		} else {
			const environments = await fetchPromotionEnvironments(context, { scope: 'instance' });
			if (environments.some((environment) => environment.direction === props.direction)) {
				await router.replace(overview);
				return;
			}
			otherEnvironment.value = environments[0];
		}
		isLoading.value = false;
	} catch (error) {
		toast.showError(
			error,
			i18n.baseText(
				props.environmentId
					? 'settings.promotions.environment.toast.error.load'
					: 'settings.promotions.environments.error.title',
			),
		);
		await router.push(overview);
	}
});

async function showSettings() {
	step.value = 'settings';
	await nextTick();
	nameInput.value?.focus();
}

function pickType(type: PromotionProviderType) {
	pickedType.value = type;
	const other = otherEnvironment.value;
	if (other?.provider.type !== type) {
		dialogOpen.value = true;
		return;
	}
	sharedProvider.value = other.provider;
	if (!isPromotionGitHostType(type)) form.remoteUrl = other.remote.remoteUrl;
	void showSettings();
}

function onProviderSaved(change: PromotionProviderChange) {
	if (!loaded.value) {
		createdProviderId.value = change.id;
		return;
	}
	// The API derives the URL on the new host from the stored repository path.
	if (change.hostChanged) {
		form.remoteUrl = loaded.value.remote.remoteUrl;
		form.repositoryPath = loaded.value.remote.repositoryPath;
	}
	if (change.hostChanged || change.credentialsChanged) discoveryRevision.value++;
}

function onDialogOpenChange(open: boolean) {
	dialogOpen.value = open;
	if (!open && step.value === 'provider' && createdProviderId.value) void showSettings();
}

function selectRepository(repository: PromotionRepository) {
	form.remoteUrl = repository.remoteUrl;
	form.repositoryPath = repository.fullPath;
	form.branch = repository.defaultBranch ?? '';
}

function directionFields(selected: PromotionDirection) {
	const branch = form.branch.trim();
	return selected === 'apply'
		? { direction: selected, settings: { schemaVersion: 1 as const, branchName: branch } }
		: {
				direction: selected,
				settings: {
					schemaVersion: 1 as const,
					baseBranchName: branch,
					createBranchOnPromotion: form.createBranchOnPromotion,
				},
			};
}

async function save() {
	const selectedProviderId = providerId.value;
	const selectedDirection = direction.value;
	if (!canSave.value || isSaving.value || !selectedProviderId || !selectedDirection) return;
	const context = rootStore.publicApiContext;
	const name = form.name.trim();
	const remote = { schemaVersion: 1 as const, remoteUrl: form.remoteUrl.trim() };
	const current = loaded.value;
	let saved: PromotionEnvironment;
	let connected = true;
	isSaving.value = true;
	try {
		if (current) {
			const remoteChanged =
				remote.remoteUrl !== current.remote.remoteUrl ||
				form.repositoryPath !== current.remote.repositoryPath;
			saved = await updatePromotionEnvironment(context, current.id, {
				name,
				settings: directionFields(selectedDirection).settings,
				...(remoteChanged && { remote }),
			});
		} else {
			saved = await createPromotionEnvironment(context, {
				name,
				scope: 'instance',
				providerId: selectedProviderId,
				remote,
				...directionFields(selectedDirection),
			});
		}
		isSaved = true;
		invalidateInstancePromotionConnection();
		if (canClone.value && !saved.checkout.matchesConfig) connected = await clone(saved.id);
	} catch (error) {
		toast.showError(error, i18n.baseText('settings.promotions.environment.toast.error.save'));
		return;
	} finally {
		isSaving.value = false;
	}
	if (connected) {
		toast.showMessage({
			title: i18n.baseText(
				current
					? 'settings.promotions.environment.toast.saved'
					: 'settings.promotions.environment.toast.added',
				{ interpolate: { name: saved.name } },
			),
			type: 'success',
		});
	}
	await router.push(overview);
}

onBeforeRouteLeave(() => {
	if (isSaving.value) return false;
	if (createdProviderId.value && !isSaved) {
		void deleteProviderIfUnused(rootStore.publicApiContext, createdProviderId.value).catch(
			(error: unknown) =>
				toast.showError(error, i18n.baseText('settings.promotions.provider.toast.error.delete')),
		);
	}
	return true;
});
</script>

<template>
	<N8nSettingsLayout
		:class="$style.layout"
		show-back
		:back-label="i18n.baseText('settings.promotions.environment.back')"
		@back="router.push(overview)"
	>
		<N8nSettingsPageHeader
			:title="
				loaded
					? i18n.baseText('settings.promotions.environment.edit.title', {
							interpolate: { name: loaded.name },
						})
					: i18n.baseText('settings.promotions.environments.add')
			"
			:description="
				direction ? i18n.baseText(`settings.promotions.environment.${direction}.description`) : ''
			"
			:show-docs-link="false"
		/>

		<N8nLoading2 v-if="isLoading" :rows="3" :shrink-last="false" />

		<N8nSettingsSection
			v-else-if="step === 'provider'"
			:title="i18n.baseText('settings.promotions.environment.provider.title')"
		>
			<N8nSettingsRowGroup>
				<N8nSettingsRow
					v-for="type in promotionProviderTypeSchema.options"
					:key="type"
					clickable
					:title="i18n.baseText(`settings.promotions.providers.type.${type}`)"
					:description="
						i18n.baseText(`settings.promotions.environment.provider.${type}.description`)
					"
					:data-test-id="`promotion-provider-type-${type}`"
					@click="pickType(type)"
				>
					<template #visual>
						<N8nIcon icon="git-branch" color="text-dark" size="xlarge" />
					</template>
					<template #action>
						<N8nIcon icon="chevron-right" color="text-light" size="small" />
					</template>
				</N8nSettingsRow>
			</N8nSettingsRowGroup>
			<div :class="$style.footer">
				<N8nButton variant="outline" @click="router.push(overview)">
					{{ i18n.baseText('generic.cancel') }}
				</N8nButton>
			</div>
		</N8nSettingsSection>

		<form v-else :class="$style.settings" @submit.prevent="save">
			<N8nSettingsRowGroup :class="$style.fields">
				<N8nInputLabel
					input-name="promotion-environment-name"
					:label="i18n.baseText('settings.promotions.environment.form.name')"
					required
				>
					<N8nInput
						id="promotion-environment-name"
						ref="nameInput"
						v-model="form.name"
						:disabled="isSaving"
						data-test-id="promotion-environment-name-input"
					/>
				</N8nInputLabel>

				<N8nInputLabel
					v-if="sharedProvider"
					input-name="promotion-environment-provider"
					:label="i18n.baseText('settings.promotions.environment.form.provider')"
				>
					<div :class="$style.provider">
						<N8nInput
							id="promotion-environment-provider"
							:model-value="`${i18n.baseText(`settings.promotions.providers.type.${sharedProvider.type}`)} · ${sharedProvider.name}`"
							readonly
							aria-describedby="promotion-environment-provider-hint"
							data-test-id="promotion-environment-provider"
						/>
						<N8nButton
							v-if="loaded"
							type="button"
							variant="outline"
							:disabled="isSaving"
							data-test-id="promotion-environment-edit-credentials"
							@click="dialogOpen = true"
						>
							{{ i18n.baseText('settings.promotions.environment.editCredentials') }}
						</N8nButton>
					</div>
					<N8nText id="promotion-environment-provider-hint" size="small" color="text-light">
						{{
							i18n.baseText(
								loaded
									? 'settings.promotions.environment.form.provider.locked'
									: 'settings.promotions.environment.form.provider.reused',
							)
						}}
					</N8nText>
				</N8nInputLabel>

				<N8nInputLabel
					v-if="hasHostApi && providerId"
					input-name="promotion-environment-repository"
					:label="i18n.baseText('settings.promotions.discovery.repository.label')"
					required
				>
					<PromotionGitHostSelect
						:model-value="form.remoteUrl"
						kind="repository"
						input-id="promotion-environment-repository"
						:provider-id="providerId"
						:revision="discoveryRevision"
						:description-id="
							needsRepositorySelection ? 'promotion-repository-selection-hint' : undefined
						"
						:disabled="isSaving"
						data-test-id="promotion-environment-repository-select"
						@selected="selectRepository"
					/>
					<N8nText
						v-if="needsRepositorySelection"
						id="promotion-repository-selection-hint"
						size="small"
						color="text-light"
						role="status"
					>
						{{ i18n.baseText('settings.promotions.discovery.repository.selectAgain') }}
					</N8nText>
				</N8nInputLabel>
				<N8nInputLabel
					v-else
					input-name="promotion-environment-remote-url"
					:label="i18n.baseText('settings.promotions.environment.form.remoteUrl')"
					required
				>
					<N8nInput
						id="promotion-environment-remote-url"
						v-model="form.remoteUrl"
						:disabled="isSaving"
						aria-describedby="promotion-environment-remote-url-hint"
						data-test-id="promotion-environment-remote-url-input"
					/>
					<N8nText id="promotion-environment-remote-url-hint" size="small" color="text-light">
						{{ i18n.baseText('settings.promotions.environment.form.remoteUrl.hint') }}
					</N8nText>
				</N8nInputLabel>

				<N8nInputLabel
					input-name="promotion-environment-branch"
					:label="i18n.baseText('settings.promotions.environment.form.branch')"
					required
				>
					<PromotionGitHostSelect
						v-if="hasHostApi && providerId"
						v-model="form.branch"
						kind="branch"
						input-id="promotion-environment-branch"
						:provider-id="providerId"
						:repository-id="form.repositoryPath"
						:revision="discoveryRevision"
						:disabled="isSaving"
						data-test-id="promotion-environment-branch-select"
					/>
					<N8nInput
						v-else
						id="promotion-environment-branch"
						v-model="form.branch"
						:disabled="isSaving"
						data-test-id="promotion-environment-branch-input"
					/>
				</N8nInputLabel>

				<div v-if="direction === 'promote'">
					<N8nCheckbox
						v-model="form.createBranchOnPromotion"
						:label="i18n.baseText('settings.promotions.environment.form.createBranch')"
						:disabled="isSaving"
						aria-describedby="promotion-environment-create-branch-description"
						data-test-id="promotion-environment-create-branch"
					/>
					<N8nText
						id="promotion-environment-create-branch-description"
						size="small"
						color="text-light"
					>
						{{ i18n.baseText('settings.promotions.environment.form.createBranch.description') }}
					</N8nText>
				</div>
			</N8nSettingsRowGroup>

			<div :class="$style.footer">
				<N8nButton
					type="button"
					variant="outline"
					:disabled="isSaving"
					data-test-id="promotion-environment-cancel"
					@click="router.push(overview)"
				>
					{{ i18n.baseText('generic.cancel') }}
				</N8nButton>
				<N8nButton
					type="submit"
					:disabled="!canSave"
					:loading="isSaving"
					data-test-id="promotion-environment-save"
				>
					{{ i18n.baseText(loaded ? 'generic.save' : 'settings.promotions.environments.add') }}
				</N8nButton>
			</div>
		</form>

		<PromotionProviderDialog
			v-if="dialogOpen"
			:open="dialogOpen"
			:type="pickedType"
			:provider-id="loaded ? providerId : undefined"
			@update:open="onDialogOpenChange"
			@saved="onProviderSaved"
		/>
	</N8nSettingsLayout>
</template>

<style lang="scss" module>
// The settings layout supplies the top spacing.
.layout {
	padding-top: 0;
}

.settings {
	display: flex;
	flex-direction: column;
	gap: var(--spacing--sm);
}

.fields {
	gap: var(--spacing--md);
	padding: var(--spacing--sm);
}

.provider {
	display: flex;
	align-items: center;
	gap: var(--spacing--xs);

	> :first-child {
		flex: 1;
	}
}

.footer {
	display: flex;
	justify-content: flex-end;
	gap: var(--spacing--xs);
}
</style>
