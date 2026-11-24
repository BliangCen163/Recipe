<template>
	<view class="page">
		<view class="nav">
			<view class="nav__back" @click="goBack">
				<text class="nav__back-icon">‹</text>
				<text class="nav__back-text">返回</text>
			</view>
			<text class="nav__title">菜谱分类</text>
		</view>

		<view class="hero-card">
			<text class="hero-card__eyebrow">{{ activeMode.label }}</text>
			<text class="hero-card__title">{{ activeMode.title }}</text>
			<text class="hero-card__desc">{{ activeMode.description }}</text>
		</view>

		<scroll-view class="mode-tabs" scroll-x>
			<view class="mode-tabs__inner">
				<view
					v-for="mode in modeOptions"
					:key="mode.key"
					class="mode-tab"
					:class="{ 'mode-tab--active': activeModeKey === mode.key }"
					@click="switchMode(mode.key)"
				>
					<text class="mode-tab__text">{{ mode.label }}</text>
				</view>
			</view>
		</scroll-view>

		<view class="filter-box">
			<input
				v-model.trim="keyword"
				class="filter-box__input"
				placeholder="搜索当前分类里的菜名、标签或作者"
				confirm-type="search"
			/>
		</view>

		<scroll-view class="quick-filters" scroll-x>
			<view class="quick-filters__inner">
				<view
					v-for="filter in quickFilters"
					:key="filter.key"
					class="quick-filter"
					:class="{ 'quick-filter--active': activeQuickFilter === filter.key }"
					@click="activeQuickFilter = filter.key"
				>
					<text class="quick-filter__text">{{ filter.label }}</text>
				</view>
			</view>
		</scroll-view>

		<view v-if="isCategoryLoading" class="status">
			<text class="status__text">正在读取分类...</text>
		</view>

		<view v-else-if="!categories.length" class="status">
			<text class="status__text">{{ emptyModeHint }}</text>
		</view>

		<view v-else class="catalog-layout">
			<scroll-view class="side-nav" scroll-y>
				<view
					v-for="category in categories"
					:key="category.name"
					class="side-nav__item"
					:class="{ 'side-nav__item--active': activeCategory === category.name }"
					@click="switchCategory(category.name)"
				>
					<text class="side-nav__name">{{ category.name }}</text>
					<text class="side-nav__count">{{ category.count }}</text>
				</view>
			</scroll-view>

			<scroll-view class="content-panel" scroll-y>
				<view class="content-panel__header">
					<view>
						<text class="content-panel__title">{{ activeCategory || '全部分类' }}</text>
						<text class="content-panel__subtitle">{{ activeMode.label }} · {{ activeQuickFilterLabel }}</text>
					</view>
					<text class="content-panel__meta">{{ currentRecipes.length }} 道菜</text>
				</view>

				<view v-if="modeNeedImportHint" class="mode-hint">
					<text class="mode-hint__text">{{ modeNeedImportHint }}</text>
				</view>

				<view v-if="isRecipeLoading" class="status status--inner">
					<text class="status__text">正在加载当前分类的菜谱...</text>
				</view>

				<view v-else-if="!currentRecipes.length" class="status status--inner">
					<text class="status__text">这个分类下暂时没有符合筛选条件的菜谱</text>
				</view>

				<view v-else class="recipe-list">
					<RecipeCard
						v-for="recipe in currentRecipes"
						:key="recipe.id"
						:recipe="recipe"
						source="menu"
					/>
				</view>
			</scroll-view>
		</view>
	</view>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import RecipeCard from '../components/RecipeCard.vue'
import {
	EIGHT_MAJOR_CUISINES,
	REGIONAL_CUISINE_ORDER,
	RECIPE_CLASSIFICATION_MODES,
	SCENE_CATEGORY_ORDER,
	TYPE_CATEGORY_ORDER,
	getModeDefinition,
	matchesRecipeKeyword,
	normalizeRecipeCard
} from '../../utils/recipes'

const PAGE_SIZE = 20
const MAX_VISIBLE_RECIPES_PER_CUISINE = 50

const quickFilters = [
	{ key: 'all', label: '全部' },
	{ key: 'home', label: '家常' },
	{ key: 'fast', label: '快手' },
	{ key: 'breakfast', label: '早餐' },
	{ key: 'party', label: '聚餐' },
	{ key: 'snack', label: '小吃' },
	{ key: 'soup', label: '汤羹' },
	{ key: 'dessert', label: '甜品' }
]

const modeOptions = RECIPE_CLASSIFICATION_MODES
const categories = ref([])
const activeModeKey = ref('cuisine')
const activeCategory = ref('')
const activeQuickFilter = ref('all')
const keyword = ref('')
const rawRecipes = ref([])
const isCategoryLoading = ref(true)
const isRecipeLoading = ref(false)
const recipeCache = reactive({})

const activeMode = computed(() => getModeDefinition(activeModeKey.value))
const activeQuickFilterLabel = computed(() => {
	return quickFilters.find((item) => item.key === activeQuickFilter.value)?.label || '全部'
})

const emptyModeHint = computed(() => {
	if (['type', 'scene'].includes(activeModeKey.value)) {
		return '这个分类模式在当前云数据库里还没有可展示的数据，通常需要把带新字段的 menu 数据重新导入。'
	}

	return '当前模式下没有可展示的分类。'
})

const modeNeedImportHint = computed(() => {
	if (!['type', 'scene'].includes(activeModeKey.value)) {
		return ''
	}

	return '按类型和按场景依赖 dishCategory / sceneCategory 字段；如果这里内容偏少，需要重新导入最新的 menu 数据。'
})

const getDatabase = () => {
	if (typeof wx === 'undefined' || !wx.cloud) {
		throw new Error('wx.cloud 不可用')
	}

	return wx.cloud.database()
}

const getCategoryOptions = (modeKey) => {
	switch (modeKey) {
		case 'region':
			return [...REGIONAL_CUISINE_ORDER, '其他地域']
		case 'type':
			return TYPE_CATEGORY_ORDER
		case 'scene':
			return SCENE_CATEGORY_ORDER
		case 'cuisine':
		default:
			return [...EIGHT_MAJOR_CUISINES, '其他菜系']
	}
}

const getQueryCondition = (db, modeKey, categoryName) => {
	const _ = db.command

	switch (modeKey) {
		case 'region':
			return categoryName === '其他地域'
				? { cuisine: _.nin(REGIONAL_CUISINE_ORDER) }
				: { cuisine: categoryName }
		case 'type':
			return { dishCategory: categoryName }
		case 'scene':
			return { sceneCategory: categoryName }
		case 'cuisine':
		default:
			return categoryName === '其他菜系'
				? { cuisine: _.nin(EIGHT_MAJOR_CUISINES) }
				: { cuisine: categoryName }
	}
}

const getVisibleRecipeLimit = (modeKey, totalCount) => {
	if (modeKey === 'cuisine') {
		return Math.min(totalCount, MAX_VISIBLE_RECIPES_PER_CUISINE)
	}

	return totalCount
}

const fetchCategoryCount = async (modeKey, categoryName) => {
	const db = getDatabase()
	const result = await db.collection('menu')
		.where(getQueryCondition(db, modeKey, categoryName))
		.count()

	return Number(result?.total || 0)
}

const loadCategories = async () => {
	isCategoryLoading.value = true
	categories.value = []
	activeCategory.value = ''
	rawRecipes.value = []

	try {
		const options = getCategoryOptions(activeModeKey.value)
		const checks = await Promise.all(
			options.map(async (name) => {
				try {
					const count = await fetchCategoryCount(activeModeKey.value, name)
					return count > 0 ? { name, count } : null
				} catch (error) {
					console.warn('[recipe-list] fetchCategoryCount failed:', activeModeKey.value, name, error)
					return null
				}
			})
		)

		categories.value = checks.filter(Boolean)
		activeCategory.value = categories.value[0]?.name || ''

		if (activeCategory.value) {
			await loadRecipesForCategory(activeCategory.value)
		}
	} catch (error) {
		console.error('[recipe-list] loadCategories failed:', error)
		categories.value = []
		activeCategory.value = ''
		uni.showToast({
			title: '加载分类失败',
			icon: 'none'
		})
	} finally {
		isCategoryLoading.value = false
	}
}

const fetchRecipesByCategory = async (modeKey, categoryName) => {
	const db = getDatabase()
	const records = []
	const totalCount = await fetchCategoryCount(modeKey, categoryName)
	const visibleLimit = getVisibleRecipeLimit(modeKey, totalCount)
	const totalBatches = Math.ceil(visibleLimit / PAGE_SIZE)

	for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
		const result = await db.collection('menu')
			.where(getQueryCondition(db, modeKey, categoryName))
			.field({
				_id: true,
				id: true,
				title: true,
				intro: true,
				cover: true,
				tags: true,
				author: true,
				category: true,
				categories: true,
				cuisine: true,
				majorCuisine: true,
				regionalCuisine: true,
				dishCategory: true,
				sceneCategory: true
			})
			.skip(batchIndex * PAGE_SIZE)
			.limit(PAGE_SIZE)
			.get()

		const batch = Array.isArray(result.data) ? result.data : []
		if (!batch.length) {
			break
		}

		records.push(...batch)

		if (batch.length < PAGE_SIZE) {
			break
		}
	}

	return records
		.map(normalizeRecipeCard)
		.filter((item) => item.id && item.title)
		.slice(0, visibleLimit)
}

const getCacheKey = (modeKey, categoryName) => `${modeKey}:${categoryName}`

const loadRecipesForCategory = async (categoryName) => {
	if (!categoryName) return

	const cacheKey = getCacheKey(activeModeKey.value, categoryName)
	if (recipeCache[cacheKey]) {
		rawRecipes.value = recipeCache[cacheKey]
		return
	}

	isRecipeLoading.value = true

	try {
		const data = await fetchRecipesByCategory(activeModeKey.value, categoryName)
		recipeCache[cacheKey] = data
		rawRecipes.value = data
	} catch (error) {
		console.error('[recipe-list] loadRecipesForCategory failed:', error)
		rawRecipes.value = []
		uni.showToast({
			title: '加载菜谱失败',
			icon: 'none'
		})
	} finally {
		isRecipeLoading.value = false
	}
}

const getFilterText = (recipe) => {
	return [
		recipe.title,
		recipe.author,
		recipe.cuisine,
		recipe.majorCuisine,
		recipe.regionalCuisine,
		recipe.dishCategory,
		recipe.sceneCategory,
		...(recipe.tags || [])
	].join(' ')
}

const matchesQuickFilter = (recipe) => {
	const text = getFilterText(recipe)

	switch (activeQuickFilter.value) {
		case 'home':
			return recipe.dishCategory === '家常菜' || text.includes('家常')
		case 'fast':
			return recipe.sceneCategory === '家常下饭' || text.includes('快手')
		case 'breakfast':
			return recipe.sceneCategory === '早餐早午餐' || text.includes('早餐')
		case 'party':
			return recipe.sceneCategory === '聚餐宴客' || text.includes('聚餐')
		case 'snack':
			return recipe.dishCategory === '小吃夜宵' || recipe.sceneCategory === '夜宵小聚'
		case 'soup':
			return recipe.dishCategory === '汤羹煲汤'
		case 'dessert':
			return ['烘焙甜品', '饮品'].includes(recipe.dishCategory) || recipe.sceneCategory === '下午茶甜点'
		case 'all':
		default:
			return true
	}
}

const currentRecipes = computed(() => {
	return rawRecipes.value.filter((recipe) => {
		return matchesQuickFilter(recipe) && matchesRecipeKeyword(recipe, keyword.value)
	})
})

const switchMode = async (modeKey) => {
	if (!modeKey || activeModeKey.value === modeKey) return
	activeModeKey.value = modeKey
	await loadCategories()
}

const switchCategory = async (name) => {
	if (!name || activeCategory.value === name) return
	activeCategory.value = name
	await loadRecipesForCategory(name)
}

const goBack = () => {
	uni.navigateBack()
}

watch(activeCategory, (value) => {
	if (!value) {
		rawRecipes.value = []
	}
})

onLoad(() => {
	uni.setNavigationBarTitle({ title: '菜谱分类' })
	loadCategories()
})
</script>

<style lang="scss" scoped>
.page {
	min-height: 100vh;
	background: linear-gradient(180deg, #fff7f3 0%, $page-bg-color 240rpx);
	padding-bottom: 32rpx;
}

.nav {
	height: 88rpx;
	padding: 0 32rpx;
	display: flex;
	align-items: center;
	justify-content: space-between;

	&__back {
		display: flex;
		align-items: center;
		gap: 8rpx;
	}

	&__back-icon {
		font-size: 42rpx;
		color: #2d2f33;
		line-height: 1;
	}

	&__back-text {
		font-size: 28rpx;
		color: #2d2f33;
	}

	&__title {
		font-size: 34rpx;
		font-weight: 700;
		color: #1f2329;
	}
}

.hero-card {
	margin: 8rpx 24rpx 0;
	padding: 28rpx;
	border-radius: 28rpx;
	background: linear-gradient(135deg, rgba(250, 102, 80, 0.15) 0%, rgba(255, 167, 102, 0.18) 100%);
	box-shadow: 0 10rpx 28rpx rgba(250, 102, 80, 0.08);

	&__eyebrow {
		display: block;
		font-size: 22rpx;
		color: $primary-color;
		font-weight: 700;
		letter-spacing: 2rpx;
	}

	&__title {
		display: block;
		margin-top: 8rpx;
		font-size: 38rpx;
		font-weight: 700;
		color: #1f2329;
	}

	&__desc {
		display: block;
		margin-top: 10rpx;
		font-size: 24rpx;
		line-height: 1.7;
		color: #666f7a;
	}
}

.mode-tabs,
.quick-filters {
	white-space: nowrap;
	padding: 20rpx 24rpx 0;
	box-sizing: border-box;

	&__inner {
		display: inline-flex;
		gap: 16rpx;
		padding-right: 24rpx;
	}
}

.mode-tab,
.quick-filter {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	height: 68rpx;
	padding: 0 28rpx;
	border-radius: 999rpx;
	background: #ffffff;
	border: 2rpx solid rgba(250, 102, 80, 0.08);

	&--active {
		background: $primary-color;
		border-color: $primary-color;
		box-shadow: 0 8rpx 20rpx rgba(250, 102, 80, 0.18);
	}

	&--active .mode-tab__text,
	&--active .quick-filter__text {
		color: #ffffff;
		font-weight: 700;
	}
}

.mode-tab__text,
.quick-filter__text {
	font-size: 25rpx;
	color: #5c626a;
	white-space: nowrap;
}

.filter-box {
	padding: 20rpx 24rpx 0;

	&__input {
		height: 76rpx;
		padding: 0 28rpx;
		border-radius: 20rpx;
		background: #ffffff;
		font-size: 26rpx;
		color: #1f2329;
		box-shadow: inset 0 0 0 2rpx rgba(250, 102, 80, 0.08);
	}
}

.catalog-layout {
	display: flex;
	gap: 18rpx;
	padding: 24rpx;
	height: calc(100vh - 430rpx);
	box-sizing: border-box;
}

.side-nav {
	width: 172rpx;
	height: 100%;
	background: rgba(255, 255, 255, 0.9);
	border-radius: 28rpx;
	padding: 12rpx;
	box-sizing: border-box;
}

.side-nav__item {
	padding: 22rpx 16rpx;
	border-radius: 20rpx;
	margin-bottom: 12rpx;
	background: transparent;

	&--active {
		background: rgba(250, 102, 80, 0.12);
	}
}

.side-nav__name {
	display: block;
	font-size: 26rpx;
	font-weight: 600;
	color: #28313b;
	line-height: 1.4;
}

.side-nav__count {
	display: block;
	margin-top: 6rpx;
	font-size: 22rpx;
	color: #8a9199;
}

.side-nav__item--active .side-nav__name,
.side-nav__item--active .side-nav__count {
	color: $primary-color;
}

.content-panel {
	flex: 1;
	height: 100%;
	background: #ffffff;
	border-radius: 28rpx;
	padding: 24rpx;
	box-sizing: border-box;
	box-shadow: 0 10rpx 26rpx rgba(18, 32, 56, 0.05);

	&__header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12rpx;
		margin-bottom: 20rpx;
	}

	&__title {
		display: block;
		font-size: 34rpx;
		font-weight: 700;
		color: #1f2329;
	}

	&__subtitle {
		display: block;
		margin-top: 8rpx;
		font-size: 23rpx;
		color: #8a9199;
	}

	&__meta {
		font-size: 24rpx;
		color: $primary-color;
		font-weight: 600;
		white-space: nowrap;
	}
}

.mode-hint {
	margin-bottom: 18rpx;
	padding: 18rpx 20rpx;
	border-radius: 18rpx;
	background: #fff7ef;

	&__text {
		font-size: 23rpx;
		line-height: 1.7;
		color: #8a5a2b;
	}
}

.status {
	padding: 120rpx 24rpx;
	text-align: center;

	&--inner {
		padding: 80rpx 24rpx;
		background: #fff8f5;
		border-radius: 24rpx;
	}

	&__text {
		font-size: 28rpx;
		color: #8a9199;
		line-height: 1.7;
	}
}

.recipe-list {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 20rpx;
}
</style>
