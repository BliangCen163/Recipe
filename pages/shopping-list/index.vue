<template>
	<view class="page">
		<view v-if="isLoading" class="loading">
			<text class="loading__text">加载中...</text>
		</view>

		<view v-else-if="shoppingList.length === 0" class="empty">
			<view class="empty__icon">
				<text class="empty__icon-text">🛒</text>
			</view>
			<text class="empty__title">采购单空空如也</text>
			<text class="empty__desc">去挑几个好菜吧</text>
		</view>

		<view v-else class="content">
			<view class="card">
				<transition-group name="list" tag="view">
					<view
						v-for="item in pendingList"
						:key="`${item.name}__${item.amount}`"
						class="row"
						@click="onToggle(item)"
					>
						<view class="row__left">
							<view class="checkbox">
								<view class="checkbox__ring" />
							</view>
							<view class="row__info">
								<text class="row__name">{{ item.name }}</text>
								<text v-if="item.sources && item.sources.length" class="row__source">
									来自: {{ item.sources.join('、') }}
								</text>
							</view>
						</view>
						<text class="row__amount">{{ item.amount }}</text>
					</view>
				</transition-group>
			</view>

			<view v-if="completedList.length > 0" class="completed-section">
				<text class="completed-section__title">已购项</text>
				<view class="card">
					<transition-group name="list" tag="view">
						<view
							v-for="item in completedList"
							:key="`${item.name}__${item.amount}`"
							class="row row--done"
							@click="onToggle(item)"
						>
							<view class="row__left">
								<view class="checkbox checkbox--checked">
									<view class="checkbox__ring" />
									<text class="checkbox__tick">✓</text>
								</view>
								<view class="row__info">
									<text class="row__name row__name--done">{{ item.name }}</text>
									<text v-if="item.sources && item.sources.length" class="row__source row__source--done">
										来自: {{ item.sources.join('、') }}
									</text>
								</view>
							</view>
							<text class="row__amount row__amount--done">{{ item.amount }}</text>
						</view>
					</transition-group>
				</view>
			</view>
		</view>

		<view v-if="completedList.length > 0" class="bottom-bar">
			<button class="bottom-bar__btn" hover-class="bottom-bar__btn--hover" @click="onClear">
				一键清空已购食材
			</button>
		</view>
	</view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'

const shoppingList = ref([])
const isLoading = ref(true)

const pendingList = computed(() => shoppingList.value.filter((item) => !item.checked))
const completedList = computed(() => shoppingList.value.filter((item) => item.checked))

const fetchList = async () => {
	isLoading.value = true
	try {
		const { result } = await wx.cloud.callFunction({
			name: 'manageShoppingList',
			data: { action: 'get' }
		})
		if (result?.success) {
			shoppingList.value = result.shoppingList || []
		}
	} catch (error) {
		console.error('[shopping-list] fetchList failed:', error)
	} finally {
		isLoading.value = false
	}
}

const onToggle = async (item) => {
	const index = shoppingList.value.findIndex(
		(i) => i.name === item.name && i.amount === item.amount
	)
	if (index === -1) return

	shoppingList.value[index].checked = !shoppingList.value[index].checked
	shoppingList.value = [...shoppingList.value]

	try {
		await wx.cloud.callFunction({
			name: 'manageShoppingList',
			data: {
				action: 'toggle',
				name: item.name,
				amount: item.amount
			}
		})
	} catch (error) {
		console.error('[shopping-list] toggle failed:', error)
		shoppingList.value[index].checked = !shoppingList.value[index].checked
		shoppingList.value = [...shoppingList.value]
	}
}

const onClear = async () => {
	uni.showLoading({ title: '清理中...' })
	try {
		const { result } = await wx.cloud.callFunction({
			name: 'manageShoppingList',
			data: { action: 'clear' }
		})
		if (result?.success) {
			shoppingList.value = result.shoppingList || []
			uni.showToast({ title: '已清空', icon: 'success' })
		}
	} catch (error) {
		console.error('[shopping-list] clear failed:', error)
		uni.showToast({ title: '操作失败', icon: 'none' })
	} finally {
		uni.hideLoading()
	}
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
	padding-bottom: calc(140rpx + env(safe-area-inset-bottom));
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
	padding-top: 240rpx;

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
}

.card {
	background: $card-bg-color;
	border-radius: 16rpx;
	box-shadow: 0 4rpx 24rpx rgba(0, 0, 0, 0.04);
}

.completed-section {
	margin-top: 32rpx;

	&__title {
		display: block;
		font-size: 24rpx;
		color: #bbb;
		margin-bottom: 12rpx;
		padding-left: 8rpx;
	}
}

.row {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 24rpx 32rpx;
	border-bottom: 1rpx solid #f0f0f0;
	transition: all 0.35s ease;

	&--done {
		opacity: 0.4;
	}

	&__left {
		display: flex;
		align-items: center;
		gap: 20rpx;
		flex: 1;
		min-width: 0;
	}

	&__info {
		flex: 1;
		min-width: 0;
	}

	&__name {
		font-size: 30rpx;
		font-weight: 600;
		color: #333;

		&--done {
			color: #ccc;
			text-decoration: line-through;
		}
	}

	&__source {
		display: block;
		margin-top: 4rpx;
		font-size: 24rpx;
		color: #999;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;

		&--done {
			color: #ccc;
		}
	}

	&__amount {
		font-size: 28rpx;
		font-weight: 600;
		color: #333;
		flex-shrink: 0;
		margin-left: 16rpx;

		&--done {
			color: #ccc;
			text-decoration: line-through;
		}
	}
}

.row:last-child {
	border-bottom: none;
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
	transition: all 0.25s ease;

	&__ring {
		width: 100%;
		height: 100%;
		border-radius: 50%;
		border: 2rpx solid #d0d3d9;
		box-sizing: border-box;
		transition: all 0.25s ease;
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

.list-move {
	transition: transform 0.35s ease;
}

.list-enter-active {
	transition: all 0.35s ease;
}

.list-leave-active {
	transition: all 0.3s ease;
	position: absolute;
}

.list-enter-from {
	opacity: 0;
	transform: translateX(-40rpx);
}

.list-leave-to {
	opacity: 0;
	transform: translateX(40rpx);
}

.bottom-bar {
	position: fixed;
	bottom: 0;
	left: 0;
	right: 0;
	padding: 24rpx 32rpx calc(24rpx + env(safe-area-inset-bottom));
	background: $card-bg-color;
	box-shadow: 0 -4rpx 24rpx rgba(0, 0, 0, 0.04);
	z-index: 10;

	&__btn {
		width: 100%;
		height: 88rpx;
		line-height: 88rpx;
		border-radius: 44rpx;
		background: $primary-color;
		color: #ffffff;
		font-size: 30rpx;
		font-weight: 600;
		border: none;
		box-shadow: 0 8rpx 24rpx rgba(250, 102, 80, 0.2);

		&::after {
			border: none;
		}

		&--hover {
			opacity: 0.85;
		}
	}
}
</style>