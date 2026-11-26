<template>
	<view class="page">
		<view v-if="isLoading" class="loading">
			<text class="loading__text">加载中...</text>
		</view>

		<view v-else-if="items.length === 0" class="empty">
			<view class="empty__icon">
				<text class="empty__icon-text">🛒</text>
			</view>
			<text class="empty__title">你还没有加入任何食材</text>
			<text class="empty__desc">去菜谱页挑选吧</text>
			<view class="empty__btn" @click="goRecipeList">
				<text class="empty__btn-text">去挑菜谱</text>
			</view>
		</view>

		<view v-else class="content">
			<view
				v-for="group in groups"
				:key="group.key"
				class="group"
			>
				<view class="group__header">
					<text class="group__title">{{ group.title }}</text>
					<text class="group__meta">{{ group.checkedCount }}/{{ group.total }}</text>
				</view>

				<view class="card">
					<view
						v-for="item in group.items"
						:key="item._id"
						class="row"
						:class="{ 'row--done': item.checked }"
					>
						<view class="row__main" @click="onToggle(item)">
							<view class="checkbox" :class="{ 'checkbox--checked': item.checked }">
								<view class="checkbox__ring" />
								<text v-if="item.checked" class="checkbox__tick">✓</text>
							</view>
							<view class="row__info">
								<text class="row__name">{{ item.name }}</text>
								<text v-if="item.amount" class="row__amount">{{ item.amount }}</text>
							</view>
						</view>

						<view class="row__remove" @click="onRemove(item)">
							<text class="row__remove-text">✕</text>
						</view>
					</view>
				</view>
			</view>
		</view>

		<view v-if="items.length > 0" class="bottom-bar">
			<view class="bottom-bar__btn bottom-bar__btn--ghost" @click="onClear">
				<text class="bottom-bar__btn-text bottom-bar__btn-text--ghost">清空全部</text>
			</view>
			<view class="bottom-bar__btn" @click="onCopy">
				<text class="bottom-bar__btn-text">一键复制清单</text>
			</view>
		</view>
	</view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'

const items = ref([])
const isLoading = ref(true)
const pendingIds = ref({})

const groups = computed(() => {
	const map = new Map()

	items.value.forEach((item) => {
		const title = item.recipeTitle
			|| (Array.isArray(item.sources) && item.sources[0])
			|| '其他食材'

		if (!map.has(title)) {
			map.set(title, [])
		}

		map.get(title).push(item)
	})

	let index = 0

	return Array.from(map.entries()).map(([title, list]) => {
		index += 1

		return {
			key: `${index}-${title}`,
			title,
			items: list,
			total: list.length,
			checkedCount: list.filter((item) => item.checked).length
		}
	})
})

const pendingCount = computed(() => items.value.filter((item) => !item.checked).length)

const fetchList = async () => {
	if (items.value.length === 0) {
		isLoading.value = true
	}

	try {
		const { result } = await wx.cloud.callFunction({
			name: 'manageShoppingList',
			data: { action: 'get', pageSize: 200 }
		})

		if (result?.success) {
			items.value = Array.isArray(result.items) ? result.items : []
		}
	} catch (error) {
		console.error('[shopping-list] fetchList failed:', error)
		uni.showToast({ title: '采购单加载失败', icon: 'none' })
	} finally {
		isLoading.value = false
	}
}

const onToggle = async (item) => {
	if (!item?._id || pendingIds.value[item._id]) return

	pendingIds.value = Object.assign({}, pendingIds.value, { [item._id]: true })

	const index = items.value.findIndex((entry) => entry._id === item._id)
	const nextChecked = !item.checked

	if (index >= 0) {
		items.value[index] = Object.assign({}, items.value[index], { checked: nextChecked })
	}

	try {
		const { result } = await wx.cloud.callFunction({
			name: 'manageShoppingList',
			data: {
				action: 'toggle',
				itemId: item._id,
				checked: nextChecked
			}
		})

		if (!result?.success) {
			throw new Error(result?.errorMessage || '更新失败')
		}

		if (index >= 0 && result.item) {
			items.value[index] = Object.assign({}, items.value[index], result.item)
		}
	} catch (error) {
		console.error('[shopping-list] toggle failed:', error)
		if (index >= 0) {
			items.value[index] = Object.assign({}, items.value[index], { checked: !nextChecked })
		}
		uni.showToast({ title: '更新失败，请重试', icon: 'none' })
	} finally {
		const nextPending = Object.assign({}, pendingIds.value)
		delete nextPending[item._id]
		pendingIds.value = nextPending
	}
}

const onRemove = (item) => {
	if (!item?._id) return

	uni.showModal({
		title: '删掉这个食材？',
		content: `${item.name}${item.amount ? `（${item.amount}）` : ''}`,
		confirmText: '删除',
		confirmColor: '#b42318',
		success: async (res) => {
			if (!res.confirm) return

			try {
				const { result } = await wx.cloud.callFunction({
					name: 'manageShoppingList',
					data: { action: 'remove', itemId: item._id }
				})

				if (!result?.success) {
					throw new Error(result?.errorMessage || '删除失败')
				}

				items.value = items.value.filter((entry) => entry._id !== item._id)
			} catch (error) {
				console.error('[shopping-list] remove failed:', error)
				uni.showToast({ title: '删除失败，请重试', icon: 'none' })
			}
		}
	})
}

const onClear = () => {
	uni.showModal({
		title: '清空采购单？',
		content: '所有加入的食材都会被删除，无法恢复',
		confirmText: '清空',
		confirmColor: '#b42318',
		success: async (res) => {
			if (!res.confirm) return

			uni.showLoading({ title: '清理中...' })

			try {
				const { result } = await wx.cloud.callFunction({
					name: 'manageShoppingList',
					data: { action: 'clear' }
				})

				if (!result?.success) {
					throw new Error(result?.errorMessage || '清空失败')
				}

				items.value = []
			} catch (error) {
				console.error('[shopping-list] clear failed:', error)
				uni.showToast({ title: '清空失败，请重试', icon: 'none' })
			} finally {
				uni.hideLoading()
			}
		}
	})
}

const buildCopyText = () => {
	const lines = ['🛒 采购清单', '']

	groups.value.forEach((group) => {
		lines.push(`【${group.title}】`)

		group.items.forEach((item) => {
			const amount = item.amount ? ` ${item.amount}` : ''
			lines.push(`${item.checked ? '☑' : '☐'} ${item.name}${amount}`)
		})

		lines.push('')
	})

	lines.push(`共 ${items.value.length} 项，待购 ${pendingCount.value} 项`)

	return lines.join('\n')
}

const onCopy = () => {
	if (!items.value.length) return

	uni.setClipboardData({
		data: buildCopyText(),
		success: () => {
			uni.showToast({ title: '清单已复制', icon: 'success' })
		},
		fail: () => {
			uni.showToast({ title: '复制失败', icon: 'none' })
		}
	})
}

const goRecipeList = () => {
	uni.switchTab({ url: '/pages/index/index' })
}

onShow(() => {
	fetchList()
})
</script>

<style lang="scss" scoped>
.page {
	min-height: 100vh;
	background-color: $page-bg-color;
}

.content {
	padding: 24rpx;
	padding-bottom: calc(160rpx + env(safe-area-inset-bottom));
}

.loading {
	display: flex;
	justify-content: center;
	padding-top: 200rpx;

	&__text {
		font-size: 28rpx;
		color: $text-placeholder;
	}
}

.empty {
	display: flex;
	flex-direction: column;
	align-items: center;
	padding-top: 220rpx;

	&__icon {
		width: 140rpx;
		height: 140rpx;
		border-radius: 50%;
		background: #f0f1f3;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	&__icon-text {
		font-size: 64rpx;
	}

	&__title {
		margin-top: 32rpx;
		font-size: 32rpx;
		font-weight: 600;
		color: #4e535a;
	}

	&__desc {
		margin-top: 12rpx;
		font-size: 26rpx;
		color: $text-placeholder;
	}

	&__btn {
		margin-top: 40rpx;
		padding: 0 56rpx;
		height: 80rpx;
		border-radius: 999rpx;
		background: $primary-color;
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 8rpx 20rpx rgba(250, 102, 80, 0.18);
	}

	&__btn-text {
		font-size: 28rpx;
		font-weight: 600;
		color: #ffffff;
	}
}

.group {
	margin-bottom: 28rpx;

	&__header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 8rpx;
		margin-bottom: 12rpx;
	}

	&__title {
		font-size: 26rpx;
		font-weight: 600;
		color: #6b7076;
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	&__meta {
		font-size: 22rpx;
		color: $text-placeholder;
		flex-shrink: 0;
		margin-left: 16rpx;
	}
}

.card {
	background: $card-bg-color;
	border-radius: 16rpx;
	box-shadow: 0 4rpx 24rpx rgba(0, 0, 0, 0.04);
	overflow: hidden;
}

.row {
	display: flex;
	align-items: center;
	border-bottom: 1rpx solid #f4f5f7;

	&:last-child {
		border-bottom: none;
	}

	&--done {
		opacity: 0.45;
	}

	&__main {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 20rpx;
		padding: 24rpx 8rpx 24rpx 28rpx;
	}

	&__info {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: baseline;
		gap: 12rpx;
	}

	&__name {
		font-size: 30rpx;
		font-weight: 600;
		color: #333333;

		.row--done & {
			color: #999999;
			text-decoration: line-through;
		}
	}

	&__amount {
		font-size: 24rpx;
		color: #9aa0a6;
		flex-shrink: 0;

		.row--done & {
			color: #bbbbbb;
			text-decoration: line-through;
		}
	}

	&__remove {
		width: 76rpx;
		height: 76rpx;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	&__remove-text {
		font-size: 26rpx;
		color: #c9ccd1;
	}
}

.checkbox {
	width: 40rpx;
	height: 40rpx;
	border-radius: 50%;
	display: flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
	position: relative;
	transition: all 0.2s ease;

	&__ring {
		width: 100%;
		height: 100%;
		border-radius: 50%;
		border: 2rpx solid #d0d3d9;
		box-sizing: border-box;
		transition: all 0.2s ease;
	}

	&--checked {
		.checkbox__ring {
			background: $primary-color;
			border-color: $primary-color;
		}
	}

	&__tick {
		position: absolute;
		font-size: 22rpx;
		color: #ffffff;
		font-weight: 700;
		line-height: 1;
	}
}

.bottom-bar {
	position: fixed;
	bottom: 0;
	left: 0;
	right: 0;
	display: flex;
	gap: 20rpx;
	padding: 20rpx 28rpx calc(20rpx + env(safe-area-inset-bottom));
	background: $card-bg-color;
	box-shadow: 0 -4rpx 24rpx rgba(0, 0, 0, 0.04);
	z-index: 10;

	&__btn {
		flex: 1;
		height: 88rpx;
		border-radius: 999rpx;
		background: $primary-color;
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 8rpx 20rpx rgba(250, 102, 80, 0.18);

		&--ghost {
			background: #f4f5f7;
			box-shadow: none;
		}
	}

	&__btn-text {
		font-size: 28rpx;
		font-weight: 600;
		color: #ffffff;

		&--ghost {
			color: #6b7076;
		}
	}
}
</style>
