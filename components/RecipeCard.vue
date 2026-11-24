<template>
	<view class="recipe-card" @click="handleClick">
		<image class="recipe-card__image" :src="recipe.cover" mode="aspectFill" />
		<view class="recipe-card__content">
			<text class="recipe-card__title">{{ recipe.title }}</text>
			<view class="recipe-card__tags">
				<text v-for="(tag, index) in recipe.tags" :key="index" class="recipe-card__tag">{{ tag }}</text>
			</view>
			<view class="recipe-card__footer">
				<text class="recipe-card__author">{{ recipe.author }}</text>
			</view>
		</view>
	</view>
</template>

<script setup>
defineProps({
	recipe: {
		type: Object,
		default: () => ({})
	}
})
const handleClick = () => {
	uni.navigateTo({ url: '/pages/recipe-detail/index' })
}
</script>

<style lang="scss" scoped>
.recipe-card {
	background-color: #FFFFFF;
	border-radius: 16rpx;
	overflow: hidden;
	box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.06);
	margin-bottom: 24rpx;

	&__image {
		width: 100%;
		height: 320rpx;
		display: block;
	}

	&__content {
		padding: 20rpx 24rpx 24rpx;
	}

	&__title {
		font-size: 30rpx;
		font-weight: bold;
		color: #333333;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		line-height: 1.4;
	}

	&__tags {
		display: flex;
		flex-wrap: wrap;
		gap: 12rpx;
		margin-top: 16rpx;
	}

	&__tag {
		font-size: 22rpx;
		color: $primary-color;
		background-color: rgba(250, 102, 80, 0.08);
		padding: 6rpx 16rpx;
		border-radius: 8rpx;
	}

	&__footer {
		margin-top: 16rpx;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	&__author {
		font-size: 24rpx;
		color: #999999;
	}
}
</style>