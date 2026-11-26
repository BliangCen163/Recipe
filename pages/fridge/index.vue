<template>
	<view class="page">
		<view class="hero">
			<view class="hero__badge">
				<text class="hero__badge-dot"></text>
				<text class="hero__badge-text">剩菜盲盒</text>
			</view>
			<text class="hero__title">打开冰箱，让 AI 帮你认食材</text>
			<text class="hero__desc">手动勾选或自己补充，攒够食材后就去生成一份靠谱又省心的菜谱。</text>
		</view>

		<view class="panel">
			<view class="section-head">
				<text class="section-head__title">常见食材</text>
				<text class="section-head__meta">点一下就加入盲盒</text>
			</view>

			<view class="category" v-for="group in ingredientGroups" :key="group.name">
				<text class="category__label">{{ group.name }}</text>
				<view class="category__tags">
					<view
						v-for="item in group.items"
						:key="item"
						class="tag"
						:class="{ 'tag--active': selectedIngredients.includes(item) }"
						@click="toggleIngredient(item)"
					>
						<text class="tag__text">{{ item }}</text>
					</view>
				</view>
			</view>
		</view>

		<view class="panel panel--warm">
			<view class="section-head">
				<text class="section-head__title">补充食材</text>
				<text class="section-head__meta">支持手动输入与自定义食材</text>
			</view>

			<text class="custom-input__label">没有找到？自己补充或者拍一张</text>

			<view class="custom-input__row">
				<input
					class="custom-input__field"
					v-model="customInput"
					placeholder="输入食材名称"
					confirm-type="done"
					@confirm="addCustomIngredient"
				/>
				<view class="custom-input__btn" @click="addCustomIngredient">
					<text class="custom-input__btn-text">添加</text>
				</view>
			</view>

			<TransitionGroup
				v-if="customIngredients.length"
				name="ingredient-pop"
				tag="view"
				class="custom-input__tags"
			>
				<view
					v-for="item in customIngredients"
					:key="item"
					class="tag tag--active tag--custom"
					@click="removeCustomIngredient(item)"
				>
					<text class="tag__text">{{ item }}</text>
					<text class="tag__close">×</text>
				</view>
			</TransitionGroup>
		</view>

			<view v-if="allIngredients.length" class="panel">
				<view class="section-head">
					<text class="section-head__title">已选食材</text>
					<text class="section-head__meta">点标签即可取消选择</text>
				</view>
			<TransitionGroup name="ingredient-pop" tag="view" class="selected-board">
				<view
					v-for="item in allIngredients"
					:key="`selected-${item}`"
					class="tag tag--editable"
					:class="{ 'tag--active': selectedIngredients.includes(item) || customIngredients.includes(item) }"
					@click="toggleSelectedIngredient(item)"
				>
					<text class="tag__text">{{ item }}</text>
					<text class="tag__close">×</text>
				</view>
			</TransitionGroup>
		</view>

		<view class="bottom-bar">
			<view class="bottom-bar__info">
				<text class="bottom-bar__count">已选 {{ allIngredients.length }} 种食材</text>
				<text class="bottom-bar__hint">生成菜谱只需一步</text>
			</view>
			<view
				class="bottom-bar__btn"
				:class="{ 'bottom-bar__btn--disabled': !hasSelected }"
				@click="startMatch"
			>
				<text class="bottom-bar__btn-text">开始 AI 智能匹配</text>
			</view>
		</view>
	</view>
</template>

<script setup>
import { computed, ref } from 'vue'

const POLL_INTERVAL = 2000

const ingredientGroups = ref([
	{ name: '肉类蛋白', items: ['鸡蛋', '牛肉', '猪肉', '鸡肉', '虾仁', '排骨'] },
	{ name: '蔬菜菌菇', items: ['土豆', '西红柿', '青椒', '洋葱', '白菜', '胡萝卜', '茄子', '豆角'] },
	{ name: '主食碳水', items: ['面条', '米饭', '馒头', '饺子皮', '面粉'] },
	{ name: '调味基础', items: ['酱油', '醋', '豆瓣酱', '蚝油', '料酒'] }
])

const selectedIngredients = ref([])
const customInput = ref('')
const customIngredients = ref([])

const allIngredients = computed(() => [...selectedIngredients.value, ...customIngredients.value])
const hasSelected = computed(() => allIngredients.value.length > 0)

const normalizeIngredient = (value) => String(value || '').trim()

const dedupeIngredients = (list) => {
	const seen = new Set()
	return list.filter((item) => {
		const normalized = normalizeIngredient(item)
		if (!normalized || seen.has(normalized)) {
			return false
		}
		seen.add(normalized)
		return true
	})
}

const clearPollTimer = () => {
	if (pollTimer) {
		clearTimeout(pollTimer)
		pollTimer = null
	}
}

const toggleIngredient = (item) => {
	const index = selectedIngredients.value.indexOf(item)
	if (index > -1) {
		selectedIngredients.value.splice(index, 1)
	} else {
		selectedIngredients.value.push(item)
	}
}

const addCustomIngredient = () => {
	const value = normalizeIngredient(customInput.value)
	if (!value) {
		customInput.value = ''
		return
	}

	const next = dedupeIngredients([...customIngredients.value, value, ...selectedIngredients.value])
	customIngredients.value = next.filter((item) => !selectedIngredients.value.includes(item))
	customInput.value = ''
}

const removeCustomIngredient = (item) => {
	customIngredients.value = customIngredients.value.filter((current) => current !== item)
}

const toggleSelectedIngredient = (item) => {
	if (selectedIngredients.value.includes(item)) {
		selectedIngredients.value = selectedIngredients.value.filter((current) => current !== item)
		return
	}

	if (customIngredients.value.includes(item)) {
		customIngredients.value = customIngredients.value.filter((current) => current !== item)
		return
	}

	selectedIngredients.value.push(item)
}

const startMatch = () => {
	if (!hasSelected.value) {
		return
	}

	const ingredients = dedupeIngredients(allIngredients.value)
	uni.navigateTo({
		url: `/pages/recipe-detail/index?ingredients=${encodeURIComponent(JSON.stringify(ingredients))}`
	})
}

</script>

<style lang="scss" scoped>
.page {
	min-height: 100vh;
	background:
		radial-gradient(circle at top left, rgba(250, 102, 80, 0.12), transparent 34%),
		linear-gradient(180deg, #fff7f2 0%, $page-bg-color 28%, $page-bg-color 100%);
	padding: 24rpx;
	padding-bottom: 220rpx;
}

.hero {
	padding: 20rpx 8rpx 0;

	&__badge {
		display: inline-flex;
		align-items: center;
		gap: 10rpx;
		padding: 10rpx 18rpx;
		border-radius: 999rpx;
		background: rgba(250, 102, 80, 0.12);
	}

	&__badge-dot {
		width: 12rpx;
		height: 12rpx;
		border-radius: 50%;
		background: $primary-color;
		box-shadow: 0 0 0 8rpx rgba(250, 102, 80, 0.12);
	}

	&__badge-text {
		font-size: 22rpx;
		font-weight: 700;
		color: $primary-color;
	}

	&__title {
		display: block;
		margin-top: 24rpx;
		font-size: 52rpx;
		line-height: 1.18;
		font-weight: 700;
		color: #1f2329;
	}

	&__desc {
		display: block;
		margin-top: 18rpx;
		font-size: 26rpx;
		line-height: 1.8;
		color: #6f7680;
	}
}

.panel {
	margin-top: 24rpx;
	padding: 30rpx;
	border-radius: 32rpx;
	background: rgba(255, 255, 255, 0.9);
	box-shadow: 0 18rpx 40rpx rgba(24, 32, 56, 0.07);
	backdrop-filter: blur(10rpx);

	&--warm {
		background: linear-gradient(180deg, #fffdfc 0%, #fff5f0 100%);
	}
}

.section-head {
	display: flex;
	align-items: flex-end;
	justify-content: space-between;
	gap: 16rpx;
	margin-bottom: 24rpx;

	&__title {
		font-size: 32rpx;
		font-weight: 700;
		color: #1f2329;
	}

	&__meta {
		font-size: 22rpx;
		color: #99a0aa;
	}
}

.category {
	margin-bottom: 28rpx;

	&:last-child {
		margin-bottom: 0;
	}

	&__label {
		display: block;
		margin-bottom: 18rpx;
		font-size: 26rpx;
		font-weight: 700;
		color: #3c424b;
	}

	&__tags {
		display: flex;
		flex-wrap: wrap;
		gap: 16rpx;
	}
}

.tag {
	display: inline-flex;
	align-items: center;
	gap: 8rpx;
	padding: 16rpx 24rpx;
	border-radius: 999rpx;
	background: #ffffff;
	border: 2rpx solid rgba(31, 35, 41, 0.06);
	box-shadow: 0 8rpx 18rpx rgba(24, 32, 56, 0.04);
	transition: all 0.22s ease;

	&--active {
		background: linear-gradient(135deg, $primary-color 0%, #ff8a65 100%);
		border-color: transparent;
		box-shadow: 0 16rpx 28rpx rgba(250, 102, 80, 0.22);

		.tag__text,
		.tag__close {
			color: #ffffff;
		}
	}

	&--custom {
		padding-right: 18rpx;
	}

	&__text {
		font-size: 25rpx;
		color: #565d67;
	}

	&__close {
		font-size: 26rpx;
		color: rgba(255, 255, 255, 0.86);
	}
}

.custom-input {
	&__label {
		display: block;
		margin-bottom: 18rpx;
		font-size: 26rpx;
		font-weight: 700;
		color: #343941;
	}

	&__row {
		display: flex;
		align-items: center;
		gap: 16rpx;
	}

	&__field {
		flex: 1;
		height: 84rpx;
		padding: 0 28rpx;
		background: rgba(255, 255, 255, 0.96);
		border-radius: 28rpx;
		border: 2rpx solid rgba(250, 102, 80, 0.12);
		font-size: 26rpx;
		color: #1f2329;
		box-shadow: inset 0 2rpx 0 rgba(255, 255, 255, 0.45);
	}

	&__btn {
		width: 132rpx;
		height: 84rpx;
		border-radius: 28rpx;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #1f2329;
		box-shadow: 0 12rpx 24rpx rgba(31, 35, 41, 0.14);
	}

	&__btn-text {
		font-size: 26rpx;
		font-weight: 700;
		color: #ffffff;
	}

	&__tags {
		display: flex;
		flex-wrap: wrap;
		gap: 16rpx;
		margin-top: 22rpx;
	}
}

.selected-board {
	display: flex;
	flex-wrap: wrap;
	gap: 16rpx;
}

.bottom-bar {
	position: fixed;
	left: 20rpx;
	right: 20rpx;
	bottom: calc(20rpx + env(safe-area-inset-bottom));
	display: flex;
	align-items: center;
	gap: 20rpx;
	padding: 20rpx;
	border-radius: 32rpx;
	background: rgba(255, 255, 255, 0.96);
	box-shadow: 0 22rpx 42rpx rgba(24, 32, 56, 0.12);
	backdrop-filter: blur(14rpx);

	&__info {
		flex: 1;
		min-width: 0;
	}

	&__count {
		display: block;
		font-size: 28rpx;
		font-weight: 700;
		color: #1f2329;
	}

	&__hint {
		display: block;
		margin-top: 8rpx;
		font-size: 22rpx;
		color: #9aa0a6;
	}

	&__btn {
		padding: 24rpx 34rpx;
		border-radius: 999rpx;
		background: linear-gradient(135deg, #1f2329 0%, #4f5662 100%);
		box-shadow: 0 14rpx 28rpx rgba(31, 35, 41, 0.18);

		&--disabled {
			opacity: 0.38;
			box-shadow: none;
		}
	}

	&__btn-text {
		font-size: 28rpx;
		font-weight: 700;
		color: #ffffff;
		white-space: nowrap;
	}
}

.ingredient-pop-enter-active,
.ingredient-pop-leave-active {
	transition: all 0.28s ease;
}

.ingredient-pop-enter-from,
.ingredient-pop-leave-to {
	opacity: 0;
	transform: translateY(16rpx) scale(0.92);
}

.ingredient-pop-move {
	transition: transform 0.28s ease;
}

@media (prefers-reduced-motion: reduce) {
	.ingredient-pop-enter-active,
	.ingredient-pop-leave-active,
	.ingredient-pop-move,
	.tag {
		transition: none;
	}
}
</style>
