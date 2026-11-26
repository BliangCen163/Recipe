const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

const normalizeIngredients = (value) => {
	if (!Array.isArray(value)) return []
	return value
		.map((item) => ({
			name: String(item?.name || '').trim(),
			amount: String(item?.amount || '').trim()
		}))
		.filter((item) => item.name)
}

const normalizeSteps = (value) => {
	if (!Array.isArray(value)) return []
	return value
		.map((item, index) => ({
			stepNum: index + 1,
			desc: String(item?.desc || '').trim(),
			timerMinute: Number(item?.timerMinute) || 0
		}))
		.filter((item) => item.desc)
}

const normalizeImages = (value) => {
	if (!Array.isArray(value)) return []
	return value
		.map((item) => String(item || '').trim())
		.filter(Boolean)
}

exports.main = async (event) => {
	const wxContext = cloud.getWXContext()
	const openid = wxContext.OPENID
	const recipe = event.recipe || {}
	const recipeId = String(event.recipeId || '').trim()

	if (!openid) {
		return {
			success: false,
			errorMessage: '未获取到 OPENID'
		}
	}

	const title = String(recipe.title || '').trim()
	const tags = Array.isArray(recipe.tags)
		? recipe.tags.map((item) => String(item || '').trim()).filter(Boolean)
		: []
	const ingredients = normalizeIngredients(recipe.ingredients)
	const steps = normalizeSteps(recipe.steps)
	const tips = String(recipe.tips || '').trim()
	const images = normalizeImages(recipe.images)
	const cover = String(recipe.cover || images[0] || '').trim()

	if (!title) {
		return {
			success: false,
			errorMessage: '菜谱名称不能为空'
		}
	}

	if (ingredients.length === 0) {
		return {
			success: false,
			errorMessage: '至少需要一个食材'
		}
	}

	if (steps.length === 0) {
		return {
			success: false,
			errorMessage: '至少需要一个步骤'
		}
	}

	try {
		const payload = {
			title,
			tags,
			ingredients,
			steps,
			tips,
			images,
			cover,
			image: cover,
			author: '我的自创',
			_openid: openid,
			createdBy: openid,
			openid,
			isOriginal: true,
			updatedAt: db.serverDate()
		}

		if (recipeId) {
			const { data } = await db.collection('original_recipes').doc(recipeId).get()
			if (!data || data.createdBy !== openid) {
				return {
					success: false,
					errorMessage: '无权编辑该菜谱'
				}
			}

			await db.collection('original_recipes').doc(recipeId).update({
				data: payload
			})

			return {
				success: true,
				id: recipeId
			}
		}

		const { _id } = await db.collection('original_recipes').add({
			data: {
				...payload,
				publishedMenuId: '',
				isPublished: false,
				createdAt: db.serverDate()
			}
		})

		return {
			success: true,
			id: _id
		}
	} catch (error) {
		return {
			success: false,
			errorMessage: error.message || '创建自创菜谱失败'
		}
	}
}
