export async function toggleFavoriteRecipe(recipe, isFromMenu, sourceMenuId) {
	const payload = {
		title: recipe.title || '',
		tags: Array.isArray(recipe.tags) ? recipe.tags : [],
		ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [],
		steps: Array.isArray(recipe.steps) ? recipe.steps : [],
		tips: recipe.tips || '',
		cover: recipe.cover || '',
		sourceIngredients: recipe.sourceIngredients?.length
			? recipe.sourceIngredients
			: recipe.ingredients?.map((i) => i.name) || [],
		sourceMenuId: isFromMenu ? (sourceMenuId || '') : '',
		_id: isFromMenu ? '' : (recipe._id || '')
	}

	const { result } = await wx.cloud.callFunction({
		name: 'toggleFavorite',
		data: { recipe: payload }
	})

	return result
}
