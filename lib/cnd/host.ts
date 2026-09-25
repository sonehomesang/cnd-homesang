// This is the STANDALONE CND app (D:/myApp/cnd) — the whole app is the CND
// partner store, so the "CND host" is always true. (In the old shared HomeSang
// bundle this checked for the cnd.* subdomain; here every surface is CND.)
//
// Effect of returning true everywhere:
//  - app/(tabs)/index renders the CND storefront (<CndStore/>) at the root `/`
//  - app/(tabs)/_layout hides the HomeSang tab bar
//  - app/_layout scopes `/admin` to the CND back-office (`/cnd/admin`)
export function isCndHost(): boolean {
  return true;
}
