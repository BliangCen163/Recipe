<script>
	import { userStore } from './stores/user'

	const LOGIN_TIMEOUT = 20000

	const withTimeout = (promise, timeout = LOGIN_TIMEOUT) =>
		Promise.race([
			promise,
			new Promise((_, reject) => {
				setTimeout(() => reject(new Error(`login timeout after ${timeout}ms`)), timeout)
			})
		])

	export default {
		onLaunch: function() {
			console.log('App Launch')
			if (typeof wx.cloud !== 'undefined') {
				wx.cloud.init({
					env: 'cloud1-6g897ntufd35a942',
					traceUser: true
				})
				this.globalData = {
					runSilentLogin: () => this.silentLogin()
				}
				this.silentLogin()
			} else {
				userStore.setLoginFailed('wx.cloud 不可用')
			}
		},
		onShow: function() {
			console.log('App Show')
		},
		onHide: function() {
			console.log('App Hide')
		},
		methods: {
			showLoginErrorModal(error) {
				let content = ''
				try {
					content = JSON.stringify(error, Object.getOwnPropertyNames(error || {}), 2)
				} catch (stringifyError) {
					content = String(error)
				}
				uni.showModal({
					title: '登录失败详情',
					content: content || '未知错误',
					showCancel: false
				})
			},
			async silentLogin() {
				userStore.setLoginPending()
				console.log('[login] start cloud login')
				try {
					const res = await withTimeout(
						wx.cloud.callFunction({
							name: 'login'
						})
					)

					console.log('完整云函数返回:', res)

					if (!res || !res.result) {
						throw new Error('云函数返回为空，请检查云函数执行结果')
					}

					const openid = res.result.openid

					if (!openid) {
						throw new Error('OpenID 丢失，请检查云函数部署情况')
					}

					uni.setStorageSync('openid', openid)

					userStore.setUser({
						openid,
						userId: res.result.userId || openid,
						nickname: res.result.nickname || '美食爱好者',
						avatarUrl: res.result.avatarUrl || ''
					})
					userStore.setSavedRecipes(res.result.savedRecipes || [])
					console.log('[login] login success:', openid)
				} catch (e) {
					console.error('[login] cloud login failed:', e)
					userStore.setLoginFailed(e?.message || '静默登录失败')
					this.showLoginErrorModal(e)
				}
			}
		}
	}
</script>

<style>
</style>
