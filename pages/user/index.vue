<template>
	<view class="page">
		<view class="header">
			<button
				class="header__avatar-btn"
				open-type="chooseAvatar"
				hover-class="none"
				@chooseavatar="onChooseAvatar"
			>
				<image
					v-if="userStore.avatarUrl"
					class="header__avatar-image"
					:src="userStore.avatarUrl"
					mode="aspectFill"
				/>
				<view v-else class="header__avatar">
					<text class="header__avatar-text">{{ displayName.slice(0, 1) }}</text>
				</view>
				<view class="header__avatar-tip">
					<text class="header__avatar-tip-text">点我换头像</text>
				</view>
			</button>
			<view class="header__info">
				<input
					v-model="nickname"
					class="header__name-input"
					type="nickname"
					placeholder="点击填写昵称"
					@blur="onNicknameBlur"
				/>
				<text class="header__status">{{ statusText }}</text>
				<text class="header__hint">{{ hintText }}</text>
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

		<view class="shortcut-card shortcut-card--accent" @click="goToPersonalRecipes">
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

		<view v-if="isLoading || !userStore.loginReady" class="loading">
			<text class="loading__text">加载中...</text>
			<text class="loading__retry" @click="retryLogin">微信登录</text>
		</view>

		<view v-else-if="savedRecipes.length === 0" class="empty">
			<view class="empty__icon">
				<text class="empty__icon-text">♥</text>
			</view>
			<text class="empty__title">还没有收藏菜谱</text>
			<text class="empty__desc">{{ emptyDescription }}</text>
			<text v-if="!userStore.isLoggedIn" class="empty__retry" @click="retryLogin">微信登录</text>
		</view>

		<view v-else class="list">
			<view class="list__header">
				<text class="list__title">我的收藏</text>
			</view>
			<view
				v-for="item in savedRecipes"
				:key="item._id"
				class="recipe-item"
				@click="goToDetail(item)"
			>
				<image v-if="item.cover" class="recipe-item__cover" :src="item.cover" mode="aspectFill" />
				<view class="recipe-item__body">
					<text class="recipe-item__title">{{ item.title }}</text>
					<view class="recipe-item__tags">
						<text v-for="tag in item.tags" :key="tag" class="recipe-item__tag">{{ tag }}</text>
					</view>
					<text class="recipe-item__ingredients">
						{{ (item.sourceIngredients || item.ingredients.map((ingredient) => ingredient.name)).join('、') }}
					</text>
				</view>
				<view class="recipe-item__fav">
					<text class="recipe-item__fav-icon">♥</text>
				</view>
			</view>
		</view>
	</view>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { userStore } from '../../stores/user'

const savedRecipes = ref([])
const isLoading = ref(true)
const isSavingAvatar = ref(false)
const isSavingNickname = ref(false)
const nickname = ref('')
const hasLoadedProfile = ref(false)
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

const db = wx.cloud.database()

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

const displayName = computed(() => {
	if (nickname.value) return nickname.value
	if (userStore.nickname) return userStore.nickname
	return '美食爱好者'
})

const statusText = computed(() => {
	if (userStore.isLoggedIn) return '尊贵的用户，欢迎回来'
	if (userStore.loginLoading) return '正在为你准备登录状态...'
	if (userStore.loginError) return '未登录，点击下方按钮重新发起微信登录'
	return '未登录'
})

const hintText = computed(() => {
	if (isSavingAvatar.value) return '头像上传中，请稍候'
	if (isSavingNickname.value) return '昵称保存中，请稍候'
	return '点击头像或昵称即可修改资料'
})

const emptyDescription = computed(() => {
	if (userStore.isLoggedIn) {
		return '去首页或剩菜盲盒生成菜谱后收藏吧'
	}

	if (userStore.loginError) {
		return `最近一次登录失败：${userStore.loginError}`
	}

	return '点击“微信登录”后会重新执行云函数登录。'
})

const fetchSavedRecipes = async (showSkeleton = true) => {
	if (!userStore.openid) {
		savedRecipes.value = []
		isLoading.value = false
		hasLoadedProfile.value = true
		return
	}

	if (showSkeleton) {
		isLoading.value = true
	}

	try {
		const { data: user } = await db.collection('users').doc(userStore.openid).get()
		const favoriteIds = Array.isArray(user?.savedRecipes) ? user.savedRecipes : []

		userStore.updateProfile(user?.nickname || user?.nickName || '美食爱好者', user?.avatarUrl || userStore.avatarUrl)
		userStore.setSavedRecipes(favoriteIds)
		nickname.value = user?.nickname || user?.nickName || '美食爱好者'

		if (!favoriteIds.length) {
			savedRecipes.value = []
			return
		}

		const batchSize = 10
		const allRecipes = []
		for (let i = 0; i < favoriteIds.length; i += batchSize) {
			const batch = favoriteIds.slice(i, i + batchSize)
			const { data: batchRecipes } = await db.collection('recipes')
				.where({ _id: db.command.in(batch) })
				.get()
			allRecipes.push(...batchRecipes)
		}

		const recipeMap = new Map(allRecipes.map((item) => [item._id, item]))
		savedRecipes.value = favoriteIds.map((id) => recipeMap.get(id)).filter(Boolean)
	} catch (error) {
		console.error('[user] fetchSavedRecipes failed:', error)
		savedRecipes.value = []
	} finally {
		isLoading.value = false
		hasLoadedProfile.value = true
	}
}

const goToDetail = (item) => {
	uni.navigateTo({
		url: `/pages/recipe-detail/index?recipeId=${item._id}`
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

const onChooseAvatar = async (event) => {
	if (!userStore.openid) {
		uni.showToast({ title: '请先完成微信登录', icon: 'none' })
		return
	}

	const avatarPath = event.detail?.avatarUrl
	if (!avatarPath) return

	const ext = avatarPath.split('.').pop() || 'png'
	const cloudPath = `avatars/${userStore.openid}-${Date.now()}.${ext}`

	isSavingAvatar.value = true
	uni.showLoading({ title: '上传头像中...' })
	try {
		const { fileID } = await wx.cloud.uploadFile({
			cloudPath,
			filePath: avatarPath
		})

		const { result } = await wx.cloud.callFunction({
			name: 'updateUserProfile',
			data: {
				avatarUrl: fileID
			}
		})

		if (!result?.success) {
			throw new Error(result?.errorMessage || '头像更新失败')
		}

		userStore.updateProfile(result.nickname || userStore.nickname, result.avatarUrl || fileID)
		uni.showToast({ title: '头像已更新', icon: 'success' })
	} catch (error) {
		console.error('[user] onChooseAvatar failed:', error)
		uni.showToast({ title: '头像更新失败', icon: 'none' })
	} finally {
		isSavingAvatar.value = false
		uni.hideLoading()
	}
}

const onNicknameBlur = async (event) => {
	if (!userStore.openid) {
		uni.showToast({ title: '请先完成微信登录', icon: 'none' })
		nickname.value = userStore.nickname || '美食爱好者'
		return
	}

	const nextNickname = (event.detail?.value || nickname.value || '').trim() || '美食爱好者'
	nickname.value = nextNickname

	if (nextNickname === userStore.nickname) return

	try {
		isSavingNickname.value = true
		uni.showLoading({ title: '保存昵称中...' })
		const { result } = await wx.cloud.callFunction({
			name: 'updateUserProfile',
			data: {
				nickname: nextNickname,
				avatarUrl: userStore.avatarUrl
			}
		})

		if (!result?.success) {
			throw new Error(result?.errorMessage || '昵称更新失败')
		}

		nickname.value = result.nickname || nextNickname
		userStore.updateProfile(result.nickname || nextNickname, result.avatarUrl || userStore.avatarUrl)
		uni.setStorageSync('nickname', result.nickname || nextNickname)
		uni.setStorageSync('avatarUrl', result.avatarUrl || userStore.avatarUrl)
		uni.showToast({ title: '昵称已保存', icon: 'success' })
	} catch (error) {
		console.error('[user] onNicknameBlur failed:', error)
		nickname.value = userStore.nickname || '美食爱好者'
		uni.showToast({ title: '昵称保存失败', icon: 'none' })
	} finally {
		isSavingNickname.value = false
		uni.hideLoading()
	}
}

const retryLogin = async () => {
	const app = getApp()
	if (app?.globalData?.runSilentLogin) {
		isLoading.value = true
		hasLoadedProfile.value = false
		await app.globalData.runSilentLogin()
		if (userStore.openid) {
			await fetchSavedRecipes(true)
		} else {
			isLoading.value = false
		}
		return
	}

	uni.showToast({ title: '重试入口不可用，请重启小程序', icon: 'none' })
}

const setAiBackend = (value) => {
	if (!value || aiBackend.value === value) return

	aiBackend.value = value
	uni.setStorageSync('aiBackend', value)
	uni.showToast({
		title: value === 'cloudbase' ? '已切换到 CloudBase AI' : '已切换到本地 AI',
		icon: 'none'
	})
}

onShow(() => {
	loadAiBackend()

	if (userStore.openid) {
		fetchSavedRecipes(!hasLoadedProfile.value)
		return
	}

	if (!userStore.loginReady) {
		isLoading.value = true
		return
	}

	isLoading.value = false
})

watch(
	() => userStore.openid,
	(value) => {
		if (value) {
			nickname.value = userStore.nickname || '美食爱好者'
			fetchSavedRecipes(!hasLoadedProfile.value)
			return
		}

		nickname.value = userStore.nickname || '美食爱好者'
		savedRecipes.value = []
		isLoading.value = false
	},
	{ immediate: true }
)
</script>

<style lang="scss" scoped>
.page {
	min-height: 100vh;
	background-color: $page-bg-color;
}

.header {
	display: flex;
	align-items: center;
	gap: 24rpx;
	padding: 48rpx 32rpx 32rpx;
	background: linear-gradient(145deg, #fff7f4 0%, #ffffff 100%);

	&__avatar-btn {
		padding: 0;
		border: none;
		background: transparent;
		line-height: 1;
	}

	&__avatar-btn::after {
		border: none;
	}

	&__avatar {
		width: 96rpx;
		height: 96rpx;
		border-radius: 50%;
		background: linear-gradient(135deg, $primary-color 0%, #ff8a65 100%);
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 8rpx 24rpx rgba(250, 102, 80, 0.25);
	}

	&__avatar-image {
		width: 96rpx;
		height: 96rpx;
		border-radius: 50%;
		display: block;
		box-shadow: 0 8rpx 24rpx rgba(250, 102, 80, 0.18);
	}

	&__avatar-text {
		font-size: 36rpx;
		font-weight: bold;
		color: #ffffff;
	}

	&__avatar-tip {
		margin-top: 12rpx;
	}

	&__avatar-tip-text {
		font-size: 22rpx;
		color: $primary-color;
		font-weight: 600;
	}

	&__info {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 8rpx;
	}

	&__name-input {
		font-size: 34rpx;
		font-weight: 700;
		color: #1f2329;
		height: 56rpx;
		padding: 0;
	}

	&__hint {
		font-size: 22rpx;
		color: $primary-color;
	}

	&__status {
		font-size: 24rpx;
		color: #9aa0a6;
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

.loading {
	display: flex;
	flex-direction: column;
	align-items: center;
	padding-top: 120rpx;
	gap: 16rpx;

	&__text {
		font-size: 28rpx;
		color: #9aa0a6;
	}

	&__retry {
		font-size: 24rpx;
		color: $primary-color;
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
		padding: 0 48rpx;
		line-height: 1.7;
	}

	&__retry {
		margin-top: 20rpx;
		font-size: 24rpx;
		color: $primary-color;
	}
}

.list {
	padding: 24rpx;

	&__header {
		margin-bottom: 20rpx;
	}

	&__title {
		font-size: 34rpx;
		font-weight: 700;
		color: #1f2329;
	}
}

.recipe-item {
	display: flex;
	align-items: center;
	gap: 20rpx;
	background: #FFFFFF;
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
		flex-shrink: 0;
	}

	&__fav-icon {
		font-size: 36rpx;
		color: $primary-color;
	}
}
</style>
