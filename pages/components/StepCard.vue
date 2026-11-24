<template>
	<view class="step-card">
		<view class="step-card__header">
			<view class="step-card__num">{{ step.stepNum }}</view>
			<text class="step-card__desc">{{ step.desc }}</text>
		</view>
		<view v-if="step.timerMinute > 0" class="step-card__timer">
			<view v-if="!timing" class="step-card__timer-btn" @click="startTimer">
				<text class="step-card__timer-text">开始倒计时 {{ step.timerMinute }}分钟</text>
			</view>
			<view v-else class="step-card__timer-running">
				<text class="step-card__countdown">{{ displayTime }}</text>
				<view class="step-card__timer-stop" @click="stopTimer">
					<text class="step-card__timer-stop-text">停止</text>
				</view>
			</view>
		</view>
	</view>
</template>

<script>
export default {
	name: 'StepCard',
	props: {
		step: {
			type: Object,
			default: () => ({})
		}
	},
	data() {
		return {
			timing: false,
			remainSeconds: 0,
			timer: null
		}
	},
	computed: {
		displayTime() {
			const min = Math.floor(this.remainSeconds / 60)
			const sec = this.remainSeconds % 60
			return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
		}
	},
	beforeUnmount() {
		this.clearTimer()
	},
	methods: {
		startTimer() {
			this.remainSeconds = this.step.timerMinute * 60
			this.timing = true
			this.timer = setInterval(() => {
				if (this.remainSeconds <= 0) {
					this.clearTimer()
					this.timing = false
					uni.vibrateLong()
					uni.showModal({
						title: '时间到！',
						content: `${this.step.desc} 已完成`,
						showCancel: false
					})
					return
				}
				this.remainSeconds--
			}, 1000)
		},
		stopTimer() {
			this.clearTimer()
			this.timing = false
		},
		clearTimer() {
			if (this.timer) {
				clearInterval(this.timer)
				this.timer = null
			}
		}
	}
}
</script>

<style lang="scss" scoped>
.step-card {
	background-color: #FFFFFF;
	border-radius: 16rpx;
	padding: 28rpx 24rpx;
	margin-bottom: 20rpx;
	box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.04);

	&__header {
		display: flex;
		align-items: flex-start;
	}

	&__num {
		width: 48rpx;
		height: 48rpx;
		background: linear-gradient(135deg, $primary-color 0%, #FF8A65 100%);
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #FFFFFF;
		font-size: 24rpx;
		font-weight: bold;
		flex-shrink: 0;
		margin-right: 20rpx;
		margin-top: 2rpx;
	}

	&__desc {
		flex: 1;
		font-size: 28rpx;
		color: #333333;
		line-height: 1.6;
	}

	&__timer {
		margin-top: 20rpx;
		margin-left: 68rpx;
	}

	&__timer-btn {
		display: inline-flex;
		align-items: center;
		background-color: rgba(250, 102, 80, 0.08);
		padding: 12rpx 24rpx;
		border-radius: 24rpx;
	}

	&__timer-text {
		font-size: 24rpx;
		color: $primary-color;
		font-weight: bold;
	}

	&__timer-running {
		display: flex;
		align-items: center;
		gap: 20rpx;
	}

	&__countdown {
		font-size: 40rpx;
		font-weight: bold;
		color: $primary-color;
		font-variant-numeric: tabular-nums;
	}

	&__timer-stop {
		background-color: #F2F3F5;
		padding: 8rpx 24rpx;
		border-radius: 20rpx;
	}

	&__timer-stop-text {
		font-size: 24rpx;
		color: #999999;
	}
}
</style>