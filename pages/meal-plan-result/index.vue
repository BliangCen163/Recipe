<template>
	<view class="page">
		<view v-if="isLoading" class="loading">
			<view class="loading__orb"></view>
			<text class="loading__title">{{ loadingText }}</text>
			<text class="loading__desc">{{ loadingDesc }}</text>
		</view>

		<view v-else-if="errorMessage" class="error-card">
			<text class="error-card__title">套餐生成失败</text>
			<text class="error-card__desc">{{ errorMessage }}</text>
			<view class="error-card__btn" @click="fetchMealPlan">
				<text class="error-card__btn-text">重新生成</text>
			</view>
		</view>

		<scroll-view v-else scroll-y class="content">
			<view class="header">
				<text class="header__eyebrow">AI 套餐方案</text>
				<text class="header__title">为您定制的 {{ diners }} 人 {{ dishCount }} 道菜方案</text>
				<text v-if="cuisine" class="header__desc">本次偏向 {{ cuisine }} 风味</text>
			</view>

			<view class="list">
				<RecipeCard
					v-for="item in mealPlan"
					:key="item._id"
					:recipe="item"
					:navigate-url="`/pages/recipe-detail/index?recipeId=${item._id}`"
				/>
			</view>
		</scroll-view>

		<view v-if="!isLoading && !errorMessage && mealPlan.length" class="shopping-btn" @click="addAllToShoppingList">
			<text class="shopping-btn__text">一键将全部食材加入采购单</text>
		</view>
	</view>
</template>

<script setup>
import { ref } from 'vue'
import { onLoad, onUnload } from '@dcloudio/uni-app'
import RecipeCard from '../components/RecipeCard.vue'
import { createAiTask, waitForAiTask } from '../../utils/ai-task'

const isLoading = ref(true)
const errorMessage = ref('')
const mealPlan = ref([])
const diners = ref(2)
const dishCount = ref(3)
const cuisine = ref('')
const preferences = ref('')
const availableIngredients = ref('')
const loadingText = ref('AI 正在为您排兵布阵...')
const loadingDesc = ref('正在规划一桌荤素搭配合理的菜单，请稍等片刻。')
const isPageDisposed = ref(false)

const parseNumber = (value, fallback) => {
	const parsed = Number(value)
	return Number.isFinite(parsed) ? parsed : fallback
}

const buildShoppingIngredients = () => {
	return mealPlan.value.flatMap((recipe) =>
		(recipe.ingredients || []).map((item) => ({
			name: item.name,
			amount: item.amount,
			recipeTitle: recipe.title
		}))
	)
}

const updateLoadingByTask = (task) => {
	if (task.status === 'pending') {
		loadingText.value = '套餐任务排队中'
		loadingDesc.value = '任务已提交到任务池，正在等待执行器处理。'
		return
	}

	if (task.status === 'processing') {
		loadingText.value = 'CloudBase AI 正在设计整桌菜单'
		loadingDesc.value = '云端模型已开始生成多道菜，请稍等片刻。'
	}
}

const loadRecipesByIds = async (recipeIds) => {
	if (!Array.isArray(recipeIds) || !recipeIds.length) {
		mealPlan.value = []
		return
	}

	const db = wx.cloud.database()
	const _ = db.command
	const { data } = await db.collection('recipes').where({
		_id: _.in(recipeIds)
	}).get()

	const recipeMap = new Map((data || []).map((item) => [item._id, item]))
	mealPlan.value = recipeIds
		.map((id) => recipeMap.get(id))
		.filter(Boolean)
}

const fetchMealPlan = async () => {
	isLoading.value = true
	errorMessage.value = ''
	loadingText.value = '正在创建套餐任务'
	loadingDesc.value = '菜单请求已提交，正在进入任务池。'

	try {
		const task = await createAiTask('meal_plan', {
			diners: diners.value,
			dishCount: dishCount.value,
			cuisine: cuisine.value,
			preferences: preferences.value,
			availableIngredients: availableIngredients.value
		})

		const finalTask = await waitForAiTask(task.taskId, {
			onUpdate: updateLoadingByTask,
			shouldStop: () => isPageDisposed.value
		})

		if (finalTask.status !== 'succeeded') {
			throw new Error(finalTask.errorMessage || 'AI 任务执行失败')
		}

		const recipeIds = Array.isArray(finalTask.resultRefs?.recipeIds)
			? finalTask.resultRefs.recipeIds
			: []

		if (!recipeIds.length) {
			throw new Error('任务已完成，但未返回套餐 recipeIds')
		}

		await loadRecipesByIds(recipeIds)
	} catch (error) {
		if (error.message === 'TASK_POLL_ABORTED') {
			return
		}

		errorMessage.value = error.message || '调用 AI 生成套餐失败'
	} finally {
		isLoading.value = false
	}
}

const addAllToShoppingList = async () => {
	const ingredients = buildShoppingIngredients()
	if (!ingredients.length) {
		uni.showToast({ title: '当前套餐没有可加入的食材', icon: 'none' })
		return
	}

	try {
		uni.showLoading({ title: '加入采购单中...' })
		const { result } = await wx.cloud.callFunction({
			name: 'manageShoppingList',
			data: {
				action: 'append',
				ingredients
			}
		})

		if (!result?.success) {
			throw new Error(result?.errorMessage || '加入采购单失败')
		}

		uni.showToast({
			title: `已加入 ${result.count || ingredients.length} 项食材`,
			icon: 'none'
		})
	} catch (error) {
		uni.showToast({
			title: error.message || '加入采购单失败',
			icon: 'none'
		})
	} finally {
		uni.hideLoading()
	}
}

onLoad((options) => {
	isPageDisposed.value = false
	diners.value = parseNumber(options?.diners, 2)
	dishCount.value = parseNumber(options?.dishCount, 3)
	cuisine.value = decodeURIComponent(options?.cuisine || '')
	preferences.value = decodeURIComponent(options?.preferences || '')
	availableIngredients.value = decodeURIComponent(options?.availableIngredients || '')
	fetchMealPlan()
})

onUnload(() => {
	isPageDisposed.value = true
})
</script>

<style lang="scss" scoped>
.page {
	min-height: 100vh;
	background: $page-bg-color;
	padding: 24rpx;
	padding-bottom: 150rpx;
	box-sizing: border-box;
}

.loading,
.error-card {
	margin-top: 160rpx;
	background: #ffffff;
	border-radius: 32rpx;
	padding: 60rpx 40rpx;
	text-align: center;
	box-shadow: 0 18rpx 40rpx rgba(24, 32, 56, 0.08);
}

.loading {
	&__orb {
		width: 120rpx;
		height: 120rpx;
		margin: 0 auto 28rpx;
		border-radius: 50%;
		background: radial-gradient(circle at 30% 30%, #ffd8ce 0%, #ff8a65 72%);
		box-shadow: 0 12rpx 32rpx rgba(250, 102, 80, 0.28);
	}

	&__title {
		display: block;
		font-size: 38rpx;
		font-weight: 700;
		color: #1f2329;
	}

	&__desc {
		display: block;
		margin-top: 16rpx;
		font-size: 28rpx;
		line-height: 1.8;
		color: #7b8088;
	}
}

.error-card {
	&__title {
		display: block;
		font-size: 38rpx;
		font-weight: 700;
		color: #1f2329;
	}

	&__desc {
		display: block;
		margin-top: 16rpx;
		font-size: 28rpx;
		line-height: 1.8;
		color: #7b8088;
	}

	&__btn {
		width: 220rpx;
		height: 84rpx;
		margin: 28rpx auto 0;
		border-radius: 42rpx;
		background: linear-gradient(135deg, $primary-color 0%, #ff8a65 100%);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	&__btn-text {
		font-size: 28rpx;
		font-weight: 700;
		color: #ffffff;
	}
}

.content {
	height: calc(100vh - 150rpx);
}

.header {
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
		font-size: 42rpx;
		font-weight: 700;
		line-height: 1.35;
		color: #1f2329;
	}

	&__desc {
		display: block;
		margin-top: 16rpx;
		font-size: 26rpx;
		color: #7b8088;
	}
}

.list {
	margin-top: 24rpx;
}

.shopping-btn {
	position: fixed;
	left: 24rpx;
	right: 24rpx;
	bottom: calc(24rpx + env(safe-area-inset-bottom));
	height: 96rpx;
	border-radius: 999rpx;
	background: linear-gradient(135deg, #1f2329 0%, #454b54 100%);
	display: flex;
	align-items: center;
	justify-content: center;
	box-shadow: 0 14rpx 30rpx rgba(31, 35, 41, 0.24);

	&__text {
		font-size: 30rpx;
		font-weight: 700;
		color: #ffffff;
	}
}
</style>
