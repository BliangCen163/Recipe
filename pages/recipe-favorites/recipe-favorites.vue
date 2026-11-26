<template>
	<view class="page">
		<view v-if="isLoading" class="state">
			<text class="state__text">正在加载收藏...</text>
		</view>

		<view v-else-if="errorMessage" class="state">
			<view class="state__icon state__icon--error">
				<text class="state__icon-text">!</text>
			</view>
			<text class="state__title">收藏加载失败</text>
			<text class="state__desc">{{ errorMessage }}</text>
			<text class="state__action" @click="loadFavorites(true)">重新加载</text>
		</view>

		<view v-else-if="items.length === 0" class="state">
			<view class="state__icon">
				<text class="state__icon-text">♥</text>
			</view>
			<text class="state__title">还没有收藏菜谱</text>
			<text class="state__desc">在菜谱详情页点一下右上角的心，收藏的菜谱就会出现在这里</text>
			<text class="state__action" @click="goRecipeList">去挑几道菜</text>
		</view>

		<view v-else class="list">
			<view class="list__header">
				<text class="list__title">菜谱收藏</text>
				<text class="list__count">共 {{ total }} 道</text>
			</view>

			<view
				v-for="item in items"
				:key="item.favoriteId"
				class="recipe-item"
				@click="goToDetail(item)"
			>
				<image v-if="item.cover" class="recipe-item__cover" :src="item.cover" mode="aspectFill" />
				<view class="recipe-item__body">
					<text class="recipe-item__title">{{ item.title }}</text>
					<view v-if="item.tags.length" class="recipe-item__tags">
						<text v-for="tag in item.tags" :key="tag" class="recipe-item__tag">{{ tag }}</text>
					</view>
					<text v-if="describeIngredients(item)" class="recipe-item__ingredients">
						{{ describeIngredients(item) }}
					</text>
				</view>
				<view class="recipe-item__fav" @click.stop="confirmRemove(item)">
					<text class="recipe-item__fav-icon">♥</text>
				</view>
			</view>

			<text v-if="isLoadingMore" class="list__more">加载中...</text>
			<text v-else-if="hasMore" class="list__more">上拉加载更多</text>
			<text v-else class="list__footer">点击爱心可取消收藏</text>
		</view>
	</view>
</template>

<script setup>
import { ref, watch } from 'vue'
import { onPullDownRefresh, onReachBottom, onShow } from '@dcloudio/uni-app'
import { userStore } from '../../stores/user'

const PAGE_SIZE = 12

const items = ref([])
const total = ref(0)
const hasMore = ref(false)
const isLoading = ref(true)
const isLoadingMore = ref(false)
const errorMessage = ref('')
const hasLoaded = ref(false)
const page = ref(0)

const describeIngredients = (item) => {
	const sourceIngredients = Array.isArray(item.sourceIngredients) ? item.sourceIngredients : []
	return sourceIngredients.join('、')
}

const loadFavorites = async (reset = true, silent = false) => {
	if (!userStore.openid) {
		if (userStore.loginLoading) {
			isLoading.value = true
			return
		}

		items.value = []
		total.value = 0
		hasMore.value = false
		isLoading.value = false
		errorMessage.value = userStore.loginError
			? `登录状态异常：${userStore.loginError}`
			: '还没有完成微信登录，请回到「我的」页重新登录'
		return
	}

	if (!reset && (isLoadingMore.value || !hasMore.value)) return

	const targetPage = reset ? 1 : page.value + 1

	if (reset) {
		if (!silent) isLoading.value = true
	} else {
		isLoadingMore.value = true
	}

	errorMessage.value = ''

	try {
		const { result } = await wx.cloud.callFunction({
			name: 'getFavorites',
			data: { page: targetPage, pageSize: PAGE_SIZE }
		})

		if (!result?.success) {
			throw new Error(result?.errorMessage || '收藏服务返回了未知错误')
		}

		const nextItems = Array.isArray(result.items) ? result.items : []
		items.value = reset ? nextItems : items.value.concat(nextItems)
		total.value = Number(result.total) || 0
		hasMore.value = !!result.hasMore
		page.value = targetPage
		hasLoaded.value = true
	} catch (error) {
		const code = error?.errCode ?? error?.code ?? ''
		console.error('[recipe-favorites] getFavorites failed:', code, error?.errMsg || error?.message || error)

		if (reset) {
			items.value = []
			total.value = 0
			hasMore.value = false
			errorMessage.value = code
				? `收藏云函数不可用（errCode=${code}），请确认 cloudfunctions/getFavorites 已上传部署`
				: (error?.message || '收藏云函数不可用，请确认 cloudfunctions/getFavorites 已上传部署')
		} else {
			uni.showToast({ title: '加载更多失败，请重试', icon: 'none' })
		}
	} finally {
		isLoading.value = false
		isLoadingMore.value = false
	}
}

const confirmRemove = (item) => {
	uni.showModal({
		title: '取消收藏',
		content: `确定把「${item.title}」移出收藏吗？`,
		confirmColor: '#FA6650',
		success: async (res) => {
			if (!res.confirm) return

			uni.showLoading({ title: '处理中...' })
			try {
				const { result } = await wx.cloud.callFunction({
					name: 'toggleFavorite',
					data: {
						action: 'remove',
						recipeId: item.recipeId,
						recipeKind: item.recipeKind
					}
				})

				if (!result?.success) {
					throw new Error(result?.errorMessage || '取消失败')
				}

				items.value = items.value.filter((recipe) => recipe.favoriteId !== item.favoriteId)
				total.value = Math.max(0, total.value - 1)
				uni.showToast({ title: '已移出收藏', icon: 'none' })

				if (items.value.length === 0 && hasMore.value) {
					loadFavorites(true, true)
				}
			} catch (error) {
				console.error('[recipe-favorites] remove failed:', error)
				uni.showToast({ title: error?.message || '取消失败，请重试', icon: 'none' })
			} finally {
				uni.hideLoading()
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

const goRecipeList = () => {
	uni.switchTab({
		url: '/pages/index/index'
	})
}

onShow(() => {
	loadFavorites(true, hasLoaded.value)
})

watch(
	() => userStore.openid,
	(value) => {
		if (value) {
			loadFavorites(true, hasLoaded.value)
		}
	}
)

watch(
	() => userStore.loginReady,
	(ready) => {
		if (!ready || userStore.openid) return
		loadFavorites(true)
	}
)

onReachBottom(() => {
	if (hasMore.value) {
		loadFavorites(false)
	}
})

onPullDownRefresh(async () => {
	await loadFavorites(true, true)
	uni.stopPullDownRefresh()
})
</script>

<style lang="scss" scoped>
.page {
	min-height: 100vh;
	background-color: $page-bg-color;
}

.state {
	display: flex;
	flex-direction: column;
	align-items: center;
	padding-top: 160rpx;

	&__text {
		font-size: 28rpx;
		color: #9aa0a6;
	}

	&__icon {
		width: 120rpx;
		height: 120rpx;
		border-radius: 50%;
		background: #f7f8fa;
		display: flex;
		align-items: center;
		justify-content: center;

		&--error {
			background: #fdecea;
		}
	}

	&__icon-text {
		font-size: 56rpx;
		color: #d0d3d9;
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
		text-align: center;
		padding: 0 60rpx;
		line-height: 1.7;
	}

	&__action {
		margin-top: 28rpx;
		padding: 16rpx 40rpx;
		border-radius: 999rpx;
		font-size: 26rpx;
		color: #ffffff;
		background: $primary-color;
	}
}

.list {
	padding: 24rpx;

	&__header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		margin-bottom: 20rpx;
	}

	&__title {
		font-size: 34rpx;
		font-weight: 700;
		color: #1f2329;
	}

	&__count {
		font-size: 24rpx;
		color: #9aa0a6;
	}

	&__more {
		display: block;
		margin-top: 20rpx;
		text-align: center;
		font-size: 24rpx;
		color: #9aa0a6;
	}

	&__footer {
		display: block;
		margin-top: 12rpx;
		text-align: center;
		font-size: 22rpx;
		color: #b6bac0;
	}
}

.recipe-item {
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
	}

	&__body {
		flex: 1;
		min-width: 0;
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

	&__tags {
		display: flex;
		flex-wrap: wrap;
		gap: 10rpx;
		margin-top: 12rpx;
	}

	&__tag {
		padding: 6rpx 14rpx;
		border-radius: 999rpx;
		font-size: 22rpx;
		color: #6a4a3c;
		background: #fff0ea;
	}

	&__ingredients {
		display: block;
		margin-top: 12rpx;
		font-size: 24rpx;
		color: #9aa0a6;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	&__fav {
		margin-left: 20rpx;
		padding: 10rpx;
		flex-shrink: 0;
	}

	&__fav-icon {
		font-size: 36rpx;
		color: $primary-color;
	}
}
</style>
