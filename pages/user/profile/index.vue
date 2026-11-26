<template>
	<view class="page">
		<view class="card">
			<view class="card__header">
				<text class="card__title">头像</text>
				<text class="card__desc">{{ userStore.isLoggedIn ? '点击头像更换' : '登录后可更换' }}</text>
			</view>
			<button
				class="avatar-btn"
				open-type="chooseAvatar"
				hover-class="none"
				:disabled="!userStore.isLoggedIn || isUploadingAvatar"
				@chooseavatar="onChooseAvatar"
			>
				<image
					v-if="userStore.avatarUrl"
					class="avatar-btn__image"
					:src="userStore.avatarUrl"
					mode="aspectFill"
				/>
				<view v-else class="avatar-btn__placeholder">
					<text class="avatar-btn__placeholder-text">{{ displayName.slice(0, 1) }}</text>
				</view>
				<text class="avatar-btn__tip">
					{{ isUploadingAvatar ? '上传中...' : '更换头像' }}
				</text>
			</button>
		</view>

		<view class="card">
			<view class="card__header">
				<text class="card__title">昵称</text>
				<text class="card__desc">失焦自动保存</text>
			</view>
			<view class="nickname-row">
				<input
					:value="nickname"
					class="nickname-row__input"
					type="nickname"
					maxlength="32"
					placeholder="点击输入，键盘上方可选择微信昵称"
					:focus="nicknameFocused"
					:disabled="!userStore.isLoggedIn || isSavingNickname"
					@input="onNicknameInput"
					@focus="onNicknameFocus"
					@blur="onNicknameBlur"
					@confirm="onNicknameBlur"
				/>
				<view
					class="nickname-row__save"
					:class="{ 'nickname-row__save--disabled': !canSaveNickname }"
					@click="saveNickname()"
				>
					<text class="nickname-row__save-text">{{ isSavingNickname ? '保存中' : '保存' }}</text>
				</view>
			</view>
		</view>

		<view class="card">
			<view class="card__header">
				<text class="card__title">登录状态</text>
			</view>

			<view v-if="userStore.isLoggedIn" class="status">
				<view class="status__row">
					<text class="status__label">状态</text>
					<text class="status__value">已登录</text>
				</view>
				<view class="status__row">
					<text class="status__label">昵称</text>
					<text class="status__value" :class="{ 'status__value--muted': !wechatNickname }">{{ wechatNickname || '微信用户' }}</text>
				</view>
				<view v-if="!wechatNickname" class="status__hint" @click="focusNicknameInput">
					<text class="status__hint-text">点上方「昵称」框，从键盘候选里选择微信昵称 ›</text>
				</view>
				<view class="status__row">
					<text class="status__label">OpenID</text>
					<text class="status__value">{{ maskedOpenid }}</text>
				</view>
			</view>

			<view v-else-if="userStore.loginLoading || isLoggingIn" class="status">
				<text class="status__text">正在为你准备登录状态...</text>
			</view>

			<view v-else class="status">
				<text class="status__text">{{ loginHint }}</text>
			</view>

			<view
				v-if="!userStore.isLoggedIn"
				class="login-btn"
				:class="{ 'login-btn--disabled': userStore.loginLoading || isLoggingIn }"
				@click="onLoginTap"
			>
				<text class="login-btn__text">
					{{ userStore.loginLoading || isLoggingIn ? '登录中...' : '微信登录' }}
				</text>
			</view>
		</view>
	</view>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { userStore } from '../../../stores/user'

const nickname = ref('')
const isEditingNickname = ref(false)
const isSavingNickname = ref(false)
const isUploadingAvatar = ref(false)
const isLoggingIn = ref(false)

const FALLBACK_NICKNAME = '微信用户'
const DEFAULT_CLOUD_NICKNAME = '美食爱好者'
const nicknameFocused = ref(false)

const normalizeNickname = (value) => {
	const text = String(value || '').trim()
	if (!text || text === DEFAULT_CLOUD_NICKNAME) return ''
	return text
}

const wechatNickname = computed(() => normalizeNickname(userStore.nickname))

const displayName = computed(() => nickname.value || wechatNickname.value || FALLBACK_NICKNAME)

const canSaveNickname = computed(() => {
	if (!userStore.isLoggedIn || isSavingNickname.value) return false
	return normalizeNickname(nickname.value) !== wechatNickname.value
})

const loginHint = computed(() => {
	if (userStore.loginError) {
		return `登录未完成：${userStore.loginError}，可点击下方按钮重试`
	}
	return '尚未登录，点击下方按钮发起微信登录'
})

const maskedOpenid = computed(() => {
	const openid = userStore.openid || ''
	if (!openid) return '-'
	return openid.length > 8 ? `${openid.slice(0, 4)}****${openid.slice(-4)}` : openid
})

const syncNickname = () => {
	nickname.value = normalizeNickname(userStore.nickname)
}

watch(
	() => userStore.nickname,
	(value) => {
		if (isEditingNickname.value || isSavingNickname.value) return
		nickname.value = normalizeNickname(value)
	}
)

onShow(() => {
	syncNickname()
})

const onNicknameFocus = () => {
	isEditingNickname.value = true
}

const onNicknameInput = (event) => {
	nickname.value = String(event?.detail?.value ?? '')
}

const onNicknameBlur = (event) => {
	isEditingNickname.value = false
	nicknameFocused.value = false
	const value = String(event?.detail?.value ?? nickname.value).trim()
	saveNickname(value)
}

const focusNicknameInput = () => {
	if (!userStore.isLoggedIn) {
		uni.showToast({ title: '请先完成微信登录', icon: 'none' })
		return
	}
	uni.pageScrollTo({ scrollTop: 0, duration: 200 })
	nicknameFocused.value = false
	nextTick(() => {
		nicknameFocused.value = true
	})
}

const saveNickname = async (value) => {
	if (isSavingNickname.value) return

	const nextNickname = normalizeNickname(value ?? nickname.value)

	if (!userStore.isLoggedIn || !userStore.openid) {
		nickname.value = normalizeNickname(userStore.nickname)
		uni.showToast({ title: '请先完成微信登录', icon: 'none' })
		return
	}

	if (!nextNickname) {
		nickname.value = normalizeNickname(userStore.nickname)
		uni.showToast({ title: '请选择或填写微信昵称', icon: 'none' })
		return
	}

	if (nextNickname === wechatNickname.value) {
		nickname.value = nextNickname
		return
	}

	isSavingNickname.value = true
	uni.showLoading({ title: '保存昵称中...' })

	try {
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

		const savedNickname = result.nickname || nextNickname
		const savedAvatar = result.avatarUrl || userStore.avatarUrl

		const storedNickname = normalizeNickname(savedNickname) || nextNickname
		nickname.value = storedNickname
		userStore.updateProfile(savedNickname, savedAvatar)
		uni.setStorageSync('nickname', storedNickname)
		if (savedAvatar) {
			uni.setStorageSync('avatarUrl', savedAvatar)
		}
		uni.showToast({ title: '昵称已保存', icon: 'success' })
	} catch (error) {
		console.error('[profile] saveNickname failed:', error)
		nickname.value = normalizeNickname(userStore.nickname)
		uni.showToast({ title: error?.message || '昵称保存失败', icon: 'none' })
	} finally {
		isSavingNickname.value = false
		uni.hideLoading()
	}
}

const onChooseAvatar = async (event) => {
	if (isUploadingAvatar.value) return

	if (!userStore.isLoggedIn || !userStore.openid) {
		uni.showToast({ title: '请先完成微信登录', icon: 'none' })
		return
	}

	const avatarPath = event?.detail?.avatarUrl
	if (!avatarPath) return

	const ext = String(avatarPath).split('.').pop() || 'png'
	const cloudPath = `avatars/${userStore.openid}-${Date.now()}.${ext}`

	isUploadingAvatar.value = true
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

		const savedNickname = result.nickname || userStore.nickname
		const normalizedNickname = normalizeNickname(savedNickname)
		nickname.value = normalizedNickname
		userStore.updateProfile(savedNickname, fileID)
		if (normalizedNickname) {
			uni.setStorageSync('nickname', normalizedNickname)
		}
		uni.setStorageSync('avatarUrl', fileID)
		uni.showToast({ title: '头像已更新', icon: 'success' })
	} catch (error) {
		console.error('[profile] onChooseAvatar failed:', error)
		uni.showToast({ title: error?.message || '头像更新失败', icon: 'none' })
	} finally {
		isUploadingAvatar.value = false
		uni.hideLoading()
	}
}

const onLoginTap = async () => {
	if (userStore.loginLoading || isLoggingIn.value) return

	const app = getApp()
	if (!app?.globalData?.runSilentLogin) {
		uni.showToast({ title: '登录入口不可用，请重启小程序', icon: 'none' })
		return
	}

	isLoggingIn.value = true
	uni.showLoading({ title: '正在登录...' })

	try {
		await app.globalData.runSilentLogin()
		syncNickname()
		uni.showToast({
			title: userStore.isLoggedIn ? '登录成功' : '登录未完成，请稍后重试',
			icon: 'none'
		})
	} finally {
		uni.hideLoading()
		isLoggingIn.value = false
	}
}
</script>

<style lang="scss" scoped>
.page {
	min-height: 100vh;
	padding: 24rpx;
	box-sizing: border-box;
	background-color: $page-bg-color;
}

.card {
	padding: 28rpx 24rpx;
	background: $card-bg-color;
	border-radius: 24rpx;
	box-shadow: 0 4rpx 16rpx rgba(24, 32, 56, 0.06);

	& + .card {
		margin-top: 24rpx;
	}

	&__header {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 16rpx;
		margin-bottom: 20rpx;
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
}

.avatar-btn {
	display: flex;
	flex-direction: column;
	align-items: center;
	padding: 0;
	border: none;
	background: transparent;
	line-height: 1;

	&::after {
		border: none;
	}

	&__image,
	&__placeholder {
		width: 140rpx;
		height: 140rpx;
		border-radius: 50%;
	}

	&__image {
		box-shadow: 0 8rpx 24rpx rgba(250, 102, 80, 0.18);
	}

	&__placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		background: linear-gradient(135deg, $primary-color 0%, #ff8a65 100%);
		box-shadow: 0 8rpx 24rpx rgba(250, 102, 80, 0.25);
	}

	&__placeholder-text {
		font-size: 52rpx;
		font-weight: 700;
		color: #ffffff;
	}

	&__tip {
		margin-top: 16rpx;
		font-size: 24rpx;
		font-weight: 600;
		color: $primary-color;
	}
}

.nickname-row {
	display: flex;
	align-items: center;
	gap: 16rpx;

	&__input {
		flex: 1;
		min-width: 0;
		height: 80rpx;
		padding: 0 24rpx;
		box-sizing: border-box;
		font-size: 30rpx;
		color: #1f2329;
		background: #f7f8fa;
		border-radius: 16rpx;
	}

	&__save {
		height: 80rpx;
		padding: 0 32rpx;
		border-radius: 16rpx;
		background: $primary-color;
		display: flex;
		align-items: center;
		justify-content: center;

		&--disabled {
			opacity: 0.4;
		}
	}

	&__save-text {
		font-size: 26rpx;
		font-weight: 600;
		color: #ffffff;
	}
}

.status {
	padding: 4rpx 0;

	&__row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 24rpx;
		padding: 14rpx 0;
	}

	&__label {
		font-size: 26rpx;
		color: #8a9099;
	}

	&__value {
		font-size: 26rpx;
		font-weight: 600;
		color: #1f2329;
		text-align: right;
		word-break: break-all;
	}

	&__value--muted {
		font-weight: 400;
		color: #b0b6be;
	}

	&__hint {
		padding: 2rpx 0 12rpx;
		text-align: right;
	}

	&__hint-text {
		font-size: 24rpx;
		color: $primary-color;
	}

	&__text {
		display: block;
		font-size: 26rpx;
		line-height: 1.6;
		color: #8a9099;
	}
}

.login-btn {
	margin-top: 20rpx;
	height: 88rpx;
	border-radius: 999rpx;
	background: $primary-color;
	display: flex;
	align-items: center;
	justify-content: center;
	box-shadow: 0 8rpx 20rpx rgba(250, 102, 80, 0.18);

	&--disabled {
		opacity: 0.6;
	}

	&__text {
		font-size: 28rpx;
		font-weight: 600;
		color: #ffffff;
	}
}
</style>
