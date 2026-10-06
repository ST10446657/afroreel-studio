export function authenticatedUser(request: Request): string | null {
  return request.headers.get('oai-authenticated-user-id')
    ?? request.headers.get('oai-authenticated-user-email');
}

export function isAuthenticated(request: Request): boolean {
  return Boolean(authenticatedUser(request));
}
