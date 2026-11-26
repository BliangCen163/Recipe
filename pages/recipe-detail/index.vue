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
					<text class="section-header__sub">份数可调，选好直接进采购单</text>
				</view>

				<view class="servings">
					<text class="servings__label">份数</text>
					<view class="servings__stepper">
						<view
							class="servings__btn"
							:class="{ 'servings__btn--disabled': servings <= 1 }"
							@click="decreaseServings"
						>
							<text class="servings__btn-text">−</text>
						</view>
						<text class="servings__value">{{ servings }} 份</text>
						<view
							class="servings__btn"
							:class="{ 'servings__btn--disabled': servings >= 10 }"
							@click="increaseServings"
						>
							<text class="servings__btn-text">＋</text>
						</view>
					</view>
				</view>

				<view class="ingredient-list">
					<view
						v-for="(item, index) in scaledIngredients"
						:key="item.key"
						class="ingredient-item"
						@click="toggleIngredient(index, item.name)"
					>
						<view
							class="ingredient-item__check"
							:class="{ 'ingredient-item__check--active': isIngredientSelected(index, item.name) }"
						>
							<text
								v-if="isIngredientSelected(index, item.name)"
								class="ingredient-item__tick"
							>✓</text>
						</view>
						<text class="ingredient-item__name">{{ item.name }}</text>
						<text class="ingredient-item__amount">{{ item.amount }}</text>
					</view>
				</view>

				<view class="shop-actions">
					<view
						v-if="selectedIngredientCount > 0"
						class="shop-actions__secondary"
						@click="addIngredientsToShopping('selected')"
					>
						<text class="shop-actions__secondary-text">
							加入已选 {{ selectedIngredientCount }} 项
						</text>
					</view>
					<view
						class="shop-actions__primary"
						:class="{ 'shop-actions__primary--busy': addingToShopping }"
						@click="addIngredientsToShopping('all')"
					>
						<text class="shop-actions__primary-text">
							{{ addingToShopping ? '正在加入...' : '一键加入全部食材' }}
						</text>
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
						<view class="timer__actions">
							<view
								v-if="!timerState[step.stepNum]"
								class="timer__btn"
								@click="startTimer(step.stepNum, step.timerMinute)"
							>
								<text class="timer__btn-text">开始倒计时</text>
							</view>
							<template v-else>
								<view
									class="timer__btn timer__btn--ghost"
									@click="toggleTimerPause(step.stepNum)"
								>
									<text class="timer__btn-text">
										{{ timerState[step.stepNum].running ? '暂停' : '继续' }}
									</text>
								</view>
								<view
									class="timer__btn timer__btn--danger"
									@click="cancelTimer(step.stepNum)"
								>
									<text class="timer__btn-text">取消计时</text>
								</view>
							</template>
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

		<view v-if="shoppingToastVisible" class="shop-toast">
			<text class="shop-toast__text">已加入采购单</text>
			<view class="shop-toast__link" @click="goShoppingList">
				<text class="shop-toast__link-text">去采购单 ›</text>
			</view>
		</view>
	</view>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { onLoad, onUnload } from '@dcloudio/uni-app'
import { userStore } from '../../stores/user'
import { toggleFavoriteRecipe } from '../../components/code/recipe-detail-toggleFavorite'
import { createAiTask, waitForAiTask } from '../../utils/ai-task'
import { scaleAmountText } from '../../utils/recipes'

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
const servings = ref(1)
const selectedIngredientKeys = ref({})
const addingToShopping = ref(false)
const shoppingToastVisible = ref(false)
let shoppingToastTimer = null

const ingredientKey = (index, name) => `${index}__${name}`

const isIngredientSelected = (index, name) =>
	!!selectedIngredientKeys.value[ingredientKey(index, name)]

const toggleIngredient = (index, name) => {
	const key = ingredientKey(index, name)
	selectedIngredientKeys.value = Object.assign({}, selectedIngredientKeys.value, {
		[key]: !selectedIngredientKeys.value[key]
	})
}

const scaledIngredients = computed(() =>
	(Array.isArray(recipe.value.ingredients) ? recipe.value.ingredients : []).map((item, index) => ({
		key: ingredientKey(index, item.name),
		name: item.name || '食材',
		amount: scaleAmountText(item.amount || '', servings.value)
	}))
)

const selectedIngredientCount = computed(
	() => scaledIngredients.value.filter((item, index) => isIngredientSelected(index, item.name)).length
)

const increaseServings = () => {
	if (servings.value >= 10) return
	servings.value += 1
}

const decreaseServings = () => {
	if (servings.value <= 1) return
	servings.value -= 1
}

const hideShoppingToast = () => {
	if (shoppingToastTimer) {
		clearTimeout(shoppingToastTimer)
		shoppingToastTimer = null
	}
	shoppingToastVisible.value = false
}

const showShoppingToast = () => {
	hideShoppingToast()
	shoppingToastVisible.value = true
	shoppingToastTimer = setTimeout(() => {
		shoppingToastVisible.value = false
		shoppingToastTimer = null
	}, 4000)
}

const goShoppingList = () => {
	hideShoppingToast()
	uni.navigateTo({ url: '/pages/shopping-list/index' })
}

const addIngredientsToShopping = async (mode) => {
	if (addingToShopping.value) return

	if (!userStore.openid) {
		uni.showToast({ title: '登录状态准备中，请稍后再试', icon: 'none' })
		return
	}

	const source = scaledIngredients.value
	const picked = mode === 'all'
		? source
		: source.filter((item, index) => isIngredientSelected(index, item.name))

	if (!picked.length) {
		uni.showToast({ title: mode === 'all' ? '暂无可加入的食材' : '请先勾选食材', icon: 'none' })
		return
	}

	addingToShopping.value = true

	try {
		const { result } = await wx.cloud.callFunction({
			name: 'manageShoppingList',
			data: {
				action: 'append',
				recipeId: recipeId.value,
				recipeTitle: recipe.value.title,
				servings: servings.value,
				ingredients: picked.map((item) => ({ name: item.name, amount: item.amount }))
			}
		})

		if (!result?.success) {
			throw new Error(result?.errorMessage || '加入采购单失败')
		}

		selectedIngredientKeys.value = {}
		showShoppingToast()
	} catch (error) {
		uni.showToast({ title: error.message || '加入采购单失败', icon: 'none' })
	} finally {
		addingToShopping.value = false
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
		loadingText.value = 'CloudBase AI 正在生成菜谱'
		loadingDesc.value = '云端模型已开始处理，请稍等片刻。'
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

	const recipeKind = isFromOriginalRecipes.value ? 'original' : (isFromMenu.value ? 'menu' : 'recipe')

	try {
		await wx.cloud.callFunction({
			name: 'recordViewHistory',
			data: {
				recipe: {
					recipeId: recipeId.value,
					title: recipe.value.title,
					cover: recipe.value.cover || '',
					recipeKind
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
			_id: id,
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
		})

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
		const { result } = await wx.cloud.callFunction({
			name: 'getFavorites',
			data: { recipeId: recipeId.value }
		})

		if (!result?.success) {
			throw new Error(result?.errorMessage || '读取收藏失败')
		}

		isFavorited.value = !!result.favorited
	} catch (e) {
		console.warn('[recipe-detail] checkFavoriteStatus failed:', e?.message || e)
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
		const recipeKind = isFromOriginalRecipes.value ? 'original' : (isFromMenu.value ? 'menu' : 'recipe')
		const result = await toggleFavoriteRecipe(recipe.value, recipeKind)

		if (!result?.success) {
			throw new Error(result?.errorMessage || '收藏操作失败')
		}

		isFavorited.value = !!result.isFavorited

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

const stopTimer = (stepNum) => {
	const handler = timerHandlers.get(stepNum)
	if (!handler) return
	clearInterval(handler)
	timerHandlers.delete(stepNum)
}

const runTimer = (stepNum) => {
	const state = timerState[stepNum]
	if (!state) return

	stopTimer(stepNum)
	timerState[stepNum] = {
		remainingSeconds: state.remainingSeconds,
		running: true
	}

	const handler = setInterval(() => {
		const current = timerState[stepNum]
		if (!current) return

		if (current.remainingSeconds <= 1) {
			stopTimer(stepNum)
			delete timerState[stepNum]
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

const startTimer = (stepNum, minute) => {
	const totalSeconds = Number(minute) * 60
	if (!totalSeconds) return

	stopTimer(stepNum)
	timerState[stepNum] = {
		remainingSeconds: totalSeconds,
		running: true
	}
	runTimer(stepNum)
}

const toggleTimerPause = (stepNum) => {
	const state = timerState[stepNum]
	if (!state) return

	if (state.running) {
		stopTimer(stepNum)
		timerState[stepNum] = {
			remainingSeconds: state.remainingSeconds,
			running: false
		}
		return
	}

	runTimer(stepNum)
}

const cancelTimer = (stepNum) => {
	stopTimer(stepNum)
	delete timerState[stepNum]
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
	hideShoppingToast()
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

.servings {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 18rpx 24rpx;
	margin-bottom: 8rpx;
	background: #fff6f1;
	border-radius: 16rpx;

	&__label {
		font-size: 26rpx;
		color: #7a5a50;
	}

	&__stepper {
		display: flex;
		align-items: center;
		gap: 20rpx;
	}

	&__btn {
		width: 52rpx;
		height: 52rpx;
		border-radius: 50%;
		background: #ffffff;
		border: 1rpx solid #ffd9cb;
		display: flex;
		align-items: center;
		justify-content: center;

		&--disabled {
			opacity: 0.35;
		}
	}

	&__btn-text {
		font-size: 30rpx;
		color: $primary-color;
		line-height: 1;
	}

	&__value {
		min-width: 96rpx;
		text-align: center;
		font-size: 28rpx;
		font-weight: 600;
		color: #2d3136;
	}
}

.ingredient-item {
	display: flex;
	align-items: center;
	gap: 16rpx;
	padding: 20rpx 0;
	border-bottom: 1rpx solid #f0f1f3;

	&:last-child {
		border-bottom: none;
		padding-bottom: 0;
	}

	&__check {
		width: 36rpx;
		height: 36rpx;
		border-radius: 50%;
		border: 2rpx solid #d7dae0;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		transition: all 0.2s ease;

		&--active {
			background: $primary-color;
			border-color: $primary-color;
		}
	}

	&__tick {
		font-size: 20rpx;
		color: #ffffff;
		font-weight: 700;
		line-height: 1;
	}

	&__name {
		flex: 1;
		min-width: 0;
		font-size: 28rpx;
		color: #2d3136;
	}

	&__amount {
		font-size: 26rpx;
		color: $primary-color;
		font-weight: 600;
	}
}

.shop-actions {
	margin-top: 28rpx;
	display: flex;
	flex-direction: column;
	gap: 16rpx;

	&__secondary {
		height: 76rpx;
		border-radius: 999rpx;
		background: #fff2ec;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	&__secondary-text {
		font-size: 26rpx;
		font-weight: 600;
		color: #c2553a;
	}

	&__primary {
		height: 88rpx;
		border-radius: 999rpx;
		background: $primary-color;
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 8rpx 20rpx rgba(250, 102, 80, 0.18);

		&--busy {
			opacity: 0.7;
		}
	}

	&__primary-text {
		font-size: 28rpx;
		font-weight: 600;
		color: #ffffff;
	}
}

.shop-toast {
	position: fixed;
	left: 50%;
	bottom: calc(48rpx + env(safe-area-inset-bottom));
	transform: translateX(-50%);
	display: flex;
	align-items: center;
	gap: 20rpx;
	padding: 20rpx 32rpx;
	background: rgba(31, 35, 41, 0.92);
	border-radius: 999rpx;
	z-index: 30;

	&__text {
		font-size: 26rpx;
		color: #ffffff;
	}

	&__link {
		padding: 6rpx 18rpx;
		border-radius: 999rpx;
		background: rgba(255, 255, 255, 0.16);
	}

	&__link-text {
		font-size: 26rpx;
		font-weight: 600;
		color: #ffd3c6;
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

	&__actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 12rpx;
		flex-shrink: 0;
	}

	&__btn {
		padding: 18rpx 24rpx;
		border-radius: 999rpx;
		background: $primary-color;
		flex-shrink: 0;
	}

	&__btn--ghost {
		background: #ffe3da;
	}

	&__btn--ghost .timer__btn-text {
		color: #b94a2b;
	}

	&__btn--danger {
		background: #f1f2f4;
	}

	&__btn--danger .timer__btn-text {
		color: #b42318;
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
