<template>
	<view class="page">
		<view class="header">
			<image
				v-if="userStore.avatarUrl"
				class="header__avatar-image"
				:src="userStore.avatarUrl"
				mode="aspectFill"
			/>
			<view v-else class="header__avatar">
				<text class="header__avatar-text">{{ displayName.slice(0, 1) }}</text>
			</view>
			<view class="header__info">
				<text class="header__name">{{ displayName }}</text>
				<text class="header__status" @click="goToProfile">{{ statusText }}</text>
				<text v-if="needsProfile" class="header__hint" @click="goToProfile">完善头像昵称，展示微信昵称 ›</text>
			</view>
			<view class="header__edit" @click="goToProfile">
				<text class="header__edit-text">编辑资料 ›</text>
			</view>
		</view>

		<view class="backend-card">
			<view class="backend-card__header">
				<text class="backend-card__title">AI 后端</text>
				<text class="backend-card__desc">影响后续创建的 AI 任务</text>
			</view>
			<view class="backend-card__options">
				<view
					v-for="item in backendOptions"
					:key="item.value"
					class="backend-chip"
					:class="{ 'backend-chip--active': aiBackend === item.value }"
					@click="setAiBackend(item.value)"
				>
					<text class="backend-chip__title">{{ item.label }}</text>
					<text class="backend-chip__desc">{{ item.desc }}</text>
				</view>
			</view>
		</view>

		<view class="shortcut-card" @click="goToShoppingList">
			<text class="shortcut-card__icon">🛒</text>
			<view class="shortcut-card__body">
				<text class="shortcut-card__title">我的采购单</text>
				<text class="shortcut-card__desc">查看和管理待购食材</text>
			</view>
			<text class="shortcut-card__arrow">›</text>
		</view>

		<view class="shortcut-card" @click="goToPersonalRecipes">
			<text class="shortcut-card__icon">🍳</text>
			<view class="shortcut-card__body">
				<text class="shortcut-card__title">个人菜谱</text>
				<text class="shortcut-card__desc">查看你创建的专属菜谱</text>
			</view>
			<text class="shortcut-card__arrow">›</text>
		</view>

		<view class="shortcut-card" @click="goToHistory">
			<text class="shortcut-card__icon">🕒</text>
			<view class="shortcut-card__body">
				<text class="shortcut-card__title">浏览历史</text>
				<text class="shortcut-card__desc">查看最近浏览过的菜谱</text>
			</view>
			<text class="shortcut-card__arrow">›</text>
		</view>

		<view class="shortcut-card shortcut-card--accent" @click="goToRecipeFavorites">
			<text class="shortcut-card__icon">♥</text>
			<view class="shortcut-card__body">
				<text class="shortcut-card__title">菜谱收藏</text>
				<text class="shortcut-card__desc">查看你收藏过的菜谱</text>
			</view>
			<text class="shortcut-card__arrow">›</text>
		</view>
	</view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { userStore } from '../../stores/user'

const aiBackend = ref('cloudbase')

const backendOptions = [
	{
		value: 'cloudbase',
		label: 'CloudBase AI',
		desc: '走云端模型'
	},
	{
		value: 'openai_compatible',
		label: '本地 AI',
		desc: '走本地 Worker / Ollama'
	}
]

const loadAiBackend = () => {
	try {
		aiBackend.value = uni.getStorageSync('aiBackend') || 'cloudbase'
		if (!uni.getStorageSync('aiBackend')) {
			uni.setStorageSync('aiBackend', aiBackend.value)
		}
	} catch (error) {
		aiBackend.value = 'cloudbase'
	}
}

const FALLBACK_NICKNAME = '微信用户'
const DEFAULT_CLOUD_NICKNAME = '美食爱好者'
const storedNickname = ref('')

const normalizeNickname = (value) => {
	const text = String(value || '').trim()
	if (!text || text === DEFAULT_CLOUD_NICKNAME) return ''
	return text
}

const confirmedNickname = computed(
	() => normalizeNickname(userStore.nickname) || normalizeNickname(storedNickname.value)
)
const displayName = computed(() => confirmedNickname.value || FALLBACK_NICKNAME)
const needsProfile = computed(() => userStore.isLoggedIn && !confirmedNickname.value)

const statusText = computed(() => {
	if (userStore.isLoggedIn) return '尊贵的用户，欢迎回来'
	if (userStore.loginLoading) return '正在为你准备登录状态...'
	return '未登录，点击前往资料页登录'
})

const goToProfile = () => {
	uni.navigateTo({
		url: '/pages/user/profile/index'
	})
}

const goToShoppingList = () => {
	uni.navigateTo({
		url: '/pages/shopping-list/index'
	})
}

const goToPersonalRecipes = () => {
	uni.navigateTo({
		url: '/pages/user/personal_recipese'
	})
}

const goToHistory = () => {
	uni.navigateTo({
		url: '/pages/user/history/index'
	})
}

const goToRecipeFavorites = () => {
	uni.navigateTo({
		url: '/pages/recipe-favorites/recipe-favorites'
	})
}

const setAiBackend = (value) => {
	if (!value || aiBackend.value === value) return

	aiBackend.value = value
	uni.setStorageSync('aiBackend', value)
	userStore.setPrefs({ aiBackend: value })

	if (userStore.openid) {
		wx.cloud.callFunction({
			name: 'updateUserProfile',
			data: { aiBackend: value }
		}).catch((error) => {
			console.warn('[user] sync aiBackend failed:', error?.message || error)
		})
	}

	uni.showToast({
		title: value === 'cloudbase' ? '已切换到 CloudBase AI' : '已切换到本地 AI',
		icon: 'none'
	})
}

onShow(() => {
	loadAiBackend()
	storedNickname.value = uni.getStorageSync('nickname') || ''
})
</script>

<style lang="scss" scoped>
.page {
	min-height: 100vh;
	padding-bottom: 48rpx;
	background-color: $page-bg-color;
}

.header {
	display: flex;
	align-items: center;
	gap: 24rpx;
	padding: 48rpx 32rpx 32rpx;
	background: linear-gradient(145deg, #fff7f4 0%, #ffffff 100%);

	&__avatar {
		width: 96rpx;
		height: 96rpx;
		border-radius: 50%;
		background: linear-gradient(135deg, $primary-color 0%, #ff8a65 100%);
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 8rpx 24rpx rgba(250, 102, 80, 0.25);
		flex-shrink: 0;
	}

	&__avatar-image {
		width: 96rpx;
		height: 96rpx;
		border-radius: 50%;
		display: block;
		box-shadow: 0 8rpx 24rpx rgba(250, 102, 80, 0.18);
		flex-shrink: 0;
	}

	&__avatar-text {
		font-size: 36rpx;
		font-weight: bold;
		color: #ffffff;
	}

	&__info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 8rpx;
	}

	&__name {
		font-size: 34rpx;
		font-weight: 700;
		color: #1f2329;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	&__status {
		font-size: 24rpx;
		color: #9aa0a6;
	}

	&__hint {
		font-size: 22rpx;
		color: $primary-color;
	}

	&__edit {
		flex-shrink: 0;
		padding: 12rpx 22rpx;
		border-radius: 999rpx;
		background: rgba(250, 102, 80, 0.1);
	}

	&__edit-text {
		font-size: 24rpx;
		font-weight: 600;
		color: $primary-color;
	}
}

.backend-card {
	margin: 24rpx;
	margin-bottom: 0;
	padding: 28rpx 24rpx;
	background: #ffffff;
	border-radius: 24rpx;
	box-shadow: 0 4rpx 16rpx rgba(24, 32, 56, 0.06);

	&__header {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 16rpx;
	}

	&__title {
		font-size: 30rpx;
		font-weight: 700;
		color: #1f2329;
	}

	&__desc {
		font-size: 22rpx;
		color: #9aa0a6;
	}

	&__options {
		margin-top: 20rpx;
		display: flex;
		gap: 16rpx;
	}
}

.backend-chip {
	flex: 1;
	padding: 20rpx 18rpx;
	border-radius: 20rpx;
	background: #f7f8fa;
	border: 2rpx solid transparent;

	&--active {
		background: rgba(250, 102, 80, 0.08);
		border-color: rgba(250, 102, 80, 0.28);
	}

	&__title {
		display: block;
		font-size: 26rpx;
		font-weight: 700;
		color: #1f2329;
	}

	&__desc {
		display: block;
		margin-top: 8rpx;
		font-size: 22rpx;
		color: #8a9099;
	}
}

.shortcut-card {
	display: flex;
	align-items: center;
	gap: 20rpx;
	margin: 24rpx;
	margin-bottom: 0;
	padding: 28rpx 24rpx;
	background: #ffffff;
	border-radius: 24rpx;
	box-shadow: 0 4rpx 16rpx rgba(24, 32, 56, 0.06);

	&__icon {
		font-size: 44rpx;
		flex-shrink: 0;
	}

	&__body {
		flex: 1;
		min-width: 0;
	}

	&__title {
		display: block;
		font-size: 30rpx;
		font-weight: 700;
		color: #1f2329;
	}

	&__desc {
		display: block;
		margin-top: 6rpx;
		font-size: 22rpx;
		color: #8a9099;
	}

	&__arrow {
		font-size: 40rpx;
		color: #c0c4cc;
		flex-shrink: 0;
		font-weight: 300;
	}

	&--accent {
		background: linear-gradient(145deg, #fff8f4 0%, #ffffff 100%);
	}
}
</style>
