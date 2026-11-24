<template>
	<scroll-view scroll-y class="page">
		<view class="hero">
			<text class="hero__eyebrow">My Recipe</text>
			<text class="hero__title">{{ isEditMode ? '编辑菜谱' : '自创菜谱' }}</text>
			<text class="hero__desc">图片现在支持不上传，也支持一次上传多张；默认取第一张作为封面展示。</text>
		</view>

		<view class="card card--cover">
			<view class="section-head">
				<text class="card__title">菜谱图片</text>
				<text class="card__tip">可不上传，最多 9 张</text>
			</view>

			<view class="gallery">
				<view
					v-for="(image, index) in form.images"
					:key="`${image}-${index}`"
					class="gallery__item"
					@click="previewImages(index)"
				>
					<image class="gallery__image" :src="image" mode="aspectFill" />
					<view class="gallery__badge" v-if="index === 0">
						<text class="gallery__badge-text">封面</text>
					</view>
					<view class="gallery__remove" @click.stop="removeImage(index)">
						<text class="gallery__remove-text">×</text>
					</view>
				</view>

				<view
					v-if="form.images.length < 9"
					class="gallery__upload"
					@click="chooseImages"
				>
					<text class="gallery__upload-icon">+</text>
					<text class="gallery__upload-text">{{ isUploadingImages ? '上传中...' : '上传图片' }}</text>
				</view>
			</view>
		</view>

		<view class="card">
			<text class="card__title">基础信息</text>
			<view class="field-block">
				<text class="field-block__label">菜谱名称</text>
				<input v-model="form.title" class="field" placeholder="例如：蒜香黄油煎鸡腿" />
			</view>
			<view class="field-block">
				<text class="field-block__label">标签分类</text>
				<input v-model="form.tagsText" class="field" placeholder="例如：家常，下饭，快手" />
			</view>
			<view class="field-block">
				<text class="field-block__label">烹饪贴士</text>
				<view class="textarea-shell">
				<textarea
					v-model="form.tips"
					class="textarea"
					auto-height
					maxlength="-1"
					placeholder="写下火候、调味或者摆盘的小贴士"
				/>
				</view>
			</view>
		</view>

		<view class="card">
			<view class="section-head">
				<text class="card__title">主食材</text>
				<view class="mini-btn" @click="addIngredient">
					<text class="mini-btn__text">添加食材</text>
				</view>
			</view>

			<view
				v-for="(item, index) in form.ingredients"
				:key="`ingredient-${index}`"
				class="row-card"
			>
				<input
					v-model="item.name"
					class="row-card__input"
					placeholder="食材名称"
				/>
				<input
					v-model="item.amount"
					class="row-card__input row-card__input--small"
					placeholder="用量"
				/>
				<view
					v-if="form.ingredients.length > 1"
					class="row-card__remove"
					@click="removeIngredient(index)"
				>
					<text class="row-card__remove-text">删除</text>
				</view>
			</view>
		</view>

		<view class="card">
			<view class="section-head">
				<text class="card__title">配料选择</text>
				<text class="card__tip">先点选常见配料，也可以手动新增</text>
			</view>

			<view class="seasoning-chip-list">
				<view
					v-for="item in commonSeasonings"
					:key="item"
					class="seasoning-chip"
					:class="{ 'seasoning-chip--active': hasSeasoning(item) }"
					@click="toggleSeasoning(item)"
				>
					<text class="seasoning-chip__text">{{ item }}</text>
				</view>
			</view>

			<view v-if="form.seasonings.length > 0" class="seasoning-list">
				<view
					v-for="(item, index) in form.seasonings"
					:key="`${item.name}-${index}`"
					class="row-card"
				>
					<input
						v-model="item.name"
						class="row-card__input"
						placeholder="配料名称"
					/>
					<input
						v-model="item.amount"
						class="row-card__input row-card__input--small"
						placeholder="用量"
					/>
					<view class="row-card__remove" @click="removeSeasoning(index)">
						<text class="row-card__remove-text">删除</text>
					</view>
				</view>
			</view>

			<view class="custom-seasoning">
				<text class="custom-seasoning__label">手动添加配料</text>
				<view class="custom-seasoning__row">
					<input
						v-model="customSeasoning.name"
						class="row-card__input"
						placeholder="例如：白芝麻"
					/>
					<input
						v-model="customSeasoning.amount"
						class="row-card__input row-card__input--small"
						placeholder="适量"
					/>
					<view class="mini-btn" @click="addCustomSeasoning">
						<text class="mini-btn__text">添加</text>
					</view>
				</view>
			</view>
		</view>

		<view class="card">
			<view class="section-head">
				<text class="card__title">步骤说明</text>
				<view class="mini-btn" @click="addStep">
					<text class="mini-btn__text">添加步骤</text>
				</view>
			</view>

			<view
				v-for="(step, index) in form.steps"
				:key="`step-${index}`"
				class="step-card"
			>
				<view class="step-card__head">
					<text class="step-card__badge">步骤 {{ index + 1 }}</text>
					<view
						v-if="form.steps.length > 1"
						class="row-card__remove"
						@click="removeStep(index)"
					>
						<text class="row-card__remove-text">删除</text>
					</view>
				</view>
				<textarea
					v-model="step.desc"
					class="textarea textarea--step"
					auto-height
					maxlength="-1"
					:placeholder="`请输入步骤 ${index + 1} 的操作说明`"
				/>
				<view class="timer-row">
					<text class="timer-row__label">计时分钟</text>
					<input
						v-model="step.timerMinute"
						class="timer-row__input"
						type="number"
						placeholder="可不填"
					/>
				</view>
			</view>
		</view>

		<view class="submit-btn" :class="{ 'submit-btn--disabled': isSubmitting }" @click="submitRecipe">
			<text class="submit-btn__text">{{ isSubmitting ? '提交中...' : isEditMode ? '保存修改' : '保存自创菜谱' }}</text>
		</view>
	</scroll-view>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { userStore } from '../../stores/user'

const createIngredient = () => ({
	name: '',
	amount: ''
})

const createStep = () => ({
	desc: '',
	timerMinute: ''
})

const createSeasoning = (name = '', amount = '') => ({
	name,
	amount
})

const commonSeasonings = [
	'盐',
	'生抽',
	'老抽',
	'蚝油',
	'料酒',
	'白糖',
	'鸡精',
	'胡椒粉',
	'淀粉',
	'醋',
	'香油',
	'辣椒油'
]

const form = reactive({
	title: '',
	images: [],
	tagsText: '',
	tips: '',
	ingredients: [createIngredient()],
	seasonings: [],
	steps: [createStep()]
})

const customSeasoning = reactive({
	name: '',
	amount: ''
})

const isSubmitting = ref(false)
const isUploadingImages = ref(false)
const isEditMode = ref(false)
const editingRecipeId = ref('')
const wasPublished = ref(false)

const chooseImages = async () => {
	if (isUploadingImages.value) return

	if (!userStore.openid) {
		uni.showToast({
			title: '请先完成微信登录',
			icon: 'none'
		})
		return
	}

	try {
		const remainCount = Math.max(0, 9 - form.images.length)
		if (!remainCount) return

		const { tempFilePaths } = await uni.chooseImage({
			count: remainCount,
			sizeType: ['compressed'],
			sourceType: ['album', 'camera']
		})

		const filePaths = Array.isArray(tempFilePaths) ? tempFilePaths : []
		if (!filePaths.length) return

		isUploadingImages.value = true
		uni.showLoading({
			title: '上传图片中...'
		})

		const uploadedImages = []
		for (const filePath of filePaths) {
			const ext = filePath.split('.').pop() || 'jpg'
			const cloudPath = `original-recipes/${userStore.openid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
			const { fileID } = await wx.cloud.uploadFile({
				cloudPath,
				filePath
			})
			uploadedImages.push(fileID)
		}

		form.images.push(...uploadedImages)
	} catch (error) {
		if (error?.errMsg?.includes('cancel')) return
		console.error('[original_recipes] upload images failed:', error)
		uni.showToast({
			title: '图片上传失败',
			icon: 'none'
		})
	} finally {
		isUploadingImages.value = false
		uni.hideLoading()
	}
}

const removeImage = (index) => {
	form.images.splice(index, 1)
}

const previewImages = (current) => {
	if (!form.images.length) return
	uni.previewImage({
		urls: form.images,
		current: form.images[current]
	})
}

const addIngredient = () => {
	form.ingredients.push(createIngredient())
}

const removeIngredient = (index) => {
	form.ingredients.splice(index, 1)
}

const hasSeasoning = (name) => form.seasonings.some((item) => item.name === name)

const toggleSeasoning = (name) => {
	const index = form.seasonings.findIndex((item) => item.name === name)
	if (index >= 0) {
		form.seasonings.splice(index, 1)
		return
	}

	form.seasonings.push(createSeasoning(name, '适量'))
}

const removeSeasoning = (index) => {
	form.seasonings.splice(index, 1)
}

const addCustomSeasoning = () => {
	const name = customSeasoning.name.trim()
	const amount = customSeasoning.amount.trim()

	if (!name) {
		uni.showToast({
			title: '请填写配料名称',
			icon: 'none'
		})
		return
	}

	form.seasonings.push(createSeasoning(name, amount))
	customSeasoning.name = ''
	customSeasoning.amount = ''
}

const addStep = () => {
	form.steps.push(createStep())
}

const removeStep = (index) => {
	form.steps.splice(index, 1)
}

const normalizePayload = () => {
	const title = form.title.trim()
	const ingredients = form.ingredients
		.map((item) => ({
			name: (item.name || '').trim(),
			amount: (item.amount || '').trim(),
			type: 'main'
		}))
		.filter((item) => item.name)

	const seasonings = form.seasonings
		.map((item) => ({
			name: (item.name || '').trim(),
			amount: (item.amount || '').trim(),
			type: 'seasoning'
		}))
		.filter((item) => item.name)

	const steps = form.steps
		.map((item, index) => ({
			stepNum: index + 1,
			desc: (item.desc || '').trim(),
			timerMinute: Number(item.timerMinute) || 0
		}))
		.filter((item) => item.desc)

	const tags = (form.tagsText || '')
		.split(/[，,]/)
		.map((item) => item.trim())
		.filter(Boolean)

	return {
		title,
		images: form.images.filter(Boolean),
		cover: form.images[0] || '',
		tips: form.tips.trim(),
		tags,
		ingredients: [...ingredients, ...seasonings],
		steps
	}
}

const validatePayload = (payload) => {
	if (!userStore.openid) {
		return '请先完成微信登录'
	}
	if (!payload.title) {
		return '请填写菜谱名称'
	}
	if (payload.ingredients.length === 0) {
		return '请至少填写一个食材'
	}
	if (payload.steps.length === 0) {
		return '请至少填写一个步骤'
	}
	return ''
}

const fillForm = (data) => {
	form.title = data?.title || ''
	form.images = Array.isArray(data?.images) ? [...data.images] : (data?.cover ? [data.cover] : [])
	form.tagsText = Array.isArray(data?.tags) ? data.tags.join('，') : ''
	form.tips = data?.tips || ''
	wasPublished.value = !!data?.isPublished
	const allIngredients = Array.isArray(data?.ingredients) ? data.ingredients : []
	const mainIngredients = allIngredients.filter((item) => item?.type !== 'seasoning')
	const seasoningIngredients = allIngredients.filter((item) => item?.type === 'seasoning')
	form.ingredients = mainIngredients.length
		? mainIngredients.map((item) => ({
			name: item?.name || '',
			amount: item?.amount || ''
		}))
		: [createIngredient()]
	form.seasonings = seasoningIngredients.map((item) => ({
		name: item?.name || '',
		amount: item?.amount || ''
	}))
	form.steps = Array.isArray(data?.steps) && data.steps.length
		? data.steps.map((item) => ({
			desc: item?.desc || '',
			timerMinute: item?.timerMinute ? String(item.timerMinute) : ''
		}))
		: [createStep()]
}

const loadRecipe = async (recipeId) => {
	try {
		uni.showLoading({
			title: '加载中...'
		})
		const db = wx.cloud.database()
		const { data } = await db.collection('original_recipes').doc(recipeId).get()

		if (!data) {
			throw new Error('菜谱不存在')
		}

		fillForm(data)
	} catch (error) {
		console.error('[original_recipes] load failed:', error)
		uni.showToast({
			title: error.message || '加载失败',
			icon: 'none'
		})
	} finally {
		uni.hideLoading()
	}
}

const submitRecipe = async () => {
	if (isSubmitting.value) return

	const payload = normalizePayload()
	const errorMessage = validatePayload(payload)
	if (errorMessage) {
		uni.showToast({
			title: errorMessage,
			icon: 'none'
		})
		return
	}

	isSubmitting.value = true
	uni.showLoading({
		title: '保存中...'
	})

	try {
		const { result } = await wx.cloud.callFunction({
			name: 'createOriginalRecipe',
			data: {
				recipeId: editingRecipeId.value,
				recipe: payload
			}
		})

		if (!result?.success) {
			throw new Error(result?.errorMessage || '保存菜谱失败')
		}

		if (isEditMode.value && wasPublished.value) {
			uni.showModal({
				title: '编辑成功',
				content: '已编辑的菜谱需要下架后重新上传，用以更新发布的菜谱',
				showCancel: false
			})
		} else {
			uni.showToast({
				title: isEditMode.value ? '菜谱已更新' : '菜谱创建成功',
				icon: 'success'
			})
		}

		setTimeout(() => {
			uni.redirectTo({
				url: '/pages/user/personal_recipese'
			})
		}, 300)
	} catch (error) {
		console.error('[original_recipes] submit failed:', error)
		uni.showToast({
			title: error.message || '保存菜谱失败',
			icon: 'none'
		})
	} finally {
		isSubmitting.value = false
		uni.hideLoading()
	}
}

onLoad((options) => {
	if (options?.recipeId) {
		isEditMode.value = true
		editingRecipeId.value = options.recipeId
		loadRecipe(options.recipeId)
	}
})
</script>

<style lang="scss" scoped>
.page {
	min-height: 100vh;
	background:
		radial-gradient(circle at top right, rgba(250, 102, 80, 0.12), transparent 32%),
		$page-bg-color;
	padding: 24rpx;
	box-sizing: border-box;
}

.hero {
	padding: 12rpx 8rpx 16rpx;

	&__eyebrow {
		display: inline-block;
		padding: 8rpx 16rpx;
		border-radius: 999rpx;
		background: rgba(250, 102, 80, 0.1);
		color: $primary-color;
		font-size: 20rpx;
		font-weight: 700;
		letter-spacing: 1rpx;
	}

	&__title {
		display: block;
		margin-top: 18rpx;
		font-size: 42rpx;
		font-weight: 700;
		color: #1f2329;
	}

	&__desc {
		display: block;
		margin-top: 12rpx;
		font-size: 25rpx;
		line-height: 1.7;
		color: #7f8790;
	}
}

.card {
	margin-top: 20rpx;
	padding: 28rpx;
	border-radius: 28rpx;
	background: #ffffff;
	box-shadow: 0 10rpx 28rpx rgba(24, 32, 56, 0.06);

	&__title {
		font-size: 32rpx;
		font-weight: 700;
		color: #1f2329;
	}

	&__tip {
		font-size: 22rpx;
		color: #8a9099;
	}
}

.section-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 16rpx;
}

.gallery {
	margin-top: 22rpx;
	display: grid;
	grid-template-columns: repeat(3, 1fr);
	gap: 16rpx;

	&__item,
	&__upload {
		position: relative;
		height: 180rpx;
		border-radius: 20rpx;
		overflow: hidden;
	}

	&__item {
		background: #f3f5f7;
	}

	&__image {
		width: 100%;
		height: 100%;
		display: block;
	}

	&__badge {
		position: absolute;
		left: 10rpx;
		top: 10rpx;
		padding: 4rpx 12rpx;
		border-radius: 999rpx;
		background: rgba(250, 102, 80, 0.9);
	}

	&__badge-text {
		font-size: 20rpx;
		color: #ffffff;
		font-weight: 700;
	}

	&__remove {
		position: absolute;
		right: 10rpx;
		top: 10rpx;
		width: 40rpx;
		height: 40rpx;
		border-radius: 50%;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	&__remove-text {
		font-size: 26rpx;
		color: #ffffff;
		line-height: 1;
	}

	&__upload {
		border: 2rpx dashed #e4e8ee;
		background: linear-gradient(145deg, #f9fafb 0%, #f2f4f7 100%);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
	}

	&__upload-icon {
		font-size: 54rpx;
		color: $primary-color;
		line-height: 1;
	}

	&__upload-text {
		margin-top: 12rpx;
		font-size: 22rpx;
		color: #8a9099;
	}
}

.field {
	width: 100%;
	margin-top: 12rpx;
	height: 88rpx;
	padding: 0 24rpx;
	line-height: 88rpx;
	border-radius: 20rpx;
	background: #f7f8fa;
	box-sizing: border-box;
	font-size: 28rpx;
	color: #1f2329;
	display: block;
}

.field-block {
	margin-top: 22rpx;

	&:first-of-type {
		margin-top: 18rpx;
	}

	&__label {
		display: block;
		font-size: 24rpx;
		font-weight: 700;
		color: #7b8088;
	}
}

.textarea-shell {
	margin-top: 12rpx;
	padding: 24rpx;
	border-radius: 20rpx;
	background: #f7f8fa;
	box-sizing: border-box;
}

.textarea {
	width: 100%;
	min-height: 180rpx;
	font-size: 28rpx;
	line-height: 1.7;
	color: #1f2329;
	display: block;

	&--step {
		min-height: 140rpx;
		margin-top: 18rpx;
		padding: 24rpx;
		border-radius: 20rpx;
		background: #f7f8fa;
		box-sizing: border-box;
	}
}

.mini-btn {
	padding: 14rpx 22rpx;
	border-radius: 999rpx;
	background: rgba(250, 102, 80, 0.1);

	&__text {
		font-size: 24rpx;
		font-weight: 700;
		color: $primary-color;
	}
}

.seasoning-chip-list {
	display: flex;
	flex-wrap: wrap;
	gap: 14rpx;
	margin-top: 22rpx;
}

.seasoning-chip {
	padding: 14rpx 22rpx;
	border-radius: 999rpx;
	background: #f7f8fa;
	border: 2rpx solid transparent;

	&--active {
		background: rgba(250, 102, 80, 0.12);
		border-color: rgba(250, 102, 80, 0.24);
	}

	&__text {
		font-size: 24rpx;
		font-weight: 600;
		color: #4e535a;
	}
}

.seasoning-list {
	margin-top: 8rpx;
}

.custom-seasoning {
	margin-top: 22rpx;
	padding: 22rpx;
	border-radius: 20rpx;
	background: #fff8f4;

	&__label {
		display: block;
		font-size: 24rpx;
		font-weight: 700;
		color: #8a5f52;
	}

	&__row {
		display: flex;
		align-items: center;
		gap: 14rpx;
		margin-top: 14rpx;
		flex-wrap: wrap;
	}
}

.row-card,
.step-card {
	margin-top: 20rpx;
	padding: 22rpx;
	border-radius: 22rpx;
	background: #fcfcfd;
	border: 2rpx solid #f1f2f4;
}

.row-card {
	display: flex;
	align-items: center;
	gap: 14rpx;
	flex-wrap: wrap;

	&__input {
		flex: 1;
		padding: 18rpx 20rpx;
		border-radius: 18rpx;
		background: #ffffff;
		font-size: 27rpx;
		min-width: 0;
	}

	&__input--small {
		flex: 0 0 180rpx;
	}

	&__remove {
		padding: 12rpx 18rpx;
		border-radius: 999rpx;
		background: #fff2ef;
		flex-shrink: 0;
	}

	&__remove-text {
		font-size: 24rpx;
		color: #d95b47;
		font-weight: 600;
	}
}

.step-card {
	&__head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	&__badge {
		font-size: 24rpx;
		font-weight: 700;
		color: $primary-color;
		background: rgba(250, 102, 80, 0.1);
		padding: 10rpx 18rpx;
		border-radius: 999rpx;
	}
}

.timer-row {
	margin-top: 18rpx;
	padding: 20rpx 22rpx;
	border-radius: 18rpx;
	background: #fff7f4;
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 16rpx;

	&__label {
		font-size: 24rpx;
		font-weight: 600;
		color: #8a5f52;
		flex-shrink: 0;
	}

	&__input {
		width: 180rpx;
		height: 72rpx;
		padding: 0 20rpx;
		line-height: 72rpx;
		border-radius: 14rpx;
		background: #ffffff;
		font-size: 26rpx;
		color: #1f2329;
		box-sizing: border-box;
		text-align: right;
	}
}

.submit-btn {
	margin: 28rpx 0 56rpx;
	height: 92rpx;
	border-radius: 28rpx;
	background: linear-gradient(135deg, $primary-color 0%, #ff8a65 100%);
	display: flex;
	align-items: center;
	justify-content: center;
	box-shadow: 0 14rpx 28rpx rgba(250, 102, 80, 0.22);

	&--disabled {
		opacity: 0.7;
	}

	&__text {
		font-size: 30rpx;
		font-weight: 700;
		color: #ffffff;
	}
}
</style>
