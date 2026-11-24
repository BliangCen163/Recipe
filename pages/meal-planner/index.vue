<template>
	<view class="page">
		<view class="hero">
			<text class="hero__eyebrow">AI 宴客管家</text>
			<text class="hero__title">一键定制整桌菜单</text>
			<text class="hero__desc">告诉我人数、菜数和偏好，我来帮你把一桌菜排得荤素平衡、长辈小孩都好安排。</text>
		</view>

		<view class="card">
			<view class="section">
				<text class="section__title">就餐人数</text>
				<view class="stepper">
					<view class="stepper__btn" @click="updateDiners(-1)">
						<text class="stepper__btn-text">-</text>
					</view>
					<view class="stepper__value">
						<text class="stepper__value-text">{{ diners }} 人</text>
					</view>
					<view class="stepper__btn" @click="updateDiners(1)">
						<text class="stepper__btn-text">+</text>
					</view>
				</view>
			</view>

			<view class="section">
				<text class="section__title">期望菜数</text>
				<view class="stepper">
					<view class="stepper__btn" @click="updateDishCount(-1)">
						<text class="stepper__btn-text">-</text>
					</view>
					<view class="stepper__value">
						<text class="stepper__value-text">{{ dishCount }} 道</text>
					</view>
					<view class="stepper__btn" @click="updateDishCount(1)">
						<text class="stepper__btn-text">+</text>
					</view>
				</view>
			</view>

			<view class="section">
				<text class="section__title">菜系偏好</text>
				<view class="tag-group">
					<view
						v-for="item in cuisineOptions"
						:key="item"
						class="tag"
						:class="{ 'tag--active': cuisine === item }"
						@click="toggleCuisine(item)"
					>
						<text class="tag__text">{{ item }}</text>
					</view>
				</view>
			</view>

			<view class="section">
				<text class="section__title">口味偏好 / 忌口</text>
				<view class="tag-group">
					<view
						v-for="item in preferenceOptions"
						:key="item"
						class="tag"
						:class="{ 'tag--active': selectedPreferences.includes(item) }"
						@click="togglePreference(item)"
					>
						<text class="tag__text">{{ item }}</text>
					</view>
				</view>
				<input
					v-model="preferenceInput"
					class="input"
					placeholder="例如：不吃香菜、想做得精致一点"
				/>
			</view>

			<view class="section">
				<text class="section__title">现有主打食材</text>
				<view class="tag-group">
					<view
						v-for="item in ingredientOptions"
						:key="item"
						class="tag"
						:class="{ 'tag--active': selectedIngredients.includes(item) }"
						@click="toggleIngredient(item)"
					>
						<text class="tag__text">{{ item }}</text>
					</view>
				</view>
				<input
					v-model="ingredientInput"
					class="input"
					placeholder="例如：有一只鸡、两块豆腐"
				/>
			</view>
		</view>

		<view class="submit" @click="submitPlan">
			<text class="submit__text">AI 一键定制菜单</text>
		</view>
	</view>
</template>

<script setup>
import { ref } from 'vue'

const diners = ref(2)
const dishCount = ref(3)
const cuisine = ref('')
const selectedPreferences = ref([])
const selectedIngredients = ref([])
const preferenceInput = ref('')
const ingredientInput = ref('')

const cuisineOptions = ['川菜', '粤菜', '湘菜', '鲁菜', '江浙菜', '家常菜']
const preferenceOptions = ['清淡', '不吃辣', '低脂', '下饭', '老人小孩都能吃', '海鲜过敏']
const ingredientOptions = ['鸡肉', '牛肉', '猪肉', '鸡蛋', '豆腐', '虾仁', '西红柿', '土豆']

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

const updateDiners = (delta) => {
	diners.value = clamp(diners.value + delta, 1, 10)
}

const updateDishCount = (delta) => {
	dishCount.value = clamp(dishCount.value + delta, 1, 8)
}

const toggleCuisine = (item) => {
	cuisine.value = cuisine.value === item ? '' : item
}

const togglePreference = (item) => {
	const index = selectedPreferences.value.indexOf(item)
	if (index > -1) {
		selectedPreferences.value.splice(index, 1)
	} else {
		selectedPreferences.value.push(item)
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

const buildField = (selectedList, inputValue) => {
	const values = [...selectedList]
	const trimmed = inputValue.trim()
	if (trimmed) {
		values.push(trimmed)
	}
	return values.join('；')
}

const submitPlan = () => {
	const preferences = buildField(selectedPreferences.value, preferenceInput.value)
	const availableIngredients = buildField(selectedIngredients.value, ingredientInput.value)
	const query = [
		`diners=${diners.value}`,
		`dishCount=${dishCount.value}`,
		`cuisine=${encodeURIComponent(cuisine.value)}`,
		`preferences=${encodeURIComponent(preferences)}`,
		`availableIngredients=${encodeURIComponent(availableIngredients)}`
	].join('&')

	uni.navigateTo({
		url: `/pages/meal-plan-result/index?${query}`
	})
}
</script>

<style lang="scss" scoped>
.page {
	min-height: 100vh;
	background: $page-bg-color;
	padding: 24rpx;
	padding-bottom: 140rpx;
}

.hero {
	background: linear-gradient(145deg, #fff6f0 0%, #ffffff 100%);
	border-radius: 32rpx;
	padding: 36rpx 32rpx;
	box-shadow: 0 18rpx 40rpx rgba(250, 102, 80, 0.08);

	&__eyebrow {
		display: inline-block;
		font-size: 22rpx;
		color: $primary-color;
		background: rgba(250, 102, 80, 0.1);
		padding: 8rpx 18rpx;
		border-radius: 999rpx;
	}

	&__title {
		display: block;
		margin-top: 18rpx;
		font-size: 46rpx;
		font-weight: 700;
		color: #1f2329;
	}

	&__desc {
		display: block;
		margin-top: 16rpx;
		font-size: 26rpx;
		line-height: 1.8;
		color: #6d737c;
	}
}

.card {
	margin-top: 24rpx;
	background: #ffffff;
	border-radius: 32rpx;
	padding: 32rpx;
	box-shadow: 0 18rpx 36rpx rgba(24, 32, 56, 0.06);
}

.section {
	margin-bottom: 36rpx;

	&:last-child {
		margin-bottom: 0;
	}

	&__title {
		display: block;
		font-size: 30rpx;
		font-weight: 700;
		color: #1f2329;
		margin-bottom: 20rpx;
	}
}

.stepper {
	display: flex;
	align-items: center;
	gap: 20rpx;

	&__btn {
		width: 72rpx;
		height: 72rpx;
		border-radius: 24rpx;
		background: #fff2ed;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	&__btn-text {
		font-size: 40rpx;
		color: $primary-color;
		font-weight: 700;
	}

	&__value {
		flex: 1;
		height: 72rpx;
		border-radius: 24rpx;
		background: #f7f8fa;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	&__value-text {
		font-size: 28rpx;
		font-weight: 600;
		color: #1f2329;
	}
}

.tag-group {
	display: flex;
	flex-wrap: wrap;
	gap: 16rpx;
}

.tag {
	padding: 14rpx 24rpx;
	border-radius: 999rpx;
	background: #ffffff;
	border: 2rpx solid #efefef;

	&--active {
		background: $primary-color;
		border-color: $primary-color;

		.tag__text {
			color: #ffffff;
		}
	}

	&__text {
		font-size: 24rpx;
		color: #5a6068;
	}
}

.input {
	margin-top: 18rpx;
	height: 84rpx;
	background: #f7f8fa;
	border-radius: 24rpx;
	padding: 0 24rpx;
	font-size: 26rpx;
	color: #1f2329;
}

.submit {
	position: fixed;
	left: 24rpx;
	right: 24rpx;
	bottom: calc(24rpx + env(safe-area-inset-bottom));
	height: 96rpx;
	border-radius: 999rpx;
	background: linear-gradient(135deg, $primary-color 0%, #ff8a65 100%);
	display: flex;
	align-items: center;
	justify-content: center;
	box-shadow: 0 14rpx 28rpx rgba(250, 102, 80, 0.28);

	&__text {
		font-size: 30rpx;
		font-weight: 700;
		color: #ffffff;
	}
}
</style>
