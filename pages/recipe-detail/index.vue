<template>
	<view class="page">
		<view class="nav">
			<view class="nav__back" @click="goBack">
				<text class="nav__back-text">返回</text>
			</view>
			<text class="nav__title">{{ recipe.title || 'AI 菜谱详情' }}</text>
			<view class="nav__placeholder"></view>
		</view>

		<view v-if="isLoading" class="loading-card">
			<view class="loading-card__spark"></view>
			<text class="loading-card__title">{{ loadingText }}</text>
			<text class="loading-card__desc">{{ loadingDesc }}</text>
		</view>

		<view v-else-if="errorMessage" class="status-card">
			<text class="status-card__title">菜谱生成失败</text>
			<text class="status-card__desc">{{ errorMessage }}</text>
			<view class="status-card__btn" @click="fetchRecipe">
				<text class="status-card__btn-text">重新生成</text>
			</view>
		</view>

		<scroll-view v-else scroll-y class="content">
			<view v-if="recipe.cover" class="hero-image">
				<image class="hero-image__img" :src="recipe.cover" mode="aspectFill" />
			</view>
			<view class="hero">
				<text class="hero__eyebrow">菜谱详情</text>
				<text class="hero__title">{{ recipe.title }}</text>
				<view class="hero__tags">
					<text v-for="tag in recipe.tags" :key="tag" class="hero__tag">{{ tag }}</text>
				</view>
			</view>

			<view class="card">
				<view class="section-header">
					<text class="section-header__title">食材清单</text>
					<text class="section-header__sub">精准分量更容易成功</text>
				</view>
				<view class="ingredient-list">
					<view
						v-for="item in recipe.ingredients"
						:key="`${item.name}-${item.amount}`"
						class="ingredient-item"
					>
						<text class="ingredient-item__name">{{ item.name }}</text>
						<text class="ingredient-item__amount">{{ item.amount }}</text>
					</view>
				</view>
			</view>

			<view class="card">
				<view class="section-header">
					<text class="section-header__title">做法步骤</text>
					<text class="section-header__sub">按顺序做，翻车概率更低</text>
				</view>
				<view
					v-for="step in recipe.steps"
					:key="step.stepNum"
					class="step-card"
				>
					<view class="step-card__header">
						<view class="step-card__num">
							<text class="step-card__num-text">{{ step.stepNum }}</text>
						</view>
						<text class="step-card__title">Step {{ step.stepNum }}</text>
					</view>
					<text class="step-card__desc">{{ step.desc }}</text>
					<view v-if="step.timerMinute > 0" class="timer">
						<view class="timer__info">
							<text class="timer__label">建议计时</text>
							<text class="timer__value">
								{{ getTimerText(step.stepNum, step.timerMinute) }}
							</text>
						</view>
						<view class="timer__btn" @click="startTimer(step.stepNum, step.timerMinute)">
							<text class="timer__btn-text">
								{{ timerState[step.stepNum]?.running ? '重新计时' : '开始倒计时' }}
							</text>
						</view>
					</view>
				</view>
			</view>

			<view class="tips-card">
				<text class="tips-card__title">大厨贴士</text>
				<text class="tips-card__desc">{{ recipe.tips }}</text>
			</view>

			<view v-if="!isFromOriginalRecipes" class="bottom-action">
				<view class="fav-btn" :class="{ 'fav-btn--active': isFavorited }" @click="toggleFavorite">
					<text class="fav-btn__icon">{{ isFavorited ? '♥' : '♡' }}</text>
					<text class="fav-btn__text">{{ isFavorited ? '已收藏' : '收藏菜谱' }}</text>
				</view>
			</view>
		</scroll-view>
	</view>
</template>

<script setup>
import { reactive, ref, watch } from 'vue'
import { onLoad, onUnload } from '@dcloudio/uni-app'
import { userStore } from '../../stores/user'
import { toggleFavoriteRecipe } from '../../components/code/recipe-detail-toggleFavorite'
import { createAiTask, waitForAiTask } from '../../utils/ai-task'

const recipe = ref({
	title: '',
	tags: [],
	ingredients: [],
	steps: [],
	tips: '',
	cover: ''
})
const isLoading = ref(true)
const errorMessage = ref('')
const selectedIngredients = ref([])
const timerState = reactive({})
const timerHandlers = new Map()
const isFavorited = ref(false)
const recipeId = ref('')
const isFromMenu = ref(false)
const isFromOriginalRecipes = ref(false)
const loadingText = ref('AI 大厨正在起锅烧油')
const loadingDesc = ref('正在根据你选的食材生成真实菜谱，请稍等片刻。')
const isPageDisposed = ref(false)
const hasRecordedHistory = ref(false)

const getPreferredBackend = () => {
	try {
		const backend = uni.getStorageSync('aiBackend') || 'cloudbase'
		if (!uni.getStorageSync('aiBackend')) {
			uni.setStorageSync('aiBackend', backend)
		}
		return backend
	} catch (error) {
		return 'cloudbase'
	}
}

const parseIngredients = (value) => {
	if (!value) return []
	try {
		const parsed = JSON.parse(decodeURIComponent(value))
		return Array.isArray(parsed) ? parsed.filter(Boolean) : []
	} catch (error) {
		return String(value).split(',').map((item) => item.trim()).filter(Boolean)
	}
}

const normalizeRecipe = (data) => ({
	_id: data?._id || '',
	title: data?.title || 'AI 私房菜',
	tags: Array.isArray(data?.tags) ? data.tags : [],
	ingredients: Array.isArray(data?.ingredients) ? data.ingredients : [],
	steps: Array.isArray(data?.steps) ? data.steps : [],
	tips: data?.tips || '出锅前先试味，再按口味微调。',
	cover: data?.cover || '',
	sourceMenuId: data?.sourceMenuId || '',
	sourceIngredients: Array.isArray(data?.sourceIngredients) ? data.sourceIngredients : []
})

const updateLoadingByTask = (task) => {
	if (task.status === 'pending') {
		loadingText.value = 'AI 任务排队中'
		loadingDesc.value = '任务已提交到任务池，正在等待执行器处理。'
		return
	}

	if (task.status === 'processing') {
		loadingText.value = task.backend === 'cloudbase' ? 'CloudBase AI 正在生成菜谱' : '本地 AI 正在生成菜谱'
		loadingDesc.value = task.backend === 'cloudbase'
			? '云端模型已开始处理，请稍等片刻。'
			: '本地模型已开始处理，请稍等片刻。'
	}
}

const clearAllTimers = () => {
	timerHandlers.forEach((handler) => clearInterval(handler))
	timerHandlers.clear()
}

const recordViewHistory = async () => {
	if (!userStore.openid || !recipeId.value || !recipe.value.title || hasRecordedHistory.value) {
		return
	}

	const source = isFromOriginalRecipes.value ? 'original_recipes' : (isFromMenu.value ? 'menu' : 'recipes')

	try {
		await wx.cloud.callFunction({
			name: 'recordViewHistory',
			data: {
				recipe: {
					recipeId: recipeId.value,
					title: recipe.value.title,
					cover: recipe.value.cover || '',
					source
				}
			}
		})
		hasRecordedHistory.value = true
	} catch (error) {
		console.error('[recipe-detail] recordViewHistory failed:', error)
	}
}

const loadFromDB = async (id) => {
	loadingText.value = '正在加载菜谱'
	loadingDesc.value = '从数据库读取菜谱数据...'
	isLoading.value = true
	errorMessage.value = ''
	isFromMenu.value = false
	isFromOriginalRecipes.value = false

	try {
		const db = wx.cloud.database()
		const { data } = await db.collection('recipes').doc(id).get()

		if (!data) {
			throw new Error('菜谱数据不存在')
		}

		recipe.value = normalizeRecipe(data)
		recipeId.value = id
		recipe.value._id = id
		selectedIngredients.value = data.sourceIngredients || data.ingredients.map((item) => item.name)
		uni.setNavigationBarTitle({ title: recipe.value.title })
		await checkFavoriteStatus()
		await recordViewHistory()
	} catch (error) {
		errorMessage.value = '加载菜谱失败：' + (error.message || '未知错误')
	} finally {
		isLoading.value = false
	}
}

const loadFromMenu = async (id) => {
	loadingText.value = '正在加载菜谱'
	loadingDesc.value = '正在读取菜谱数据...'
	isLoading.value = true
	errorMessage.value = ''
	isFromMenu.value = true
	isFromOriginalRecipes.value = false

	try {
		const db = wx.cloud.database()
		const { data } = await db.collection('menu').doc(id).get()

		if (!data) {
			throw new Error('菜谱数据不存在')
		}

		recipe.value = {
			title: data.title || '菜谱详情',
			tags: Array.isArray(data.tags) ? data.tags : [],
			ingredients: Array.isArray(data.ingredients) ? data.ingredients : [],
			steps: Array.isArray(data.steps) ? data.steps : [],
			tips: data.tips || '出锅前先试味，再按口味微调。',
			cover: data.cover || data.image || ''
		}
		recipeId.value = id
		uni.setNavigationBarTitle({ title: recipe.value.title })
		await checkFavoriteStatus()
		await recordViewHistory()
	} catch (error) {
		errorMessage.value = '加载菜谱失败：' + (error.message || '未知错误')
	} finally {
		isLoading.value = false
	}
}

const loadFromOriginalRecipes = async (id) => {
	loadingText.value = '正在加载菜谱'
	loadingDesc.value = '正在读取你的自创菜谱...'
	isLoading.value = true
	errorMessage.value = ''
	isFromMenu.value = false
	isFromOriginalRecipes.value = true

	try {
		const db = wx.cloud.database()
		const { data } = await db.collection('original_recipes').doc(id).get()

		if (!data) {
			throw new Error('菜谱数据不存在')
		}

		recipe.value = {
			_id: id,
			title: data.title || '自创菜谱',
			tags: Array.isArray(data.tags) ? data.tags : [],
			ingredients: Array.isArray(data.ingredients) ? data.ingredients : [],
			steps: Array.isArray(data.steps) ? data.steps : [],
			tips: data.tips || '按自己的口味继续微调。',
			cover: data.cover || data.image || ''
		}
		recipeId.value = id
		uni.setNavigationBarTitle({ title: recipe.value.title })
		isFavorited.value = false
		await recordViewHistory()
	} catch (error) {
		errorMessage.value = '加载菜谱失败：' + (error.message || '未知错误')
	} finally {
		isLoading.value = false
	}
}

const fetchRecipe = async () => {
	if (!selectedIngredients.value.length) {
		errorMessage.value = '没有收到食材列表，请返回上一页重新选择。'
		isLoading.value = false
		return
	}

	loadingText.value = '正在创建 AI 任务'
	loadingDesc.value = '菜谱请求已提交，正在进入任务池。'
	isLoading.value = true
	errorMessage.value = ''

	try {
		// Merge note: keep the task-based generation flow and do not restore
		// the legacy direct call path, which bypasses ai_tasks and result recovery.
		const task = await createAiTask('recipe', {
			ingredients: selectedIngredients.value
		}, getPreferredBackend())

		const finalTask = await waitForAiTask(task.taskId, {
			onUpdate: updateLoadingByTask,
			shouldStop: () => isPageDisposed.value
		})

		if (finalTask.status !== 'succeeded') {
			throw new Error(finalTask.errorMessage || 'AI 任务执行失败')
		}

		const nextRecipeId = finalTask.resultRefs?.recipeId
		if (!nextRecipeId) {
			throw new Error('任务已完成，但未返回 recipeId')
		}

		await loadFromDB(nextRecipeId)
	} catch (error) {
		if (error.message === 'TASK_POLL_ABORTED') {
			return
		}

		errorMessage.value = error.message || '调用 AI 生成菜谱失败'
		isLoading.value = false
	}
}

const checkFavoriteStatus = async () => {
	if (!userStore.openid || !recipeId.value) {
		isFavorited.value = false
		return
	}

	try {
		const db = wx.cloud.database()
		const { data: user } = await db.collection('users').doc(userStore.openid).get()
		const savedRecipes = Array.isArray(user?.savedRecipes) ? user.savedRecipes : []
		isFavorited.value = savedRecipes.includes(recipeId.value)

		if (!isFavorited.value && isFromMenu.value) {
			const { data: matched } = await db.collection('recipes')
				.where({ sourceMenuId: recipeId.value })
				.limit(1)
				.get()
			if (matched.length > 0) {
				const matchedRecipeId = matched[0]._id
				isFavorited.value = savedRecipes.includes(matchedRecipeId)
			}
		}
	} catch (e) {
		isFavorited.value = false
	}
}

const toggleFavorite = async () => {
	if (isLoading.value || !recipe.value.title) return
	if (!userStore.openid) {
		uni.showToast({
			title: '登录状态准备中，请稍后再试',
			icon: 'none'
		})
		return
	}

	try {
		uni.showLoading({ title: '收藏中...' })
		const sourceMenuId = isFromMenu.value ? recipeId.value : ''
		const result = await toggleFavoriteRecipe(recipe.value, isFromMenu.value, sourceMenuId)

		if (!result?.success) {
			throw new Error(result?.errorMessage || '收藏操作失败')
		}

		recipeId.value = result.recipeId || recipeId.value
		recipe.value._id = recipeId.value
		isFavorited.value = !!result.isFavorited
		isFromMenu.value = false
		userStore.setSavedRecipes(result.savedRecipes || [])

		uni.showToast({
			title: isFavorited.value ? '已收藏' : '已取消收藏',
			icon: 'none'
		})
	} catch (error) {
		uni.showToast({
			title: error.message || '操作失败，请重试',
			icon: 'none'
		})
	} finally {
		uni.hideLoading()
	}
}

const startTimer = (stepNum, minute) => {
	const totalSeconds = Number(minute) * 60
	if (!totalSeconds) return

	if (timerHandlers.has(stepNum)) {
		clearInterval(timerHandlers.get(stepNum))
		timerHandlers.delete(stepNum)
	}

	timerState[stepNum] = {
		remainingSeconds: totalSeconds,
		running: true
	}

	const handler = setInterval(() => {
		const current = timerState[stepNum]
		if (!current) return

		if (current.remainingSeconds <= 1) {
			clearInterval(handler)
			timerHandlers.delete(stepNum)
			timerState[stepNum] = {
				remainingSeconds: 0,
				running: false
			}
			uni.vibrateLong()
			uni.showModal({
				title: '时间到',
				content: `第 ${stepNum} 步计时结束`,
				showCancel: false
			})
			return
		}

		timerState[stepNum] = {
			remainingSeconds: current.remainingSeconds - 1,
			running: true
		}
	}, 1000)

	timerHandlers.set(stepNum, handler)
}

const getTimerText = (stepNum, minute) => {
	const state = timerState[stepNum]
	if (!state) return `${minute} 分钟`
	const minutes = Math.floor(state.remainingSeconds / 60)
	const seconds = state.remainingSeconds % 60
	return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

const goBack = () => {
	uni.navigateBack()
}

onLoad((options) => {
	isPageDisposed.value = false
	hasRecordedHistory.value = false

	if (options?.recipeId) {
		if (options?.source === 'menu') {
			loadFromMenu(options.recipeId)
		} else if (options?.source === 'original_recipes') {
			loadFromOriginalRecipes(options.recipeId)
		} else {
			loadFromDB(options.recipeId)
		}
		return
	}

	selectedIngredients.value = parseIngredients(options?.ingredients)
	fetchRecipe()
})

onUnload(() => {
	isPageDisposed.value = true
	clearAllTimers()
})

watch(
	() => [userStore.openid, recipeId.value, recipe.value.title],
	() => {
		recordViewHistory()
	}
)
</script>

<style lang="scss" scoped>
.page {
	min-height: 100vh;
	background-color: $page-bg-color;
	padding: 24rpx;
	box-sizing: border-box;
}

.nav {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 24rpx;

	&__back {
		display: flex;
		align-items: center;
		gap: 8rpx;
		background: #ffffff;
		padding: 14rpx 20rpx;
		border-radius: 999rpx;
		box-shadow: 0 8rpx 20rpx rgba(24, 32, 56, 0.06);
	}

	&__back-text {
		font-size: 28rpx;
		color: #222222;
		font-weight: 600;
	}

	&__title {
		font-size: 28rpx;
		color: #222222;
		font-weight: 600;
		max-width: 360rpx;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	&__placeholder {
		width: 72rpx;
		height: 72rpx;
	}
}

.loading-card,
.status-card {
	margin-top: 120rpx;
	background: #ffffff;
	border-radius: 32rpx;
	padding: 56rpx 40rpx;
	box-shadow: 0 18rpx 40rpx rgba(24, 32, 56, 0.08);
	text-align: center;

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
		line-height: 1.7;
		color: #7b8088;
	}
}

.loading-card {
	&__spark {
		width: 120rpx;
		height: 120rpx;
		margin: 0 auto 28rpx;
		border-radius: 50%;
		background: radial-gradient(circle at 30% 30%, #ffd4cc 0%, $primary-color 75%);
		box-shadow: 0 12rpx 32rpx rgba(250, 102, 80, 0.3);
	}
}

.status-card {
	&__btn {
		margin: 28rpx auto 0;
		width: 220rpx;
		height: 84rpx;
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
	height: calc(100vh - 120rpx);
}

.hero {
	background: linear-gradient(145deg, #fff7f4 0%, #ffffff 100%);
	border-radius: 32rpx;
	padding: 40rpx 32rpx;
	box-shadow: 0 18rpx 40rpx rgba(250, 102, 80, 0.08);

	&__eyebrow {
		display: inline-block;
		padding: 8rpx 18rpx;
		border-radius: 999rpx;
		font-size: 22rpx;
		color: $primary-color;
		background: rgba(250, 102, 80, 0.1);
	}

	&__title {
		display: block;
		margin-top: 20rpx;
		font-size: 48rpx;
		line-height: 1.3;
		font-weight: 700;
		color: #1f2329;
	}

	&__tags {
		display: flex;
		flex-wrap: wrap;
		gap: 14rpx;
		margin-top: 24rpx;
	}

	&__tag {
		padding: 10rpx 18rpx;
		border-radius: 999rpx;
		font-size: 24rpx;
		color: #6a4a3c;
		background: #fff0ea;
	}
}

.hero-image {
	margin-bottom: 24rpx;
	border-radius: 32rpx;
	overflow: hidden;

	&__img {
		width: 100%;
		height: 400rpx;
		display: block;
	}
}

.card,
.tips-card {
	margin-top: 24rpx;
	background: #ffffff;
	border-radius: 32rpx;
	padding: 32rpx;
	box-shadow: 0 18rpx 36rpx rgba(24, 32, 56, 0.06);
}

.section-header {
	display: flex;
	align-items: flex-end;
	justify-content: space-between;
	margin-bottom: 24rpx;

	&__title {
		font-size: 34rpx;
		font-weight: 700;
		color: #1f2329;
	}

	&__sub {
		font-size: 24rpx;
		color: #9aa0a6;
	}
}

.ingredient-list {
	display: flex;
	flex-direction: column;
	gap: 18rpx;
}

.ingredient-item {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 20rpx 0;
	border-bottom: 1rpx solid #f0f1f3;

	&:last-child {
		border-bottom: none;
		padding-bottom: 0;
	}

	&__name {
		font-size: 28rpx;
		color: #2d3136;
	}

	&__amount {
		font-size: 26rpx;
		color: $primary-color;
		font-weight: 600;
	}
}

.step-card {
	padding: 28rpx;
	background: #fcfcfd;
	border-radius: 24rpx;
	margin-bottom: 20rpx;

	&:last-child {
		margin-bottom: 0;
	}

	&__header {
		display: flex;
		align-items: center;
		gap: 16rpx;
		margin-bottom: 18rpx;
	}

	&__num {
		width: 56rpx;
		height: 56rpx;
		border-radius: 50%;
		background: linear-gradient(135deg, $primary-color 0%, #ff8a65 100%);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	&__num-text {
		font-size: 26rpx;
		font-weight: 700;
		color: #ffffff;
	}

	&__title {
		font-size: 28rpx;
		font-weight: 600;
		color: #2d3136;
	}

	&__desc {
		font-size: 28rpx;
		line-height: 1.9;
		color: #4e535a;
	}
}

.timer {
	margin-top: 24rpx;
	padding: 22rpx 24rpx;
	background: #fff4ef;
	border-radius: 20rpx;
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 16rpx;

	&__info {
		display: flex;
		flex-direction: column;
		gap: 8rpx;
	}

	&__label {
		font-size: 22rpx;
		color: #9b6a5a;
	}

	&__value {
		font-size: 30rpx;
		font-weight: 700;
		color: #2d3136;
	}

	&__btn {
		padding: 18rpx 24rpx;
		border-radius: 999rpx;
		background: $primary-color;
		flex-shrink: 0;
	}

	&__btn-text {
		font-size: 24rpx;
		font-weight: 600;
		color: #ffffff;
	}
}

.tips-card {
	&__title {
		display: block;
		font-size: 34rpx;
		font-weight: 700;
		color: #1f2329;
	}

	&__desc {
		display: block;
		margin-top: 20rpx;
		font-size: 28rpx;
		line-height: 1.9;
		color: #4e535a;
	}
}

.bottom-action {
	margin-top: 32rpx;
	margin-bottom: 60rpx;
	display: flex;
	justify-content: center;
}

.fav-btn {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 12rpx;
	padding: 24rpx 64rpx;
	border-radius: 999rpx;
	background: #ffffff;
	box-shadow: 0 8rpx 24rpx rgba(24, 32, 56, 0.08);
	border: 2rpx solid #f0f1f3;

	&--active {
		background: rgba(250, 102, 80, 0.08);
		border-color: rgba(250, 102, 80, 0.3);
	}

	&__icon {
		font-size: 36rpx;
		color: $primary-color;
	}

	&__text {
		font-size: 28rpx;
		font-weight: 600;
		color: #2d3136;
	}
}
</style>
