<template>
	<view class="page">
		<view class="search-bar" @click="handleSearch">
			<view class="search-bar__input">
				<text class="search-bar__placeholder">想吃什么？AI 帮你配菜</text>
			</view>
		</view>

		<view class="entry-grid">
			<view class="banner" @click="goFridge">
				<view class="banner__content">
					<text class="banner__title">剩菜盲盒</text>
					<text class="banner__desc">输入现有食材，AI 帮你快速出菜</text>
					<view class="banner__btn">
						<text class="banner__btn-text">立即体验</text>
					</view>
				</view>
				<view class="banner__icon">
					<text class="banner__icon-text">AI</text>
				</view>
			</view>

			<view class="banner banner--secondary" @click="goMealPlanner">
				<view class="banner__content">
					<text class="banner__title">智能配餐管家</text>
					<text class="banner__desc">家庭聚餐、宴客场景，一键生成整桌方案</text>
					<view class="banner__btn">
						<text class="banner__btn-text">去定制</text>
					</view>
				</view>
				<view class="banner__icon">
					<text class="banner__icon-text">宴</text>
				</view>
			</view>
		</view>

		<view class="section">
			<view class="section__header">
				<text class="section__title">精选菜谱</text>
				<text class="section__more" @click="handleMoreRecipes">更多</text>
			</view>

			<view v-if="recipeList.length" class="recipe-list">
				<RecipeCard
					v-for="item in recipeList"
					:key="item.id"
					:recipe="item"
					source="menu"
				/>
			</view>

			<view v-else class="empty-state">
				<text class="empty-state__text">正在准备精选菜谱</text>
			</view>
		</view>
	</view>
</template>

<script setup>
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import RecipeCard from '../components/RecipeCard.vue'
import { normalizeRecipeCard, sortCuisineNames } from '../../utils/recipes'

const recipeList = ref([])

const PAGE_SIZE = 20
const MAX_BATCHES = 12
const HOME_CUISINE_COUNT = 12

const fetchRecipeBatch = async (db, skip) => {
	const result = await db.collection('menu')
		.field({
			_id: true,
			id: true,
			title: true,
			cover: true,
			tags: true,
			author: true,
			category: true,
			categories: true,
			cuisine: true
		})
		.skip(skip)
		.limit(PAGE_SIZE)
		.get()

	return Array.isArray(result.data) ? result.data : []
}

const loadRecipes = async () => {
	try {
		if (typeof wx === 'undefined' || !wx.cloud) {
			throw new Error('wx.cloud 不可用')
		}

		const db = wx.cloud.database()
		const cuisineMap = new Map()

		for (let batchIndex = 0; batchIndex < MAX_BATCHES; batchIndex++) {
			const data = await fetchRecipeBatch(db, batchIndex * PAGE_SIZE)
			if (!data.length) {
				break
			}

			// Merge note: keep the test home layout, but source cards from `menu`
			// so they follow the public catalog + source=menu navigation contract.
			data
				.map(normalizeRecipeCard)
				.filter((item) => item.id && item.title)
				.forEach((item) => {
					if (!cuisineMap.has(item.cuisine)) {
						cuisineMap.set(item.cuisine, item)
					}
				})

			if (cuisineMap.size >= HOME_CUISINE_COUNT) {
				break
			}
		}

		const orderedCuisines = sortCuisineNames(Array.from(cuisineMap.keys())).slice(0, HOME_CUISINE_COUNT)
		recipeList.value = orderedCuisines.map((cuisine) => cuisineMap.get(cuisine)).filter(Boolean)
	} catch (error) {
		console.error('[index] loadRecipes failed:', error)
		recipeList.value = []
		uni.showToast({
			title: '首页菜谱加载失败',
			icon: 'none'
		})
	}
}

const handleSearch = () => {
	uni.navigateTo({ url: '/pages/index/search' })
}

const goFridge = () => {
	uni.navigateTo({ url: '/pages/fridge/index' })
}

const goMealPlanner = () => {
	uni.navigateTo({ url: '/pages/meal-planner/index' })
}

const handleMoreRecipes = () => {
	uni.navigateTo({ url: '/pages/recipe-list/index' })
}

onLoad(() => {
	loadRecipes()
})
</script>

<style lang="scss" scoped>
.page {
	min-height: 100vh;
	background-color: $page-bg-color;
	padding: 20rpx 24rpx;
	padding-bottom: 40rpx;
}

.search-bar {
	&__input {
		height: 72rpx;
		background-color: #F2F3F5;
		border-radius: 36rpx;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0 32rpx;
	}

	&__placeholder {
		font-size: 28rpx;
		color: #BBBBBB;
	}
}

.entry-grid {
	display: grid;
	grid-template-columns: repeat(2, 1fr);
	gap: 20rpx;
	margin-top: 24rpx;
}

.banner {
	background: linear-gradient(135deg, $primary-color 0%, #FF8A65 100%);
	border-radius: 16rpx;
	padding: 36rpx 32rpx;
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	justify-content: space-between;
	box-shadow: 0 8rpx 24rpx rgba(250, 102, 80, 0.25);
	min-height: 260rpx;

	&--secondary {
		background: linear-gradient(135deg, #ffb347 0%, #ff7b54 100%);
		box-shadow: 0 8rpx 24rpx rgba(255, 123, 84, 0.24);
	}

	&__content {
		flex: 1;
	}

	&__title {
		font-size: 34rpx;
		font-weight: bold;
		color: #FFFFFF;
		display: block;
		line-height: 1.3;
	}

	&__desc {
		font-size: 24rpx;
		color: rgba(255, 255, 255, 0.85);
		margin-top: 12rpx;
		display: block;
		line-height: 1.6;
		min-height: 76rpx;
	}

	&__btn {
		margin-top: 24rpx;
		display: inline-block;
		background-color: #FFFFFF;
		padding: 14rpx 32rpx;
		border-radius: 28rpx;
	}

	&__btn-text {
		font-size: 26rpx;
		color: $primary-color;
		font-weight: bold;
	}

	&__icon {
		width: 96rpx;
		height: 96rpx;
		background-color: rgba(255, 255, 255, 0.2);
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		margin-top: 24rpx;
	}

	&__icon-text {
		font-size: 28rpx;
		font-weight: bold;
		color: #FFFFFF;
	}
}

.section {
	margin-top: 40rpx;

	&__header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 24rpx;
	}

	&__title {
		font-size: 34rpx;
		font-weight: bold;
		color: #333333;
	}

	&__more {
		font-size: 26rpx;
		color: #999999;
	}
}

.recipe-list {
	display: grid;
	grid-template-columns: repeat(2, 1fr);
	gap: 20rpx;
}

.empty-state {
	padding: 48rpx 0;
	display: flex;
	justify-content: center;

	&__text {
		font-size: 28rpx;
		color: #9aa0a6;
	}
}
</style>
