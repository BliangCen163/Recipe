<template>
	<view class="page">
		<scroll-view
			scroll-y
			class="chat-list"
			:scroll-top="scrollTop"
			:scroll-with-animation="true"
		>
			<view v-if="messages.length === 0" class="welcome">
				<view class="welcome__icon">
					<text class="welcome__icon-text">AI</text>
				</view>
				<text class="welcome__title">后厨领班在线</text>
				<text class="welcome__desc">做菜遇到任何问题，随时问我！</text>
				<view class="welcome__hints">
					<view
						v-for="hint in quickHints"
						:key="hint"
						class="welcome__hint"
						@click="sendQuickHint(hint)"
					>
						<text class="welcome__hint-text">{{ hint }}</text>
					</view>
				</view>
			</view>

			<view v-for="(msg, idx) in messages" :key="idx" class="msg" :class="`msg--${msg.role}`">
				<view v-if="msg.role === 'assistant'" class="msg__avatar msg__avatar--ai">
					<text class="msg__avatar-text">AI</text>
				</view>
				<view class="msg__bubble" :class="`msg__bubble--${msg.role}`">
					<text class="msg__content">{{ msg.content }}</text>
				</view>
				<view v-if="msg.role === 'user'" class="msg__avatar msg__avatar--user">
					<text class="msg__avatar-text">我</text>
				</view>
			</view>

			<view v-if="isThinking" class="msg msg--assistant">
				<view class="msg__avatar msg__avatar--ai">
					<text class="msg__avatar-text">AI</text>
				</view>
				<view class="msg__bubble msg__bubble--thinking">
					<view class="typing">
						<view class="typing__dot"></view>
						<view class="typing__dot"></view>
						<view class="typing__dot"></view>
					</view>
				</view>
			</view>
		</scroll-view>

		<view class="input-bar">
			<input
				class="input-bar__field"
				v-model="inputText"
				placeholder="问问做菜的任何问题..."
				:disabled="isThinking"
				confirm-type="send"
				@confirm="sendMessage"
			/>
			<view
				class="input-bar__btn"
				:class="{ 'input-bar__btn--disabled': !canSend }"
				@click="sendMessage"
			>
				<text class="input-bar__btn-text">发送</text>
			</view>
		</view>
	</view>
</template>

<script setup>
import { computed, nextTick, ref } from 'vue'

const messages = ref([])
const inputText = ref('')
const isThinking = ref(false)
const scrollTop = ref(0)

const quickHints = [
	'盐放多了怎么办？',
	'如何判断油温？',
	'肉炒老了怎么补救？',
	'怎么去鱼腥味？'
]

const canSend = computed(() => inputText.value.trim().length > 0 && !isThinking.value)

const scrollToBottom = () => {
	nextTick(() => {
		scrollTop.value = scrollTop.value === 99999 ? 99998 : 99999
	})
}

const sendQuickHint = (hint) => {
	inputText.value = hint
	sendMessage()
}

const sendMessage = async () => {
	const text = inputText.value.trim()
	if (!text || isThinking.value) return

	messages.value.push({ role: 'user', content: text })
	inputText.value = ''
	scrollToBottom()

	isThinking.value = true

	const chatHistory = messages.value.map((m) => ({
		role: m.role,
		content: m.content
	}))

	try {
		const { result } = await wx.cloud.callFunction({
			name: 'aiAssistant',
			data: { messages: chatHistory }
		})

		if (result?.success) {
			messages.value.push({ role: 'assistant', content: result.data.reply })
		} else {
			messages.value.push({
				role: 'assistant',
				content: '抱歉，领班暂时开小差了，请稍后再试～'
			})
		}
	} catch (error) {
		messages.value.push({
			role: 'assistant',
			content: '网络似乎不太好，请检查连接后重试。'
		})
	} finally {
		isThinking.value = false
		scrollToBottom()
	}
}
</script>

<style lang="scss" scoped>
.page {
	display: flex;
	flex-direction: column;
	height: 100vh;
	background-color: #F7F8FA;
}

.chat-list {
	flex: 1;
	padding: 24rpx;
	overflow-y: auto;
}

.welcome {
	display: flex;
	flex-direction: column;
	align-items: center;
	padding-top: 80rpx;

	&__icon {
		width: 96rpx;
		height: 96rpx;
		border-radius: 50%;
		background: linear-gradient(135deg, $primary-color 0%, #FF8A65 100%);
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 12rpx 32rpx rgba(250, 102, 80, 0.25);
	}

	&__icon-text {
		font-size: 32rpx;
		font-weight: bold;
		color: #FFFFFF;
	}

	&__title {
		margin-top: 24rpx;
		font-size: 36rpx;
		font-weight: 700;
		color: #1f2329;
	}

	&__desc {
		margin-top: 12rpx;
		font-size: 26rpx;
		color: #9aa0a6;
	}

	&__hints {
		margin-top: 40rpx;
		display: flex;
		flex-wrap: wrap;
		gap: 16rpx;
		justify-content: center;
		padding: 0 24rpx;
	}

	&__hint {
		padding: 16rpx 28rpx;
		background: #FFFFFF;
		border-radius: 999rpx;
		box-shadow: 0 4rpx 16rpx rgba(24, 32, 56, 0.06);
		border: 1rpx solid #f0f1f3;
	}

	&__hint-text {
		font-size: 26rpx;
		color: #4e535a;
	}
}

.msg {
	display: flex;
	align-items: flex-start;
	margin-bottom: 28rpx;

	&--user {
		justify-content: flex-end;
	}

	&--assistant {
		justify-content: flex-start;
	}

	&__avatar {
		width: 64rpx;
		height: 64rpx;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;

		&--ai {
			background: linear-gradient(135deg, $primary-color 0%, #FF8A65 100%);
			margin-right: 16rpx;
		}

		&--user {
			background: #E8EAED;
			margin-left: 16rpx;
		}
	}

	&__avatar-text {
		font-size: 22rpx;
		font-weight: bold;
		color: #FFFFFF;
	}

	&__bubble {
		max-width: 520rpx;
		padding: 24rpx 28rpx;
		border-radius: 24rpx;
		word-break: break-all;

		&--assistant {
			background: #FFFFFF;
			box-shadow: 0 4rpx 16rpx rgba(24, 32, 56, 0.06);
			border-top-left-radius: 8rpx;
		}

		&--user {
			background: linear-gradient(135deg, $primary-color 0%, #FF8A65 100%);
			border-top-right-radius: 8rpx;
		}

		&--thinking {
			background: #FFFFFF;
			box-shadow: 0 4rpx 16rpx rgba(24, 32, 56, 0.06);
			border-top-left-radius: 8rpx;
			padding: 28rpx 36rpx;
		}
	}

	&__content {
		font-size: 28rpx;
		line-height: 1.7;
		color: #2d3136;
	}

	&__bubble--user &__content {
		color: #FFFFFF;
	}
}

.typing {
	display: flex;
	gap: 10rpx;
	align-items: center;

	&__dot {
		width: 14rpx;
		height: 14rpx;
		border-radius: 50%;
		background: #C0C4CC;
		animation: typingBounce 1.2s infinite ease-in-out;

		&:nth-child(2) {
			animation-delay: 0.2s;
		}

		&:nth-child(3) {
			animation-delay: 0.4s;
		}
	}
}

@keyframes typingBounce {
	0%, 60%, 100% {
		transform: translateY(0);
		opacity: 0.4;
	}
	30% {
		transform: translateY(-8rpx);
		opacity: 1;
	}
}

.input-bar {
	display: flex;
	align-items: center;
	gap: 16rpx;
	padding: 20rpx 24rpx;
	padding-bottom: calc(20rpx + env(safe-area-inset-bottom));
	background: #FFFFFF;
	border-top: 1rpx solid #F0F1F3;

	&__field {
		flex: 1;
		height: 76rpx;
		padding: 0 28rpx;
		background: #F7F8FA;
		border-radius: 999rpx;
		font-size: 28rpx;
		color: #2d3136;
	}

	&__btn {
		width: 120rpx;
		height: 76rpx;
		border-radius: 999rpx;
		background: linear-gradient(135deg, $primary-color 0%, #FF8A65 100%);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;

		&--disabled {
			opacity: 0.5;
		}
	}

	&__btn-text {
		font-size: 28rpx;
		font-weight: 600;
		color: #FFFFFF;
	}
}
</style>