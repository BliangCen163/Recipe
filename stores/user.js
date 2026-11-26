import { reactive } from 'vue'

const DEFAULT_PREFS = { aiBackend: 'cloudbase' }

export const userStore = reactive({
	openid: '',
	userId: '',
	nickname: '',
	avatarUrl: '',
	isLoggedIn: false,
	loginReady: false,
	loginLoading: false,
	loginError: '',
	prefs: Object.assign({}, DEFAULT_PREFS),

	setUser(data) {
		this.openid = data.openid || ''
		this.userId = data.userId || data.openid || ''
		this.nickname = data.nickname || data.nickName || ''
		this.avatarUrl = data.avatarUrl || ''
		this.prefs = Object.assign({}, DEFAULT_PREFS, data.prefs || {})
		this.isLoggedIn = !!data.openid
		this.loginReady = true
		this.loginLoading = false
		this.loginError = ''
	},

	updateProfile(nickname, avatarUrl) {
		this.nickname = nickname || this.nickname
		this.avatarUrl = avatarUrl || this.avatarUrl
	},

	setPrefs(prefs) {
		this.prefs = Object.assign({}, this.prefs, prefs || {})
	},

	setLoginPending() {
		this.loginLoading = true
		this.loginReady = false
		this.loginError = ''
	},

	setLoginFailed(errorMessage = '登录失败') {
		this.openid = ''
		this.userId = ''
		this.nickname = ''
		this.avatarUrl = ''
		this.isLoggedIn = false
		this.prefs = Object.assign({}, DEFAULT_PREFS)
		this.loginReady = true
		this.loginLoading = false
		this.loginError = errorMessage
	},

	reset() {
		this.openid = ''
		this.userId = ''
		this.nickname = ''
		this.avatarUrl = ''
		this.isLoggedIn = false
		this.loginReady = true
		this.loginLoading = false
		this.loginError = ''
		this.prefs = Object.assign({}, DEFAULT_PREFS)
	}
})
