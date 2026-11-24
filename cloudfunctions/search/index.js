const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

const PAGE_SIZE = 16

exports.main = async (event) => {
	const { keyword, page = 1 } = event

	if (!keyword || !keyword.trim()) {
		return { success: true, data: [], total: 0, page: 1, pageSize: PAGE_SIZE }
	}

	try {
		const trimmedKeyword = keyword.trim()
		console.log('[search] searching with keyword:', trimmedKeyword, 'page:', page)
		
		// 先获取所有匹配的数据
		const allRecipes = await db.collection('menu')
			.where({
				title: db.RegExp({
					regexp: trimmedKeyword,
					options: 'i'
				})
			})
			.limit(1000)
			.get()
		
		console.log('[search] regex search result count:', allRecipes.data.length)
		
		// 如果正则搜索无结果，获取所有数据并在服务端进行模糊匹配
		let matchedRecipes = allRecipes.data
		if (allRecipes.data.length === 0) {
			console.log('[search] regex search no results, trying fuzzy match')
			const allData = await db.collection('menu')
				.limit(1000)
				.get()
			
			matchedRecipes = allData.data.filter(recipe => {
				if (!recipe.title) return false
				const title = recipe.title.toLowerCase()
				
				// 1. 完全包含匹配
				if (title.includes(trimmedKeyword.toLowerCase())) {
					return true
				}
				
				// 2. 模糊匹配（允许 1 个字符差异）
				if (trimmedKeyword.length >= 2) {
					for (let i = 0; i <= title.length - trimmedKeyword.length; i++) {
						const substr = title.substring(i, i + trimmedKeyword.length)
						if (isSimilar(substr, trimmedKeyword.toLowerCase())) {
							return true
						}
					}
				}
				
				return false
			})
			
			console.log('[search] fuzzy search result count:', matchedRecipes.length)
		}

		const total = matchedRecipes.length
		const totalPages = Math.ceil(total / PAGE_SIZE)
		const currentPage = Math.min(Math.max(1, page), totalPages || 1)
		const startIndex = (currentPage - 1) * PAGE_SIZE
		const endIndex = startIndex + PAGE_SIZE
		const pageData = matchedRecipes.slice(startIndex, endIndex)

		return {
			success: true,
			data: pageData,
			total: total,
			page: currentPage,
			pageSize: PAGE_SIZE,
			totalPages: totalPages
		}
	} catch (error) {
		console.error('[search] search failed:', error)
		return {
			success: false,
			data: [],
			total: 0,
			page: 1,
			pageSize: PAGE_SIZE,
			errorMessage: error.message || '搜索失败'
		}
	}
}

// 简单的字符串相似度判断函数
function isSimilar(str1, str2) {
	if (str1.length !== str2.length) return false
	let diffCount = 0
	for (let i = 0; i < str1.length; i++) {
		if (str1[i] !== str2[i]) {
			diffCount++
		}
	}
	return diffCount <= 1
}
