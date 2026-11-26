export async function toggleFavoriteRecipe(recipe, recipeKind) {
	const sourceIngredients = recipe?.sourceIngredients?.length
		? recipe.sourceIngredients
		: recipe?.ingredients?.map((item) => item?.name).filter(Boolean) || []

	const payload = {
		action: 'toggle',
		recipeId: recipe?._id || recipe?.id || recipe?.recipeId || '',
		recipeKind: recipeKind || 'recipe',
		snapshot: {
			title: recipe?.title || '',
			cover: recipe?.cover || '',
			tags: Array.isArray(recipe?.tags) ? recipe.tags : [],
			sourceIngredients
		}
	}

	const { result } = await wx.cloud.callFunction({
		name: 'toggleFavorite',
		data: payload
	})

	return result
}
