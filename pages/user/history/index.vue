<template>
	<view class="page">
		<view class="header">
			<text class="header__title">浏览历史</text>
			<text v-if="items.length > 0" class="header__clear" @click="clearHistory">清空</text>
		</view>

		<view v-if="isLoading" class="status">
			<text class="status__text">加载中...</text>
		</view>

		<view v-else-if="!userStore.openid" class="status">
			<text class="status__text">请先完成微信登录后查看浏览历史</text>
		</view>

		<view v-else-if="items.length === 0" class="empty">
			<view class="empty__icon">
				<text class="empty__icon-text">🕒</text>
			</view>
			<text class="empty__title">还没有浏览历史</text>
			<text class="empty__desc">浏览菜谱后会在这里显示</text>
		</view>

		<view v-else class="list">
			<view
				v-for="item in items"
				:key="item.historyId"
				class="history-item"
				@click="goToDetail(item)"
			>
				<image v-if="item.cover" class="history-item__cover" :src="item.cover" mode="aspectFill" />
				<view v-else class="history-item__cover history-item__cover--empty">
					<text class="history-item__cover-text">无图</text>
				</view>
				<view class="history-item__body">
					<text class="history-item__title">{{ item.title }}</text>
					<text class="history-item__time">{{ formatTime(item.viewedAt) }}</text>
				</view>
				<view class="history-item__actions" @click.stop>
					<view class="history-item__delete" @click="deleteHistoryItem(item)">
						<text class="history-item__delete-text">删除</text>
					</view>
					<text class="history-item__arrow">›</text>
				</view>
			</view>

			<text v-if="isLoadingMore" class="list__more">加载中...</text>
			<text v-else-if="hasMore" class="list__more">上拉加载更多</text>
		</view>
	</view>
</template>

<script setup>
import { ref } from 'vue'
import { onReachBottom, onShow } from '@dcloudio/uni-app'
import { userStore } from '../../../stores/user'

const PAGE_SIZE = 20

const items = ref([])
const total = ref(0)
const hasMore = ref(false)
const isLoading = ref(true)
const isLoadingMore = ref(false)
const page = ref(0)

const loadHistory = async (reset = true) => {
	if (!userStore.openid) {
		items.value = []
		total.value = 0
		hasMore.value = false
		isLoading.value = false
		return
	}

	if (!reset && (isLoadingMore.value || !hasMore.value)) return

	const targetPage = reset ? 1 : page.value + 1

	if (reset) {
		isLoading.value = true
	} else {
		isLoadingMore.value = true
	}

	try {
		const { result } = await wx.cloud.callFunction({
			name: 'getViewHistory',
			data: { page: targetPage, pageSize: PAGE_SIZE }
		})

		if (!result?.success) {
			throw new Error(result?.errorMessage || '获取浏览历史失败')
		}

		const nextItems = Array.isArray(result.items) ? result.items : []
		items.value = reset ? nextItems : items.value.concat(nextItems)
		total.value = Number(result.total) || 0
		hasMore.value = !!result.hasMore
		page.value = targetPage
	} catch (error) {
		console.error('[history] load failed:', error)
		if (reset) {
			items.value = []
			total.value = 0
			hasMore.value = false
		}
		uni.showToast({
			title: error.message || '获取浏览历史失败',
			icon: 'none'
		})
	} finally {
		isLoading.value = false
		isLoadingMore.value = false
	}
}

const clearHistory = () => {
	uni.showModal({
		title: '确认清空',
		content: '确定要清空所有浏览历史吗？',
		success: async (res) => {
			if (!res.confirm) return

			try {
				uni.showLoading({ title: '清空中...' })
				const { result } = await wx.cloud.callFunction({
					name: 'clearViewHistory'
				})

				if (!result?.success) {
					throw new Error(result?.errorMessage || '清空失败')
				}

				items.value = []
				total.value = 0
				hasMore.value = false
				uni.showToast({
					title: '已清空',
					icon: 'success'
				})
			} catch (error) {
				uni.showToast({
					title: error.message || '清空失败',
					icon: 'none'
				})
			} finally {
				uni.hideLoading()
			}
		}
	})
}

const deleteHistoryItem = (item) => {
	uni.showModal({
		title: '删除记录',
		content: '确认删除这条浏览记录吗？',
		success: async (res) => {
			if (!res.confirm) return

			try {
				const { result } = await wx.cloud.callFunction({
					name: 'clearViewHistory',
					data: {
						recipeId: item.recipeId,
						recipeKind: item.recipeKind
					}
				})

				if (!result?.success) {
					throw new Error(result?.errorMessage || '删除失败')
				}

				items.value = items.value.filter((historyItem) => historyItem.historyId !== item.historyId)
				total.value = Math.max(0, total.value - 1)
				uni.showToast({
					title: '已删除',
					icon: 'success'
				})

				if (items.value.length === 0 && hasMore.value) {
					loadHistory(true)
				}
			} catch (error) {
				uni.showToast({
					title: error.message || '删除失败',
					icon: 'none'
				})
			}
		}
	})
}

const goToDetail = (item) => {
	const sourceQuery = item.recipeKind === 'menu'
		? '&source=menu'
		: item.recipeKind === 'original'
			? '&source=original_recipes'
			: ''

	uni.navigateTo({
		url: `/pages/recipe-detail/index?recipeId=${item.recipeId}${sourceQuery}`
	})
}

const formatTime = (value) => {
	if (!value) return ''

	let date = null
	if (typeof value === 'string' || typeof value === 'number') {
		date = new Date(value)
	} else if (value instanceof Date) {
		date = value
	} else if (value.$date) {
		date = new Date(value.$date)
	} else if (value.seconds) {
		date = new Date(value.seconds * 1000)
	} else {
		date = new Date(value)
	}

	if (Number.isNaN(date.getTime())) return ''

	const now = Date.now()
	const diff = now - date.getTime()

	if (diff < 60 * 1000) return '刚刚'
	if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))}分钟前`
	if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / (60 * 60 * 1000))}小时前`
	if (diff < 7 * 24 * 60 * 60 * 1000) return `${Math.floor(diff / (24 * 60 * 60 * 1000))}天前`

	const year = date.getFullYear()
	const month = String(date.getMonth() + 1).padStart(2, '0')
	const day = String(date.getDate()).padStart(2, '0')
	return `${year}-${month}-${day}`
}

onShow(() => {
	loadHistory(true)
})

onReachBottom(() => {
	if (hasMore.value) {
		loadHistory(false)
	}
})
</script>

<style lang="scss" scoped>
.page {
	min-height: 100vh;
	background-color: $page-bg-color;
}

.header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 28rpx 24rpx 12rpx;

	&__title {
		font-size: 34rpx;
		font-weight: 700;
		color: #1f2329;
	}

	&__clear {
		font-size: 26rpx;
		color: $primary-color;
	}
}

.status {
	padding-top: 160rpx;
	display: flex;
	justify-content: center;

	&__text {
		font-size: 28rpx;
		color: #8a9099;
		text-align: center;
	}
}

.empty {
	display: flex;
	flex-direction: column;
	align-items: center;
	padding-top: 160rpx;

	&__icon {
		width: 120rpx;
		height: 120rpx;
		border-radius: 50%;
		background: #f7f8fa;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	&__icon-text {
		font-size: 56rpx;
	}

	&__title {
		margin-top: 28rpx;
		font-size: 32rpx;
		font-weight: 600;
		color: #4e535a;
	}

	&__desc {
		margin-top: 12rpx;
		font-size: 26rpx;
		color: #9aa0a6;
	}
}

.list {
	padding: 12rpx 24rpx 24rpx;

	&__more {
		display: block;
		margin-top: 20rpx;
		text-align: center;
		font-size: 24rpx;
		color: #9aa0a6;
	}
}

.history-item {
	display: flex;
	align-items: center;
	gap: 20rpx;
	background: #ffffff;
	border-radius: 24rpx;
	padding: 20rpx 24rpx;
	margin-bottom: 16rpx;
	box-shadow: 0 4rpx 16rpx rgba(24, 32, 56, 0.06);

	&__cover {
		width: 120rpx;
		height: 120rpx;
		border-radius: 16rpx;
		flex-shrink: 0;
		background: #f2f4f7;
	}

	&__cover--empty {
		display: flex;
		align-items: center;
		justify-content: center;
	}

	&__cover-text {
		font-size: 22rpx;
		color: #a0a6ad;
	}

	&__body {
		flex: 1;
		min-width: 0;
	}

	&__actions {
		display: flex;
		align-items: center;
		gap: 18rpx;
		flex-shrink: 0;
	}

	&__title {
		display: block;
		font-size: 30rpx;
		font-weight: 600;
		color: #1f2329;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	&__time {
		display: block;
		margin-top: 10rpx;
		font-size: 24rpx;
		color: #9aa0a6;
	}

	&__arrow {
		font-size: 40rpx;
		color: #c0c4cc;
		flex-shrink: 0;
		font-weight: 300;
	}

	&__delete {
		padding: 10rpx 18rpx;
		border-radius: 999rpx;
		background: #fff1f1;
	}

	&__delete-text {
		font-size: 22rpx;
		font-weight: 600;
		color: #d95b47;
	}
}
</style>
