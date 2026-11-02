export function loginUrl(pathname: string, search: string): string {
  return "/login?next=" + encodeURIComponent(pathname + search);
}
