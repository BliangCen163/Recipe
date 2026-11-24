import { reactive } from 'vue'

export const userStore = reactive({
	openid: '',
	userId: '',
	nickname: '',
	avatarUrl: '',
	isLoggedIn: false,
	loginReady: false,
	loginLoading: false,
	loginError: '',
	savedRecipes: [],

	setUser(data) {
		this.openid = data.openid || ''
		this.userId = data.userId || data.openid || ''
		this.nickname = data.nickname || data.nickName || ''
		this.avatarUrl = data.avatarUrl || ''
		this.isLoggedIn = !!data.openid
		this.savedRecipes = Array.isArray(data.savedRecipes) ? data.savedRecipes : this.savedRecipes
		this.loginReady = true
		this.loginLoading = false
		this.loginError = ''
	},

	updateProfile(nickname, avatarUrl) {
		this.nickname = nickname || this.nickname
		this.avatarUrl = avatarUrl || this.avatarUrl
	},

	setSavedRecipes(savedRecipes) {
		this.savedRecipes = Array.isArray(savedRecipes) ? savedRecipes : []
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
		this.savedRecipes = []
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
		this.savedRecipes = []
	}
})
