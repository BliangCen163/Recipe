export async function searchRecipes(keyword) {
	if (!keyword || !keyword.trim()) {
		return { success: true, data: [] }
	}

	const db = wx.cloud.database()

	try {
		const trimmedKeyword = keyword.trim().toLowerCase()
		console.log('[search] local search with keyword:', trimmedKeyword)
		
		// 获取所有菜谱
		// Merge note: local fallback should search the public menu catalog,
		// so it stays aligned with the cloud search contract and menu navigation.
		const { data: allRecipes } = await db.collection('menu')
			.get()
		console.log('[search] all recipes count:', allRecipes.length)
		console.log('[search] all recipes titles:', allRecipes.map(r => r.title))
		
		// 优化过滤逻辑：支持模糊匹配和部分匹配
		const filteredRecipes = allRecipes.filter(recipe => {
			if (!recipe.title) return false
			const title = recipe.title.toLowerCase()
			
			// 1. 完全包含匹配
			if (title.includes(trimmedKeyword)) {
				return true
			}
			
			// 2. 分词匹配（将关键词按空格分割）
			const keywords = trimmedKeyword.split(/\s+/).filter(k => k.length > 0)
			if (keywords.length > 1) {
				return keywords.some(k => title.includes(k))
			}
			
			// 3. 拼音首字母匹配（简化版：支持中文关键词的部分匹配）
			// 例如："西红柿炒蛋" 可以匹配 "西红柿炒鸡蛋"
			if (trimmedKeyword.length >= 2) {
				// 检查是否是标题的子串
				for (let i = 0; i <= title.length - trimmedKeyword.length; i++) {
					const substr = title.substring(i, i + trimmedKeyword.length)
					if (isSimilar(substr, trimmedKeyword)) {
						return true
					}
				}
			}
			
			return false
		})
		
		console.log('[search] filtered recipes count:', filteredRecipes.length)
		console.log('[search] filtered recipes:', filteredRecipes)

		return { success: true, data: filteredRecipes }
	} catch (error) {
		console.error('[search] searchRecipes failed:', error)
		return { success: false, data: [], errorMessage: error.message || '搜索失败' }
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
	return diffCount <= 1 // 允许最多 1 个字符的差异
}
