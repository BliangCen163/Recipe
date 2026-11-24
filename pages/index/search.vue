<template>
	<view class="page">
		<view class="search-bar">
			<input
				class="search-bar__input"
				v-model="keyword"
				focus
				confirm-type="search"
				placeholder="输入菜名搜索菜谱"
				@confirm="handleSearch"
			/>
			<text v-if="keyword" class="search-bar__clear" @click="clearKeyword">✕</text>
			<text class="search-bar__btn" @click="handleSearch">搜索</text>
		</view>

		<view v-if="isSearching" class="status">
			<text class="status__text">搜索中...</text>
		</view>

		<view v-else-if="hasSearched && resultList.length > 0" class="section">
			<view class="section__header">
				<text class="section__title">搜索结果</text>
				<text class="section__more">共 {{ total }} 个菜谱</text>
			</view>
			<view class="recipe-list">
				<RecipeCard v-for="item in resultList" :key="item._id" :recipe="item" source="menu" />
			</view>
			
			<view v-if="totalPages > 1" class="pagination">
				<view 
					class="pagination__btn" 
					:class="{ 'pagination__btn--disabled': currentPage === 1 }"
					@click="goToPage(currentPage - 1)"
				>
					<text class="pagination__text">上一页</text>
				</view>
				<text class="pagination__info">{{ currentPage }} / {{ totalPages }}</text>
				<view 
					class="pagination__btn" 
					:class="{ 'pagination__btn--disabled': currentPage === totalPages }"
					@click="goToPage(currentPage + 1)"
				>
					<text class="pagination__text">下一页</text>
				</view>
			</view>
		</view>

		<view v-else-if="hasSearched && resultList.length === 0" class="empty-container">
			<view class="empty">
				<text class="empty__title">没有找到相关菜谱</text>
				<text class="empty__desc">换个关键词试试吧</text>
			</view>
		</view>

		<view v-else class="hint">
			<text class="hint__text">输入菜名，搜索你想要的菜谱</text>
		</view>
	</view>
</template>

<script setup>
import { ref } from 'vue'
import RecipeCard from '../components/RecipeCard.vue'
import { searchRecipes } from '../../components/code/search'

const keyword = ref('')
const resultList = ref([])
const isSearching = ref(false)
const hasSearched = ref(false)
const currentPage = ref(1)
const totalPages = ref(1)
const total = ref(0)

const handleSearch = () => {
	onSearch(1)
}

const onSearch = async (page = 1) => {
	const kw = keyword.value.trim()
	if (!kw) return

	isSearching.value = true
	hasSearched.value = true
	currentPage.value = page

	try {
		console.log('[search] calling cloud function with keyword:', kw, 'page:', page)
		const { result } = await wx.cloud.callFunction({
			name: 'search',
			data: { keyword: kw, page: page }
		})
		console.log('[search] cloud function result:', result)

		if (result.success) {
			resultList.value = result.data
			total.value = result.total
			totalPages.value = result.totalPages
		} else {
			resultList.value = []
			total.value = 0
			totalPages.value = 1
		}
		console.log('[search] resultList:', resultList.value)
	} catch (error) {
		console.error('[search] call search function failed, fallback to local search:', error)
		const result = await searchRecipes(kw)
		console.log('[search] local search result:', result)
		resultList.value = result.success ? result.data : []
		total.value = resultList.value.length
			totalPages.value = Math.max(1, Math.ceil(total.value / 16))
		console.log('[search] resultList after fallback:', resultList.value)
	}

	isSearching.value = false
}

const clearKeyword = () => {
	keyword.value = ''
	resultList.value = []
	hasSearched.value = false
	currentPage.value = 1
	totalPages.value = 1
	total.value = 0
}

const goToPage = (page) => {
	if (page < 1 || page > totalPages.value) return
	onSearch(page)
}
</script>

<style lang="scss" scoped>
.page {
	min-height: 100vh;
	background-color: $page-bg-color;
}

.search-bar {
	display: flex;
	align-items: center;
	padding: 16rpx 24rpx;
	background-color: #FFFFFF;
	gap: 16rpx;

	&__input {
		flex: 1;
		height: 72rpx;
		background-color: #F2F3F5;
		border-radius: 36rpx;
		padding: 0 32rpx;
		font-size: 28rpx;
		color: #333333;
	}

	&__clear {
		width: 40rpx;
		height: 40rpx;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 24rpx;
		color: #999999;
	}

	&__btn {
		font-size: 28rpx;
		color: $primary-color;
		font-weight: 600;
		flex-shrink: 0;
	}
}

.status {
	display: flex;
	justify-content: center;
	padding-top: 160rpx;

	&__text {
		font-size: 28rpx;
		color: #9aa0a6;
	}
}

.empty-container {
	display: flex;
	justify-content: center;
	align-items: center;
	min-height: 60vh;
}

.empty {
	display: flex;
	flex-direction: column;
	align-items: center;

	&__title {
		font-size: 32rpx;
		font-weight: 600;
		color: #4e535a;
		margin-bottom: 16rpx;
	}

	&__desc {
		font-size: 26rpx;
		color: #9aa0a6;
	}
}

.section {
	padding: 24rpx;

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

.pagination {
	display: flex;
	align-items: center;
	justify-content: center;
	margin-top: 40rpx;
	gap: 32rpx;

	&__btn {
		padding: 16rpx 32rpx;
		background-color: #FFFFFF;
		border-radius: 12rpx;
		box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.08);

		&--disabled {
			opacity: 0.5;
		}
	}

	&__text {
		font-size: 28rpx;
		color: #333333;
	}

	&__info {
		font-size: 28rpx;
		color: #666666;
	}
}

.hint {
	display: flex;
	justify-content: center;
	padding-top: 200rpx;

	&__text {
		font-size: 28rpx;
		color: #9aa0a6;
	}
}
</style>
