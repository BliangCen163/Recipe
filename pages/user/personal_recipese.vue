<template>
	<view class="page">
		<view class="top-card">
			<view class="top-card__head">
				<text class="top-card__title">个人菜谱</text>
				<text class="top-card__desc">这里是你创建的专属菜谱</text>
			</view>
			<view class="top-card__actions">
				<view class="ghost-btn" @click="toggleManageMode">
					<text class="ghost-btn__text">{{ manageMode ? '完成' : '管理' }}</text>
				</view>
				<view class="create-btn" @click="goToCreate">
					<text class="create-btn__text">自创菜谱</text>
				</view>
			</view>
		</view>

		<view v-if="isLoading" class="status">
			<text class="status__text">加载中...</text>
		</view>

		<view v-else-if="!userStore.openid" class="status">
			<text class="status__text">请先完成微信登录后查看个人菜谱</text>
		</view>

		<view v-else-if="recipes.length === 0" class="status">
			<text class="status__text">还没有个人菜谱，点击上方按钮创建第一道吧</text>
		</view>

		<view v-else class="list">
			<view
				v-for="item in recipes"
				:key="item._id"
				class="recipe-item"
				@click="goToDetail(item)"
			>
				<image
					v-if="getCover(item)"
					class="recipe-item__cover"
					:src="getCover(item)"
					mode="aspectFill"
				/>
				<view v-else class="recipe-item__cover recipe-item__cover--empty">
					<text class="recipe-item__cover-text">无图</text>
				</view>

				<view class="recipe-item__body">
					<view class="recipe-item__title-row">
						<text class="recipe-item__title">{{ item.title }}</text>
						<text v-if="item.isPublished" class="recipe-item__status">已发布</text>
					</view>
					<view class="recipe-item__tags">
						<text v-for="tag in item.tags" :key="tag" class="recipe-item__tag">{{ tag }}</text>
					</view>
					<text class="recipe-item__meta">
						{{ formatIngredients(item.ingredients) }}
					</text>
				</view>

				<view class="recipe-item__actions" @click.stop>
					<view class="item-btn item-btn--light" @click="editRecipe(item)">
						<text class="item-btn__text">编辑</text>
					</view>
					<view
						v-if="!item.isPublished"
						class="item-btn"
						@click="publishRecipe(item)"
					>
						<text class="item-btn__text">发布</text>
					</view>
					<view
						v-else
						class="item-btn item-btn--warn"
						@click="unpublishRecipe(item)"
					>
						<text class="item-btn__text">下架</text>
					</view>
					<view
						v-if="manageMode"
						class="item-btn item-btn--danger"
						@click="deleteRecipe(item)"
					>
						<text class="item-btn__text">删除</text>
					</view>
				</view>
			</view>
		</view>
	</view>
</template>

<script setup>
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { userStore } from '../../stores/user'

const recipes = ref([])
const isLoading = ref(true)
const manageMode = ref(false)
const db = wx.cloud.database()

const getCover = (item) => {
	if (item?.cover) return item.cover
	if (Array.isArray(item?.images) && item.images.length) return item.images[0]
	if (item?.image) return item.image
	return ''
}

const formatIngredients = (ingredients) => {
	if (!Array.isArray(ingredients) || ingredients.length === 0) {
		return '暂无食材信息'
	}
	return ingredients
		.map((item) => `${item.name || ''}${item.amount ? ` ${item.amount}` : ''}`.trim())
		.filter(Boolean)
		.join('、')
}

const fetchPersonalRecipes = async () => {
	if (!userStore.openid) {
		recipes.value = []
		isLoading.value = false
		return
	}

	isLoading.value = true
	try {
		const { data } = await db.collection('original_recipes')
			.where({
				createdBy: userStore.openid
			})
			.get()

		recipes.value = (Array.isArray(data) ? data : []).sort((a, b) => {
			const timeA = a?.createdAt ? new Date(a.createdAt).getTime() || 0 : 0
			const timeB = b?.createdAt ? new Date(b.createdAt).getTime() || 0 : 0
			return timeB - timeA
		})
	} catch (error) {
		console.error('[personal_recipes] fetch failed:', error)
		recipes.value = []
		uni.showToast({
			title: '加载个人菜谱失败',
			icon: 'none'
		})
	} finally {
		isLoading.value = false
	}
}

const runAction = async (action, item) => {
	const { result } = await wx.cloud.callFunction({
		name: 'manageOriginalRecipe',
		data: {
			action,
			recipeId: item._id
		}
	})

	if (!result?.success) {
		throw new Error(result?.errorMessage || '操作失败')
	}

	return result
}

const confirmAction = (title, content) =>
	new Promise((resolve) => {
		uni.showModal({
			title,
			content,
			success: (res) => resolve(!!res.confirm)
		})
	})

const toggleManageMode = () => {
	manageMode.value = !manageMode.value
}

const goToCreate = () => {
	uni.navigateTo({
		url: '/pages/user/original_recipes'
	})
}

const goToDetail = (item) => {
	uni.navigateTo({
		url: `/pages/recipe-detail/index?recipeId=${item._id}&source=original_recipes`
	})
}

const editRecipe = (item) => {
	uni.navigateTo({
		url: `/pages/user/original_recipes?recipeId=${item._id}`
	})
}

const publishRecipe = async (item) => {
	const confirmed = await confirmAction('发布菜谱', '确认将该菜谱发布到公共菜谱库吗？')
	if (!confirmed) return

	try {
		uni.showLoading({ title: '发布中...' })
		await runAction('publish', item)
		uni.showToast({
			title: '发布成功',
			icon: 'success'
		})
		await fetchPersonalRecipes()
	} catch (error) {
		uni.showToast({
			title: error.message || '发布失败',
			icon: 'none'
		})
	} finally {
		uni.hideLoading()
	}
}

const unpublishRecipe = async (item) => {
	const confirmed = await confirmAction('下架菜谱', '确认将该菜谱从公共菜谱库下架吗？')
	if (!confirmed) return

	try {
		uni.showLoading({ title: '下架中...' })
		await runAction('unpublish', item)
		uni.showToast({
			title: '已下架',
			icon: 'success'
		})
		await fetchPersonalRecipes()
	} catch (error) {
		uni.showToast({
			title: error.message || '下架失败',
			icon: 'none'
		})
	} finally {
		uni.hideLoading()
	}
}

const deleteRecipe = async (item) => {
	const confirmed = await confirmAction('删除菜谱', '确认删除该菜谱吗？如果已发布，也会同步下架。')
	if (!confirmed) return

	try {
		uni.showLoading({ title: '删除中...' })
		await runAction('delete', item)
		uni.showToast({
			title: '已删除',
			icon: 'success'
		})
		await fetchPersonalRecipes()
	} catch (error) {
		uni.showToast({
			title: error.message || '删除失败',
			icon: 'none'
		})
	} finally {
		uni.hideLoading()
	}
}

onShow(() => {
	fetchPersonalRecipes()
})
</script>

<style lang="scss" scoped>
.page {
	min-height: 100vh;
	background-color: $page-bg-color;
	padding: 24rpx;
}

.top-card {
	background: linear-gradient(150deg, #fff6f2 0%, #ffffff 100%);
	border-radius: 28rpx;
	padding: 28rpx;
	box-shadow: 0 10rpx 24rpx rgba(250, 102, 80, 0.08);
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 20rpx;

	&__head {
		flex: 1;
	}

	&__actions {
		display: flex;
		align-items: center;
		gap: 14rpx;
		flex-shrink: 0;
	}

	&__title {
		display: block;
		font-size: 34rpx;
		font-weight: 700;
		color: #1f2329;
	}

	&__desc {
		display: block;
		margin-top: 10rpx;
		font-size: 24rpx;
		color: #8a9099;
	}
}

.ghost-btn,
.create-btn {
	padding: 18rpx 26rpx;
	border-radius: 999rpx;

	&__text {
		font-size: 24rpx;
		font-weight: 700;
	}
}

.ghost-btn {
	background: #ffffff;
	border: 2rpx solid #f0d7cf;

	&__text {
		color: #b06b58;
	}
}

.create-btn {
	background: linear-gradient(135deg, $primary-color 0%, #ff8a65 100%);
	box-shadow: 0 8rpx 18rpx rgba(250, 102, 80, 0.24);

	&__text {
		color: #ffffff;
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

.list {
	margin-top: 24rpx;
}

.recipe-item {
	display: flex;
	align-items: center;
	gap: 18rpx;
	padding: 22rpx;
	border-radius: 24rpx;
	background: #ffffff;
	box-shadow: 0 8rpx 20rpx rgba(24, 32, 56, 0.06);
	margin-bottom: 16rpx;

	&__cover {
		width: 116rpx;
		height: 116rpx;
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

	&__title-row {
		display: flex;
		align-items: center;
		gap: 12rpx;
	}

	&__title {
		display: block;
		font-size: 30rpx;
		font-weight: 700;
		color: #1f2329;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	&__status {
		padding: 4rpx 12rpx;
		border-radius: 999rpx;
		font-size: 20rpx;
		color: #ffffff;
		background: #39b46a;
		flex-shrink: 0;
	}

	&__tags {
		display: flex;
		flex-wrap: wrap;
		gap: 10rpx;
		margin-top: 10rpx;
	}

	&__tag {
		padding: 6rpx 14rpx;
		border-radius: 999rpx;
		font-size: 22rpx;
		color: #6a4a3c;
		background: #fff0ea;
	}

	&__meta {
		display: block;
		margin-top: 12rpx;
		font-size: 24rpx;
		color: #8a9099;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	&__actions {
		display: flex;
		flex-direction: column;
		gap: 12rpx;
		flex-shrink: 0;
	}
}

.item-btn {
	min-width: 96rpx;
	padding: 12rpx 18rpx;
	border-radius: 999rpx;
	background: linear-gradient(135deg, $primary-color 0%, #ff8a65 100%);
	text-align: center;

	&--light {
		background: #fff4ef;
	}

	&--warn {
		background: #fff7e8;
	}

	&--danger {
		background: #fff1f1;
	}

	&__text {
		font-size: 22rpx;
		font-weight: 700;
		color: #ffffff;
	}
}

.item-btn--light .item-btn__text {
	color: $primary-color;
}

.item-btn--warn .item-btn__text {
	color: #c07a18;
}

.item-btn--danger .item-btn__text {
	color: #d95b47;
}
</style>
