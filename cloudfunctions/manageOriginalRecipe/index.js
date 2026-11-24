const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

const normalizeImages = (value) => {
	if (!Array.isArray(value)) return []
	return value.map((item) => String(item || '').trim()).filter(Boolean)
}

exports.main = async (event) => {
	const wxContext = cloud.getWXContext()
	const openid = wxContext.OPENID
	const action = String(event.action || '').trim()
	const recipeId = String(event.recipeId || '').trim()

	if (!openid) {
		return {
			success: false,
			errorMessage: '未获取到 OPENID'
		}
	}

	if (!action || !recipeId) {
		return {
			success: false,
			errorMessage: '缺少必要参数'
		}
	}

	try {
		const recipeRef = db.collection('original_recipes').doc(recipeId)
		const { data: recipe } = await recipeRef.get()

		if (!recipe || recipe.createdBy !== openid) {
			return {
				success: false,
				errorMessage: '未找到对应菜谱或无操作权限'
			}
		}

		if (action === 'delete') {
			if (recipe.publishedMenuId) {
				await db.collection('menu').doc(recipe.publishedMenuId).remove().catch(() => null)
			}

			await recipeRef.remove()
			return {
				success: true
			}
		}

		if (action === 'publish') {
			const images = normalizeImages(recipe.images)
			const cover = recipe.cover || images[0] || ''
			const menuPayload = {
				title: recipe.title || '',
				tags: Array.isArray(recipe.tags) ? recipe.tags : [],
				ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [],
				steps: Array.isArray(recipe.steps) ? recipe.steps : [],
				tips: recipe.tips || '',
				cover,
				image: cover,
				images,
				author: '用户发布',
				createdBy: openid,
				openid,
				sourceOriginalRecipeId: recipeId,
				updatedAt: db.serverDate()
			}

			let publishedMenuId = recipe.publishedMenuId || ''
			if (publishedMenuId) {
				await db.collection('menu').doc(publishedMenuId).update({
					data: menuPayload
				})
			} else {
				const { _id } = await db.collection('menu').add({
					data: {
						...menuPayload,
						createdAt: db.serverDate()
					}
				})
				publishedMenuId = _id
			}

			await recipeRef.update({
				data: {
					isPublished: true,
					publishedMenuId,
					updatedAt: db.serverDate()
				}
			})

			return {
				success: true,
				isPublished: true,
				publishedMenuId
			}
		}

		if (action === 'unpublish') {
			if (recipe.publishedMenuId) {
				await db.collection('menu').doc(recipe.publishedMenuId).remove().catch(() => null)
			}

			await recipeRef.update({
				data: {
					isPublished: false,
					publishedMenuId: '',
					updatedAt: db.serverDate()
				}
			})

			return {
				success: true,
				isPublished: false
			}
		}

		return {
			success: false,
			errorMessage: `不支持的操作: ${action}`
		}
	} catch (error) {
		return {
			success: false,
			errorMessage: error.message || '操作失败'
		}
	}
}
