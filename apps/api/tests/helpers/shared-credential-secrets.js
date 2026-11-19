export function toSharedApiKeys(...apiKeys) {
  return {apiKey: apiKeys.map(apiKey => ({apiKey}))};
}

export function toSharedAccessTokens(...accessTokens) {
  return {
    accessToken: accessTokens.map(accessToken => ({
      accessToken,
    })),
  };
}
